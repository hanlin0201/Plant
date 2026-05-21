// Central threshold and MVP device allow-list configuration.
// Future hardware/PM threshold changes should happen here first.
export const plantThresholds = {
  soilMoistureBelow: 30,
  temperatureAbove: 32,
  validDeviceIds: ["sensor_001"],
} as const;

export const allowedTriggerTypes = [
  "periodic",
  "moisture_changed",
  "touched",
  "manual_test",
] as const;
