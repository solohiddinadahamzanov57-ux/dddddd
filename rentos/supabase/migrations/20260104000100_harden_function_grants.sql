-- Hardening found while adding the public booking surface: a newly created
-- function gets EXECUTE granted to PUBLIC *and*, on this project's default
-- privileges, directly to anon/authenticated at creation time (the same
-- thing a real Supabase project does out of the box). Every earlier
-- migration's `revoke all ... from public` only revoked from the public
-- pseudo-role -- anon's own direct grant was untouched, so anon could call
-- every "authenticated-only" function below. None of them could actually
-- do anything as anon (each checks auth.uid() itself, or is SECURITY
-- INVOKER so RLS still applies inside it), so nothing was ever exploitable
-- -- but anon shouldn't be able to reach them at all. Tightened here rather
-- than quietly left, and test/rls/public-booking.test.ts is what caught it.
revoke execute on function public.current_company_ids() from anon;
revoke execute on function public.current_role_in_company(uuid) from anon;
revoke execute on function public.is_staff_in_company(uuid) from anon;
revoke execute on function public.my_account_ids() from anon;
revoke execute on function public.create_company(text, text, text, text, text) from anon;
revoke execute on function public.vehicle_profit_report(uuid, timestamptz, timestamptz) from anon;
