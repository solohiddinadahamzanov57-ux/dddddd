-- Server-authoritative reservation pricing.
--
-- A customer inserts their own reservation row, so every money column on it
-- was whatever their client sent. Payment, the signed agreement and the
-- rental all read those columns. quote_reservation() recomputes them from the
-- company's tariffs (same rules as src/lib/billing/fees.ts, with a parity
-- test), and the guard trigger overwrites the customer's values with it.
-- It also stops a reservation from pointing at another company's vehicle or
-- customer, which would otherwise let one tenant block another's cars.

create or replace function public.quote_reservation(
  p_vehicle_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table (
  currency text,
  subtotal_minor integer,
  tax_minor integer,
  total_minor integer,
  tariff_snapshot jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v public.vehicles;
  t public.tariffs;
  v_tax_bps integer;
  v_ms numeric;
  v_hours integer;
  v_days integer;
  v_base integer;
  v_tax integer;
begin
  select * into v from public.vehicles where id = p_vehicle_id;
  if not found then
    return;
  end if;

  select * into t from public.tariffs tf
  where tf.company_id = v.company_id and (tf.vehicle_type = v.type or tf.vehicle_type is null)
  order by tf.vehicle_type nulls last
  limit 1;
  if not found then
    return;
  end if;
  select c.tax_rate_bps into v_tax_bps from public.companies c where c.id = v.company_id;

  v_ms := extract(epoch from (p_end_at - p_start_at)) * 1000;
  if v_ms <= 0 then
    v_base := 0;
  else
    -- "Ceiling" billing, daily cap on hourly billing, weekly tier: identical to calculateBaseCharge().
    v_hours := greatest(1, ceil(v_ms / 3600000 - 0.000000001));
    if v_hours <= 24 then
      v_base := least(v_hours * t.hourly_rate_minor, t.daily_rate_minor);
    else
      v_days := ceil(v_ms / 86400000 - 0.000000001);
      if v_days < 7 then
        v_base := v_days * t.daily_rate_minor;
      else
        v_base := (v_days / 7) * t.weekly_rate_minor + (v_days % 7) * t.daily_rate_minor;
      end if;
    end if;
  end if;
  v_tax := round(v_base * v_tax_bps / 10000.0);

  return query select
    t.currency,
    v_base,
    v_tax,
    v_base + v_tax,
    jsonb_build_object(
      'tariffId', t.id,
      'currency', t.currency,
      'hourlyRateMinor', t.hourly_rate_minor,
      'dailyRateMinor', t.daily_rate_minor,
      'weeklyRateMinor', t.weekly_rate_minor,
      'gracePeriodMinutes', t.grace_period_minutes,
      'lateFeePerHourMinor', t.late_fee_per_hour_minor,
      'taxRateBps', v_tax_bps
    );
end;
$$;

create or replace function public.reservations_guard_member_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_company uuid;
  v_member_company uuid;
  q record;
begin
  -- Trusted server code (no JWT user) is exempt.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.vehicle_id is distinct from old.vehicle_id
     or new.member_account_id is distinct from old.member_account_id then
    select v.company_id into v_vehicle_company from public.vehicles v where v.id = new.vehicle_id;
    select a.company_id into v_member_company from public.accounts a where a.id = new.member_account_id;
    if v_vehicle_company is distinct from new.company_id or v_member_company is distinct from new.company_id then
      raise exception 'vehicle and customer must belong to the reservation''s company';
    end if;
  end if;

  if public.is_staff_in_company(new.company_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    select * into q from public.quote_reservation(new.vehicle_id, new.start_at, new.end_at);
    if not found then
      raise exception 'no_tariff';
    end if;
    new.currency := q.currency;
    new.subtotal_minor := q.subtotal_minor;
    new.tax_minor := q.tax_minor;
    new.total_minor := q.total_minor;
    new.tariff_snapshot := q.tariff_snapshot;
    return new;
  end if;

  if new.status is distinct from old.status
     and not (old.status in ('pending', 'confirmed') and new.status = 'cancelled') then
    raise exception 'customers can only cancel a reservation';
  end if;
  -- `during` is a stored generated column: Postgres computes it after BEFORE triggers, so NEW still holds the stale value.
  if (to_jsonb(new) - 'status' - 'updated_at' - 'during') is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'during') then
    raise exception 'customers cannot edit reservation details';
  end if;
  return new;
end;
$$;

revoke all on function public.quote_reservation(uuid, timestamptz, timestamptz) from public, anon, authenticated;
