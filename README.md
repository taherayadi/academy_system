# System Academy — SaaS Platform Administration

Dedicated **platform-operator console** for the System Academy SaaS. This repository
(`academy_system_admin`) manages the *business* of the platform: tenants (centers),
their subscriptions and invoices, demo/trial requests, renewal-request review,
advertisement campaigns and platform reporting.

It is one of two applications that share a single Cloudflare D1 database:

| Repository | Application | Who logs in | Session store / cookie |
|---|---|---|---|
| `academy_system` | Public landing page + center workspace (students, staff, meals, attendance, scheduling, operational finance…) | `admin`, `super_admin`, `restricted_admin` (center roles) | `center_sessions` → `tc_center_session`* |
| **`academy_system_admin` (this repo)** | SaaS platform console only | **`platform_super_admin` only** | **`platform_sessions` → `tc_platform_session`** |

\* The center application is mid-rollout onto `center_sessions`; its legacy
`sessions` / `tc_session` pair is still its own fallback. **Neither is ever
accepted by this application** — see [Security model](#security-model).

Managing a center's **subscription and account** (create / edit / suspend / delete,
password reset for its admins, plans, invoices) is SaaS functionality and lives
here. Managing that center's **students, staff, attendance or operational
finances** is not — it lives in `academy_system` and this codebase refuses those
routes with a controlled 404/401 (never center logic, never the SPA fallback).

---

## Table of contents
1. [Architecture](#architecture)
2. [Security model](#security-model)
3. [Shared database & migration ownership](#shared-database--migration-ownership)
4. [Local development](#local-development)
5. [Environment & secrets](#environment--secrets)
6. [Platform-account provisioning](#platform-account-provisioning)
7. [Deployment & rollout order](#deployment--rollout-order)
8. [Rollback](#rollback)
9. [Testing & verification](#testing--verification)

---

## Architecture

```
Browser (RTL React SPA)
  └── same-origin fetch /api/* ──► Cloudflare Pages Functions (functions/api/)
                                     ├── _middleware.ts   platform session gate
                                     ├── auth/*           login / me / logout / password
                                     ├── centers.ts       tenant lifecycle (+admin pw resets,
                                     │                    auto period invoices)
                                     ├── center-plans.ts    plan engine (set/remove/schedule/trial)
                                     ├── planLogic.ts       pure pricing/proration rules
                                     ├── platform-billing.ts  invoices, payment status, module prices
                                     ├── demo-requests.ts   management only (no public POST here)
                                     ├── renewal-requests.ts review only (no center POST here)
                                     ├── platform-advertisements.ts + _adPositions.ts
                                     ├── platform-upload-logo.ts   ImageKit (ads & center logos)
                                     ├── pubnub-grant.ts    read-only `platform` channel
                                     └── [[path]].ts        controlled 404 for removed routes
  Cloudflare D1 `academy-system-v2` (SQLite) bound as `DB` — SHARED with the center app
```

* **Frontend** — React 19 + Vite + Tailwind 4 SPA (`src/`). `App.tsx` is a
  platform-only shell: login screen + seven sidebar consoles rendered by
  `PlatformAdminDashboard`. **No center dashboard, no landing page, no runtime
  switch that could enable one.**
* **Backend** — Cloudflare Pages Functions in `functions/`. The SPA talks to
  **relative same-origin URLs only** (`fetch('/api/…', { credentials: 'include' })`).
  There is no hard-coded host, no localhost API base, and no cross-application call.
* **Data layer** — `functions/api/_lib.ts` kept the platform slice of the former
  combined data layer (auth, sessions, rate limiting, center-tenant lifecycle
  helpers). Every student/staff/meals/scheduling CRUD function was deleted with
  the center application.

## Security model

Enforced on the **backend** at four independent levels (never by hiding UI):

1. **Login** (`POST /api/auth/login`) — verifies the bcrypt hash, then requires
   `role === 'platform_super_admin'`. A center account (or any other role) with
   a *correct* password gets the same 401 as a wrong password (no enumeration).
   No session row, no cookie.
2. **Session validation** (`validateSession` in `_lib.ts`) — every authenticated
   request JOINs `platform_sessions` → `users` and re-checks the role: deleted
   accounts and role downgrades are revoked immediately; expiry is enforced.
3. **Middleware** (`functions/api/_middleware.ts`) — the whole `/api/*` tree
   requires that session; only login/logout bypass it. There are **no public
   API paths** in this application anymore.
4. **Handlers** — each platform route re-checks `session.role === 'platform_super_admin'`
   (defense in depth) before touching data.

Credential isolation:

* HttpOnly **`tc_platform_session`** cookie (SameSite=Lax, Path=/, Secure over
  HTTPS) — a distinct name from the center app's `tc_session`, so both apps can
  share a parent domain without seeing each other's cookies; and the platform
  backend **never reads** the `sessions` table or a `tc_session`/`center_sessions`/
  `tc_center_session` value under any circumstances.
* **Bearer compatibility** is retained (API clients, dev tooling) but tokens are
  validated **only against `platform_sessions`**, and the browser client stores
  its copy in a separate localStorage namespace (`tc_platform_token` +
  `tc_platform_user`; the center app uses `tc_token` + `tc_user`).
* **Rate limiting** uses the shared `rate_limits` table with a distinct
  `platform-auth:` key prefix so a flood against one app cannot lock out the
  other's login.
* **Removed routes**: `functions/api/[[path]].ts` answers every unmatched `/api/*`
  with a controlled JSON 404 (`code: ROUTE_REMOVED`) for any method; methods that
  a kept route no longer implements (e.g. public `POST /api/demo-requests`,
  center `POST /api/renewal-requests`) are not exported, so nothing runs.
* **PubNub**: `GET /api/pubnub-grant` issues a PAM v3 token scoped to the exact
  `platform` channel, **read-only**, and only to a validated platform session.
  The grant's `ttl` uses the provider's unit — **minutes** — converted from the
  app's seconds constant (the combined app sent raw seconds, silently meaning
  10 hours; fixed here, with a regression test).
* **No default/seed passwords** were added; secrets stay out of the repo; no
  authentication bypass exists (there is no dev-mode flag, no header override).
* **Invoice print HTML** escapes every untrusted field (invoice number, center
  name, cheque number, notes) via `src/utils/html.ts` before `document.write`.

## Shared database & migration ownership

The Cloudflare D1 database **`academy-system-v2`** is shared and bound as `DB`
in `wrangler.toml`. There is exactly one schema.

**Ownership rule: this repository is the SOLE owner of the migrations in
`migrations/`.** The center application (`academy_system`) must not add, edit
or renumber migrations; its own migration history is frozen at `0034`.

Coordination protocol:

1. A schema change is authored **here** as the next `00NN_*.sql` (historical
   files are immutable — never edited or deleted, including the ones that
   created center-only tables).
2. Apply to remote once: `npm run d1:migrate` — **only with explicit approval**
   (this is production data). Both apps see it immediately; nothing else does.
3. Tag both repositories with the migration number that was applied
   (e.g. `schema@0035`) so each app knows its required minimum schema.
4. If the center app needs a schema change, it opens an issue here; this repo
   ships it and the center app only adopts the type/query changes.
5. Never run destructive statements (`DROP`, `TRUNCATE`, column drops) against
   `academy-system-v2`; additive SQL only (`CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN` guarded by try/catch or IF NOT EXISTS where the engine allows).
   Data cleanup exists in exactly one place: the platform's explicit
   center-deletion flow.

Current head: **`0035_platform_sessions.sql`** (this app's session table). The
legacy `sessions` table remains owned by the center application during the
rollout window — this app neither reads nor migrates it away.

## Local development

```bash
npm install
cp .env.example .env            # optional PubNub client keys (see below)
cp .dev.vars.example .dev.vars  # optional server-side keys for Pages dev

npm run d1:migrate:local        # build the local D1 mirror from migrations/
npm run dev                     # Vite on :3000 (proxies /api → :8788)
npm run pages:dev               # Pages Functions + local D1 on :8788
npm test                        # 112 frontend + 206 backend checks
npm run lint                    # tsc --noEmit
npm run build                   # production SPA bundle in dist/
npx wrangler pages functions build   # compile the Functions worker
```

To sign in locally you need a platform account in the local mirror — see
provisioning below (local only; never insert hand-made hashes into production).

## Environment & secrets

Server side — Cloudflare Pages → Settings → Environment variables
(**Production AND Preview**); never in `wrangler.toml [vars]` (committed file):

| Variable | Required | Purpose |
|---|---|---|
| `DB` (D1 binding) | ✅ | Shared `academy-system-v2` database |
| `IMAGEKIT_PRIVATE_KEY` | if logo/ad uploads are used | Uploads via `platform-upload-logo` |
| `PUBNUB_PUBLISH_KEY` / `PUBNUB_SUBSCRIBE_KEY` / `PUBNUB_SECRET_KEY` | optional | Realtime refresh for the platform dashboard; without them the app falls back to 30 s polling |

Client side — baked at build time by Vite (same Pages UI):

| Variable | Purpose |
|---|---|
| `VITE_PUBNUB_SUBSCRIBE_KEY` (+ publish key) | Browser PubNub client |

> ⚠️ Never commit real keys — not in code, not in tests (fixtures use
> `test-key`-style dummies), not in docs. Rotate immediately if one leaks.
> This application has **no Gemini/AI keys** — that surface belonged to the
> center app's PDF import and was not extracted here.

Login brute force is limited per IP (10 POSTs / 60 s on `platform-auth:*`, plus
a separate bucket for password changes) with `429 + Retry-After`.

## Platform-account provisioning

There is **no public sign-up and no seeded admin password** in this application.
The `users` table row alone is not access — the role must be `platform_super_admin`:

```sql
-- Run via the Cloudflare dashboard (or `wrangler d1 execute … --remote`
-- with explicit approval). Set the password by generating a bcrypt hash
-- OUT-OF-BAND (e.g. `node -e "console.log(require('bcryptjs').hashSync(process.env.PW,10))"`
-- with PW exported in your shell — never echo it into shell history files).
UPDATE users SET role = 'platform_super_admin', center_id = NULL
WHERE email = 'someone@yourdomain.tn';
-- …or INSERT a new platform admin with the same role. The historical
-- migration 0020 created the first platform account; rotate its password
-- through the UI before relying on it.
```

* Center admins keep using the center application; granting them access to the
  platform console would require changing their **role**, which is exactly what
  the backend enforces on every request.
* Removing access: set the user's role away from `platform_super_admin` or
  delete the row — the next request fails session validation (revocation is
  immediate, no cookie/TTL window).
* Password policy on self-service change: ≥ 8 characters and all other
  platform sessions of the account are revoked (the center app remains on its
  historical ≥4 rule for center users; that policy is theirs to tighten).

## Deployment & rollout order

Only with explicit approval for production steps (`deploy`, remote migrations):

1. **Schema first**: apply this repo's migrations (head `0035`) to remote D1.
   Additive only; the center app is unaffected by `0035`.
2. **Deploy the center app** (`academy_system`) with its own split changes once
   ready (accepting only `center_sessions`/legacy-center sessions, granting its
   own PubNub channels). Its login must NOT mint platform access — the platform
   role cannot authenticate there either way since center routes gate by center
   roles; verify.
3. **Deploy this app**: `npm run deploy` (builds `dist/` +
   `wrangler pages deploy dist` under project `system-academy-admin`), then
   attach the `DB` D1 binding + env vars/secrets to the Pages project.
4. Smoke checklist on the deployed preview URL: platform login OK; center
   account login 401; `GET /api/students` → 401 unauthenticated / `ROUTE_REMOVED`
   404 when authenticated; cookie name is `tc_platform_session`.
5. Cut over DNS/edge routing: platform hostname → this project; center hostname →
   `academy_system`. Both may share the D1 — never both serve `/api` for the
   other's surface on one origin.

### Rollback

* **App rollback**: re-deploy the previous Pages release (instant). The
  `0035` table is additive — old releases simply ignore it.
* **Access rollback**: because `platform_sessions` only ever holds
  `platform_super_admin` rows, this app can be taken offline without touching
  center data; platform admins would (temporarily) lose only the console.
* **Never** roll back migrations by deleting rows or dropping `platform_sessions`
  in an emergency; a bad deploy is fixed forward-only in this shared-database
  setup.
* Cookie/bearer namespaces were changed (`tc_platform_session`,
  `tc_platform_token`) — a rollback to the *combined* app would require users
  to log in again; acceptable and intentional (it also purges any session that
  was minted during the split).

## Testing & verification

* `npm test` — 8 jsdom suites (112 tests: platform API client, auth storage,
  dashboard smoke incl. the fetch-loop regression guard, plan-change analyzer,
  live-sync cadence, PubNub client fallback) and 13 node suites (206 tests:
  billing, plans, plan logic, auto-invoicing, demo-request one-way conversion,
  ad management, renewal review flow, middleware, and the split's negative
  suite: `platform-auth.test.ts` — center roles + legacy credentials rejected —
  and `removed-routes.test.ts` — 404/405 contract + method surfaces).
* `npm run lint` — full `tsc --noEmit` across SPA and functions.
* `npx wrangler pages functions build` — the Functions worker compiles.
