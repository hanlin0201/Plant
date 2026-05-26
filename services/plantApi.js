import { callSupabaseFunction } from "./supabaseFunctionClient.js";

export async function getPlantStatus(deviceId = "sensor_001") {
  const body = await callSupabaseFunction("latest-data", {
    method: "GET",
    query: { device_id: deviceId },
  });
  return normalizePlantStatus(body);
}

export function decidePlantStateFallback(sensorData) {
  if (
    !sensorData ||
    typeof sensorData.soil_moisture !== "number" ||
    typeof sensorData.temperature !== "number"
  ) {
    return "unknown";
  }

  if (sensorData.soil_moisture < 30) {
    return "thirsty";
  }

  if (sensorData.temperature > 32) {
    return "hot";
  }

  return "normal";
}

function normalizePlantStatus(body) {
  if (!body || typeof body !== "object") {
    console.warn("[plantApi] latest-data returned empty response");
    return {
      device_id: null,
      plant_id: null,
      reading_id: null,
      sensor_data: {},
      state: "unknown",
      event_type: "unknown",
      trigger_type: "periodic",
      created_at: null,
    };
  }

  const sensorData = body.sensor_data || {};

  return {
    device_id: body.device_id,
    plant_id: body.plant_id ?? null,
    reading_id: body.reading_id,
    sensor_data: sensorData,
    state: body.state || decidePlantStateFallback(sensorData),
    event_type: body.event_type || "unknown",
    trigger_type: body.trigger_type || "periodic",
    created_at: body.created_at,
  };
}
