-- Field-tampering guards (security checklist #8): a client must never be
-- able to move a row to a different company, or hand themselves a role,
-- purely by sending different values in an UPDATE. RLS's WITH CHECK limits
-- *which* rows are reachable; these triggers additionally freeze specific
-- columns regardless of which row is being updated.

create or replace function public.forbid_company_id_change()
returns trigger
language plpgsql
as $$
begin
  if new.company_id <> old.company_id then
    raise exception 'company_id cannot be changed after creation';
  end if;
  return new;
end;
$$;

create trigger locations_forbid_company_id_change
  before update on public.locations
  for each row execute function public.forbid_company_id_change();

create trigger vehicles_forbid_company_id_change
  before update on public.vehicles
  for each row execute function public.forbid_company_id_change();

create trigger reservations_forbid_company_id_change
  before update on public.reservations
  for each row execute function public.forbid_company_id_change();

create trigger rentals_forbid_company_id_change
  before update on public.rentals
  for each row execute function public.forbid_company_id_change();

create trigger expenses_forbid_company_id_change
  before update on public.expenses
  for each row execute function public.forbid_company_id_change();

-- accounts needs its own guard: user_id is just as immutable as company_id,
-- and role may only change at an owner's hand.
create or replace function public.accounts_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id <> old.user_id or new.company_id <> old.company_id then
    raise exception 'user_id and company_id cannot be changed';
  end if;
  if new.role <> old.role and public.current_role_in_company(old.company_id) <> 'owner' then
    raise exception 'only an owner can change account roles';
  end if;
  return new;
end;
$$;

create trigger accounts_guard_update
  before update on public.accounts
  for each row execute function public.accounts_guard_update();
