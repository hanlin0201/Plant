export const plantThresholds = {
  temperature: { min: 18, max: 30, unit: "°C", lowLabel: "偏冷", highLabel: "偏热" },
  humidity: { min: 40, max: 70, unit: "%", lowLabel: "偏低", highLabel: "偏高" },
  soilMoisture: { min: 25, max: 60, unit: "%", lowLabel: "偏干", highLabel: "偏湿" },
  light: { min: 10000, max: 30000, unit: "lx", lowLabel: "偏弱", highLabel: "偏强" },
  fertility: { min: 500, max: 1500, unit: "μS", lowLabel: "偏低", highLabel: "偏高" },
  battery: { min: 20, max: 100, unit: "%", lowLabel: "偏低", highLabel: "正常" },
};

const metricDefinitions = [
  { key: "temperature", label: "温度", icon: "🌡" },
  { key: "humidity", label: "空气湿度", icon: "💧" },
  { key: "soilMoisture", label: "土壤湿度", icon: "🪴" },
  { key: "light", label: "光照", icon: "☀" },
  { key: "fertility", label: "肥力", icon: "🧪" },
  { key: "battery", label: "电量", icon: "🔋" },
];

export function buildSensorMetrics(sensorData = {}, thresholdsOverride = {}) {
  const values = normalizeSensorData(sensorData);
  return metricDefinitions.map((def) => {
    const threshold = buildMetricThreshold(def.key, thresholdsOverride);
    const value = values[def.key];
    const status = getStatus(value, threshold);
    return {
      ...def,
      value,
      unit: threshold.unit,
      status,
      displayValue: formatSensorValue(value, threshold.unit),
      progress: getProgressPercent(value, threshold),
    };
  });
}

function buildMetricThreshold(key, thresholdsOverride) {
  const baseThreshold = plantThresholds[key];
  const overrideThreshold = thresholdsOverride?.[key];
  return {
    ...baseThreshold,
    ...(overrideThreshold || {}),
  };
}

export function normalizeSensorData(sensorData = {}) {
  const numberOrNull = (value) => (typeof value === "number" ? value : null);
  return {
    temperature: numberOrNull(sensorData.temperature),
    humidity: numberOrNull(sensorData.air_humidity ?? sensorData.humidity),
    soilMoisture: numberOrNull(sensorData.soil_moisture ?? sensorData.soilMoisture),
    light: numberOrNull(sensorData.light),
    fertility: numberOrNull(sensorData.fertility ?? sensorData.ec),
    battery: resolveBatteryValue(sensorData),
  };
}

export function resolveBatteryValue(sensorData = {}) {
  const candidates = [
    sensorData.battery,
    sensorData.batteryLevel,
    sensorData.power,
    sensorData.voltage,
  ];

  for (const value of candidates) {
    if (typeof value === "number") {
      return value;
    }
  }

  return null;
}

export function getStatus(value, threshold) {
  if (typeof value !== "number") {
    return { tone: "missing", label: "暂无数据" };
  }

  if (value < threshold.min) {
    return { tone: "low", label: threshold.lowLabel || "偏低" };
  }

  if (value > threshold.max) {
    return { tone: "high", label: threshold.highLabel || "偏高" };
  }

  return { tone: "good", label: "正常" };
}

export function formatSensorValue(value, unit) {
  if (typeof value !== "number") {
    return "暂无数据";
  }

  const rounded = value >= 1000 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded}${unit}`;
}

export function getProgressPercent(value, threshold) {
  if (typeof value !== "number") {
    return 0;
  }

  if (threshold.max <= threshold.min) {
    return 0;
  }

  const raw = ((value - threshold.min) / (threshold.max - threshold.min)) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
