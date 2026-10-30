-- Staff need to know who a customer is, and the sign-in email lives in
-- auth.users, which the app can't read. Keep a copy on the account, taken from
-- the caller's own sign-in token when the account is created.
alter table public.accounts add column email text;

update public.accounts a
set email = u.email
from auth.users u
where u.id = a.user_id and a.email is null;

create or replace function public.create_company(
  p_name text,
  p_slug text,
  p_default_currency text,
  p_default_locale text default 'en',
  p_timezone text default 'UTC'
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.companies (name, slug, default_currency, default_locale, timezone)
  values (p_name, p_slug, p_default_currency, p_default_locale, p_timezone)
  returning * into v_company;

  insert into public.accounts (user_id, company_id, role, full_name, email)
  values (auth.uid(), v_company.id, 'owner', coalesce(auth.jwt() ->> 'name', ''), auth.jwt() ->> 'email');

  return v_company;
end;
$$;

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

  insert into public.accounts (user_id, company_id, role, full_name, email)
  values (auth.uid(), v_company_id, 'member', coalesce(auth.jwt() ->> 'name', ''), auth.jwt() ->> 'email')
  returning * into v_account;

  return v_account;
end;
$$;

-- CREATE OR REPLACE keeps the existing grants, so anon stays locked out.
