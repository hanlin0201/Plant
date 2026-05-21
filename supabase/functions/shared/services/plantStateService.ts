import { plantThresholds } from "../config/plantThresholds.ts";
import type {
  DeviceDataPayload,
  PlantEventType,
  PlantReading,
  PlantState,
} from "../types.ts";

export interface PlantStateEvaluation {
  state: PlantState;
  event_type: PlantEventType;
}

// The backend owns the authoritative health state and feedback event.
// The priority is intentionally simple for MVP: thirsty > hot > normal.
export function evaluatePlantState(
  sensorData: Partial<DeviceDataPayload>,
  previousReading?: Pick<PlantReading, "state"> | null,
): PlantStateEvaluation {
  const state = calculateState(sensorData);
  const eventType = calculateEventType(sensorData, state, previousReading);

  return {
    state,
    event_type: eventType,
  };
}

function calculateState(sensorData: Partial<DeviceDataPayload>): PlantState {
  if (
    typeof sensorData.soil_moisture !== "number" ||
    typeof sensorData.temperature !== "number"
  ) {
    return "unknown";
  }

  if (sensorData.soil_moisture < plantThresholds.soilMoistureBelow) {
    return "thirsty";
  }

  if (sensorData.temperature > plantThresholds.temperatureAbove) {
    return "hot";
  }

  return "normal";
}

function calculateEventType(
  sensorData: Partial<DeviceDataPayload>,
  currentState: PlantState,
  previousReading?: Pick<PlantReading, "state"> | null,
): PlantEventType {
  if (sensorData.trigger_type === "touched") {
    return "touched";
  }

  if (
    (previousReading?.state === "thirsty" || previousReading?.state === "hot") &&
    currentState === "normal"
  ) {
    return "recovered";
  }

  if (currentState === "thirsty") {
    return "thirsty_warning";
  }

  if (currentState === "hot") {
    return "hot_warning";
  }

  if (currentState === "normal") {
    return "normal_update";
  }

  return "unknown";
}
