-- A customer can't cancel a reservation once its rental has started (the car is out).
-- Replaces the guard from 20260106000300; the only change is the "rental already started" rule.

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
  if new.status = 'cancelled' and old.status <> 'cancelled'
     and exists (select 1 from public.rentals r where r.reservation_id = new.id) then
    raise exception 'rental already started';
  end if;
  -- `during` is a stored generated column: Postgres computes it after BEFORE triggers, so NEW still holds the stale value.
  if (to_jsonb(new) - 'status' - 'updated_at' - 'during') is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'during') then
    raise exception 'customers cannot edit reservation details';
  end if;
  return new;
end;
$$;

revoke all on function public.reservations_guard_member_writes() from public, anon, authenticated;
