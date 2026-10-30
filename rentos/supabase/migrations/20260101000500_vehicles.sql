-- Fleet: vehicles and their event log. subtype is validated against type
-- with a check constraint rather than a second enum, since the set of valid
-- subtypes depends on the type.

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  barcode text not null,
  license_plate text not null,
  model text not null,
  type public.vehicle_type not null,
  subtype text not null,
  color text not null default '',
  parking_stall text,
  status public.vehicle_status not null default 'available',
  odometer integer not null default 0 check (odometer >= 0),
  fuel_type public.fuel_type not null,
  fuel_or_charge_level numeric(5, 2) not null default 100 check (fuel_or_charge_level between 0 and 100),
  level_source public.level_source not null default 'manual',
  model_glb_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, barcode),
  constraint vehicles_subtype_matches_type check (
    (type = 'car' and subtype in ('sedan', 'hatchback', 'coupe')) or
    (type = 'truck' and subtype in ('pickup', 'box_truck')) or
    (type = 'suv' and subtype in ('compact', 'full_size')) or
    (type = 'van' and subtype in ('passenger', 'cargo')) or
    (type = 'motorcycle' and subtype in ('standard', 'touring'))
  )
);

create index vehicles_company_id_idx on public.vehicles (company_id);
create index vehicles_company_status_idx on public.vehicles (company_id, status);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create table public.vehicle_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  event_type public.vehicle_log_event not null,
  actor_account_id uuid references public.accounts (id) on delete set null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index vehicle_logs_company_id_idx on public.vehicle_logs (company_id);
create index vehicle_logs_vehicle_id_idx on public.vehicle_logs (vehicle_id, occurred_at desc);
