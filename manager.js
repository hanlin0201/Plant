import {
  getCurrentUser,
  isLoggedIn,
  signIn,
  signOut,
} from "./services/authService.js";
import {
  getAvailablePlantSpecies,
  getSelectedPlantProfile,
  getSelectedSpeciesId,
  setSelectedSpeciesId,
} from "./services/plantSelectionService.js";
import {
  DEFAULT_DEVICE_ID,
  loadRemoteSelectionOrFallback,
  upsertUserPlant,
} from "./services/userPlantService.js";
import { getPlantAssetCandidates } from "./services/assetResolver.js";

const emailInputEl = document.querySelector("#emailInput");
const loginBtnEl = document.querySelector("#loginBtn");
const logoutBtnEl = document.querySelector("#logoutBtn");
const authStatusEl = document.querySelector("#authStatus");
const currentUserTextEl = document.querySelector("#currentUserText");
const syncStatusTextEl = document.querySelector("#syncStatusText");
const speciesListEl = document.querySelector("#speciesList");
const selectedSpeciesTextEl = document.querySelector("#selectedSpeciesText");
const currentPlantTextEl = document.querySelector("#currentPlantText");
const currentStateTextEl = document.querySelector("#currentStateText");

function renderAuth() {
  const user = getCurrentUser();
  const loggedIn = isLoggedIn();
  authStatusEl.textContent = loggedIn ? "已登录" : "未登录";
  currentUserTextEl.textContent = loggedIn
    ? `当前用户：${user.email}`
    : "当前用户：未登录";
  logoutBtnEl.disabled = !loggedIn;
}

function renderSpeciesList() {
  const selectedSpeciesId = getSelectedSpeciesId();
  speciesListEl.innerHTML = "";

  getAvailablePlantSpecies().forEach((species) => {
    const previewSrc = getPlantPreviewSrc(species);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `species-card ${species.id === selectedSpeciesId ? "selected" : ""}`;
    button.dataset.speciesId = species.id;
    button.innerHTML = `
      <div class="species-card-content">
        <div class="species-copy">
          <div class="species-title">
            <span>${species.name}</span>
            <span>${species.id === selectedSpeciesId ? "当前" : "选择"}</span>
          </div>
          <p class="species-latin">${species.scientificName || ""}</p>
          <p class="species-desc">${species.description}</p>
        </div>
        <div class="species-preview">
          <img src="${previewSrc}" alt="${species.name}形象预览" loading="lazy" />
        </div>
      </div>
    `;
    const previewImage = button.querySelector(".species-preview img");
    previewImage?.addEventListener("error", () => {
      previewImage.src = getFallbackPreviewSrc();
    }, { once: true });
    speciesListEl.appendChild(button);
  });
}

function getPlantPreviewSrc(species) {
  return getPlantAssetCandidates(species.id, "normal")[0] || getFallbackPreviewSrc();
}

function getFallbackPreviewSrc() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='24' fill='%23e8f5ec'/%3E%3Ctext x='48' y='58' text-anchor='middle' font-size='38'%3E%F0%9F%8C%B1%3C/text%3E%3C/svg%3E";
}

function renderCurrentPlant() {
  const profile = getSelectedPlantProfile();
  selectedSpeciesTextEl.textContent = profile.species;
  currentPlantTextEl.textContent = `${profile.species} · ${profile.scientificName || "-"}`;
}

function renderManager() {
  renderAuth();
  renderSpeciesList();
  renderCurrentPlant();
}

function setSyncStatus(message, type = "") {
  if (!syncStatusTextEl) {
    return;
  }

  syncStatusTextEl.textContent = message;
  syncStatusTextEl.classList.remove("success", "warning", "error");
  if (type) {
    syncStatusTextEl.classList.add(type);
  }
}

function notifyPlantSelectionChanged(speciesId = getSelectedSpeciesId()) {
  window.plantPet?.setPlantSelection(speciesId);
}

async function handleLogin() {
  try {
    const user = signIn(emailInputEl.value);
    emailInputEl.value = user.email;
    window.plantPet?.notifyAuthChanged({ user });
    renderManager();
    await restoreRemoteSelectionForUser(user);
  } catch (error) {
    setSyncStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

function handleLogout() {
  signOut();
  window.plantPet?.notifyAuthChanged({ user: null });
  setSyncStatus("已退出登录，植物选择仍保存在本地。", "warning");
  renderManager();
}

function handleSpeciesClick(event) {
  const button = event.target.closest("[data-species-id]");
  if (!button) {
    return;
  }

  const speciesId = setSelectedSpeciesId(button.dataset.speciesId);
  notifyPlantSelectionChanged(speciesId);
  renderManager();

  if (!isLoggedIn()) {
    setSyncStatus("未登录，仅保存到本地。", "warning");
    return;
  }

  setSyncStatus("本地已保存，正在同步到数据库...", "");
  void syncSelectedPlantToRemote(getCurrentUser(), speciesId);
}

async function syncSelectedPlantToRemote(user, speciesId = getSelectedSpeciesId()) {
  if (!user?.id) {
    setSyncStatus("未登录，仅保存到本地。", "warning");
    return;
  }

  const profile = getSelectedPlantProfile();
  try {
    await upsertUserPlant({
      userId: user.id,
      deviceId: DEFAULT_DEVICE_ID,
      speciesId,
      displayName: profile.species,
    });
    setSyncStatus("已同步到数据库。", "success");
  } catch (error) {
    console.error("[manager] failed to sync plant selection", error);
    setSyncStatus("本地已保存，数据库同步失败。", "error");
  }
}

async function restoreRemoteSelectionForUser(user) {
  if (!user?.id) {
    setSyncStatus("未登录时，植物选择只会保存到本地。", "warning");
    return;
  }

  setSyncStatus("正在从数据库恢复植物选择...", "");
  const result = await loadRemoteSelectionOrFallback(user.id, DEFAULT_DEVICE_ID);
  renderManager();

  if (result.status === "remote") {
    notifyPlantSelectionChanged(result.speciesId);
    setSyncStatus("已从数据库恢复植物选择。", "success");
    return;
  }

  if (result.status === "fallback_default") {
    notifyPlantSelectionChanged(result.speciesId);
    setSyncStatus("数据库中的植物不存在，已回退到默认植物。", "warning");
    return;
  }

  if (result.reason === "request_failed") {
    setSyncStatus("数据库暂时不可用，已使用本地植物选择。", "warning");
    return;
  }

  setSyncStatus("数据库暂无记录，继续使用本地植物选择。", "warning");
}

loginBtnEl.addEventListener("click", () => {
  void handleLogin();
});
logoutBtnEl.addEventListener("click", handleLogout);
speciesListEl.addEventListener("click", handleSpeciesClick);
emailInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    void handleLogin();
  }
});

window.plantPet?.onPlantSelectionChanged(() => {
  renderManager();
});

window.plantPet?.onAuthChanged((payload) => {
  if (payload?.user?.email) {
    emailInputEl.value = payload.user.email;
  }
  renderManager();
});

currentStateTextEl.textContent = "由小组件侧读取 / 调试按钮更新";
renderManager();

if (isLoggedIn()) {
  const user = getCurrentUser();
  if (user?.email) {
    emailInputEl.value = user.email;
  }
  void restoreRemoteSelectionForUser(user);
} else {
  setSyncStatus("未登录时，植物选择只会保存到本地。", "warning");
}
