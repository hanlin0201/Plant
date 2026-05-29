import type { SensorRepository } from "../repositories/sensorRepository.ts";
import type { PlantEventType, PlantState } from "../types.ts";

export interface PlantContext {
  state: PlantState;
  event_type: PlantEventType;
  sensor_data: {
    soil_moisture: number;
    temperature: number;
    light: number | null;
    air_humidity: number | null;
    fertility: number | null;
    battery: number | null;
  } | null;
  created_at: string | null;
}

// Reads the latest backend-evaluated plant status for chat context.
// Database access stays in sensorRepository so chat can migrate with the rest.
export async function getPlantContext(
  deviceId: string,
  repository: SensorRepository,
): Promise<PlantContext> {
  console.log("[plantContextService] fetching context for device_id:", deviceId);

  let reading;
  try {
    reading = await repository.getLatestReading({ device_id: deviceId });
  } catch (error) {
    const err = error as Error;
    console.error(
      "[plantContextService] failed to query latest reading:",
      err?.message ?? String(error),
    );
    throw error;
  }

  if (!reading) {
    console.log(
      "[plantContextService] no plant_readings found, using unknown context",
    );
    return {
      state: "unknown",
      event_type: "unknown",
      sensor_data: null,
      created_at: null,
    };
  }

  return {
    state: reading.state,
    event_type: reading.event_type,
    sensor_data: {
      soil_moisture: Number(reading.soil_moisture),
      temperature: Number(reading.temperature),
      light: reading.light === null ? null : Number(reading.light),
      air_humidity:
        reading.air_humidity === null ? null : Number(reading.air_humidity),
      fertility: reading.fertility === null ? null : Number(reading.fertility),
      battery: reading.battery === null ? null : Number(reading.battery),
    },
    created_at: reading.created_at,
  };
}
