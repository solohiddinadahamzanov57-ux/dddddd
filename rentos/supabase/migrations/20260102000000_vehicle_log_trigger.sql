-- Automatically logs every vehicle status change to vehicle_logs, so "track
-- all vehicle events" (domain model #9) can't be skipped by forgetting to
-- call a log function from application code -- it happens at the database
-- layer whenever vehicles.status actually changes.
create or replace function public.log_vehicle_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_account_id uuid;
begin
  if new.status is distinct from old.status then
    select id into v_actor_account_id
    from public.accounts
    where user_id = auth.uid() and company_id = new.company_id
    limit 1;

    insert into public.vehicle_logs (company_id, vehicle_id, event_type, actor_account_id, payload)
    values (
      new.company_id,
      new.id,
      'status_change',
      v_actor_account_id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger vehicles_log_status_change
  after update on public.vehicles
  for each row execute function public.log_vehicle_status_change();
