-- The only way to create a company. Companies and accounts have no INSERT
-- policy (see 20260101000900_rls.sql) so a signed-in user cannot insert an
-- accounts row for themselves with an arbitrary role or company_id -- this
-- function is the sole, controlled path, and it always makes the caller the
-- new company's owner.
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

  insert into public.accounts (user_id, company_id, role, full_name)
  values (auth.uid(), v_company.id, 'owner', coalesce(auth.jwt() ->> 'name', ''));

  return v_company;
end;
$$;

revoke all on function public.create_company(text, text, text, text, text) from public;
grant execute on function public.create_company(text, text, text, text, text) to authenticated;
