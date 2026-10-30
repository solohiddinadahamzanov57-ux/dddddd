-- Tenancy: companies, locations, and the accounts that link auth.users to a
-- company with a role. Every other table in the schema carries company_id
-- and is locked down by RLS policies defined in 20260101000900_rls.sql.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  default_currency text not null check (default_currency ~ '^[A-Z]{3}$'),
  default_locale text not null default 'en',
  timezone text not null default 'UTC',
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.companies.tax_rate_bps is 'Tax rate in basis points (100 = 1%). A per-company setting, never hardcoded.';

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  address text not null default '',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  role public.account_role not null,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create index locations_company_id_idx on public.locations (company_id);
create index accounts_company_id_idx on public.accounts (company_id);
create index accounts_user_id_idx on public.accounts (user_id);

-- Keep updated_at current without trusting the client to set it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();
