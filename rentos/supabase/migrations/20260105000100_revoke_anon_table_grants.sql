-- Supabase's default privileges grant anon full access to every new table in
-- public. RLS (all policies are `to authenticated`) already returns zero rows to
-- anon, but the booking page reaches data only through SECURITY DEFINER
-- functions, so anon never needs table privileges at all. Remove them so a
-- future mistake in a policy can't expose a table to unauthenticated callers.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
