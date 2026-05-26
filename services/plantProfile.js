const DEFAULT_PLANT_PROFILE = {
  // TODO: replace with user setting from localStorage / Supabase profile.
  name: "小财",
  species: "发财树",
  scientificName: "Pachira Aquatica",
  startDate: "2026-05-07",
};

export function getPlantProfile() {
  return { ...DEFAULT_PLANT_PROFILE };
}

export function getCompanionDays(startDate) {
  if (!startDate) {
    return null;
  }

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const now = new Date();
  const ms = now.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)) + 1);
}
