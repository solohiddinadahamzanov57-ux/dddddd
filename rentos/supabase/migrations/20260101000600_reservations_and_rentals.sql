-- Reservations (booked ahead of time) and rentals (an actual pickup-to-return
-- period). A rental usually originates from a reservation, but reservation_id
-- is nullable to allow a walk-in rental with no prior reservation.
--
-- Money is always integer minor units + an ISO currency code, never a float.
-- tariff_snapshot freezes the tariff that applied when the reservation/rental
-- was created, so changing a company's prices later never rewrites history.

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  location_id uuid references public.locations (id) on delete set null,
  member_account_id uuid not null references public.accounts (id) on delete cascade,
  created_by_account_id uuid references public.accounts (id) on delete set null,
  status public.reservation_status not null default 'pending',
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  tariff_snapshot jsonb not null default '{}'::jsonb,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor integer not null default 0 check (subtotal_minor >= 0),
  tax_minor integer not null default 0 check (tax_minor >= 0),
  total_minor integer not null default 0 check (total_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reservations_company_id_idx on public.reservations (company_id);
create index reservations_vehicle_id_idx on public.reservations (vehicle_id, start_at);
create index reservations_member_account_id_idx on public.reservations (member_account_id);

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete set null,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  member_account_id uuid not null references public.accounts (id) on delete cascade,
  status public.rental_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz check (ended_at is null or ended_at >= started_at),
  odometer_start integer not null check (odometer_start >= 0),
  odometer_end integer check (odometer_end is null or odometer_end >= odometer_start),
  tariff_snapshot jsonb not null default '{}'::jsonb,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  late_fee_minor integer not null default 0 check (late_fee_minor >= 0),
  extras_minor integer not null default 0 check (extras_minor >= 0),
  subtotal_minor integer not null default 0 check (subtotal_minor >= 0),
  tax_minor integer not null default 0 check (tax_minor >= 0),
  total_minor integer not null default 0 check (total_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rentals_ended_fields_consistent check (
    (status = 'active' and ended_at is null) or
    (status = 'completed' and ended_at is not null and odometer_end is not null)
  )
);

create index rentals_company_id_idx on public.rentals (company_id);
create index rentals_vehicle_id_idx on public.rentals (vehicle_id);
create index rentals_member_account_id_idx on public.rentals (member_account_id);
-- At most one active rental per vehicle at a time.
create unique index rentals_one_active_per_vehicle_idx on public.rentals (vehicle_id) where status = 'active';

create trigger rentals_set_updated_at
  before update on public.rentals
  for each row execute function public.set_updated_at();

-- Equipment, services, additional drivers and insurance all attach to a
-- reservation and/or the rental it became, sharing the same (type, cost,
-- details) shape from the domain model.
create table public.rental_extras (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete cascade,
  rental_id uuid references public.rentals (id) on delete cascade,
  item_type public.extra_item_type not null,
  label text not null,
  cost_minor integer not null default 0 check (cost_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint rental_extras_attached_to_something check (
    reservation_id is not null or rental_id is not null
  )
);

create index rental_extras_company_id_idx on public.rental_extras (company_id);
create index rental_extras_reservation_id_idx on public.rental_extras (reservation_id);
create index rental_extras_rental_id_idx on public.rental_extras (rental_id);
