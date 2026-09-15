# CLAUDE.md

Guidance for coding agents working in this repository.

## What this repository is

**System Academy — SaaS platform administration console ONLY.** It manages the
platform business: tenant (center) lifecycle, subscriptions/plans/invoices,
demo-request handling, renewal-request review, advertisement campaigns and
platform reporting. The public landing page and the entire center workspace
(students, staff, meals, attendance, scheduling, operational finance, backups)
live in the separate `academy_system` repository — they must never be re-added
here, and their API routes stay deliberately absent (answered by
`functions/api/[[path]].ts` with a controlled 404, or by the auth middleware
with 401 before that).

Read `README.md` first: architecture, the security model (platform_super_admin
only, `platform_sessions` / `tc_platform_session`, bearer namespace
`tc_platform_token`), shared-D1 migration ownership and the deployment/rollback
runbook.

## Hard rules

1. **Never grant center roles platform access.** `admin`, `super_admin`,
   `restricted_admin` are CENTER roles. Authentication, session validation and
   every handler must accept only `platform_super_admin`. Do not "convenience"
   this open with `||` on other roles.
2. **Never read the center app's session state** (`sessions`,
   `center_sessions`, cookies `tc_session` / `tc_center_session`). New
   session-like stores in this app are always `platform_*`.
3. **Migrations in `migrations/` are owned here** and apply to the shared D1
   `academy-system-v2`: append-only (create the next `00NN_*.sql`), never edit
   historical files, additive SQL only, and never apply to `--remote` without
   explicit user approval. The center repository must not carry migrations.
4. **Same-origin API only.** The SPA calls relative `/api/…` with
   `credentials: 'include'`. No absolute hosts.
5. **No default passwords / seeds / auth bypasses.** No env-flag that disables
   role checks. Missing keys must only degrade optional features (PubNub →
   polling, ImageKit → error message), never security.
6. **PubNub PAM wire-unit:** grant `ttl` is MINUTES (provider API); app
   constant stays SECONDS — convert in `grantToken()`. Grants are read-only on
   the `platform` channel for this app.
7. **`document.write`/print HTML must escape every interpolated untrusted
   field** with `src/utils/html.ts → escapeHtml`.

## Repo map

* `src/App.tsx` — platform shell (login + 7-tab sidebar); `page` prop selects
  the section inside `src/components/PlatformAdminDashboard.tsx`.
* `src/api.ts` — the ONLY fetch layer (Bearer+cookie, `UnauthorizedError` on 401).
* `src/auth.ts` — `tc_platform_user` storage, boot resolution via `/api/auth/me`.
* `functions/api/_lib.ts` — platform data layer: json/readBody, bcrypt helpers
  (+ the ONE-TIME legacy unsalted-SHA-256 upgrade helpers used by login only),
  rate limiting (`platform-auth` prefix), `platform_sessions` lifecycle,
  `getCenterAccessState`, `mapCenterRow`, `removedRouteResponse`.
* `functions/api/centers.ts` — tenant lifecycle: create (with director account),
  edit, suspend, delete (full tenant-data cleanup incl. `sessions` rows of that
  CENTER — that's the one sanctioned exception: account deletion is platform-owned),
  admin password resets, `ensurePeriodInvoice` auto-invoicing.
* `functions/api/center-plans.ts` + `planLogic.ts` + `_planHistory.ts` — plan
  engine: immediate/scheduled changes, prorated settlements, audit trail.
* `functions/api/platform-billing.ts` — invoices, payment status, module prices.
* `functions/api/renewal-requests.ts` — GET/PATCH review only (POST was removed
  with the center submission flow).
* `functions/api/demo-requests.ts` — GET/PATCH/DELETE only (public POST removed;
  submissions happen on the center app's landing page).
* `functions/api/platform-advertisements.ts` + `_adPositions.ts` — campaign CRUD
  incl. center assignments; rendering lives in the other app.
* Tests: vitest — jsdom config covers `src/**/*.test.ts(x)`, node config covers
  `functions/**/*.test.ts`.

## Commands

```bash
npm run dev / pages:dev      # frontend :3000 / functions :8788 (run both)
npm test                     # all suites
npm run lint                 # tsc --noEmit
npm run build                # SPA production build
npx wrangler pages functions build   # functions compile check
npm run d1:migrate:local     # local mirror only — never --remote unapproved
```

## Before touching auth, billing or plans

Run the full suite; the split's guarantees are pinned by
`functions/api/platform-auth.test.ts` (center roles & legacy creds rejected),
`functions/api/removed-routes.test.ts` (404/405 contract),
`functions/api/_pubnub.test.ts` (TTL units) and
`src/utils/html.test.ts` (print escaping). Adapt/extend them rather than
deleting assertions. If a change alters the shared schema, follow the
coordination protocol in README.md §"Shared database & migration ownership".
