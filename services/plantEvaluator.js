import { normalizeSensorData } from "./plantStatusService.js";

const DEFAULT_EVALUATION = {
  state: "unknown",
  eventType: "unknown",
  reasons: ["missing_sensor_data"],
  message: "暂时还没有足够的传感器数据。",
};

export function evaluatePlantStatus(sensorData, speciesConfig) {
  const thresholds = speciesConfig?.thresholds;
  if (!sensorData || !thresholds) {
    return { ...DEFAULT_EVALUATION };
  }

  const values = normalizeSensorData(sensorData);
  const missingRequired = [
    ["soilMoisture", thresholds.soilMoisture],
    ["temperature", thresholds.temperature],
    ["light", thresholds.light],
    ["humidity", thresholds.humidity],
  ].some(([key, threshold]) => threshold && typeof values[key] !== "number");

  if (missingRequired) {
    return { ...DEFAULT_EVALUATION };
  }

  if (isBelow(values.soilMoisture, thresholds.soilMoisture)) {
    return buildEvaluation(
      "thirsty",
      "thirsty_warning",
      "soil_moisture_low",
      "我有点渴了，可以给我浇点水吗？",
    );
  }

  if (isAbove(values.temperature, thresholds.temperature)) {
    return buildEvaluation(
      "hot",
      "temperature_warning",
      "temperature_high",
      "有点热，我想凉快一下。",
    );
  }

  if (isBelow(values.temperature, thresholds.temperature)) {
    return buildEvaluation(
      "cold",
      "temperature_warning",
      "temperature_low",
      "有点冷，我想待在暖一点的地方。",
    );
  }

  if (isBelow(values.light, thresholds.light)) {
    return buildEvaluation(
      "weak_light",
      "light_warning",
      "light_low",
      "今天的光有点弱，我想再靠近一点阳光。",
    );
  }

  if (isAbove(values.light, thresholds.light)) {
    return buildEvaluation(
      "strong_light",
      "light_warning",
      "light_high",
      "阳光有点太强了，我想稍微躲一躲。",
    );
  }

  if (
    isBelow(values.humidity, thresholds.humidity) ||
    isAbove(values.humidity, thresholds.humidity)
  ) {
    return buildEvaluation(
      "humidity_warning",
      "humidity_warning",
      "humidity_out_of_range",
      "空气湿度有点不太合适，我在努力适应。",
    );
  }

  return buildEvaluation(
    "normal",
    "normal_update",
    "all_normal",
    "现在状态刚刚好。",
  );
}

function buildEvaluation(state, eventType, reason, message) {
  return {
    state,
    eventType,
    reasons: [reason],
    message,
  };
}

function isBelow(value, threshold) {
  return typeof value === "number" && threshold && value < threshold.min;
}

function isAbove(value, threshold) {
  return typeof value === "number" && threshold && value > threshold.max;
}
