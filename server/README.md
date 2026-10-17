# LazyStakes server

The REST API and scheduled jobs: the part of LazyStakes that decides whether a day counts and whether a card gets charged. TypeScript on Node, Postgres on Supabase, deployed to Railway, charges through Stripe.

See [`../docs/specsheet.md`](../docs/specsheet.md) for why it works the way it does.

## Layout

```
db/schema.sql                 The base database. Run once on a fresh Supabase project.
db/migrations/                Changes since; `npm run migrate` applies the new ones
src/gateways/auth.ts          Checks Supabase sign-in tokens
src/index.ts                  Entry point: HTTP API + cron jobs in one process
src/api/app.ts                Endpoints (/v1/today, /v1/commitments, /v1/check-ins/:id/done, …)
src/jobs/materializeCheckIns  Nightly: create check-ins two days ahead
src/jobs/resolveDeadlines     Every 15 min: verified / free pass / missed + queue charge
src/jobs/processCharges       Every 15 min: charge via Stripe, retry, block on final failure
src/jobs/sendNotifications    Every 15 min: 6 pm reminder, 10 pm warning, receipts (off for now)
src/gateways/stripe.ts        The only code that moves money
src/time.ts                   Every timezone calculation
scripts/                      seed, run-job, exit-test
test/                         Runs schema.sql in in-process Postgres (PGlite) — no setup needed
```

## Commands

```bash
npm install
npm test               # full suite, no database or Stripe needed
npm run typecheck
npm run dev            # API + jobs locally, reads server/.env
npm run build && npm start
npm run migrate        # apply new db/migrations/*.sql to DATABASE_URL
npm run seed           # test user + Stripe test card; prints the user id
npm run test-card -- you@example.com   # give a signed-in account Stripe's test Visa
npm run job -- resolve # run one job now: materialize | resolve | charge | notify
npm run exit-test      # the Phase 2 exit test against real Supabase + Stripe test mode
```

## One-time setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Pick a region near you; save the database password.
2. **SQL Editor** → New query → paste all of `db/schema.sql` → **Run**. Then, once `server/.env` is filled in (step 3), `npm run migrate` applies everything in `db/migrations/`.
3. Click **Connect** (top of the dashboard) → **Session pooler**. Copy the URI and put your password in it. That's `DATABASE_URL`. It should look like `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   - Don't use the **Direct connection** string (`db.<project-ref>.supabase.co`). That host only has an IPv6 address, so most home networks and Railway fail with `getaddrinfo ENOTFOUND`.
   - If the password has symbols like `@ # / ? %`, URL-encode them (`@` → `%40`), or reset the password to letters and numbers.

### 2. Stripe

1. Create an account at [stripe.com](https://stripe.com). Stay in **test mode** (toggle top right).
2. **Developers → API keys** → copy the **secret key** (`sk_test_…`). That's `STRIPE_SECRET_KEY`.
3. **Settings → Public details → Statement descriptor**: `LAZYSTAKES`. This is what appears on bank statements, and the app tells users to look for it.

### 3. Run the exit test locally

```bash
cd server
copy .env.example .env       # then fill in DATABASE_URL and STRIPE_SECRET_KEY
npm install
npm run exit-test
```

It takes about three minutes (it waits for a real deadline to pass) and prints PASS/FAIL for each check. The spec's rule: don't start Phase 3 until this passes.

### 4. Railway

1. Create a project at [railway.com](https://railway.com) → **Deploy from GitHub repo** → `lazystakes`.
2. Service **Settings**:
   - **Root directory**: `server`
   - **Build command**: `npm run build`
   - **Start command**: `npm start`
   - **Replicas**: 1 (the jobs are safe to double-run, but there's no reason to)
3. **Variables**: `DATABASE_URL`, `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `JOBS_ENABLED=true`, `NOTIFICATIONS_ENABLED=false`, `DEV_AUTH=false`.
4. **Settings → Networking → Generate domain**, with the port the deploy logs print in `[api] listening on :…` (usually 8080). Visit `/health` — it should return `{"ok":true}`.

## Sign-in and data access

The app signs in with Supabase Auth and sends `Authorization: Bearer <access token>` on every `/v1` request (plus `x-timezone` with the device's IANA zone). The API verifies the token against the project's published public keys, so there's no JWT secret to store, and creates the user's row on the first request. Without a token every `/v1` endpoint returns 401.

The app never reads or writes tables directly. Migration 001 turns on row-level security everywhere, gives the public (anon) key no access at all, and gives signed-in sessions read-only access to their own rows. Every write goes through the API, because direct writes would skip its rules. `test/auth.test.ts` checks all of this.

## Trying the API locally

Set `DEV_AUTH=true` in `server/.env` (never on Railway), run `npm run seed`, then:

```bash
npm run dev
curl -H "x-dev-user-id: <id from seed>" localhost:3000/v1/me
```

## Secrets

Everything in `server/.env` is secret — unlike the app's `.env`, nothing here ships to phones. The service-role key and database URL bypass row-level security entirely. If one is ever committed, rotate it; rewriting git history isn't enough.
