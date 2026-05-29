export const DEFAULT_SPECIES_ID = "money_tree";

export const SPECIES_ASSET_BASE = "species";

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
    id: "phalaenopsis",
    name: "蝴蝶兰",
    scientificName: "Phalaenopsis aphrodite",
    description: "喜欢柔和散射光和较高空气湿度，适合做温柔优雅的桌宠形象。",
    thresholds: {
      soilMoisture: { min: 35, max: 65 },
      temperature: { min: 18, max: 30 },
      light: { min: 8000, max: 20000 },
      humidity: { min: 50, max: 80 },
    },
    assets: {
      normal: "species/phalaenopsis/normal.png",
      dry: "species/phalaenopsis/dry.png",
      lowLight: "species/phalaenopsis/low_light.png",
      hot: "species/phalaenopsis/temperature_warning.png",
      touch: "species/phalaenopsis/touch.png",
      reward: "species/phalaenopsis/reward.png",
    },
  },
  {
    id: "succulent",
    name: "多肉",
    scientificName: "Succulent",
    description: "耐旱、喜欢充足光照，照顾重点是避免过度浇水。",
    thresholds: {
      soilMoisture: { min: 15, max: 45 },
      temperature: { min: 15, max: 32 },
      light: { min: 12000, max: 40000 },
      humidity: { min: 25, max: 60 },
    },
    assets: {
      normal: "species/succulent/normal.png",
      dry: "species/succulent/dry.png",
      lowLight: "species/succulent/low_light.png",
      hot: "species/succulent/temperature_warning.png",
      touch: "species/succulent/touch.png",
      reward: "species/succulent/reward.png",
    },
  },
];

export function getSpeciesCatalog() {
  return speciesCatalog.map((species) => cloneSpecies(species));
}

export function getSpeciesConfig(speciesId = DEFAULT_SPECIES_ID) {
  const species =
    speciesCatalog.find((item) => item.id === speciesId) ||
    speciesCatalog.find((item) => item.id === DEFAULT_SPECIES_ID);
  return cloneSpecies(species);
}

export function isKnownSpeciesId(speciesId) {
  return speciesCatalog.some((item) => item.id === speciesId);
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
