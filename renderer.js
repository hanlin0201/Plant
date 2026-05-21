import { getPlantStatus } from "./services/plantApi.js";

const plantEl = document.querySelector("#plant");
const plantImageEl = document.querySelector("#plantImage");
const plantEmojiEl = document.querySelector("#plantEmoji");
const bubbleEl = document.querySelector("#bubble");

const DEVICE_ID = "sensor_001";
const BACKEND_POLL_INTERVAL_MS = 3000;
const CLICK_DISTANCE_PX = 5;

let currentState = "normal";
let lastReadingId = null;
let bubbleTimer = null;
let dragState = null;
let hasGreeted = false;

// Drop your own images into assets/ later. Missing files fall back to emoji.
const plantImageMap = {
  normal: "./assets/plant-normal.png",
  thirsty: "./assets/plant-thirsty.png",
  hot: "./assets/plant-hot.png",
  unknown: "./assets/plant-normal.png",
};

function showBubble(text) {
  if (!text) {
    return;
  }

  clearTimeout(bubbleTimer);
  bubbleEl.textContent = text;
  bubbleEl.classList.remove("hidden");

  bubbleTimer = setTimeout(() => {
    bubbleEl.classList.add("hidden");
  }, 3000);
}

function setPlantState(state) {
  if (!state || state === "unknown") {
    currentState = "unknown";
    plantEl.className = "plant unknown";
    updatePlantArt("unknown");
    return;
  }

  if (!["normal", "thirsty", "hot"].includes(state)) {
    console.warn("[unknown plant state]", state);
    return;
  }

  currentState = state;
  plantEl.className = `plant ${state}`;
  updatePlantArt(state);
}

function updatePlantArt(state) {
  const src = plantImageMap[state] || plantImageMap.normal;

  plantImageEl.onload = () => {
    plantImageEl.classList.remove("hidden");
    plantEmojiEl.classList.add("hidden");
  };

  plantImageEl.onerror = () => {
    plantImageEl.classList.add("hidden");
    plantEmojiEl.classList.remove("hidden");
  };

  plantImageEl.src = src;
}

function showBubbleByEventType(eventType, sensorData = {}) {
  switch (eventType) {
    case "thirsty_warning":
      showBubble("我有点渴了，可以给我浇点水吗？");
      break;
    case "hot_warning":
      showBubble("有点热，我想凉快一下。");
      break;
    case "recovered":
      showBubble("谢谢你，我感觉好多啦！");
      break;
    case "touched":
      showBubble("你刚刚摸到我啦，我在呢。");
      break;
    case "normal_update":
      // Normal syncs are intentionally quiet so the plant does not interrupt.
      break;
    case "unknown":
      console.warn("[unknown plant event]", { eventType, sensorData });
      break;
    default:
      console.warn("[unsupported plant event]", { eventType, sensorData });
  }
}

async function pollPlantStatus() {
  try {
    const status = await getPlantStatus(DEVICE_ID);
    if (!status) {
      return;
    }

    if (status.state) {
      setPlantState(status.state);
    }

    if (status.reading_id && status.reading_id !== lastReadingId) {
      lastReadingId = status.reading_id;
      showBubbleByEventType(status.event_type, status.sensor_data);
    }
  } catch (error) {
    console.warn("[backend poll failed]", error);
  }
}

function getScreenPoint(event) {
  return {
    x: Math.round(event.screenX),
    y: Math.round(event.screenY),
  };
}

function beginDrag(event) {
  if (event.button !== 0) {
    return;
  }

  dragState = {
    startX: event.screenX,
    startY: event.screenY,
    moved: false,
  };

  plantEl.setPointerCapture(event.pointerId);
  window.plantPet?.startDrag(getScreenPoint(event));
}

function moveDrag(event) {
  if (!dragState) {
    return;
  }

  const dx = event.screenX - dragState.startX;
  const dy = event.screenY - dragState.startY;
  dragState.moved = dragState.moved || Math.hypot(dx, dy) > CLICK_DISTANCE_PX;
  window.plantPet?.moveDrag(getScreenPoint(event));
}

function endDrag() {
  if (!dragState) {
    return;
  }

  const wasDrag = dragState.moved;
  dragState = null;
  window.plantPet?.endDrag();

  if (!wasDrag) {
    showBubble("我在呢。");
  }
}

plantEl.addEventListener("pointerdown", beginDrag);
plantEl.addEventListener("pointermove", moveDrag);
plantEl.addEventListener("pointerup", endDrag);
plantEl.addEventListener("pointercancel", endDrag);

plantEl.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.plantPet?.openMenu();
});

plantEl.addEventListener("dblclick", () => {
  showBubble("我先安静待一会儿。");
  setTimeout(() => window.plantPet?.hideWindow(), 500);
});

window.plantPet?.onWindowShown(() => {
  if (!hasGreeted) {
    hasGreeted = true;
    showBubble("你好，我会根据环境数据陪着你。");
  }

  pollPlantStatus();
});

setPlantState(currentState);
pollPlantStatus();
setInterval(pollPlantStatus, BACKEND_POLL_INTERVAL_MS);
