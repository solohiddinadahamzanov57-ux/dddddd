-- Helper functions used by RLS policies. Each is SECURITY DEFINER so it reads
-- public.accounts as its owner (bypassing RLS on that read) instead of
-- re-entering the accounts table's own policies -- that indirection is what
-- avoids infinite recursion when accounts.sql's own policies call these.

create or replace function public.current_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.accounts where user_id = auth.uid();
$$;

create or replace function public.current_role_in_company(target_company_id uuid)
returns public.account_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.accounts
  where user_id = auth.uid() and company_id = target_company_id
  limit 1;
$$;

create or replace function public.is_staff_in_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.accounts
    where user_id = auth.uid()
      and company_id = target_company_id
      and role in ('owner', 'receptionist', 'worker')
  );
$$;

create or replace function public.my_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.accounts where user_id = auth.uid();
$$;

revoke all on function public.current_company_ids() from public;
revoke all on function public.current_role_in_company(uuid) from public;
revoke all on function public.is_staff_in_company(uuid) from public;
revoke all on function public.my_account_ids() from public;
grant execute on function public.current_company_ids() to authenticated;
grant execute on function public.current_role_in_company(uuid) to authenticated;
grant execute on function public.is_staff_in_company(uuid) to authenticated;
grant execute on function public.my_account_ids() to authenticated;
