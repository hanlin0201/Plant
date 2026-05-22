const CHAT_API_URL =
  "https://jifvbfumwasmnqmxvgmv.supabase.co/functions/v1/chat";

// Fill this with the Supabase Legacy anon public key only.
// Never put AI_API_KEY, service_role keys, sb_secret keys, or database passwords here.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppZnZiZnVtd2FzbW5xbXh2Z212Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjgxMjIsImV4cCI6MjA5NDk0NDEyMn0.JcIt36GHjgNPAnLZ8zsZ4BwE_QbXXddCAMkviL55Pk4";

export async function sendPlantMessage(messages, deviceId = "sensor_001") {
  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      device_id: deviceId,
      messages,
    }),
  });

  const body = await safeJson(response);

  if (!response.ok) {
    throw new Error(
      body?.error?.message ||
        `Plant chat request failed: ${response.status}. 我现在有点连不上云端。`,
    );
  }

  return {
    reply: body.reply || "",
    plant_state: body.plant_state || "unknown",
    event_type: body.event_type || "unknown",
  };
}

function buildHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };

  if (SUPABASE_ANON_KEY) {
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  return headers;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
