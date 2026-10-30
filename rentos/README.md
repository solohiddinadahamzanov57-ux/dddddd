# RentOS

Fleet management, live rental timers, and revenue tracking for small car
rental companies. See `CLAUDE.md` for the full product brief and build
plan, and `docs/DECISIONS.md` for why things are built the way they are.

> This app lives in `rentos/` inside a repo that also contains an
> unrelated product (Driver Desk, at the repo root). They're independent;
> nothing here touches it and nothing there touches this.

**Status: Phases 0-4 complete.** Sign up, create a company (isolated by
Postgres Row Level Security -- proven by a test that runs the real
migrations against a throwaway database, see `test/rls/`), manage a fleet
(add/edit/delete vehicles, scan a barcode with the camera to find one,
change status (auto-logged), 3D vehicle cards), and run rentals end to end:
set tariffs, check a vehicle out to a customer, watch a live timer and
running total, return it and get a final charge computed server-side
(hourly/daily/weekly tiering, grace period, late fees -- all unit tested,
including across DST transitions), log expenses, and see revenue/profit per
vehicle and per period. A GiST exclusion constraint stops two reservations
from ever double-booking the same vehicle. On top of that, a public,
no-login-required booking page per company (`/book/[companySlug]`): search
real availability by date and type, get a priced quote, reserve, and pay
with Stripe Checkout (test mode) -- all without exposing a single table to
the `anon` role directly (see `docs/DECISIONS.md`). Phase 4 adds contactless
pickup: a customer finishes an ID check (reviewed by staff), signs the rental
agreement, holds the deposit, and photographs the vehicle, and only then can open
the key box, which also starts the rental timer. One database function decides
whether every check has passed, and it is tested against a real Postgres
(`test/rls/contactless.test.ts`).

## Stack

Next.js (App Router, TypeScript strict, Tailwind) + Supabase (Postgres,
Auth, RLS) + Stripe + `<model-viewer>` for the 3D vehicle cards +
`next-intl` (English/Russian) + Vitest + Playwright.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's URL + anon key
npm run dev                  # http://localhost:3000
```

You need a Supabase project (free tier is fine). Create one at
[supabase.com](https://supabase.com), then from **Project Settings → API**
copy the Project URL and `anon` key into `.env.local`. Apply the schema:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

(No Supabase project yet, or just exploring the code? `npm run build` works
with any syntactically-valid URL in `.env.local` -- the app just won't be
able to talk to a real database until you point it at one.)

## Commands

| Command                           | What it does                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`                     | Start the dev server                                                                |
| `npm run build`                   | Production build                                                                    |
| `npm run lint`                    | ESLint                                                                              |
| `npm run typecheck`               | `tsc --noEmit`                                                                      |
| `npm run format` / `format:check` | Prettier                                                                            |
| `npm test`                        | Vitest (unit + RLS tests; RLS suite needs local Postgres, see `test/rls/README.md`) |
| `npm run test:e2e`                | Playwright, against a production build                                              |
| `npm run db:types`                | Regenerate `src/lib/supabase/database.types.ts` from `$DATABASE_URL`                |

## Database

Everything lives in `supabase/migrations/`, applied in filename order.
`supabase/seed.sql` adds one demo company and 12 demo vehicles (mixed
types, statuses, fuel types, including EVs) for local development --
applied automatically by `supabase db reset` against the local Supabase
stack (requires Docker), or run by hand against any Postgres your migrations
target.

Every tenant-scoped table has Row Level Security **enabled and forced**:
even the table owner is subject to the policies over PostgREST, so the only
way around them is the service-role key (`src/lib/supabase/admin.ts`),
which never reaches the browser. `test/rls/company-isolation.test.ts` proves
this against real Postgres, not a mock.
