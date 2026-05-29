import { DEFAULT_SPECIES_ID, getSpeciesConfig } from "./speciesCatalog.js";

const ASSET_ROOT = "./assets";

export function getAssetPath(relativeAssetPath) {
  if (!relativeAssetPath || typeof relativeAssetPath !== "string") {
    return "";
  }

  const normalized = relativeAssetPath
    .replace(/\\/g, "/")
    .replace(/^\.?\/*assets\//, "")
    .replace(/^\/+/, "");

  return `${ASSET_ROOT}/${normalized}`;
}

export function resolvePlantAsset(speciesId, assetName = "normal") {
  const speciesConfig = getSpeciesConfig(speciesId);
  const fallbackConfig = getSpeciesConfig(DEFAULT_SPECIES_ID);
  const relativeAssetPath =
    speciesConfig.assets?.[assetName] ||
    speciesConfig.assets?.normal ||
    fallbackConfig.assets?.[assetName] ||
    fallbackConfig.assets?.normal;

  return getAssetPath(relativeAssetPath);
}

export function getPlantAssetCandidates(speciesId, assetName = "normal") {
  const selected = resolvePlantAsset(speciesId, assetName);
  const fallback = resolvePlantAsset(DEFAULT_SPECIES_ID, assetName);
  const normalFallback = resolvePlantAsset(DEFAULT_SPECIES_ID, "normal");
  return Array.from(new Set([selected, fallback, normalFallback].filter(Boolean)));
}
