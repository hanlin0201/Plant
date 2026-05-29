const DEFAULT_DEVICE_DATA_API_URL =
  "http://127.0.0.1:54321/functions/v1/device-data";

const apiUrl = process.env.DEVICE_DATA_API_URL || DEFAULT_DEVICE_DATA_API_URL;

const basePayload = {
  device_id: "sensor_001",
  plant_id: "plant_001",
  light: 350,
  air_humidity: 55,
  fertility: 800,
  battery: 87,
};

const scenarios = {
  normal: [
    {
      ...basePayload,
      soil_moisture: 55,
      temperature: 27,
      trigger_type: "manual_test",
    },
  ],
  thirsty: [
    {
      ...basePayload,
      soil_moisture: 20,
      temperature: 27,
      trigger_type: "manual_test",
    },
  ],
  hot: [
    {
      ...basePayload,
      soil_moisture: 50,
      temperature: 35,
      trigger_type: "manual_test",
    },
  ],
  recovered: [
    {
      ...basePayload,
      soil_moisture: 20,
      temperature: 27,
      trigger_type: "manual_test",
    },
    {
      ...basePayload,
      soil_moisture: 60,
      temperature: 27,
      trigger_type: "moisture_changed",
    },
  ],
  touched: [
    {
      ...basePayload,
      soil_moisture: 55,
      temperature: 27,
      trigger_type: "touched",
    },
  ],
};

async function main() {
  const scenarioName = process.argv[2] || "all";

  if (!process.env.DEVICE_DATA_API_URL) {
    console.warn(
      `DEVICE_DATA_API_URL is not set. Using local default: ${DEFAULT_DEVICE_DATA_API_URL}`,
    );
  }

  const payloads =
    scenarioName === "all"
      ? Object.entries(scenarios).flatMap(([name, values]) =>
          values.map((payload) => ({ name, payload })),
        )
      : (scenarios[scenarioName] || []).map((payload) => ({
          name: scenarioName,
          payload,
        }));

  if (payloads.length === 0) {
    console.error(
      `Unknown scenario "${scenarioName}". Use: ${Object.keys(scenarios).join(", ")}, all`,
    );
    process.exitCode = 1;
    return;
  }

  for (const item of payloads) {
    await postPayload(item.name, item.payload);
    await sleep(700);
  }
}

async function postPayload(name, payload) {
  console.log(`\n[${name}] POST ${apiUrl}`);
  console.log(JSON.stringify(payload, null, 2));

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY || ""}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(body, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
