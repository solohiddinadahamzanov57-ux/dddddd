-- Pricing. Phase 0 added `tariff_snapshot jsonb` columns to reservations and
-- rentals (to freeze a tariff at the moment it's used) but never added
-- anywhere to actually define one -- this is that.
--
-- One tariff per (company, vehicle_type); vehicle_type IS NULL is the
-- company-wide default used when no per-type tariff exists.

create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_type public.vehicle_type,
  name text not null default '',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  hourly_rate_minor integer not null check (hourly_rate_minor >= 0),
  daily_rate_minor integer not null check (daily_rate_minor >= 0),
  weekly_rate_minor integer not null check (weekly_rate_minor >= 0),
  grace_period_minutes integer not null default 15 check (grace_period_minutes >= 0),
  late_fee_per_hour_minor integer not null check (late_fee_per_hour_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, vehicle_type)
);

-- unique(company_id, vehicle_type) alone doesn't stop two company-wide
-- defaults (NULL <> NULL for uniqueness purposes), so that case needs its
-- own partial index.
create unique index tariffs_one_default_per_company_idx on public.tariffs (company_id) where vehicle_type is null;

create index tariffs_company_id_idx on public.tariffs (company_id);

create trigger tariffs_set_updated_at
  before update on public.tariffs
  for each row execute function public.set_updated_at();

create trigger tariffs_forbid_company_id_change
  before update on public.tariffs
  for each row execute function public.forbid_company_id_change();

alter table public.tariffs enable row level security;
alter table public.tariffs force row level security;

create policy tariffs_select on public.tariffs
  for select to authenticated
  using (company_id in (select public.current_company_ids()));

create policy tariffs_write_by_staff on public.tariffs
  for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (public.is_staff_in_company(company_id));
