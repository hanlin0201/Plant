import { getPlantStatus } from "./services/plantApi.js";
import { sendPlantMessage as sendPlantMessageToApi } from "./services/chatApi.js";

const plantEl = document.querySelector("#plant");
const plantImageEl = document.querySelector("#plantImage");
const plantEmojiEl = document.querySelector("#plantEmoji");
const bubbleEl = document.querySelector("#bubble");
const inputBarEl = document.querySelector("#inlineChatForm");
const inlineInputEl = document.querySelector("#inlineChatInput");
const inlineSendBtnEl = document.querySelector("#inlineChatSendBtn");
const expandPanelBtnEl = document.querySelector("#expandPanelBtn");
const chatPanelEl = document.querySelector("#chatPanel");
const chatHistoryEl = document.querySelector("#chatHistory");
const panelFormEl = document.querySelector("#panelChatForm");
const panelInputEl = document.querySelector("#panelChatInput");
const panelSendBtnEl = document.querySelector("#panelChatSendBtn");
const collapsePanelBtnEl = document.querySelector("#collapsePanelBtn");

const DEVICE_ID = "sensor_001";
const BACKEND_POLL_INTERVAL_MS = 3000;
const CLICK_DISTANCE_PX = 5;
const MAX_LOCAL_CHAT_HISTORY = 8;

let currentState = "normal";
let lastReadingId = null;
let bubbleTimer = null;
let dragState = null;
let hasGreeted = false;
let chatHistory = [];
let chatPending = false;
let panelExpanded = false;

// Drop your own images into assets/ later. Missing files fall back to emoji.
const plantImageMap = {
  normal: "./assets/plant-normal.png",
  thirsty: "./assets/plant-thirsty.png",
  hot: "./assets/plant-hot.png",
  unknown: "./assets/plant-normal.png",
};

function showBubble(text, options = {}) {
  if (!text) {
    return;
  }

  clearTimeout(bubbleTimer);
  bubbleEl.textContent = text;
  bubbleEl.classList.remove("hidden");

  if (!options.persist) {
    bubbleTimer = setTimeout(() => {
      bubbleEl.classList.add("hidden");
    }, 3000);
  }
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
      showBubble("我有点渴了，可以给我浇点水吗？", { persist: true });
      break;
    case "hot_warning":
      showBubble("有点热，我想凉快一下。", { persist: true });
      break;
    case "recovered":
      showBubble("谢谢你，我感觉好多啦！", { persist: true });
      break;
    case "touched":
      showBubble("你刚刚摸到我啦，我在呢。", { persist: true });
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

function activateInput() {
  if (panelExpanded) {
    return;
  }

  inputBarEl.classList.remove("hidden");
  window.setTimeout(() => inlineInputEl.focus(), 50);
}

function deactivateInput() {
  if (panelExpanded) {
    return;
  }

  inputBarEl.classList.add("hidden");
  inlineInputEl.value = "";
}

function expandToPanel() {
  panelExpanded = true;
  inputBarEl.classList.add("hidden");
  renderPanelHistory();
  chatPanelEl.classList.remove("hidden");
  window.setTimeout(() => {
    panelInputEl.focus();
    scrollChatHistory();
  }, 50);
}

function collapseToInput() {
  panelExpanded = false;
  chatPanelEl.classList.add("hidden");
  activateInput();
}

function collapseChatUi() {
  panelExpanded = false;
  chatPanelEl.classList.add("hidden");
  inputBarEl.classList.add("hidden");
}

async function sendInlineMessage(event) {
  event.preventDefault();
  await submitPlantMessage({
    inputEl: inlineInputEl,
    source: "inline",
  });
}

async function sendPanelMessage(event) {
  event.preventDefault();
  await submitPlantMessage({
    inputEl: panelInputEl,
    source: "panel",
  });
}

async function submitPlantMessage({ inputEl, source }) {
  if (chatPending) {
    return;
  }

  const text = inputEl.value.trim();

  if (!text) {
    return;
  }

  inputEl.value = "";
  const historyForRequest = chatHistory.slice();
  pushChatRecord("user", text);
  renderPanelHistory();
  setChatPending(true);
  showBubble("...", { persist: true });

  let result;
  try {
    const messages = buildChatMessages(historyForRequest, text);
    result = await sendPlantMessageToApi(messages, DEVICE_ID);
  } catch (error) {
    result = {
      reply: "",
      error:
        error instanceof Error
          ? error.message
          : "连接失败，稍后再试",
    };
  }

  setChatPending(false);

  if (result?.reply) {
    pushChatRecord("plant", result.reply);
    showBubble(result.reply, { persist: true });
    renderPanelHistory();
    return;
  }

  showSystemMessage(result?.error || "连接失败，稍后再试", source);
}

function buildChatMessages(history, latestUserText) {
  const messages = [];

  for (const item of history) {
    if (!item || typeof item.text !== "string" || item.text.trim() === "") {
      continue;
    }

    if (item.role === "user") {
      messages.push({ role: "user", content: item.text });
      continue;
    }

    if (item.role === "plant") {
      messages.push({ role: "assistant", content: item.text });
    }
  }

  messages.push({ role: "user", content: latestUserText });
  return messages.slice(-MAX_LOCAL_CHAT_HISTORY);
}

function pushChatRecord(role, text) {
  chatHistory.push({ role, text });
  chatHistory = chatHistory.slice(-MAX_LOCAL_CHAT_HISTORY);
}

function showSystemMessage(text, source) {
  showBubble(text, { persist: true });

  if (source === "panel" || panelExpanded) {
    appendPanelMessage("system", text);
  }
}

function renderPanelHistory() {
  chatHistoryEl.innerHTML = "";

  chatHistory.forEach((message) => {
    appendPanelMessage(message.role, message.text);
  });

  scrollChatHistory();
}

function appendPanelMessage(role, text) {
  const messageEl = document.createElement("div");
  messageEl.className = `chat-message ${role}`;
  messageEl.textContent = text;
  chatHistoryEl.appendChild(messageEl);
  scrollChatHistory();
}

function scrollChatHistory() {
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

function setChatPending(isPending) {
  chatPending = isPending;
  inlineInputEl.disabled = isPending;
  inlineSendBtnEl.disabled = isPending;
  panelInputEl.disabled = isPending;
  panelSendBtnEl.disabled = isPending;
  inlineSendBtnEl.textContent = isPending ? "..." : "➤";
  panelSendBtnEl.textContent = isPending ? "发送中" : "发送";
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

  collapseChatUi();
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
    showBubble("我在呢。", { persist: true });
    activateInput();
  }
}

plantEl.addEventListener("pointerdown", beginDrag);
plantEl.addEventListener("pointermove", moveDrag);
plantEl.addEventListener("pointerup", endDrag);
plantEl.addEventListener("pointercancel", endDrag);

bubbleEl.addEventListener("click", (event) => {
  event.stopPropagation();
  activateInput();
});

inputBarEl.addEventListener("submit", sendInlineMessage);
panelFormEl.addEventListener("submit", sendPanelMessage);
expandPanelBtnEl.addEventListener("click", expandToPanel);
collapsePanelBtnEl.addEventListener("click", collapseToInput);

inlineInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    deactivateInput();
  }
});

panelInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    collapseToInput();
  }
});

document.addEventListener("click", (event) => {
  const isInsideChat =
    plantEl.contains(event.target) ||
    bubbleEl.contains(event.target) ||
    inputBarEl.contains(event.target) ||
    chatPanelEl.contains(event.target);

  if (!isInsideChat) {
    collapseChatUi();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (panelExpanded) {
      collapseToInput();
    } else {
      deactivateInput();
    }
  }
});

plantEl.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.plantPet?.openMenu();
});

plantEl.addEventListener("dblclick", () => {
  showBubble("我先安静待一会儿。", { persist: true });
  window.setTimeout(() => window.plantPet?.hideWindow(), 500);
});

window.plantPet?.onWindowShown(() => {
  if (!hasGreeted) {
    hasGreeted = true;
    showBubble("你好，我会根据环境数据陪着你。", { persist: true });
  }

  pollPlantStatus();
});

setPlantState(currentState);
pollPlantStatus();
setInterval(pollPlantStatus, BACKEND_POLL_INTERVAL_MS);
