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
const bubbleTextEl = document.querySelector("#bubbleText");
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
const profileNameEditBtnEl = document.querySelector("#profileNameEditBtn");
const profileNameInputEl = document.querySelector("#profileNameInput");
const profileAvatarButtonEl = document.querySelector("#profileAvatarButton");
const profileAvatarImageEl = document.querySelector("#profileAvatarImage");
const profileAvatarInputEl = document.querySelector("#profileAvatarInput");
const profileSpeciesEl = document.querySelector("#profileSpecies");
const profileScientificEl = document.querySelector("#profileScientific");
const profileCompanionDaysNumberEl = document.querySelector("#profileCompanionDaysNumber");
const panelResizeHandleEl = document.querySelector("#panelResizeHandle");
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
const PANEL_MIN_WIDTH = 260;
const PANEL_MIN_HEIGHT = 320;
const PANEL_DEFAULT_WIDTH = 280;
const PANEL_DEFAULT_HEIGHT = 420;
const PANEL_EDGE_MARGIN = 4;
const PANEL_RESIZE_DRAG_SCALE = 1.65;

const STORAGE_KEYS = {
  plantName: "desktopPlant.plantName",
  plantAvatar: "desktopPlant.plantAvatar",
  panelSize: "desktopPlant.panelSize",
};

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
    icon: "💧",
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
let bubbleMode = "none";
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
let statusPanelInteractionsInitialized = false;
let panelResizeSession = null;
let mousePassthroughEnabled = false;
let mousePassthroughLocked = false;
let lastPointerClientPoint = null;

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
    showBubble("\u5956\u52b1\u5230\u624b\uff0c\u7ee7\u7eed\u52a0\u6cb9\u3002", { mode: "chat" });
    return;
  }

  if (isQuickChatVisible()) {
    collapseChatUi();
    return;
  }

  playPetAction("touch");
  activateInput();
  showBubble("\u6211\u5728\u5462\u3002", { mode: "chat" });
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

function hideBubble(options = {}) {
  if (bubbleMode === "abnormal" && !options.force) {
    return;
  }

  clearTimeout(bubbleTimer);
  bubbleTimer = null;
  bubbleMode = "none";
  bubbleEl.classList.add("hidden");
  syncMousePassthrough();
}

function showBubble(text, options = {}) {
  if (!text) {
    return;
  }

  if (bubbleMode === "abnormal" && options.mode !== "abnormal") {
    return;
  }

  clearTimeout(bubbleTimer);
  bubbleTimer = null;
  bubbleMode = options.mode || "chat";
  if (bubbleTextEl) {
    bubbleTextEl.textContent = text;
  } else {
    bubbleEl.textContent = text;
  }
  bubbleEl.classList.remove("hidden");
  syncMousePassthrough();

  if (!options.persist) {
    bubbleTimer = setTimeout(() => {
      hideBubble({ force: bubbleMode !== "abnormal" });
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
      showBubble("\u6211\u6709\u70b9\u6e34\u4e86\uff0c\u53ef\u4ee5\u7ed9\u6211\u6d47\u70b9\u6c34\u5417\uff1f", { mode: "abnormal", persist: true });
      break;
    case "hot_warning":
      showBubble("\u6709\u70b9\u70ed\uff0c\u6211\u60f3\u51c9\u5feb\u4e00\u4e0b\u3002", { mode: "abnormal", persist: true });
      break;
    case "recovered":
    case "touched":
    case "normal_update":
      clearAbnormalBubble();
      break;
    case "unknown":
      console.warn("[unknown plant event]", { eventType, sensorData });
      break;
    default:
      console.warn("[unsupported plant event]", { eventType, sensorData });
  }
}

function clearAbnormalBubble() {
  if (bubbleMode === "abnormal") {
    hideBubble({ force: true });
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
    if (bubbleMode === "abnormal" && status.state === "normal") {
      clearAbnormalBubble();
    }

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
}

function activateInput() {
  if (panelExpanded) {
    return;
  }

  inputBarEl.classList.remove("hidden");
  syncMousePassthrough();
  window.setTimeout(() => inlineInputEl.focus(), 50);
}

function deactivateInput() {
  if (panelExpanded) {
    return;
  }

  inputBarEl.classList.add("hidden");
  inlineInputEl.value = "";
  hideBubble();
  syncMousePassthrough();
}

function isQuickChatVisible() {
  return (
    !panelExpanded &&
    !inputBarEl.classList.contains("hidden") &&
    bubbleMode !== "abnormal"
  );
}

function expandToPanel() {
  panelExpanded = true;
  inputBarEl.classList.add("hidden");
  setPanelTab("chat");
  renderPanelHistory();
  chatPanelEl.classList.remove("hidden");
  syncResizeHandlePosition();
  syncMousePassthrough();
  window.setTimeout(() => {
    panelInputEl.focus();
    scrollChatHistory();
  }, 50);
}

function collapseToInput() {
  panelExpanded = false;
  chatPanelEl.classList.add("hidden");
  syncResizeHandlePosition();
  deactivateInput();
  syncMousePassthrough();
}

function collapseChatUi() {
  panelExpanded = false;
  chatPanelEl.classList.add("hidden");
  syncResizeHandlePosition();
  inputBarEl.classList.add("hidden");
  hideBubble();
  syncMousePassthrough();
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

function safeGetLocalStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function safeSetLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_error) {
    // Ignore quota/security errors and keep runtime behavior.
  }
}

function safeRemoveLocalStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (_error) {
    // Ignore quota/security errors and keep runtime behavior.
  }
}

function getPlantDisplayName(profile) {
  const customName = safeGetLocalStorage(STORAGE_KEYS.plantName);
  if (typeof customName === "string" && customName.trim()) {
    return customName.trim();
  }
  if (profile?.name && String(profile.name).trim()) {
    return String(profile.name).trim();
  }
  return "小财";
}

function getDefaultAvatarCandidates() {
  return [
    "./assets/pet/idle_fixed.gif",
    "./assets/pet/touch_fixed.gif",
    "./assets/pet/reward_fixed.gif",
  ];
}

function getPlantAvatarSrc() {
  const customAvatar = safeGetLocalStorage(STORAGE_KEYS.plantAvatar);
  if (typeof customAvatar === "string" && customAvatar.startsWith("data:image/")) {
    return customAvatar;
  }
  return getDefaultAvatarCandidates()[0];
}

function savePanelSize(width, height) {
  const payload = JSON.stringify({
    width: Math.round(width),
    height: Math.round(height),
  });
  safeSetLocalStorage(STORAGE_KEYS.panelSize, payload);
}

function loadPanelSize() {
  const raw = safeGetLocalStorage(STORAGE_KEYS.panelSize);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      Number.isFinite(parsed?.width) &&
      Number.isFinite(parsed?.height) &&
      parsed.width >= PANEL_MIN_WIDTH &&
      parsed.height >= PANEL_MIN_HEIGHT
    ) {
      return {
        width: Math.round(parsed.width),
        height: Math.round(parsed.height),
      };
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function applyPanelSize(width, height) {
  const rect = chatPanelEl.getBoundingClientRect();
  const panelRight = window.innerWidth - rect.right;
  const panelTop = rect.top;
  const maxWidth = Math.max(PANEL_MIN_WIDTH, window.innerWidth - panelRight - PANEL_EDGE_MARGIN);
  const maxHeight = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - panelTop - PANEL_EDGE_MARGIN);
  const nextWidth = Math.min(maxWidth, Math.max(PANEL_MIN_WIDTH, width));
  const nextHeight = Math.min(maxHeight, Math.max(PANEL_MIN_HEIGHT, height));
  chatPanelEl.style.width = `${nextWidth}px`;
  chatPanelEl.style.height = `${nextHeight}px`;
  syncResizeHandlePosition();
}

function syncResizeHandlePosition() {
  if (!panelResizeHandleEl) {
    return;
  }
  const hidden = chatPanelEl.classList.contains("hidden");
  panelResizeHandleEl.classList.toggle("hidden", hidden);
}

function beginPanelResize(event) {
  if (!panelResizeHandleEl || event.button !== 0) {
    return;
  }
  lockMousePassthrough();
  event.stopPropagation();
  const rect = chatPanelEl.getBoundingClientRect();
  chatPanelEl.style.top = `${Math.round(rect.top)}px`;
  chatPanelEl.style.bottom = "auto";
  panelResizeSession = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
  };
  panelResizeHandleEl.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function movePanelResize(event) {
  if (!panelResizeSession || panelResizeSession.pointerId !== event.pointerId) {
    return;
  }
  const dx = panelResizeSession.startX - event.clientX;
  event.stopPropagation();
  const dy = event.clientY - panelResizeSession.startY;
  const width = panelResizeSession.startWidth + dx * PANEL_RESIZE_DRAG_SCALE;
  const height = panelResizeSession.startHeight + dy * PANEL_RESIZE_DRAG_SCALE;
  applyPanelSize(width, height);
}

function endPanelResize(event) {
  if (!panelResizeSession || panelResizeSession.pointerId !== event.pointerId) {
    return;
  }
  event.stopPropagation();
  const rect = chatPanelEl.getBoundingClientRect();
  savePanelSize(rect.width, rect.height);
  panelResizeSession = null;
  unlockMousePassthrough({ clientX: event.clientX, clientY: event.clientY });
}

function initPanelResize() {
  if (!panelResizeHandleEl) {
    return;
  }
  const savedSize = loadPanelSize();
  if (savedSize) {
    applyPanelSize(savedSize.width, savedSize.height);
  } else {
    applyPanelSize(PANEL_DEFAULT_WIDTH, PANEL_DEFAULT_HEIGHT);
  }

  panelResizeHandleEl.addEventListener("pointerdown", beginPanelResize);
  panelResizeHandleEl.addEventListener("pointermove", movePanelResize);
  panelResizeHandleEl.addEventListener("pointerup", endPanelResize);
  panelResizeHandleEl.addEventListener("pointercancel", endPanelResize);
  panelResizeHandleEl.addEventListener("click", (event) => event.stopPropagation());
  window.addEventListener("resize", () => {
    const rect = chatPanelEl.getBoundingClientRect();
    applyPanelSize(rect.width, rect.height);
    syncResizeHandlePosition();
  });
}

function startPlantNameEditing() {
  if (!profileNameInputEl) {
    return;
  }
  profileNameInputEl.classList.remove("hidden");
  profileNameInputEl.value = getPlantDisplayName(plantProfile);
  profileNameInputEl.focus();
  profileNameInputEl.select();
}

function commitPlantNameEditing() {
  if (!profileNameInputEl) {
    return;
  }
  const nextName = profileNameInputEl.value.trim();
  if (nextName) {
    safeSetLocalStorage(STORAGE_KEYS.plantName, nextName);
  } else {
    safeRemoveLocalStorage(STORAGE_KEYS.plantName);
  }
  profileNameInputEl.classList.add("hidden");
  renderStatusPanel();
}

function initPlantNameEditor() {
  if (!profileNameEditBtnEl || !profileNameEl || !profileNameInputEl) {
    return;
  }
  profileNameEditBtnEl.addEventListener("click", startPlantNameEditing);
  profileNameEl.addEventListener("click", startPlantNameEditing);
  profileNameInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commitPlantNameEditing();
    }
    if (event.key === "Escape") {
      profileNameInputEl.classList.add("hidden");
    }
  });
  profileNameInputEl.addEventListener("blur", commitPlantNameEditing);
}

function onAvatarLoadError(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLImageElement)) {
    return;
  }
  const candidates = getDefaultAvatarCandidates();
  const current = target.dataset.avatarFallbackIndex
    ? Number.parseInt(target.dataset.avatarFallbackIndex, 10)
    : 0;
  const next = current + 1;
  if (next < candidates.length) {
    target.dataset.avatarFallbackIndex = String(next);
    target.src = candidates[next];
    return;
  }
  target.dataset.avatarFallbackIndex = "0";
  target.src =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='88' height='88' viewBox='0 0 88 88'%3E%3Ccircle cx='44' cy='44' r='44' fill='%23e8f5ec'/%3E%3Ctext x='44' y='51' text-anchor='middle' font-size='32'%3E%F0%9F%8C%B1%3C/text%3E%3C/svg%3E";
}

function readAvatarFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取头像失败"));
    reader.readAsDataURL(file);
  });
}

async function handleAvatarFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    return;
  }
  const dataUrl = await readAvatarFileAsDataUrl(file);
  safeSetLocalStorage(STORAGE_KEYS.plantAvatar, dataUrl);
  renderStatusPanel();
  event.target.value = "";
}

function initAvatarUploader() {
  if (!profileAvatarButtonEl || !profileAvatarInputEl || !profileAvatarImageEl) {
    return;
  }
  profileAvatarButtonEl.addEventListener("click", () => profileAvatarInputEl.click());
  profileAvatarInputEl.addEventListener("change", (event) => {
    handleAvatarFileSelected(event).catch((error) => {
      console.warn("[avatar upload failed]", error);
    });
  });
  profileAvatarImageEl.addEventListener("error", onAvatarLoadError);
}

function initStatusPanelInteractions() {
  if (statusPanelInteractionsInitialized) {
    return;
  }
  statusPanelInteractionsInitialized = true;
  initPanelResize();
  initPlantNameEditor();
  initAvatarUploader();
  syncResizeHandlePosition();
}

function getInteractiveElements() {
  return [
    plantEl,
    bubbleEl,
    inputBarEl,
    chatPanelEl,
  ].filter((element) => element && !element.classList.contains("hidden"));
}

function isPointInsideElement(point, element) {
  const rect = element.getBoundingClientRect();
  return (
    point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom
  );
}

function isPointInsideInteractiveUi(point) {
  if (!point) {
    return true;
  }
  return getInteractiveElements().some((element) => isPointInsideElement(point, element));
}

function setMousePassthrough(enabled) {
  if (mousePassthroughEnabled === enabled) {
    return;
  }
  mousePassthroughEnabled = enabled;
  window.plantPet?.setMousePassthrough(enabled);
}

function syncMousePassthrough(point = lastPointerClientPoint) {
  if (mousePassthroughLocked) {
    setMousePassthrough(false);
    return;
  }
  setMousePassthrough(!isPointInsideInteractiveUi(point));
}

function lockMousePassthrough() {
  mousePassthroughLocked = true;
  setMousePassthrough(false);
}

function unlockMousePassthrough(point = lastPointerClientPoint) {
  mousePassthroughLocked = false;
  syncMousePassthrough(point);
}

function renderStatusPanel() {
  const days = getCompanionDays(plantProfile.startDate);
  profileNameEl.textContent = getPlantDisplayName(plantProfile);
  profileSpeciesEl.textContent = `品种：${plantProfile.species || "-"}`;
  profileScientificEl.textContent = `学名：${plantProfile.scientificName || "-"}`;
  profileCompanionDaysNumberEl.textContent = Number.isFinite(days) ? String(days) : "-";

  if (profileAvatarImageEl) {
    profileAvatarImageEl.dataset.avatarFallbackIndex = "0";
    profileAvatarImageEl.src = getPlantAvatarSrc();
  }

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
    showBubble("\u5df2\u8bbe\u7f6e\u5956\u52b1\u5f85\u9886\u53d6\uff0c\u70b9\u51fb\u690d\u7269\u4f1a\u89e6\u53d1 reward\u3002", { mode: "chat" });
    return;
  }
  if (action === "mock-dry") {
    const sensorData = {
      soil_moisture: plantThresholds.soilMoisture.min - 5,
    };
    updateWaterRewardState(sensorData);
    setPlantState("thirsty");
    showBubbleByEventType("thirsty_warning", sensorData);
    return;
  }
  if (action === "mock-normal") {
    const sensorData = {
      soil_moisture: plantThresholds.soilMoisture.min + 5,
    };
    updateWaterRewardState(sensorData);
    setPlantState("normal");
    showBubbleByEventType("recovered", sensorData);
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
  if (shouldShowChatBubble(source)) {
    showBubble("...", { mode: "chat", persist: true });
  }

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
    if (shouldShowChatBubble(source)) {
      showBubble(result.reply, { mode: "chat" });
    } else {
      hideBubble();
    }
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

function shouldShowChatBubble(source) {
  return (
    source === "inline" &&
    !panelExpanded &&
    !inputBarEl.classList.contains("hidden")
  );
}

function showSystemMessage(text, source) {
  if (shouldShowChatBubble(source)) {
    showBubble(text, { mode: "chat" });
  } else {
    hideBubble();
  }
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
  if (inlineSendBtnEl.querySelector("svg")) {
    inlineSendBtnEl.setAttribute("aria-label", isPending ? "发送中" : "发送");
  } else {
    inlineSendBtnEl.textContent = isPending ? "..." : "→";
  }
  panelSendBtnEl.textContent = isPending ? "发送中" : "发送";
}

function getScreenPoint(event) {
  return { x: Math.round(event.screenX), y: Math.round(event.screenY) };
}

function beginDrag(event) {
  if (event.button !== 0) {
    return;
  }

  lockMousePassthrough();
  if (!panelExpanded) {
    collapseChatUi();
  }
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

function endDrag(event) {
  if (!dragState) {
    return;
  }

  const wasDrag = dragState.moved;
  dragState = null;
  window.plantPet?.endDrag();
  unlockMousePassthrough({ clientX: event.clientX, clientY: event.clientY });

  if (!wasDrag) {
    handlePetClick();
  }
}

plantEl.addEventListener("pointerdown", beginDrag);
plantEl.addEventListener("pointermove", moveDrag);
plantEl.addEventListener("pointerup", endDrag);
plantEl.addEventListener("pointercancel", endDrag);

document.addEventListener("pointermove", (event) => {
  lastPointerClientPoint = { clientX: event.clientX, clientY: event.clientY };
  syncMousePassthrough(lastPointerClientPoint);
});

document.addEventListener("pointerleave", () => {
  lastPointerClientPoint = null;
  syncMousePassthrough(null);
});

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
  if (panelExpanded) {
    return;
  }

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

initStatusPanelInteractions();
setPlantState(currentState);
renderStatusPanel();
setPetAnimation("idle");
preloadPetAnimations();
syncMousePassthrough();
pollPlantStatus();
setInterval(pollPlantStatus, BACKEND_POLL_INTERVAL_MS);
