import { callSupabaseFunction } from "./supabaseFunctionClient.js";

export async function sendPlantMessage(messages, deviceId = "sensor_001") {
  const body = await callSupabaseFunction("chat", {
    method: "POST",
    body: {
      device_id: deviceId,
      messages,
    },
  });

  return {
    reply: body.reply || "",
    plant_state: body.plant_state || "unknown",
    event_type: body.event_type || "unknown",
  };
}
