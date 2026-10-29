-- Extensions used across later migrations. `extensions` already exists on
-- every real Supabase project; created here only so this migration also
-- works against a plain Postgres instance (e.g. the local RLS test harness).
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
