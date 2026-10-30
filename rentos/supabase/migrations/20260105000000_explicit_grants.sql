-- Every earlier migration relied on Supabase's default of auto-granting new
-- public tables to the Data API roles. A project can turn that off
-- (auto_expose_new_tables = false), and then the authenticated role can't
-- touch a single table -- RLS never even gets a chance to run. Granting
-- explicitly makes the schema work either way. RLS is still what decides
-- which rows each caller sees; these grants only let the request reach it.
--
-- anon deliberately gets nothing here: everything public goes through the
-- curated SECURITY DEFINER functions in 20260104000000_public_booking.sql.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
