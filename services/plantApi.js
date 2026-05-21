const PLANT_API_BASE_URL =
  "https://jifvbfumwasmnqmxvgmv.supabase.co/functions/v1";

// Fill this with the Supabase Legacy anon public key only.
// Never put service_role keys, sb_secret keys, or database passwords here.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppZnZiZnVtd2FzbW5xbXh2Z212Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjgxMjIsImV4cCI6MjA5NDk0NDEyMn0.JcIt36GHjgNPAnLZ8zsZ4BwE_QbXXddCAMkviL55Pk4";

export async function getPlantStatus(deviceId = "sensor_001") {
  const url = new URL(`${PLANT_API_BASE_URL}/latest-data`);
  url.searchParams.set("device_id", deviceId);

  const response = await fetch(url.toString(), {
    headers: buildHeaders(),
  });

  if (!response.ok) {
    const errorBody = await safeJson(response);
    throw new Error(
      errorBody?.error?.message ||
        `Failed to fetch latest plant status: ${response.status}`,
    );
  }

  const body = await response.json();
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

function buildHeaders() {
  if (!SUPABASE_ANON_KEY) {
    return {};
  }

  return {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

function normalizePlantStatus(body) {
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

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
