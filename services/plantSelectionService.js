import {
  DEFAULT_SPECIES_ID,
  getSpeciesCatalog,
  getSpeciesConfig,
  isKnownSpeciesId,
  normalizeSpeciesId,
} from "./speciesCatalog.js";

export const PLANT_SELECTION_STORAGE_KEY = "desktopPlant.selectedSpeciesId";

export function getAvailablePlantSpecies() {
  return getSpeciesCatalog();
}

export function getSelectedSpeciesId(storage = window.localStorage) {
  const storedSpeciesId = safeGet(storage, PLANT_SELECTION_STORAGE_KEY);
  const normalizedSpeciesId = normalizeSpeciesId(storedSpeciesId);
  return isKnownSpeciesId(normalizedSpeciesId) ? normalizedSpeciesId : DEFAULT_SPECIES_ID;
}

export function setSelectedSpeciesId(speciesId, storage = window.localStorage) {
  const normalizedSpeciesId = normalizeSpeciesId(speciesId);
  const nextSpeciesId = isKnownSpeciesId(normalizedSpeciesId)
    ? normalizedSpeciesId
    : DEFAULT_SPECIES_ID;
  safeSet(storage, PLANT_SELECTION_STORAGE_KEY, nextSpeciesId);
  return nextSpeciesId;
}

export function getSelectedSpeciesConfig(storage = window.localStorage) {
  return getSpeciesConfig(getSelectedSpeciesId(storage));
}

export function getSelectedPlantProfile(storage = window.localStorage) {
  const speciesConfig = getSelectedSpeciesConfig(storage);
  return {
    name: "小财",
    speciesId: speciesConfig.id,
    species: speciesConfig.name,
    scientificName: speciesConfig.scientificName,
    description: speciesConfig.description,
    thresholds: speciesConfig.thresholds,
    assets: speciesConfig.assets,
    startDate: "2026-05-07",
  };
}

function safeGet(storage, key) {
  try {
    return storage?.getItem(key);
  } catch (_error) {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch (_error) {
    // Keep the demo usable in restricted storage environments.
  }
}
