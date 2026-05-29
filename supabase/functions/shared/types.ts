export type PlantState = "normal" | "thirsty" | "hot" | "unknown";

export type PlantEventType =
  | "normal_update"
  | "thirsty_warning"
  | "hot_warning"
  | "recovered"
  | "touched"
  | "unknown";

export type TriggerType =
  | "periodic"
  | "moisture_changed"
  | "touched"
  | "manual_test";

export interface DeviceDataPayload {
  device_id: string;
  plant_id?: string;
  soil_moisture: number;
  temperature: number;
  light?: number;
  air_humidity?: number;
  fertility?: number;
  battery?: number;
  trigger_type: TriggerType;
}

export interface PlantReading {
  id: string;
  device_id: string;
  plant_id: string | null;
  soil_moisture: number;
  temperature: number;
  light: number | null;
  air_humidity: number | null;
  fertility: number | null;
  battery: number | null;
  trigger_type: TriggerType;
  state: PlantState;
  event_type: PlantEventType;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

export interface PlantStatusResponse {
  device_id: string;
  plant_id: string | null;
  reading_id: string;
  sensor_data: {
    soil_moisture: number;
    temperature: number;
    light: number | null;
    air_humidity: number | null;
    fertility: number | null;
    battery: number | null;
  };
  state: PlantState;
  event_type: PlantEventType;
  trigger_type: TriggerType;
  created_at: string;
}
