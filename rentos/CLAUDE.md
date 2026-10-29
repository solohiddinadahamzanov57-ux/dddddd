# RentOS: build prompt for Claude Code

> This file lives at `rentos/CLAUDE.md` -- `rentos/` is RentOS's project
> root. The repo it sits in also contains an unrelated, already-shipping
> product ("Driver Desk," at the repo root, Cloudflare Workers/D1/Hono).
> RentOS and Driver Desk are independent apps sharing one repo; nothing
> here applies to Driver Desk, and nothing in Driver Desk's own tooling
> applies to RentOS. See `docs/DECISIONS.md` for why, and for every other
> durable choice made while building this.

## 1. Product

RentOS is a multi-tenant SaaS for small car rental companies (5 to 50 vehicles) that now run on Excel and WhatsApp.
Two sides in one system:

- Operator side: fleet management, live rental timer, automatic revenue and profit tracking.
- Customer side: a public booking page per company, later a shared marketplace where customers search and book vehicles from many companies.

Signature features:

1. Each vehicle is shown as a 3D model (GLB) with live info: status (available, rented, service), fuel or battery level, plate number, mileage.
2. Rental timer: starts at pickup, shows elapsed time and money earned in real time (time x tariff + extras).
3. Contactless rental: online booking, ID check, deposit hold, e-contract, photo inspection, keybox code. No meeting required.
4. Launch order: operator software first, then public booking pages, then contactless handover, then the marketplace. Design the data model for all of them from day one, but build in phases.

Target: global architecture (multi-currency, multi-language, time zones, tax as a setting), first launch in 1 to 2 countries.

## 2. Domain model (from the system design video "Car Rental System")

Requirements to cover:

1. Vehicle types: cars, trucks, SUVs, vans, motorcycles. Subtypes: car (sedan, hatchback, coupe), truck (pickup, box truck), SUV (compact, full-size), van (passenger, cargo), motorcycle (standard, touring).
2. Unique barcode per vehicle plus parking stall number.
3. Tracking: which member has which vehicle.
4. Late fees: collect fees for overdue returns.
5. Search and reserve: search inventory, reserve available vehicles.
6. Notifications: pickup, due date, overdue alerts.
7. Barcode reader: the system reads vehicle barcodes (camera scan in browser).
8. Cancel: members cancel reservations.
9. Vehicle log: track all vehicle events.
10. Insurance: add rental insurance to a reservation.
11. Equipment: navigation, child seat, ski rack.
12. Services: roadside assistance, extra driver, wifi.

Entities (adapt for multi-tenancy; every row carries `company_id`):

- Company (tenant), Location (name, address, time zone), Account (role: owner, receptionist, worker, member)
- Vehicle (barcode, license plate, model, type, subtype, color, parking stall, status, odometer, fuel_type, fuel_or_charge_level, level_source: `manual | photo | obd | api`, model_glb_key)
- Reservation (vehicle, member, start, end, status, tariff snapshot, total)
- Rental (actual start, actual end, timer, tariff, late fee, extras, final amount)
- VehicleLog (event type, vehicle, actor, timestamp, payload)
- Equipment, Service, AdditionalDriver, RentalInsurance (type, cost, details)
- Payment (amount in minor units, currency, method, status, provider id)
- Notification (type, content, date, channel)
- Expense (vehicle, category: repair, insurance, fuel, wash, fine; amount, date)

Actors and permissions:

- Receptionist: add/modify vehicles and workers, reserve for members, manage inventory.
- Member (customer): search catalog, reserve, pick up, return, manage own reservations.
- System: overdue notifications, cancelled reservation alerts, automated reminders (service due, insurance expiry).
- Worker: handle returned vehicles, update vehicle log, inspect and maintain.

Core flows:

- Reserve: search by type, select vehicle, choose dates, add equipment and insurance, confirm, pay.
- Return: scan barcode, inspect (photos), check late return, calculate fee, update vehicle log, mark available.
- Check-out (pickup) starts the rental timer. Return stops it.

## 3. Money and time rules

- Store money as integer minor units plus ISO currency code. Never floats.
- Timer and fee logic live on the server, based on server timestamps. The client only displays.
- Tariffs: hourly, daily, weekly; grace period; late fee per hour. Snapshot the tariff into the rental when it starts.
- Revenue and profit: per vehicle and per period. Profit = income minus expenses.
- Tax (VAT or similar) is a per-company setting, not hardcoded.
- Write unit tests for every fee calculation, including time zone changes, grace periods and late returns.

## 4. Tech stack

- Next.js (App Router) + TypeScript (strict) + Tailwind
- Supabase: Postgres, Auth, Storage, Row Level Security
- Stripe for subscriptions and customer payments (test mode first)
- Google `<model-viewer>` for the 3D vehicle card (GLB files in `public/models/`, one per body type: sedan, hatchback, SUV, van, pickup, motorcycle; recolor by the material named `body`)
- i18n from day one (`next-intl`): English and Russian first
- Vitest for unit tests, Playwright for key flows
- Mobile-first, installable PWA

Fuel and charge data: show the source of every value (manual, photo, OBD tracker, manufacturer API) as a small label on the vehicle card. Start with manual input plus photo of the dashboard at pickup and return. Keep an adapter interface (`FuelProvider`) so OBD and Smartcar-style APIs can be added later.

## 5. Build phases (stop after each one for my review)

**Phase 0 (done -- see `docs/DECISIONS.md`): foundation.** Repo, strict TS, lint, env handling, CI, Supabase schema and migrations, RLS policies for every table, auth with roles, i18n skeleton, design tokens. Done when: a user can sign up, create a company, and cannot read another company's data (prove with a test).

**Phase 1 (done -- see `docs/DECISIONS.md`): fleet and 3D cards.** Vehicle CRUD, barcode generation and camera scanning, vehicle log, status changes, 3D card with status, fuel or charge, plate, mileage. Fleet dashboard with filters.
Phase 2: rentals, timer, money. Check-out and return flows, live timer and earnings, late fees, extras (equipment, services, insurance), expenses, revenue and profit per vehicle and per period, calendar to prevent double booking.
Phase 3: public booking page. Per-company page and link, search by dates and type, price calculation, reservation, Stripe payment, cancellation rules, notifications (email first, WhatsApp or Telegram later).
Phase 4: contactless rental. ID and license verification through a provider adapter (Sumsub or Veriff style), deposit hold on the card, e-contract with signature, before and after photos with timestamps, keybox code released only after all checks pass.
Phase 5: SaaS billing. Plans by vehicle count (Start, Growth, Pro), Stripe subscriptions, limits enforcement, free trial.
Phase 6: marketplace. Cross-company search, commission on bookings, company approval, reviews from real completed rentals only.

## 6. Security checklist (apply from Phase 0; verify before every launch)

1. Never expose API keys in client code; secrets only in server env.
2. No secrets in Git; add `.env*` to `.gitignore`, scan history, rotate anything leaked.
3. Only the public (anon) database key in the browser; the service key stays on the server.
4. Row Level Security enabled on every table, with tests.
5. Encrypt sensitive data (ID documents, license numbers) at rest; private storage buckets with signed URLs.
6. Enforce authentication and authorization on the server, never only in the UI.
7. Lock record access: users reach only their own company's records (check ownership on every query).
8. Block field tampering: whitelist updatable fields; never trust `company_id`, `role`, `price`, or `status` from the client.
9. Secure session cookies: HttpOnly, Secure, SameSite.
10. Hash passwords (rely on the auth provider; never roll your own).
11. Rate limit login, signup, password reset, and booking endpoints.
12. Bot protection (CAPTCHA or Turnstile) on public forms.
13. Parameterized queries only.
14. Validate all input on the server with a schema (zod).
15. Escape user-generated content on output.
16. Restrict file uploads: type, size, content sniffing, random file names, private storage.
17. Trim API responses: return only the fields the client needs.
18. Security headers: CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy.
19. Force HTTPS everywhere.
20. Scan dependencies (npm audit, Dependabot) and pin versions.

## 7. Legal and compliance checklist (generate drafts; I will have a lawyer review them)

1. Privacy policy.
2. Terms of service.
3. Refund and cancellation policy.
4. Cookie policy.
5. Cookie consent banner (no non-essential cookies before consent).
6. Check that every form has proper consent checkboxes (unchecked by default).
7. Collect no unnecessary data.
8. Audit third-party SDKs and what data they receive.
9. No dark patterns (no pre-checked upsells, no hidden cancel paths).
10. No hidden fees: show the full price, including taxes, insurance, and deposit, before payment.
11. No fake reviews or testimonials.
12. No unsupported marketing claims.
13. Alt text on all meaningful images.
14. Fix color contrast (WCAG AA).
15. Full keyboard navigation.
16. Business details (company name, address, contact) in the footer.
17. Age and driver license checks; no data collection from minors.
18. Unsubscribe link in every marketing email.
19. Use only licensed fonts, images, and 3D models; keep a `LICENSES.md` with the source and license of each asset. Do not use real car brand models or logos.
20. Data deletion and export requests handled in account settings.

## 8. Design rules: the app must not look "vibecoded"

Do not do any of these:

1. Purple-to-blue gradients.
2. Gradient hero text.
3. Emojis in headings or UI.
4. Inter everywhere.
5. Colored-border cards.
6. Glassmorphism cards.
7. Low-contrast dark mode.
8. Three icon boxes in a row as the main content block.
9. A small badge above the headline.
10. Lucide icons on everything.
11. Untouched shadcn/ui defaults (customize radius, color, spacing, states).
12. Fade-in on every scroll.
13. Cursor-following glow beams.
14. Buttons that only fade on hover.
15. Inconsistent spacing (use a strict spacing scale).
16. Em dashes in copy.
17. Generic buzzword copy ("seamless", "unlock", "empower", "revolutionize").
18. Serif italic accent words.
19. The Space Grotesk plus Instrument Serif pairing.
20. Grain texture over a gradient.

Do this instead:

- Pick one distinctive type pairing (not any font named above) and define a type scale.
- A restrained palette: one accent color, neutral surfaces, real semantic colors for status (available, rented, service, overdue).
- A spacing scale on a 4 or 8 px grid, used everywhere.
- Dense, useful data screens: this is a tool for operators who work on a phone in a parking lot. Large tap targets, readable numbers, tabular figures for money and time.
- The 3D vehicle card is the hero element. Keep everything around it flat and calm.
- Real, specific copy written like a person who runs a rental business ("Mark as returned", "Late by 2 h 10 min: $18").
- Meaningful empty states, loading skeletons, and error messages that say what to do next.
- Light and dark mode both checked for contrast.

## 9. Working rules for you (Claude Code)

- Work phase by phase. Before coding a phase, write a short plan and list assumptions. After coding, run tests, lint, and type-check, then summarize what changed and what is not done.
- Ask me only when a decision cannot be reversed cheaply (pricing logic, legal text, data deletion). Otherwise pick a sensible default and note it.
- Keep a `docs/DECISIONS.md` log of important choices.
- Keep `CLAUDE.md` updated when the plan changes.
- Never commit secrets. Never disable RLS to make something work.
- Every user-facing string goes through i18n.
- Seed script with 12 demo vehicles (mix of types, statuses, fuel and EV) so the dashboard looks real.
