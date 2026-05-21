import { evaluatePlantState } from "./plantStateService.ts";
import type { SensorRepository } from "../repositories/sensorRepository.ts";
import type { PlantReading, PlantStatusResponse } from "../types.ts";
import {
  readJsonBody,
  validateDeviceDataPayload,
  validateLatestQuery,
} from "../utils/validation.ts";
import { ApiError } from "../utils/response.ts";

export async function handleDeviceDataUpload(
  request: Request,
  repository: SensorRepository,
): Promise<PlantStatusResponse> {
  const rawPayload = await readJsonBody(request);
  const payload = validateDeviceDataPayload(rawPayload);

  const previousReading = await repository.getPreviousReading({
    device_id: payload.device_id,
    plant_id: payload.plant_id,
  });

  const evaluation = evaluatePlantState(payload, previousReading);
  const inserted = await repository.insertReading({
    payload,
    state: evaluation.state,
    event_type: evaluation.event_type,
    raw_payload: rawPayload,
  });

  return toPlantStatusResponse(inserted);
}

export async function handleLatestDataRequest(
  request: Request,
  repository: SensorRepository,
): Promise<PlantStatusResponse> {
  const filters = validateLatestQuery(new URL(request.url));
  const reading = await repository.getLatestReading(filters);

  if (!reading) {
    throw new ApiError(404, "No plant reading found");
  }

  return toPlantStatusResponse(reading);
}

export function toPlantStatusResponse(reading: PlantReading): PlantStatusResponse {
  return {
    device_id: reading.device_id,
    plant_id: reading.plant_id,
    reading_id: reading.id,
    sensor_data: {
      soil_moisture: Number(reading.soil_moisture),
      temperature: Number(reading.temperature),
      light: reading.light === null ? null : Number(reading.light),
      air_humidity: reading.air_humidity === null ? null : Number(reading.air_humidity),
      battery: reading.battery === null ? null : Number(reading.battery),
    },
    state: reading.state,
    event_type: reading.event_type,
    trigger_type: reading.trigger_type,
    created_at: reading.created_at,
  };
}
