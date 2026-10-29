-- Minimal stand-in for the parts of Supabase's "auth" schema that our RLS
-- policies depend on: auth.users, auth.uid(), auth.jwt(). This file is ONLY
-- for the local test harness (see test/rls/run-migrations.ts) -- a real
-- Supabase project already provides the real versions of all of this, so
-- none of it belongs in supabase/migrations.

create schema if not exists auth;

-- Columns mirror the subset of the real auth.users shape that
-- supabase/seed.sql writes to, so the seed script can be smoke-tested here
-- too (see test/rls/seed.test.ts).
create table auth.users (
  instance_id uuid not null default '00000000-0000-0000-0000-000000000000',
  id uuid primary key default gen_random_uuid(),
  aud text not null default 'authenticated',
  role text not null default 'authenticated',
  email text not null unique,
  encrypted_password text not null default '',
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmation_token text not null default '',
  recovery_token text not null default ''
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema auth, public to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

-- On a real Supabase project, the platform grants this automatically to
-- every table created in `public`. We replicate it here so RLS (not a
-- missing GRANT) is what the tests are actually exercising.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
