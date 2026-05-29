alter table public.plant_readings
  add column if not exists fertility numeric;

comment on column public.plant_readings.fertility is
  'Soil fertility / EC value reported by the hardware. Recommended upload field: fertility.';
