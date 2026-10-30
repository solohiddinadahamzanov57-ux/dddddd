# Decisions

Durable choices made along the way, and why, so later phases don't
re-litigate them. Newest first.

## Phase 3

- **The public booking surface is a handful of `SECURITY DEFINER` functions,
  not new RLS policies on the real tables.** `anon` gets zero table grants
  it can use; `public_company_by_slug`, `public_vehicle_by_id`,
  `search_available_vehicles`, and `public_tariff_for_vehicle_type`
  (migration `20260104000000_public_booking.sql`) each return only the
  specific, curated columns a public page needs. This means every future
  column added to `vehicles`/`companies`/`tariffs` is private by default --
  nobody has to remember to _not_ expose it publicly, since there's no
  policy that would.

- **Real finding while testing the above: a newly created Postgres
  function gets `EXECUTE` granted to `anon`/`authenticated` directly at
  creation time** (this project's default privileges mirror a real
  Supabase project's), and `revoke all ... from public` does not take that
  back from `anon` -- its grant doesn't come through the `public`
  pseudo-role. This affected every "authenticated-only" function back to
  Phase 0 (`create_company`, the auth helpers) and Phase 2
  (`vehicle_profit_report`), though none of them could actually do
  anything as `anon` (each checks `auth.uid()` itself, or is `SECURITY
INVOKER` so RLS still applied inside it) -- so nothing was ever
  exploitable, but `anon` shouldn't have been able to reach them at all.
  Fixed in `20260104000100_harden_function_grants.sql` (a new migration,
  not an edit to the already-written ones) with an explicit `revoke
execute ... from anon` on each. `test/rls/function-grants.test.ts` is
  what caught it and is what keeps it caught.

- **A customer becomes a company's member via `join_company_as_member()`,
  a narrow `SECURITY DEFINER` function**, not a general INSERT policy on
  `accounts`. It can only create the lowest-privilege role ('member'),
  only for `auth.uid()` (the caller themselves), only for a company that
  already exists, and is idempotent (returns the existing row if one's
  already there). This is the self-service parallel to Phase 0's
  `create_company()` and Phase 2's staff-driven walk-in member creation --
  three different trust levels (self-service customer, staff-on-behalf-of,
  company owner), three different narrow paths, no general-purpose
  "insert an account" escape hatch anywhere.

- **One `auth.users` table and one set of sign-in/sign-up pages serve both
  staff and customers.** Rather than a second, parallel auth system, the
  existing pages gained an optional `next` query param
  (`src/lib/auth/next-path.ts`) that sends a visitor back into the booking
  flow after authenticating instead of into onboarding/the fleet
  dashboard. `next` is validated against an allowlist (must start with
  `/book/`) before ever being redirected to, since it's client-supplied --
  otherwise the sign-in flow would be an open redirect.

- **Reservation pricing is computed server-side, twice, from the same
  function.** The quote shown while browsing (`calculateReservationQuote`,
  a thin wrapper over `calculateRentalCharge` with no late fee and no
  extras -- a reservation hasn't started yet) and the amount actually
  charged via Stripe are both derived from the tariff looked up at submit
  time, never from a price the client posted. The `tariff_snapshot` frozen
  onto the reservation is what the eventual rental's checkout step will
  read later, same as Phase 2.

- **Stripe: a real integration, built against keys that don't exist yet.**
  Same pattern as Supabase in Phase 0 -- `src/lib/stripe/client.ts` throws
  a clear error if `STRIPE_SECRET_KEY` is unset rather than the app
  crashing obscurely or silently pretending payment succeeded, and the
  booking flow checks `isStripeConfigured()` to show "this company hasn't
  set up online payment yet" instead of a broken checkout button. The
  webhook (`src/app/api/stripe/webhook/route.ts`) verifies the Stripe
  signature before doing anything, and uses the admin client to flip the
  reservation to `confirmed` and the payment row to `succeeded` --
  deliberately idempotent (`where status = 'pending'`) since Stripe
  retries webhook deliveries.

- **Not implemented, flagged rather than silently skipped:** Stripe
  refunds on cancellation (cancelling a paid reservation right now doesn't
  touch the Stripe charge -- a manual refund is needed until this exists),
  WhatsApp/Telegram notifications (the brief itself defers these to
  "later"), a location picker on the booking form, and localized
  transactional email content (confirmation/cancellation emails are
  English-only; the schema doesn't yet track a customer's preferred
  locale). Email itself goes through `ConsoleEmailProvider`
  (`src/lib/notifications/email.ts`) until a real provider's API key
  exists -- it logs instead of sending, and every call site already goes
  through the one function that will need to change.

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
