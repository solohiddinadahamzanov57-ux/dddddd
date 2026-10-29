# Decisions

Durable choices made along the way, and why, so later phases don't
re-litigate them. Newest first.

## Phase 0

- **Repo layout.** This GitHub repo already contained an unrelated,
  shipping product ("Driver Desk," a lead manager for truck recruiters, on
  Cloudflare Workers/D1/Hono). Rather than replace it, RentOS lives entirely
  under `rentos/` as its own Next.js app with its own `package.json`,
  `node_modules`, and CI job (`.github/workflows/rentos-ci.yml`, scoped to
  `rentos/**` so it never runs against Driver Desk's changes, and vice
  versa). `rentos/` is RentOS's project root; this file, `CLAUDE.md`, and
  all paths below are relative to it.

- **Package manager: npm.** Matches what Driver Desk already uses in this
  repo, and `create-next-app`'s default.

- **Next.js 16 experimental features.** `create-next-app` defaults to
  `cacheComponents: true`, which assumes mostly-static content with
  opt-in dynamic islands. RentOS is the opposite shape -- nearly every page
  reads the signed-in user's session -- so it's turned off in
  `next.config.ts` in favor of plain per-request rendering. Revisit if a
  later phase adds genuinely static, cacheable pages (e.g. the public
  marketing site).

- **`middleware.ts` renamed to `proxy.ts`.** Next.js 16 deprecated the
  `middleware` file convention in favor of `proxy` (same API, new name and
  default export name). Using the current convention from day one.

- **Supabase: schema-first, RLS as the actual security boundary.** Every
  tenant-scoped table carries `company_id`, has RLS enabled _and forced_
  (`force row level security`, so even the table owner over PostgREST is
  subject to policies -- only the service-role key bypasses them), and has
  explicit policies. `src/lib/supabase/*` splits browser/server/admin
  clients so the service-role key (`admin.ts`) can never be imported from
  client code -- it's also guarded with the `server-only` package, which
  fails the build if a client component tries to import it.

- **`accounts` has no client-facing INSERT policy.** The only way to create
  a company (and become its owner) is the `create_company()` Postgres
  function (`SECURITY DEFINER`), which inserts both the `companies` and
  `accounts` rows atomically. This closes off a privilege-escalation path
  where a signed-in user could otherwise insert an `accounts` row for
  themselves with an arbitrary `role` or an existing company's `id`.
  Staff-invites-a-member and self-service-signup-as-a-member are real flows
  but belong to Phase 2/3 -- they'll need their own narrow, audited
  functions rather than a general INSERT policy.

- **Field-tampering guards beyond RLS.** RLS's `USING`/`WITH CHECK` controls
  _which rows_ are reachable, but doesn't stop a client from flipping a
  specific column on a row it can already reach. `company_id` is frozen on
  every tenant table via a trigger (`forbid_company_id_change`), and
  `accounts.role`/`accounts.user_id` have their own guard
  (`accounts_guard_update`) so only an existing owner can change a role, and
  nobody can change which auth user an account belongs to. This is the
  security checklist's "never trust `company_id`, `role`, `price`, or
  `status` from the client" applied at the database layer, not just in
  application code.

- **Equipment/services/additional drivers/insurance share one table.** The
  domain brief lists `Equipment, Service, AdditionalDriver, RentalInsurance
(type, cost, details)` with a shared shape. Rather than four near-identical
  tables, there's one `rental_extras` table with an `item_type` enum. It can
  split later if the shapes diverge enough to be worth it.

- **Company slugs get a random suffix.** `slugify()` always appends 4
  random characters, so Phase 0's onboarding form doesn't need collision
  retry logic for the (globally unique) `companies.slug`. A settings screen
  to pick a custom, human-chosen slug is a small later addition, not a
  redesign.

- **RLS is tested against real Postgres, not mocked.** `test/rls/` spins up
  a throwaway Postgres database (the project's own Postgres 16, no Docker
  needed), applies the real files in `supabase/migrations/`, and drives them
  the way PostgREST actually would (`SET ROLE authenticated`,
  `request.jwt.claims`). This is what proves the Phase 0 acceptance
  criterion ("a user can sign up, create a company, and cannot read another
  company's data") against the policies themselves, not against application
  code that might just happen to filter correctly. `test/rls/auth-shim.sql`
  (a minimal stand-in for Supabase's real `auth` schema) exists only for
  this harness and must never be added to `supabase/migrations/`.

- **`@supabase/ssr` pinned to `^0.12.7`, not the originally-installed
  `0.6.1`.** `0.6.1`'s `createServerClient<Database>()` doesn't infer the
  `Database["public"]["Functions"]` schema correctly, so
  `supabase.rpc("create_company", {...})` type-checked the arguments
  against `undefined` instead of the real `Args` type. `0.12.7` fixes this;
  confirmed with a throwaway probe comparing `createClient` (supabase-js)
  vs. `createServerClient` (ssr) against the same generated `Database` type.

- **i18n: English and Russian, routed via `/{locale}/...`.** `next-intl`,
  locale always in the URL (`localePrefix: "always"`, the default). Source
  Sans 3 (body/UI) + Source Serif 4 (headings, upright, no italics) as the
  type pairing -- deliberately not Inter, not Space Grotesk + Instrument
  Serif, per the design rules.

- **Not done in Phase 0 (intentionally):** PWA manifest/installability
  (not in Phase 0's scope per the build plan; revisit when there's an
  operator-facing dashboard worth installing), tariffs/pricing tables
  (Phase 2 -- `tariff_snapshot jsonb` columns exist on `reservations`/
  `rentals` so the shape is ready), vehicle photo capture / GLB assets
  (Phase 1), and any invite-a-teammate or invite-a-member flow (needs its
  own `SECURITY DEFINER` function, Phase 1/2/3 depending on which role).
