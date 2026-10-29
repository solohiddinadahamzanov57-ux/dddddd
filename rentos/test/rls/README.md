# RLS test harness

`company-isolation.test.ts` proves the Phase 0 acceptance criterion: a user
can sign up, create a company, and cannot read another company's data. It
runs the real files in `supabase/migrations/` against a throwaway Postgres
database and drives them exactly the way PostgREST would (`SET ROLE
authenticated`, `request.jwt.claims` set per user) -- a pass means the RLS
policies themselves are sound, not just that application code filters
correctly.

## Running locally

Needs a local Postgres reachable at `127.0.0.1:5432` as user `postgres`.

```bash
# Ubuntu/Debian, one-time:
sudo apt-get install postgresql-16
sudo service postgresql start
sudo -u postgres psql -c "ALTER ROLE postgres PASSWORD 'postgres';"

npm test -- test/rls
```

No local Postgres? The suite skips itself with a warning instead of failing
`npm test`. Override the connection with `PG_TEST_HOST`, `PG_TEST_PORT`,
`PG_TEST_USER`, `PG_TEST_PASSWORD` if your setup differs.

## What's intentionally not here

`auth-shim.sql` is a minimal stand-in for the parts of Supabase's real `auth`
schema (`auth.users`, `auth.uid()`, `auth.jwt()`) that RLS policies rely on.
It is only for this harness -- never add it to `supabase/migrations/`, a real
Supabase project already provides the real versions.
