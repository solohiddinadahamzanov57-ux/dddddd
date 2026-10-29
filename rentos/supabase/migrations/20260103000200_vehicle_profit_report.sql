-- Revenue/profit per vehicle for a period. Plain SQL function (not
-- SECURITY DEFINER) so it runs with the caller's own privileges -- RLS on
-- `rentals` and `expenses` still applies exactly as if the caller had
-- queried those tables directly; this only exists because PostgREST can't
-- express a GROUP BY aggregation through the normal table API.
create or replace function public.vehicle_profit_report(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  vehicle_id uuid,
  model text,
  license_plate text,
  revenue_minor bigint,
  expenses_minor bigint,
  profit_minor bigint,
  rental_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    v.id as vehicle_id,
    v.model,
    v.license_plate,
    coalesce(r.revenue_minor, 0) as revenue_minor,
    coalesce(e.expenses_minor, 0) as expenses_minor,
    coalesce(r.revenue_minor, 0) - coalesce(e.expenses_minor, 0) as profit_minor,
    coalesce(r.rental_count, 0) as rental_count
  from public.vehicles v
  left join (
    select vehicle_id, sum(total_minor) as revenue_minor, count(*) as rental_count
    from public.rentals
    where company_id = p_company_id
      and status = 'completed'
      and ended_at >= p_from
      and ended_at < p_to
    group by vehicle_id
  ) r on r.vehicle_id = v.id
  left join (
    select vehicle_id, sum(amount_minor) as expenses_minor
    from public.expenses
    where company_id = p_company_id
      and occurred_on >= p_from::date
      and occurred_on < p_to::date
    group by vehicle_id
  ) e on e.vehicle_id = v.id
  where v.company_id = p_company_id
  order by profit_minor desc;
$$;

revoke all on function public.vehicle_profit_report(uuid, timestamptz, timestamptz) from public;
grant execute on function public.vehicle_profit_report(uuid, timestamptz, timestamptz) to authenticated;
