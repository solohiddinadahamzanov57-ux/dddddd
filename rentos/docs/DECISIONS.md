# Decisions

Durable choices made along the way, and why, so later phases don't
re-litigate them. Newest first.

## Phase 2

- **Tariffs are one row per (company, vehicle type), with `vehicle_type IS
NULL` as the company-wide default.** Added `tariffs` (migration
  `20260103000000_tariffs.sql`) since Phase 0/1 only ever added the
  `tariff_snapshot jsonb` columns to freeze a tariff into, never a place to
  define one. A plain `unique(company_id, vehicle_type)` doesn't stop two
  NULL-type rows (NULL <> NULL for uniqueness), so there's a separate
  partial unique index for "at most one default per company." Picking the
  effective tariff for a vehicle (per-type if set, else the default) is
  done in app code (`pickEffectiveTariff`), not a DB function, since it's
  a two-row lookup, not an aggregation.

- **No single upsert target covers both the plain unique constraint and the
  partial index**, so `saveTariff` (settings/actions.ts) is
  update-then-insert-if-nothing-updated rather than one `.upsert()` call.

- **Double-booking is prevented by a GiST exclusion constraint**
  (`reservations_no_overlap`, migration `20260103000100_booking_calendar.sql`),
  not application-level date-range validation. `btree_gist` is what lets a
  GiST index also compare the plain `vehicle_id` uuid for equality
  alongside the `tstzrange` overlap check. Proven against real Postgres in
  `test/rls/booking-calendar.test.ts`: overlap rejected, back-to-back
  bookings allowed, a cancelled reservation doesn't block the slot, a
  different vehicle isn't affected.

- **Fee calculation is a pure, dependency-free module**
  (`src/lib/billing/fees.ts`) used identically by the server (the
  authoritative charge at return) and the client (the live running-total
  display) -- same inputs, same output, by construction, not by convention.
  21 unit tests cover the hourly/daily/weekly tiering (including the "day
  rate caps hourly billing" convention), grace periods, late fees, and --
  explicitly, since CLAUDE.md calls this out -- that a rental spanning a
  DST transition (both directions) still bills the same real elapsed time
  as one that doesn't. All duration math is done on `Date`/epoch
  milliseconds, never on calendar fields in a particular time zone.

- **Walk-in customers get a real `auth.users` row, created server-side via
  the service-role client**, not a separate "guest" concept. Every
  `accounts` row still has to reference a real Supabase Auth user (that FK
  was never going away), so `startRental`'s `resolveOrCreateMember` calls
  `admin.auth.admin.createUser()` with `email_confirm: true` and a random
  password, then inserts the `accounts` row through the same admin client
  (accounts still has no client-facing INSERT policy -- see Phase 0). The
  `company_id` on that insert is always the _calling staff member's own_,
  looked up server-side, never taken from the form. This is also the
  first real use of `src/lib/supabase/admin.ts`, built in Phase 0 but
  unused until now.

- **`vehicle_profit_report()` is a plain SQL function (not `SECURITY
DEFINER`)**, unlike `create_company()` or the auth-helper functions.
  It only aggregates `rentals`/`expenses` the caller could already see row
  by row, so it runs with the caller's own privileges and RLS applies
  inside it exactly as if the caller had queried those tables directly --
  no elevated access needed, so none is granted. Proven in
  `test/rls/vehicle-profit-report.test.ts`, including that rentals outside
  the period or still `active` don't count as revenue, and that one
  company can't see another's report.

- **Server-action-level integration tests aren't part of the suite.**
  Everything with real logic risk (RLS, triggers, exclusion constraints,
  the aggregation function, the fee math) is tested where it actually
  lives -- the DB layer and the pure `fees.ts` module. The server actions
  themselves (`startRental`, `completeRental`, `saveTariff`, ...) are thin
  glue over those tested pieces; testing them directly would mean mocking
  Next.js's request-scoped cookie/auth context, which the test
  infrastructure built so far (real Postgres, no Next.js runtime) doesn't
  cover. Worth adding if a bug ever turns up in the glue itself rather
  than the logic underneath it.

## Phase 1

- **Placeholder 3D models, generated not downloaded.** `public/models/*.glb`
  are simple boxes/cylinders built programmatically by
  `scripts/generate-placeholder-models.mjs` via `@gltf-transform/core` --
  not sourced from anywhere, so there's no licensing question. Each has a
  material literally named `body` so `VehicleCard3D` can recolor it per
  vehicle at runtime via `<model-viewer>`'s material API. See `LICENSES.md`
  for how to swap in real models later.

- **Vehicle color is free text, recolored via a name->hex lookup.**
  `vehicles.color` stores what staff actually type ("Silver", "Blue"), not a
  hex code. `src/lib/vehicles/color.ts` maps common names to hex for the 3D
  card and falls back to a neutral gray for anything it doesn't recognize,
  rather than guessing or erroring.

- **`@supabase/ssr`'s `createServerClient<Database>()` doesn't infer
  `Database["public"]["Functions"]` correctly in 0.6.1** -- discovered
  while wiring `supabase.rpc("create_company", ...)`: the call type-checked
  the RPC args against `undefined` instead of the real `Args` type, even
  though the same `Database` type worked fine through plain `createClient`
  from `@supabase/supabase-js`. Pinned to `^0.12.7`, confirmed with a
  throwaway isolated repro before touching the real code. (Recorded here
  too, not just in the Phase 0 section, since it's the kind of thing that
  looks like "my code is wrong" and costs real time to re-diagnose if it
  resurfaces after a dependency bump.)

- **Vehicle log entries for status changes are written by a DB trigger, not
  application code.** `log_vehicle_status_change()` (migration
  `20260102000000_vehicle_log_trigger.sql`) fires `AFTER UPDATE` on
  `vehicles` whenever `status` actually changes, resolves the caller's own
  `accounts.id` as the actor, and inserts the log row itself. The
  alternative -- remembering to insert a log row in every code path that
  can change status -- reliably rots as more of those paths get added
  (Phase 2's checkout/return flows, for one). Manual notes (via
  `changeVehicleStatus`'s optional note field) are still inserted from
  application code since there's no DB-level event to hang them off of.

- **Barcodes are generated client-side (random 6-char code, retried on
  collision) rather than via a DB sequence or function.** Matches the
  pattern already used for company slugs in Phase 0. Ambiguous characters
  (0/O, 1/I/L) are excluded since these get read and typed by hand.

- **Barcode scanning uses `@zxing/browser`, not the native `BarcodeDetector`
  API.** `BarcodeDetector` isn't supported in Safari or Firefox yet; a
  camera-decoding library works everywhere `getUserMedia` does.

- **`src/lib/vehicles/types.ts` (the type->subtype mapping) is a
  hand-maintained mirror of the DB's `vehicles_subtype_matches_type` CHECK
  constraint, not generated from it.** `test/rls/vehicle-subtypes.test.ts`
  is what actually keeps them honest -- it inserts every (type, subtype)
  pair the TS module calls valid against real Postgres and asserts a
  couple of invalid ones are rejected, so drift between the two fails CI
  instead of shipping silently.

- **All server-action error returns are i18n keys, never raw Postgres/Auth
  error text.** Every action returns strings like `"errors.generic"`,
  translated with `useTranslations()` (no namespace -- the key already
  carries the full dotted path) at the point of display. This was a
  Phase 0 gap (`FormError message={state.error}` was rendering raw English
  provider text untranslated) fixed while touching this pattern for the
  fleet actions. Raw errors are still `console.error`'d server-side for
  debugging; the client only ever sees a translated, generic message --
  consistent with not leaking internal error detail to the UI.

- **`(app)` route group added for every signed-in page.**
  `src/app/[locale]/(app)/layout.tsx` does the "signed in? has a company?"
  check and renders the shared header once, instead of every page
  (`/fleet`, `/fleet/new`, `/fleet/[vehicleId]`, `/fleet/scan`,
  `/dashboard`) repeating it. `/dashboard` is now just a redirect to
  `/fleet` -- kept as a route so the Phase 0 sign-in flow's target URL
  doesn't need to change, but `/fleet` is the real operator home from here
  on.

- **Vehicle CRUD and status changes are open to any staff role** (owner,
  receptionist, worker) via the existing `is_staff_in_company` RLS check,
  not narrowed to receptionist-only as the domain brief's permission list
  implies. Fine-grained per-action role checks are a cheap addition once
  there's a real invite/role-management flow (Phase 2/3) to assign roles
  through in the first place; not worth building ahead of that.

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
