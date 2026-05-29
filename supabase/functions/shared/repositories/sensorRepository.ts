import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { DeviceDataPayload, PlantReading } from "../types.ts";
import { ApiError } from "../utils/response.ts";

export interface SensorRepository {
  getPreviousReading(filters: {
    device_id?: string;
    plant_id?: string;
  }): Promise<PlantReading | null>;
  insertReading(params: {
    payload: DeviceDataPayload;
    state: string;
    event_type: string;
    raw_payload: Record<string, unknown>;
  }): Promise<PlantReading>;
  getLatestReading(filters: {
    device_id?: string;
    plant_id?: string;
  }): Promise<PlantReading | null>;
}

// Supabase access is isolated here so migration later can replace this file
// with a Tencent/Alibaba/custom Node repository without changing services.
export function createSensorRepository(): SensorRepository {
  return new SupabaseSensorRepository(createSupabaseClient());
}

class SupabaseSensorRepository implements SensorRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getPreviousReading(filters: {
    device_id?: string;
    plant_id?: string;
  }): Promise<PlantReading | null> {
    return this.getLatestReading(filters);
  }

  async getLatestReading(filters: {
    device_id?: string;
    plant_id?: string;
  }): Promise<PlantReading | null> {
    let query = this.supabase
      .from("plant_readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (filters.device_id) {
      query = query.eq("device_id", filters.device_id);
    } else if (filters.plant_id) {
      query = query.eq("plant_id", filters.plant_id);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new ApiError(500, "Failed to query latest plant reading", error);
    }

    return data as PlantReading | null;
  }

  async insertReading(params: {
    payload: DeviceDataPayload;
    state: string;
    event_type: string;
    raw_payload: Record<string, unknown>;
  }): Promise<PlantReading> {
    const { payload, state, event_type, raw_payload } = params;
    const { data, error } = await this.supabase
      .from("plant_readings")
      .insert({
        device_id: payload.device_id,
        plant_id: payload.plant_id ?? null,
        soil_moisture: payload.soil_moisture,
        temperature: payload.temperature,
        light: payload.light ?? null,
        air_humidity: payload.air_humidity ?? null,
        fertility: payload.fertility ?? null,
        battery: payload.battery ?? null,
        trigger_type: payload.trigger_type,
        state,
        event_type,
        raw_payload,
      })
      .select("*")
      .single();

    if (error) {
      throw new ApiError(500, "Failed to insert plant reading", error);
    }

    return data as PlantReading;
  }
}

function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ApiError(500, "Missing Supabase server environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
