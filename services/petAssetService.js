import { DEFAULT_SPECIES_ID, getSpeciesConfig } from "./speciesCatalog.js";
import { getAssetPath } from "./assetResolver.js";

const STATE_ASSET_KEYS = {
  normal: "normal",
  unknown: "normal",
  thirsty: "dry",
  weak_light: "lowLight",
  strong_light: "hot",
  hot: "hot",
  cold: "normal",
  humidity_warning: "normal",
};

const ACTION_ASSET_KEYS = {
  idle: "normal",
  touch: "touch",
  reward: "reward",
};

export function getAssetKeyForPlantState(state) {
  return STATE_ASSET_KEYS[state] || "normal";
}

export function getPetStateAssetCandidates(speciesConfig, state) {
  return getPetAssetCandidates(speciesConfig, getAssetKeyForPlantState(state));
}

export function getPetActionAssetCandidates(speciesConfig, actionName) {
  return getPetAssetCandidates(speciesConfig, ACTION_ASSET_KEYS[actionName] || "normal");
}

function getPetAssetCandidates(speciesConfig, assetKey) {
  const selectedConfig = speciesConfig?.id
    ? getSpeciesConfig(speciesConfig.id)
    : getSpeciesConfig(DEFAULT_SPECIES_ID);
  const fallbackConfig = getSpeciesConfig(DEFAULT_SPECIES_ID);
  const candidates = [
    selectedConfig.assets?.[assetKey],
    selectedConfig.assets?.normal,
    fallbackConfig.assets?.[assetKey],
    fallbackConfig.assets?.normal,
  ];

  return Array.from(new Set(candidates.filter(Boolean).map(getAssetPath)));
}
