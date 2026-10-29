-- Row Level Security for every table. FORCE ROW LEVEL SECURITY makes the
-- policies apply even to the table owner over PostgREST, so the only way
-- around RLS is the service-role key (src/lib/supabase/admin.ts), which never
-- reaches the browser.

alter table public.companies enable row level security;
alter table public.companies force row level security;
alter table public.locations enable row level security;
alter table public.locations force row level security;
alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.vehicles enable row level security;
alter table public.vehicles force row level security;
alter table public.vehicle_logs enable row level security;
alter table public.vehicle_logs force row level security;
alter table public.reservations enable row level security;
alter table public.reservations force row level security;
alter table public.rentals enable row level security;
alter table public.rentals force row level security;
alter table public.rental_extras enable row level security;
alter table public.rental_extras force row level security;
alter table public.payments enable row level security;
alter table public.payments force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
alter table public.expenses enable row level security;
alter table public.expenses force row level security;

-- companies: visible to any member of the company. No INSERT policy -- the
-- only path in is create_company(). Only an owner may update settings.
create policy companies_select on public.companies
  for select to authenticated
  using (id in (select public.current_company_ids()));

create policy companies_update_by_owner on public.companies
  for update to authenticated
  using (public.current_role_in_company(id) = 'owner')
  with check (public.current_role_in_company(id) = 'owner');

-- locations: readable by anyone in the company (members need pickup
-- addresses too); writable by staff only.
create policy locations_select on public.locations
  for select to authenticated
  using (company_id in (select public.current_company_ids()));

create policy locations_write_by_staff on public.locations
  for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (public.is_staff_in_company(company_id));

-- accounts: everyone can see their own row; staff can see every account in
-- their company (teammates and members). No INSERT policy -- rows are only
-- created via create_company() or a future invite-acceptance function.
create policy accounts_select on public.accounts
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff_in_company(company_id));

create policy accounts_update on public.accounts
  for update to authenticated
  using (user_id = auth.uid() or public.is_staff_in_company(company_id))
  with check (company_id in (select public.current_company_ids()));

-- vehicles: catalog is readable by anyone in the company (members browse
-- inventory to reserve); only staff can add/edit/retire vehicles.
create policy vehicles_select on public.vehicles
  for select to authenticated
  using (company_id in (select public.current_company_ids()));

create policy vehicles_write_by_staff on public.vehicles
  for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (public.is_staff_in_company(company_id));

-- vehicle_logs: internal operational history -- staff only, both ways.
create policy vehicle_logs_staff_only on public.vehicle_logs
  for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (public.is_staff_in_company(company_id));

-- reservations: staff see and manage every reservation in their company;
-- a member sees and manages only their own.
create policy reservations_select on public.reservations
  for select to authenticated
  using (
    public.is_staff_in_company(company_id)
    or member_account_id in (select public.my_account_ids())
  );

create policy reservations_insert on public.reservations
  for insert to authenticated
  with check (
    public.is_staff_in_company(company_id)
    or member_account_id in (select public.my_account_ids())
  );

create policy reservations_update on public.reservations
  for update to authenticated
  using (
    public.is_staff_in_company(company_id)
    or member_account_id in (select public.my_account_ids())
  )
  with check (
    public.is_staff_in_company(company_id)
    or member_account_id in (select public.my_account_ids())
  );

-- rentals: same shape as reservations. No member-facing INSERT: a rental is
-- only ever opened by staff at pickup (see Phase 2).
create policy rentals_select on public.rentals
  for select to authenticated
  using (
    public.is_staff_in_company(company_id)
    or member_account_id in (select public.my_account_ids())
  );

create policy rentals_write_by_staff on public.rentals
  for insert to authenticated
  with check (public.is_staff_in_company(company_id));

create policy rentals_update_by_staff on public.rentals
  for update to authenticated
  using (public.is_staff_in_company(company_id))
  with check (public.is_staff_in_company(company_id));

-- rental_extras: visibility follows the parent reservation/rental.
create policy rental_extras_select on public.rental_extras
  for select to authenticated
  using (
    public.is_staff_in_company(company_id)
    or exists (
      select 1 from public.reservations r
      where r.id = rental_extras.reservation_id
        and r.member_account_id in (select public.my_account_ids())
    )
    or exists (
      select 1 from public.rentals rt
      where rt.id = rental_extras.rental_id
        and rt.member_account_id in (select public.my_account_ids())
    )
  );

create policy rental_extras_write_by_staff on public.rental_extras
  for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (public.is_staff_in_company(company_id));

-- payments: same visibility shape as rental_extras; writes happen server-side
-- (Stripe webhooks via the service-role client) or by staff for cash/manual.
create policy payments_select on public.payments
  for select to authenticated
  using (
    public.is_staff_in_company(company_id)
    or exists (
      select 1 from public.reservations r
      where r.id = payments.reservation_id
        and r.member_account_id in (select public.my_account_ids())
    )
    or exists (
      select 1 from public.rentals rt
      where rt.id = payments.rental_id
        and rt.member_account_id in (select public.my_account_ids())
    )
  );

create policy payments_write_by_staff on public.payments
  for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (public.is_staff_in_company(company_id));

-- notifications: a recipient sees their own; staff sees all in the company
-- (to debug delivery). Notifications are otherwise written by the server
-- (service-role), not by end users.
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    account_id in (select public.my_account_ids())
    or public.is_staff_in_company(company_id)
  );

-- expenses: fully internal, staff only.
create policy expenses_staff_only on public.expenses
  for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (public.is_staff_in_company(company_id));
