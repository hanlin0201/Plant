import {
  DEFAULT_SPECIES_ID,
  isKnownSpeciesId,
  normalizeSpeciesId,
} from "./speciesCatalog.js";
import {
  getSelectedPlantProfile,
  getSelectedSpeciesId,
  setSelectedSpeciesId,
} from "./plantSelectionService.js";
import { requestSupabaseTable } from "./supabaseRestClient.js";

export const USER_PLANTS_TABLE = "user_plants";
export const DEFAULT_DEVICE_ID = "sensor_001";

export async function getUserPlant(userId, deviceId = DEFAULT_DEVICE_ID) {
  if (!userId || !deviceId) {
    return null;
  }

  const rows = await requestSupabaseTable(USER_PLANTS_TABLE, {
    method: "GET",
    query: {
      user_id: `eq.${userId}`,
      device_id: `eq.${deviceId}`,
      select: "id,user_id,device_id,species_id,display_name,created_at,updated_at",
      limit: 1,
    },
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function upsertUserPlant({
  userId,
  deviceId = DEFAULT_DEVICE_ID,
  speciesId,
  displayName,
}) {
  if (!userId) {
    throw new Error("缺少 userId，无法同步植物选择。");
  }
  if (!deviceId) {
    throw new Error("缺少 deviceId，无法同步植物选择。");
  }

  const normalizedSpeciesId = normalizeSpeciesId(speciesId);
  if (!isKnownSpeciesId(normalizedSpeciesId)) {
    throw new Error(`未知植物 species_id：${speciesId}`);
  }

  const rows = await requestSupabaseTable(USER_PLANTS_TABLE, {
    method: "POST",
    query: { on_conflict: "user_id,device_id" },
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: {
      user_id: userId,
      device_id: deviceId,
      species_id: normalizedSpeciesId,
      display_name: displayName || null,
      updated_at: new Date().toISOString(),
    },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function maybeSyncLocalSelectionToRemote(userId, deviceId = DEFAULT_DEVICE_ID) {
  if (!userId) {
    return { status: "skipped", reason: "not_logged_in" };
  }

  const speciesId = getSelectedSpeciesId();
  const profile = getSelectedPlantProfile();
  const record = await upsertUserPlant({
    userId,
    deviceId,
    speciesId,
    displayName: profile.species,
  });

  return { status: "synced", record };
}

export async function loadRemoteSelectionOrFallback(userId, deviceId = DEFAULT_DEVICE_ID) {
  if (!userId) {
    return {
      status: "local",
      reason: "not_logged_in",
      speciesId: getSelectedSpeciesId(),
    };
  }

  let record;
  try {
    record = await getUserPlant(userId, deviceId);
  } catch (error) {
    console.warn("[userPlantService] failed to load remote selection", error);
    return {
      status: "local",
      reason: "request_failed",
      speciesId: getSelectedSpeciesId(),
      error,
    };
  }

  if (!record?.species_id) {
    return {
      status: "local",
      reason: "remote_empty",
      speciesId: getSelectedSpeciesId(),
    };
  }

  const remoteSpeciesId = normalizeSpeciesId(record.species_id);
  if (!isKnownSpeciesId(remoteSpeciesId)) {
    console.warn("[userPlantService] unknown remote species_id, fallback to default", {
      speciesId: record.species_id,
    });
    const fallbackSpeciesId = setSelectedSpeciesId(DEFAULT_SPECIES_ID);
    return {
      status: "fallback_default",
      reason: "unknown_species_id",
      speciesId: fallbackSpeciesId,
      record,
    };
  }

  const speciesId = setSelectedSpeciesId(remoteSpeciesId);
  return { status: "remote", speciesId, record };
}
