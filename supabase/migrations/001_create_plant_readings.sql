create extension if not exists "pgcrypto";

create table if not exists public.plant_readings (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  plant_id text,
  soil_moisture numeric not null,
  temperature numeric not null,
  light numeric,
  air_humidity numeric,
  battery numeric,
  trigger_type text not null default 'periodic',
  state text not null,
  event_type text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_plant_readings_device_created_at
  on public.plant_readings (device_id, created_at desc);

create index if not exists idx_plant_readings_plant_created_at
  on public.plant_readings (plant_id, created_at desc);

create index if not exists idx_plant_readings_created_at
  on public.plant_readings (created_at desc);

comment on table public.plant_readings is
  'Sensor readings plus backend-evaluated plant state and feedback event.';

comment on column public.plant_readings.state is
  'Current plant health state: normal, thirsty, hot, unknown.';

comment on column public.plant_readings.event_type is
  'Feedback event for this reading: normal_update, thirsty_warning, hot_warning, recovered, touched, unknown.';
