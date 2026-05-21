const plantEl = document.querySelector('#plant');
const plantImageEl = document.querySelector('#plantImage');
const plantEmojiEl = document.querySelector('#plantEmoji');
const bubbleEl = document.querySelector('#bubble');

const SENSOR_POLL_INTERVAL_MS = 5000;
const NORMAL_IDLE_BUBBLE_INTERVAL_MS = 24000;
const STATE_REMINDER_INTERVAL_MS = 20000;
const CLICK_DISTANCE_PX = 5;

let currentState = 'normal';
let lastSensorData = null;
let bubbleTimer = null;
let idleBubbleTimer = null;
let dragState = null;
let hasGreeted = false;
let lastStateBubbleAt = 0;

// Replace these files with your own art later. If an image does not exist,
// the renderer automatically falls back to the emoji plant.
const plantImageMap = {
  normal: './assets/plant-normal.png',
  thirsty: './assets/plant-thirsty.png',
  hot: './assets/plant-hot.png',
  idle: './assets/plant-idle.png'
};

// Bubble copy is intentionally centralized for future PM/content replacement.
const bubbleLines = {
  normal: [
    '今天状态很好，叶子也很精神。',
    '阳光刚刚好，我在慢慢长大。',
    '我在这里陪你工作一会儿。'
  ],
  thirsty: [
    '土壤有点干，我想喝水了。',
    '叶子有点蔫，帮我补点水吧。',
    '湿度偏低，我需要一点点水。'
  ],
  hot: [
    '这里有点热，我想凉快一下。',
    '温度偏高啦，叶子都快冒汗了。',
    '能不能把我放到更阴凉的地方？'
  ],
  idle: [
    '我先安静待着。',
    '需要我的时候，点托盘图标叫我。',
    '我在后台继续看着环境变化。'
  ],
  interaction: [
    '我在呢。',
    '摸摸叶子，今天也要好好休息。',
    '被你发现啦。'
  ],
  sensor: [
    '环境数据变了，我调整一下状态。',
    '我刚刚读到新的环境数据。',
    '传感器有新消息。'
  ]
};

// renderer.js controls the plant UI: animation state, automatic bubbles,
// simulated sensor polling, click interaction, and drag gestures.
// Later, replace getLatestSensorData() with a real hardware/database API call.
function decidePlantState(sensorData) {
  if (sensorData.soilMoisture < 30) {
    return 'thirsty';
  }

  if (sensorData.temperature > 32) {
    return 'hot';
  }

  return 'normal';
}

function mockSensorData() {
  return {
    soilMoisture: randomInt(12, 82),
    temperature: randomInt(20, 38),
    light: randomInt(120, 980),
    createdAt: new Date().toISOString()
  };
}

async function getLatestSensorData() {
  // Future replacement example:
  // const response = await fetch('http://localhost:3000/sensor/latest');
  // return response.json();
  return mockSensorData();
}

async function pollSensorData() {
  const sensorData = await getLatestSensorData();
  applySensorData(sensorData, { source: 'auto' });
}

function applySensorData(sensorData, options = {}) {
  lastSensorData = sensorData;
  const nextState = decidePlantState(sensorData);
  const changed = nextState !== currentState;
  const now = Date.now();
  const shouldRemind =
    nextState !== 'normal' && now - lastStateBubbleAt > STATE_REMINDER_INTERVAL_MS;

  setPlantState(nextState);

  if (changed || options.forceBubble || shouldRemind) {
    lastStateBubbleAt = now;
    showBubble(`${pickLine(nextState)} ${formatSensorHint(sensorData)}`);
    return;
  }

  if (options.source === 'tray') {
    showBubble(`${pickLine('sensor')} ${formatSensorHint(sensorData)}`);
  }
}

function setPlantState(state) {
  currentState = state;
  plantEl.className = `plant ${state}`;
  updatePlantArt(state);
}

function updatePlantArt(state) {
  const src = plantImageMap[state] || plantImageMap.normal;
  plantImageEl.onload = () => {
    plantImageEl.classList.remove('hidden');
    plantEmojiEl.classList.add('hidden');
  };
  plantImageEl.onerror = () => {
    plantImageEl.classList.add('hidden');
    plantEmojiEl.classList.remove('hidden');
  };
  plantImageEl.src = src;
}

function showBubble(text) {
  clearTimeout(bubbleTimer);
  bubbleEl.textContent = text;
  bubbleEl.classList.remove('hidden');

  bubbleTimer = setTimeout(() => {
    bubbleEl.classList.add('hidden');
  }, 3000);
}

function scheduleIdleBubble() {
  clearTimeout(idleBubbleTimer);
  idleBubbleTimer = setTimeout(() => {
    if (currentState === 'normal') {
      showBubble(pickLine('normal'));
    }

    scheduleIdleBubble();
  }, NORMAL_IDLE_BUBBLE_INTERVAL_MS);
}

function pickLine(state) {
  const lines = bubbleLines[state] || bubbleLines.normal;
  return lines[randomInt(0, lines.length - 1)];
}

function formatSensorHint(sensorData) {
  return `湿度 ${sensorData.soilMoisture}% / 温度 ${sensorData.temperature}°C`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getScreenPoint(event) {
  return {
    x: Math.round(event.screenX),
    y: Math.round(event.screenY)
  };
}

function beginDrag(event) {
  if (event.button !== 0) {
    return;
  }

  dragState = {
    startX: event.screenX,
    startY: event.screenY,
    moved: false
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

function endDrag(event) {
  if (!dragState) {
    return;
  }

  const wasDrag = dragState.moved;
  dragState = null;
  window.plantPet?.endDrag();

  if (!wasDrag) {
    showBubble(pickLine('interaction'));
  }
}

plantEl.addEventListener('pointerdown', beginDrag);
plantEl.addEventListener('pointermove', moveDrag);
plantEl.addEventListener('pointerup', endDrag);
plantEl.addEventListener('pointercancel', endDrag);

plantEl.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.plantPet?.openMenu();
});

plantEl.addEventListener('dblclick', () => {
  setPlantState('idle');
  showBubble(pickLine('idle'));
  setTimeout(() => window.plantPet?.hideWindow(), 500);
});

window.plantPet?.onMockSensor(() => {
  applySensorData(mockSensorData(), {
    source: 'tray',
    forceBubble: true
  });
});

window.plantPet?.onWindowShown(() => {
  if (!hasGreeted) {
    hasGreeted = true;
    showBubble('你好，我会在桌面上陪你。');
    return;
  }

  if (lastSensorData) {
    showBubble(`${pickLine(currentState)} ${formatSensorHint(lastSensorData)}`);
  } else {
    showBubble(pickLine(currentState));
  }
});

setPlantState('normal');
scheduleIdleBubble();
setInterval(pollSensorData, SENSOR_POLL_INTERVAL_MS);
