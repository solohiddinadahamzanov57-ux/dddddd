# Driver Desk

A lead manager for truck driver recruiters. Rebuilt from a claude.ai prototype
into a real, deployable website — free to run and free to build with.

## Status: Phase 1 complete

**Phase 1 — Login + dashboard + leads (no AI, no payments).** Done and
tested locally. Phases 2–4 (AI-assisted import, Stripe subscriptions, public
marketing pages) come next, one at a time.

## Stack (all free — see "Free limits" below before you deploy)

| Piece | Service | Why |
|---|---|---|
| Hosting | Cloudflare Workers (+ Workers Static Assets) | Free `*.workers.dev` URL, no server to manage |
| Database | Cloudflare D1 (SQLite) | Free, every query scoped to the logged-in user — see `src/db/scoped.ts` |
| Auth | Better Auth (email+password, Google) | MIT-licensed, open source, runs on Workers |
| Email | Resend (password reset only, Phase 1) | Free tier, server-side only |
| Framework | Hono | Tiny, fast, built for Workers |

## Free limits — confirm before you deploy for real

I'm required to tell you these up front and get your OK before anything paid
touches this project. Nothing below costs money at Driver Desk's current
size, but you should know the ceilings:

- **Cloudflare Workers (free plan):** 100,000 requests/day. Static files
  (HTML/CSS/JS) don't count against this at all. Commercial use is allowed —
  there's no "non-commercial only" clause on the Workers Free plan.
- **Cloudflare D1 (free plan):** 5 GB total storage (500 MB per database, up
  to 10 databases), 5 million rows read/day, 100,000 rows written/day.
  Plenty for thousands of leads across many users. Commercial use allowed.
- **Resend (free plan):** 3,000 emails/month, 100/day. Only used for
  password-reset emails right now. Commercial use allowed.
- **Better Auth, Hono:** MIT license — free for commercial use, no
  attribution required, no usage caps (they're just code you host yourself).

If you outgrow any of these, Cloudflare's and Resend's next tiers are
pay-as-you-go with no surprise bill — but **I will not add a paid plan or a
paid service without telling you first and getting a yes from you.**

## Everything is scoped to the logged-in user — on purpose

D1 has no row-level security (nothing stops a query from reading another
user's row unless the code itself filters for it). So every table
(`leads`, `custom_fields`, `info_templates`, `message_templates`,
`call_logs`) has a `user_id` column, and the **only** way the app is allowed
to touch them is through `src/db/scoped.ts`. That file:

- Takes a `userId` once, up front, and bakes it into every SQL statement
  (`WHERE user_id = ?`) — there's no method that accepts a caller-supplied
  user ID, so a route handler can't pass the wrong one even by mistake.
- Refuses to even construct itself without a real `userId`.
- Filters updates and deletes by `user_id AND id` together, so even if
  someone guessed another user's exact lead ID, the query matches zero rows.

`test/isolation.test.ts` proves this: it creates two users, lets one of them
try to read, update, and delete the other's data by guessing real IDs, and
asserts every attempt fails. Run it any time with `npm test`.

---

## Setting it up (one-time)

### 1. Create a free Cloudflare account

Go to **https://dash.cloudflare.com/sign-up** and sign up (free). No credit
card required for the Workers Free plan.

### 2. Install dependencies

```bash
npm install --legacy-peer-deps
```

(The `--legacy-peer-deps` flag works around an unrelated npm resolver bug
in some of the Workers dev-tooling's peer dependency declarations — it's
safe here.)

### 3. Log in to Cloudflare from your terminal

```bash
npx wrangler login
```

This opens a browser tab to authorize. Approve it.

### 4. Create your real D1 database

```bash
npx wrangler d1 create driver_desk_db
```

This prints a `database_id`. Open `wrangler.toml` and replace
`REPLACE_AFTER_WRANGLER_D1_CREATE` with that ID.

### 5. Set your secrets

Copy `.dev.vars.example` to `.dev.vars` for local development:

```bash
cp .dev.vars.example .dev.vars
```

Generate a secret and put it in `.dev.vars`:

```bash
openssl rand -base64 32
```

Paste the output as `BETTER_AUTH_SECRET=...` in `.dev.vars`. Leave
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`RESEND_API_KEY` blank for now —
Google sign-in and real password-reset emails are optional; the app works
without them (email/password sign-up works either way, and without Resend
configured, reset-password emails just get logged to your terminal instead
of actually sent — fine for local testing).

`.dev.vars` is gitignored — it never gets committed.

When you're ready to deploy for real (not just `wrangler dev` locally), set
the same secrets on Cloudflare itself (these never go in `wrangler.toml` or
any committed file):

```bash
npx wrangler secret put BETTER_AUTH_SECRET
```

### 6. Apply the database migration

Locally (creates a local SQLite file under `.wrangler/`, no Cloudflare
account traffic involved):

```bash
npm run db:migrate:local
```

Against your real, deployed D1 database (only do this once you're ready to
deploy):

```bash
npm run db:migrate:remote
```

---

## Running it locally

```bash
npm run dev
```

Then open **http://localhost:8787** in your browser. You'll see the Driver
Desk landing page. Click **Start free trial**, sign up with any email/
password, and you'll land on the dashboard.

### How to test Phase 1

1. **Sign up** at `/signup.html` with a name, email, and password (8+
   characters). You should land on `/dashboard` immediately.
2. **Add a lead**: click **+ Add lead**, fill in a name (required) and
   whatever else you have, save. It should appear in the list with a
   completeness bar.
3. **Edit / delete** a lead from its card.
4. **Search and filter**: type in the search box, try the status dropdown,
   try the "Due today" chip (set a lead's follow-up date to today to see it
   show up).
5. **Call / Text buttons**: on a lead with a phone number, "Call" opens your
   phone/softphone via a `tel:` link; "Text" opens a composer that can pull
   from a message template and opens your messaging app via an `sms:` link.
6. **Templates tab**: add an info template and a message template (try a
   placeholder like `Hi {name}, following up about {company}`). Use it from
   a lead's Text button and confirm the placeholders got filled in.
7. **Custom fields tab**: add a field (e.g. "CDL Class"), go back to a lead,
   edit it, confirm the new field shows up on the form and counts toward the
   completeness bar.
8. **Log out / log back in**: confirm your leads are still there.
9. **Two-account check** (the thing the isolation tests already prove, but
   worth seeing yourself): sign up a second account in a private/incognito
   window. Confirm it starts with zero leads — it never sees account one's
   data.
10. **Password reset**: on the login page, click "Forgot your password?",
    enter your email. Without `RESEND_API_KEY` set, check your terminal —
    the reset link gets printed there via `console.warn`. Paste it into your
    browser, set a new password, confirm you can log in with it.

### Running the automated tests

```bash
npm test
```

This runs the user-isolation tests (`test/isolation.test.ts`) against a
real in-memory SQLite database running your actual migration file — no
Cloudflare account or network access needed.

### Type-checking

```bash
npm run typecheck
```

---

## Deploying for real

Once you've done the one-time setup above (Cloudflare account, `wrangler
login`, real D1 database, secrets set with `wrangler secret put`, remote
migration applied):

```bash
npm run deploy
```

This gives you a free `https://driver-desk.<your-subdomain>.workers.dev`
URL. No custom domain needed yet — that can come later.

### Setting up Google sign-in (optional)

1. Go to **https://console.cloud.google.com/apis/credentials**, create a
   project if you don't have one, and create an **OAuth client ID** of type
   **Web application**.
2. Add `http://localhost:8787/api/auth/callback/google` as an authorized
   redirect URI for local testing, and your deployed
   `https://<your-worker>.workers.dev/api/auth/callback/google` once
   deployed.
3. Put the Client ID and Client Secret into `.dev.vars` locally and into
   `wrangler secret put GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for the
   deployed version.
4. Google's OAuth client setup itself is free — no cost at any volume for
   this use case.

### Setting up real password-reset emails (optional)

1. Go to **https://resend.com/signup** (free, confirm you're OK with the
   3,000/month, 100/day limit above).
2. Create an API key at **https://resend.com/api-keys**.
3. Put it in `.dev.vars` (`RESEND_API_KEY=...`) locally and
   `wrangler secret put RESEND_API_KEY` for the deployed version.
4. By default Resend lets you send from `onboarding@resend.dev` without
   verifying a domain — fine to start. Verifying your own domain (also
   free) gets you out of that sandbox sender later.

---

## What's next

- **Phase 2:** Import leads from pasted text, CSV/Excel/PDF, and photos,
  with Cloudflare Workers AI cleaning up messy data — free daily allocation,
  rate-limited per user so it can't be exhausted by one account.
- **Phase 3:** Stripe Checkout (3-day trial, then $4.99/mo or $20/yr), a
  webhook that updates subscription status in D1, and a "Choose a plan"
  screen that appears if the trial lapses without payment (your data is
  never deleted).
- **Phase 4:** Public marketing pages (features, pricing, Terms of Service,
  Privacy Policy — starter versions that you should have reviewed by
  someone qualified before relying on them) and a launch checklist.
