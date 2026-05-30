export const DEFAULT_SPECIES_ID = "money_tree";

export const SPECIES_ASSET_BASE = "species";

export const LEGACY_SPECIES_ID_MAP = {
  phalaenopsis: "stephania_erecta",
  succulent: "oxalis_triangularis",
};

const speciesCatalog = [
  {
    id: "money_tree",
    name: "发财树",
    scientificName: "Pachira Aquatica",
    description: "寓意生机和好运，适合温暖、明亮但不过晒的环境。",
    thresholds: {
      soilMoisture: { min: 25, max: 60 },
      temperature: { min: 18, max: 30 },
      light: { min: 10000, max: 30000 },
      humidity: { min: 40, max: 70 },
    },
    assets: {
      normal: "pet/idle_fixed.gif",
      dry: "pet/idle_fixed.gif",
      lowLight: "pet/idle_fixed.gif",
      hot: "pet/idle_fixed.gif",
      touch: "pet/touch_fixed.gif",
      reward: "pet/reward_fixed.gif",
    },
  },
  {
    id: "stephania_erecta",
    name: "山乌龟",
    scientificName: "Stephania erecta",
    description: "块根圆润像小龟壳，藤蔓和叶片轻盈舒展，喜欢明亮散射光、温暖通风和不过湿的土壤。",
    thresholds: {
      soilMoisture: { min: 25, max: 55 },
      temperature: { min: 18, max: 30 },
      light: { min: 8000, max: 22000 },
      humidity: { min: 45, max: 75 },
    },
    assets: {
      normal: "species/stephania_erecta/normal.png",
      dry: "species/stephania_erecta/dry.png",
      lowLight: "species/stephania_erecta/low_light.png",
      hot: "species/stephania_erecta/temperature_warning.png",
      touch: "species/stephania_erecta/touch.png",
      reward: "species/stephania_erecta/reward.png",
    },
  },
  {
    id: "oxalis_triangularis",
    name: "酢浆草",
    scientificName: "Oxalis triangularis",
    description: "叶片像小蝴蝶一样开合，偏爱明亮散射光和微润土壤，太晒或长期缺水时容易垂头。",
    thresholds: {
      soilMoisture: { min: 30, max: 65 },
      temperature: { min: 15, max: 28 },
      light: { min: 7000, max: 25000 },
      humidity: { min: 40, max: 75 },
    },
    assets: {
      normal: "species/oxalis_triangularis/normal.png",
      dry: "species/oxalis_triangularis/dry.png",
      lowLight: "species/oxalis_triangularis/low_light.png",
      hot: "species/oxalis_triangularis/temperature_warning.png",
      touch: "species/oxalis_triangularis/touch.png",
      reward: "species/oxalis_triangularis/reward.png",
    },
  },
];

export function getSpeciesCatalog() {
  return speciesCatalog.map((species) => cloneSpecies(species));
}

export function getSpeciesConfig(speciesId = DEFAULT_SPECIES_ID) {
  const normalizedSpeciesId = normalizeSpeciesId(speciesId);
  const species =
    speciesCatalog.find((item) => item.id === normalizedSpeciesId) ||
    speciesCatalog.find((item) => item.id === DEFAULT_SPECIES_ID);
  return cloneSpecies(species);
}

export function isKnownSpeciesId(speciesId) {
  return speciesCatalog.some((item) => item.id === normalizeSpeciesId(speciesId));
}

export function normalizeSpeciesId(speciesId) {
  return LEGACY_SPECIES_ID_MAP[speciesId] || speciesId;
}

function cloneSpecies(species) {
  return {
    ...species,
    thresholds: {
      soilMoisture: { ...species.thresholds.soilMoisture },
      temperature: { ...species.thresholds.temperature },
      light: { ...species.thresholds.light },
      humidity: { ...species.thresholds.humidity },
    },
    assets: { ...species.assets },
  };
}
