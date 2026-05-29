create table if not exists public.user_plants (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  device_id text not null,
  species_id text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_plants_user_device_unique unique (user_id, device_id)
);

create index if not exists user_plants_user_id_idx
  on public.user_plants (user_id);

create index if not exists user_plants_device_id_idx
  on public.user_plants (device_id);

create or replace function public.set_user_plants_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_plants_set_updated_at on public.user_plants;
create trigger user_plants_set_updated_at
before update on public.user_plants
for each row
execute function public.set_user_plants_updated_at();

alter table public.user_plants enable row level security;

drop policy if exists "demo anon can read user_001 plants" on public.user_plants;
create policy "demo anon can read user_001 plants"
on public.user_plants
for select
to anon, authenticated
using (user_id = 'user_001');

drop policy if exists "demo anon can insert user_001 plants" on public.user_plants;
create policy "demo anon can insert user_001 plants"
on public.user_plants
for insert
to anon, authenticated
with check (user_id = 'user_001');

drop policy if exists "demo anon can update user_001 plants" on public.user_plants;
create policy "demo anon can update user_001 plants"
on public.user_plants
for update
to anon, authenticated
using (user_id = 'user_001')
with check (user_id = 'user_001');

grant select, insert, update on public.user_plants to anon, authenticated;
