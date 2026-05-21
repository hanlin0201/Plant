import { allowedTriggerTypes, plantThresholds } from "../config/plantThresholds.ts";
import { ApiError } from "./response.ts";
import type { DeviceDataPayload, TriggerType } from "../types.ts";

const DEFAULT_PLANT_ID = "plant_001";

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "Request body must be a JSON object");
    }

    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(400, "Invalid JSON request body");
  }
}

export function validateDeviceDataPayload(
  raw: Record<string, unknown>,
): DeviceDataPayload {
  const deviceId = requiredString(raw.device_id, "device_id");
  assertValidDeviceId(deviceId);

  const triggerType = optionalTriggerType(raw.trigger_type);

  return {
    device_id: deviceId,
    plant_id: optionalString(raw.plant_id, "plant_id") ?? DEFAULT_PLANT_ID,
    soil_moisture: requiredNumber(raw.soil_moisture, "soil_moisture"),
    temperature: requiredNumber(raw.temperature, "temperature"),
    light: optionalNumber(raw.light, "light"),
    air_humidity: optionalNumber(raw.air_humidity, "air_humidity"),
    battery: optionalNumber(raw.battery, "battery"),
    trigger_type: triggerType,
  };
}

export function validateLatestQuery(url: URL): {
  device_id?: string;
  plant_id?: string;
} {
  const deviceId = url.searchParams.get("device_id")?.trim();
  const plantId = url.searchParams.get("plant_id")?.trim();

  if (!deviceId && !plantId) {
    throw new ApiError(400, "Provide device_id or plant_id");
  }

  if (deviceId) {
    assertValidDeviceId(deviceId);
  }

  return {
    device_id: deviceId || undefined,
    plant_id: plantId || undefined,
  };
}

export function assertValidDeviceId(deviceId: string): void {
  if (!(plantThresholds.validDeviceIds as readonly string[]).includes(deviceId)) {
    throw new ApiError(403, "Unknown device_id", {
      device_id: deviceId,
    });
  }
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ApiError(400, `${fieldName} must be a string`);
  }

  return value.trim();
}

function requiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ApiError(400, `${fieldName} is required and must be a number`);
  }

  return value;
}

function optionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ApiError(400, `${fieldName} must be a number`);
  }

  return value;
}

function optionalTriggerType(value: unknown): TriggerType {
  if (value === undefined || value === null || value === "") {
    return "periodic";
  }

  if (
    typeof value !== "string" ||
    !allowedTriggerTypes.includes(value as TriggerType)
  ) {
    throw new ApiError(400, "trigger_type is invalid", {
      allowed: allowedTriggerTypes,
    });
  }

  return value as TriggerType;
}
