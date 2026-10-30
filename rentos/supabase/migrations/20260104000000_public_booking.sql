-- Public booking surface. Visitors browsing a company's booking page are
-- the `anon` role -- not authenticated, not a company member -- and the
-- rest of the schema's RLS policies correctly give them zero access.
-- Rather than opening new RLS policies on the real tables (which would mean
-- reasoning about anon access on every future column added to vehicles/
-- companies/tariffs), the public surface is a small set of SECURITY
-- DEFINER functions that each return only the specific, curated columns a
-- public page actually needs. anon gets no table grants at all; only
-- execute on these functions.

create or replace function public.public_company_by_slug(p_slug text)
returns table (id uuid, name text, default_currency text, default_locale text, timezone text, tax_rate_bps integer)
language sql
stable
security definer
set search_path = public
as $$
  select id, name, default_currency, default_locale, timezone, tax_rate_bps
  from public.companies
  where slug = p_slug;
$$;

create or replace function public.search_available_vehicles(
  p_company_slug text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_type public.vehicle_type default null
)
returns table (
  vehicle_id uuid,
  model text,
  type public.vehicle_type,
  subtype text,
  color text,
  fuel_type public.fuel_type,
  model_glb_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.model, v.type, v.subtype, v.color, v.fuel_type, v.model_glb_key
  from public.vehicles v
  join public.companies c on c.id = v.company_id and c.slug = p_company_slug
  where v.status <> 'service'
    and (p_type is null or v.type = p_type)
    and p_end_at > p_start_at
    and not exists (
      select 1 from public.reservations r
      where r.vehicle_id = v.id
        and r.status in ('pending', 'confirmed')
        and r.during && tstzrange(p_start_at, p_end_at, '[)')
    )
  order by v.type, v.model;
$$;

create or replace function public.public_vehicle_by_id(p_vehicle_id uuid)
returns table (
  vehicle_id uuid,
  company_id uuid,
  model text,
  type public.vehicle_type,
  subtype text,
  color text,
  fuel_type public.fuel_type,
  model_glb_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.company_id, v.model, v.type, v.subtype, v.color, v.fuel_type, v.model_glb_key
  from public.vehicles v
  where v.id = p_vehicle_id and v.status <> 'service';
$$;

revoke all on function public.public_vehicle_by_id(uuid) from public;
grant execute on function public.public_vehicle_by_id(uuid) to anon, authenticated;

create or replace function public.public_tariff_for_vehicle_type(
  p_company_slug text,
  p_vehicle_type public.vehicle_type
)
returns table (
  hourly_rate_minor integer,
  daily_rate_minor integer,
  weekly_rate_minor integer,
  currency text,
  grace_period_minutes integer,
  late_fee_per_hour_minor integer
)
language sql
stable
security definer
set search_path = public
as $$
  select t.hourly_rate_minor, t.daily_rate_minor, t.weekly_rate_minor, t.currency,
         t.grace_period_minutes, t.late_fee_per_hour_minor
  from public.tariffs t
  join public.companies c on c.id = t.company_id
  where c.slug = p_company_slug
    and (t.vehicle_type = p_vehicle_type or t.vehicle_type is null)
  order by t.vehicle_type nulls last
  limit 1;
$$;

revoke all on function public.public_company_by_slug(text) from public;
revoke all on function public.search_available_vehicles(text, timestamptz, timestamptz, public.vehicle_type) from public;
revoke all on function public.public_tariff_for_vehicle_type(text, public.vehicle_type) from public;
grant execute on function public.public_company_by_slug(text) to anon, authenticated;
grant execute on function public.search_available_vehicles(text, timestamptz, timestamptz, public.vehicle_type) to anon, authenticated;
grant execute on function public.public_tariff_for_vehicle_type(text, public.vehicle_type) to anon, authenticated;

-- The only way a signed-in visitor becomes a member of a company they're
-- booking with. Deliberately narrow: it can only create the lowest-
-- privilege role ('member'), only for the caller's own auth.uid(), only
-- for a company that already exists -- no way to escalate role or target
-- another user, unlike a general-purpose accounts INSERT would allow.
create or replace function public.join_company_as_member(p_company_slug text)
returns public.accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_account public.accounts;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select id into v_company_id from public.companies where slug = p_company_slug;
  if v_company_id is null then
    raise exception 'company not found';
  end if;

  select * into v_account from public.accounts where user_id = auth.uid() and company_id = v_company_id;
  if found then
    return v_account;
  end if;

  insert into public.accounts (user_id, company_id, role, full_name)
  values (auth.uid(), v_company_id, 'member', coalesce(auth.jwt() ->> 'name', ''))
  returning * into v_account;

  return v_account;
end;
$$;

-- A new function gets EXECUTE granted to PUBLIC (and, on this project's
-- default privileges, directly to anon/authenticated too) at creation time
-- -- revoking from "public" alone is not enough to keep anon out, since
-- anon's own grant doesn't come through the public pseudo-role.
revoke all on function public.join_company_as_member(text) from public, anon;
grant execute on function public.join_company_as_member(text) to authenticated;
