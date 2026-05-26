import { getPlantStatus } from "./services/plantApi.js";
import { sendPlantMessage as sendPlantMessageToApi } from "./services/chatApi.js";
import {
  buildSensorMetrics,
  normalizeSensorData,
  plantThresholds,
} from "./services/plantStatusService.js";
import { getPlantProfile, getCompanionDays } from "./services/plantProfile.js";

const PET_ANIMATIONS = {
  idle: { src: "./assets/pet/idle_fixed.gif", duration: null, loop: true },
  touch: { src: "./assets/pet/touch_fixed.gif", duration: 1200, loop: false },
  reward: { src: "./assets/pet/reward_fixed.gif", duration: 1800, loop: false },
};

const PET_ANIMATION_POSE = {
  // Fine-tune action pose to make idle/action transitions feel more natural.
  idle: { x: 0, y: 0, scale: 1 },
  touch: { x: 0, y: -4, scale: 0.98 },
  reward: { x: 0, y: -3, scale: 0.98 },
};

const plantEl = document.querySelector("#plant");
const petAnimationEl = document.querySelector("#petAnimation");
const plantEmojiEl = document.querySelector("#plantEmoji");
const bubbleEl = document.querySelector("#bubble");
const inputBarEl = document.querySelector("#inlineChatForm");
const inlineInputEl = document.querySelector("#inlineChatInput");
const inlineSendBtnEl = document.querySelector("#inlineChatSendBtn");
const expandPanelBtnEl = document.querySelector("#expandPanelBtn");
const chatPanelEl = document.querySelector("#chatPanel");
const collapsePanelBtnEl = document.querySelector("#collapsePanelBtn");

const chatTabBtnEl = document.querySelector("#chatTabBtn");
const statusTabBtnEl = document.querySelector("#statusTabBtn");
const chatViewEl = document.querySelector("#chatView");
const statusViewEl = document.querySelector("#statusView");

const chatHistoryEl = document.querySelector("#chatHistory");
const panelFormEl = document.querySelector("#panelChatForm");
const panelInputEl = document.querySelector("#panelChatInput");
const panelSendBtnEl = document.querySelector("#panelChatSendBtn");

const statusLoadingEl = document.querySelector("#statusLoading");
const statusErrorEl = document.querySelector("#statusError");
const profileNameEl = document.querySelector("#profileName");
const profileSpeciesEl = document.querySelector("#profileSpecies");
const profileScientificEl = document.querySelector("#profileScientific");
const profileCompanionDaysEl = document.querySelector("#profileCompanionDays");
const sensorGridEl = document.querySelector("#sensorGrid");
const achievementGridEl = document.querySelector("#achievementGrid");
const achievementListViewEl = document.querySelector("#achievementListView");
const achievementDetailViewEl = document.querySelector(
  "#achievementDetailView",
);
const achievementDetailCardEl = document.querySelector(
  "#achievementDetailCard",
);
const achievementBackBtnEl = document.querySelector("#achievementBackBtn");
const petDebugToolsEl = document.querySelector("#petDebugTools");

const DEVICE_ID = "sensor_001";
const BACKEND_POLL_INTERVAL_MS = 3000;
const CLICK_DISTANCE_PX = 5;
const MAX_LOCAL_CHAT_HISTORY = 8;

const plantProfile = getPlantProfile();

const achievements = [
  {
    id: "first_chat",
    icon: "🌱",
    title: "萌芽初生",
    description: "第一次对话",
    condition: "用户和植物完成第一次聊天",
    type: "first_chat",
  },
  {
    id: "light_week",
    icon: "✨",
    title: "金光闪闪",
    description: "连续 7 天光照充足",
    condition: "后续根据历史光照数据判断",
    type: "progress",
    current: 5,
    target: 7,
  },
  {
    id: "water_balance",
    icon: "🌧",
    title: "雨露均沾",
    description: "浇水不忘记",
    condition: "后续根据土壤湿度变化或浇水记录判断",
    type: "progress",
    current: 2,
    target: 4,
  },
];

let currentState = "normal";
let lastReadingId = null;
let bubbleTimer = null;
let dragState = null;
let hasGreeted = false;
let chatHistory = [];
let chatPending = false;
let panelExpanded = false;
let lastDataUnavailableAt = 0;

let activePanelTab = "chat";
let latestPlantStatus = null;
let statusLoading = true;
let statusError = "";
let selectedAchievementId = null;

let currentPetAnimation = "idle";
let isPetActionPlaying = false;
let wasPlantDry = false;
let hasWaterRewardPending = false;
let pendingActionTimer = null;

function preloadPetAnimations() {
  const tasks = Object.values(PET_ANIMATIONS).map(
    (item) =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = item.src;
      }),
  );
  return Promise.all(tasks);
}

function setPetAnimation(animationName) {
  const config = PET_ANIMATIONS[animationName];
  if (!config) {
    return;
  }

  currentPetAnimation = animationName;
  petAnimationEl.src = config.src;
  const pose = PET_ANIMATION_POSE[animationName] || PET_ANIMATION_POSE.idle;
  petAnimationEl.style.setProperty("--pet-offset-x", `${pose.x}px`);
  petAnimationEl.style.setProperty("--pet-offset-y", `${pose.y}px`);
  petAnimationEl.style.setProperty("--pet-scale", `${pose.scale}`);
  petAnimationEl.classList.remove("hidden");
  plantEmojiEl.classList.add("hidden");
}

function playPetAction(animationName) {
  const config = PET_ANIMATIONS[animationName];
  if (!config || !config.duration) {
    return;
  }

  if (isPetActionPlaying) {
    return;
  }

  isPetActionPlaying = true;
  clearTimeout(pendingActionTimer);
  setPetAnimation(animationName);

  pendingActionTimer = window.setTimeout(() => {
    isPetActionPlaying = false;
    setPetAnimation("idle");
  }, config.duration);
}

function handlePetClick() {
  if (isPetActionPlaying) {
    return;
  }

  if (hasWaterRewardPending) {
    hasWaterRewardPending = false;
    playPetAction("reward");
    showBubble("奖励到手，继续加油。", { persist: true });
    return;
  }

  playPetAction("touch");
  showBubble("我在呢。", { persist: true });
}

function isPlantDry(sensorData) {
  const normalized = normalizeSensorData(sensorData);
  return typeof normalized.soilMoisture === "number"
    ? normalized.soilMoisture < plantThresholds.soilMoisture.min
    : false;
}

function isPlantWaterNormal(sensorData) {
  const normalized = normalizeSensorData(sensorData);
  if (typeof normalized.soilMoisture !== "number") {
    return false;
  }
  const soil = normalized.soilMoisture;
  return (
    soil >= plantThresholds.soilMoisture.min &&
    soil <= plantThresholds.soilMoisture.max
  );
}

function updateWaterRewardState(sensorData) {
  if (!sensorData) {
    return;
  }

  const dryNow = isPlantDry(sensorData);
  const normalNow = isPlantWaterNormal(sensorData);

  if (wasPlantDry && normalNow) {
    hasWaterRewardPending = true;
  }

  if (dryNow) {
    wasPlantDry = true;
    return;
  }

  if (normalNow) {
    wasPlantDry = false;
  }
}

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
    return;
  }

  if (!["normal", "thirsty", "hot"].includes(state)) {
    console.warn("[unknown plant state]", state);
    return;
  }

  currentState = state;
  plantEl.className = `plant ${state}`;
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
      break;
    case "unknown":
      console.warn("[unknown plant event]", { eventType, sensorData });
      break;
    default:
      console.warn("[unsupported plant event]", { eventType, sensorData });
  }
}

async function pollPlantStatus() {
  if (!latestPlantStatus) {
    statusLoading = true;
    renderStatusPanel();
  }

  try {
    const status = await getPlantStatus(DEVICE_ID);
    statusLoading = false;
    statusError = "";
    latestPlantStatus = status;
    updateWaterRewardState(status?.sensor_data || {});
    renderStatusPanel();

    if (!status || !status.state || status.state === "unknown") {
      setPlantState("normal");
      showDataUnavailableHint();
      return;
    }

    setPlantState(status.state);

    if (status.reading_id && status.reading_id !== lastReadingId) {
      lastReadingId = status.reading_id;
      showBubbleByEventType(status.event_type, status.sensor_data);
    }
  } catch (error) {
    statusLoading = false;
    statusError = "暂无最新数据，正在尝试重连";
    renderStatusPanel();
    setPlantState("normal");
    showDataUnavailableHint();
    console.warn("[backend poll failed]", error);
  }
}

function showDataUnavailableHint() {
  const now = Date.now();
  if (now - lastDataUnavailableAt < 15000) {
    return;
  }

  lastDataUnavailableAt = now;
  showBubble("数据暂时不可用，先保持正常状态。");
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
  setPanelTab("chat");
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

function setPanelTab(tab) {
  activePanelTab = tab;
  const isChat = tab === "chat";
  chatTabBtnEl.classList.toggle("active", isChat);
  chatTabBtnEl.setAttribute("aria-selected", String(isChat));
  statusTabBtnEl.classList.toggle("active", !isChat);
  statusTabBtnEl.setAttribute("aria-selected", String(!isChat));
  chatViewEl.classList.toggle("hidden", !isChat);
  statusViewEl.classList.toggle("hidden", isChat);

  if (!isChat) {
    renderStatusPanel();
  }
}

function renderStatusPanel() {
  const days = getCompanionDays(plantProfile.startDate);
  profileNameEl.textContent = plantProfile.name || "小财";
  profileSpeciesEl.textContent = `品种：${plantProfile.species || "-"}`;
  profileScientificEl.textContent = `学名：${plantProfile.scientificName || "-"}`;
  profileCompanionDaysEl.textContent = days ? `${days} 天陪伴` : "陪伴天数暂无";

  statusLoadingEl.classList.toggle("hidden", !statusLoading);
  statusErrorEl.classList.toggle("hidden", !statusError);
  statusErrorEl.textContent = statusError;

  const metrics = buildSensorMetrics(latestPlantStatus?.sensor_data || {});
  renderSensorCards(metrics);
  renderAchievementArea();
}

function renderSensorCards(metrics) {
  sensorGridEl.innerHTML = "";

  metrics.forEach((metric) => {
    const card = document.createElement("article");
    card.className = "sensor-card";
    card.innerHTML = `
      <div class="sensor-head">
        <span class="sensor-label">${metric.icon} ${metric.label}</span>
        <span class="sensor-status ${metric.status.tone}">${metric.status.label}</span>
      </div>
      <div class="sensor-value">${metric.displayValue}</div>
      <div class="sensor-progress">
        <div class="sensor-progress-fill ${metric.status.tone}" style="width:${metric.progress}%"></div>
      </div>
    `;
    sensorGridEl.appendChild(card);
  });
}

function renderAchievementArea() {
  if (selectedAchievementId) {
    achievementListViewEl.classList.add("hidden");
    achievementDetailViewEl.classList.remove("hidden");
    renderAchievementDetail(selectedAchievementId);
    return;
  }

  achievementDetailViewEl.classList.add("hidden");
  achievementListViewEl.classList.remove("hidden");
  renderAchievementCards();
}

function getAchievementViewModels() {
  const hasFirstChat = chatHistory.some((item) => item.role === "plant");
  return achievements.map((item) => {
    if (item.type === "first_chat") {
      return {
        ...item,
        unlocked: hasFirstChat,
        progressText: hasFirstChat ? "已完成" : "0 / 1",
      };
    }

    const current = item.current ?? 0;
    const target = item.target ?? 1;
    const unlocked = current >= target;
    return {
      ...item,
      unlocked,
      progressText: `${Math.min(current, target)} / ${target}`,
    };
  });
}

function renderAchievementCards() {
  const viewModels = getAchievementViewModels();
  achievementGridEl.innerHTML = "";

  viewModels.forEach((item) => {
    const card = document.createElement("button");
    const className = item.unlocked
      ? "unlocked"
      : item.progressText === "0 / 1"
        ? "locked"
        : "progress";
    card.type = "button";
    card.className = `achievement-card ${className}`;
    card.dataset.achievementId = item.id;
    card.innerHTML = `
      <div class="achievement-title">
        <span>${item.icon} ${item.title}</span>
        <span>${item.unlocked ? "已解锁" : "进行中"}</span>
      </div>
      <div class="achievement-desc">${item.description}</div>
      <div class="achievement-progress">${item.progressText}</div>
    `;
    achievementGridEl.appendChild(card);
  });
}

function renderAchievementDetail(achievementId) {
  const viewModels = getAchievementViewModels();
  const detail = viewModels.find((item) => item.id === achievementId);
  if (!detail) {
    achievementDetailCardEl.textContent = "未找到该成就";
    return;
  }

  achievementDetailCardEl.innerHTML = `
    <h3 class="profile-name">${detail.icon} ${detail.title}</h3>
    <p>${detail.description}</p>
    <p>完成条件：${detail.condition}</p>
    <p>当前进度：${detail.progressText}</p>
    <p>解锁状态：${detail.unlocked ? "已解锁" : "进行中"}</p>
    <p>鼓励：你在认真照顾我，我也在努力成长。</p>
  `;
}

function onAchievementClick(event) {
  const button = event.target.closest("[data-achievement-id]");
  if (!button) {
    return;
  }

  selectedAchievementId = button.dataset.achievementId;
  renderAchievementArea();
}

function backToAchievementList() {
  selectedAchievementId = null;
  renderAchievementArea();
}

function handlePetDebugAction(event) {
  const button = event.target.closest("[data-debug-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.debugAction;
  if (action === "idle") {
    clearTimeout(pendingActionTimer);
    isPetActionPlaying = false;
    setPetAnimation("idle");
    return;
  }
  if (action === "touch") {
    playPetAction("touch");
    return;
  }
  if (action === "reward-pending") {
    hasWaterRewardPending = true;
    showBubble("已设置奖励待领取，点击植物触发 reward。", { persist: true });
    return;
  }
  if (action === "mock-dry") {
    updateWaterRewardState({
      soil_moisture: plantThresholds.soilMoisture.min - 5,
    });
    showBubble("已模拟缺水状态。", { persist: true });
    return;
  }
  if (action === "mock-normal") {
    updateWaterRewardState({
      soil_moisture: plantThresholds.soilMoisture.min + 5,
    });
    showBubble("已模拟恢复正常，下一次点击可触发奖励。", { persist: true });
  }
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
      error: error instanceof Error ? error.message : "连接失败，稍后再试。",
    };
  }

  setChatPending(false);

  if (result?.reply) {
    pushChatRecord("plant", result.reply);
    showBubble(result.reply, { persist: true });
    renderPanelHistory();
    if (activePanelTab === "status") {
      renderStatusPanel();
    }
    return;
  }

  showSystemMessage(result?.error || "连接失败，稍后再试。", source);
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
  chatHistory.forEach((message) =>
    appendPanelMessage(message.role, message.text),
  );
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
  return { x: Math.round(event.screenX), y: Math.round(event.screenY) };
}

function beginDrag(event) {
  if (event.button !== 0) {
    return;
  }

  collapseChatUi();
  dragState = { startX: event.screenX, startY: event.screenY, moved: false, dragging: false };
  plantEl.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!dragState) {
    return;
  }

  const dx = event.screenX - dragState.startX;
  const dy = event.screenY - dragState.startY;
  const distanceExceeded = Math.hypot(dx, dy) > CLICK_DISTANCE_PX;
  dragState.moved = dragState.moved || distanceExceeded;

  if (!dragState.dragging && distanceExceeded) {
    dragState.dragging = true;
    window.plantPet?.startDrag(getScreenPoint(event));
  }

  if (dragState.dragging) {
    window.plantPet?.moveDrag(getScreenPoint(event));
  }
}

function endDrag() {
  if (!dragState) {
    return;
  }

  const wasDrag = dragState.moved;
  dragState = null;
  window.plantPet?.endDrag();

  if (!wasDrag) {
    handlePetClick();
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
chatTabBtnEl.addEventListener("click", () => setPanelTab("chat"));
statusTabBtnEl.addEventListener("click", () => setPanelTab("status"));
achievementGridEl.addEventListener("click", onAchievementClick);
achievementBackBtnEl.addEventListener("click", backToAchievementList);
petDebugToolsEl?.addEventListener("click", handlePetDebugAction);

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

window.petDebug = {
  setRewardPending(value = true) {
    hasWaterRewardPending = Boolean(value);
  },
  simulateDry() {
    updateWaterRewardState({
      soil_moisture: plantThresholds.soilMoisture.min - 5,
    });
  },
  simulateRecovered() {
    updateWaterRewardState({
      soil_moisture: plantThresholds.soilMoisture.min + 5,
    });
  },
  playTouch() {
    playPetAction("touch");
  },
  playReward() {
    hasWaterRewardPending = true;
    handlePetClick();
  },
  getFlags() {
    return {
      currentPetAnimation,
      isPetActionPlaying,
      wasPlantDry,
      hasWaterRewardPending,
    };
  },
};

setPlantState(currentState);
renderStatusPanel();
preloadPetAnimations().finally(() => setPetAnimation("idle"));
pollPlantStatus();
setInterval(pollPlantStatus, BACKEND_POLL_INTERVAL_MS);
