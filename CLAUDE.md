# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

System Academy is a full-stack SaaS platform for managing student tutoring centers in Tunisia. It's a Cloudflare Pages app (React 19 + Vite + Tailwind 4) backed by a Cloudflare D1 (SQLite) database, with multi-tenant, plan-based feature gating and realtime sync via PubNub.

**Core domain:** Student enrollment, academic tracking (Tunisian curriculum), study-hall (Étude) scheduling, private lessons, meals, staff payroll, transport (bus), finance, and plan/subscription management for the platform.

## Commands

```bash
npm run dev              # Start Vite dev server (port 3000)
npm run pages:dev        # Start Cloudflare Pages Functions locally (port 8788; reads .dev.vars)
npm run build            # Production build
npm run preview          # Preview production build
npm run lint             # TypeScript type checking (tsc --noEmit)
npm test                 # Run all tests (browser config, then Node config)
npm run test:watch       # Watch mode for browser tests
npm run test:node        # Node environment tests only
npm run d1:migrate:local # Apply migrations to local D1 (academy-system-v2)
npm run d1:migrate       # Apply migrations to remote D1
npm run deploy           # Build + `wrangler pages deploy dist`
```

## Architecture

### Frontend

**State management:** React hooks + prop drilling. `App.tsx` (~1400 lines) owns all global state and passes it down via props. There is no Redux/Zustand.

**Global state in `App.tsx`:** `students`, `staff`, `slots`, `courses`, `sessions`, `mealPlans`, `expenses`, `timesheets`, `settings`, `externalStudents`, `revisionSeances`, `studentTimeSheets`, `studentAttendance`, `formations`, `mealForfaitClosures`. `mealForfaitClosures` and `studentAttendance` are loaded separately (own endpoints) from the main boot snapshot.

**Routing (no React Router):** A single `activeTab` string state decides which module renders. Tabs are `dashboard`, `module1`…`module8`, `studentTimeSheets`, `formations`, `settings`, `renewal`, `moduleBus`, and `platform*` (platform admin only). Rendering is `{activeTab === 'module1' && <StudentRegistrationModule … />}`.

**Module gating:** `TAB_MODULE` in `App.tsx` maps each tab id to a `ModuleKey` (e.g. `module3: 'etude'`, `module7: 'finance'`). `hasCenterModule(tabId)` returns true when the tab's key is in `currentCenter.enabledModules`. Dashboard/settings are always allowed; empty `enabledModules` (legacy centers) or `platform_super_admin` role → all modules visible. The nav menu is filtered with the same helper. `LIBRARY_ENABLED = false` disables the (still-implemented) library module globally.

**Session/login behavior:** Sessions do NOT persist across reloads — `App.tsx` calls `clearLocalSession()` on mount, so every launch requires login (by design). After login, a platform super admin lands on the platform dashboard, center admins on the center dashboard.

### Backend (Cloudflare Pages Functions)

**Location:** `functions/api/`. Each route is its own `.ts` file exporting `onRequestGet` / `onRequestPost` / `onRequestPut` / `onRequestDelete`. Handlers are typed `PagesFunction<Env>` and receive `({ request, env, params, context })` with `env.DB` for D1.

**Files prefixed `_` are NOT routes** (Cloudflare Pages routing convention) — they're shared helpers, e.g. `_lib.ts`, `_middleware.ts`, `_pubnub.ts`, `_planHistory.ts`, `_adPositions.ts`. `_lib.ts` (1300+ lines) is the shared data layer: `Env` interface, `json()` / `readBody()` helpers, all CRUD/domain functions, session management, and default seed data (`DEFAULT_SUBJECTS`, `DEFAULT_ACADEMIC_YEARS`, `DEFAULT_CENTER_ID`).

**Two middleware layers:**
- `functions/api/_middleware.ts` — auth gate for the whole `/api/*` tree. Only a hard-coded `PUBLIC_PATHS` list bypasses it: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/demo-requests`, `GET /api/public-pricing`, `GET /api/advertisements/active`.
- `functions/api/auth/_middleware.ts` — rate limiter for every POST under `/api/auth/*`: 5 requests / 60 s per IP; the 6th is rejected with 429 + `Retry-After`.

### Authentication & Sessions

- **Session-based, not JWT.** Login (`POST /api/auth/login`) creates a row in the **`sessions`** table (token = `crypto.randomUUID()`, **24-hour expiry**, not 30 days) and returns an HttpOnly cookie `tc_session` (`SameSite=Lax`).
- **Requests authenticate by EITHER** the `Authorization: Bearer <token>` header (token mirrors localStorage key `tc_token`, kept by `src/auth.ts`) **OR** the `tc_session` cookie — `getSessionToken()` in `_lib.ts` tries the header first, then the cookie. The frontend sends both (`authHeaders()` in `src/api.ts` + `credentials: 'include'`).
- `validateSession()` (called by the middleware and attached to `context.data.session`) joins `sessions` to `users` for the role, resolves `center_id`, and — for non-`platform_super_admin` roles — **re-checks the center's access state on every authenticated request** via `getCenterAccessState()` (returns `trial_expired` | `subscription_expired` | `suspended` | `expired` and rejects the session when non-null).
- Password hashing: bcrypt with 10 rounds of salt via `bcryptjs` (`hashPassword`/`verifyPassword` in `_lib.ts`).
- `users.role` values: `super_admin`, `restricted_admin`, `platform_super_admin`, `admin` (migration 0020). `platform_super_admin` = the SaaS platform operator; seeds `platform@systemacademy.tn`.

### Multi-Tenancy & Plan Gating

**There is no `VITE_SAAS_MODE` env switch anymore** — multi-tenancy is structural. The `centers` table holds every tenant (single-tenant deployments just work on one default center).

- Most domain tables carry `center_id`; in multi-tenant mode every query filters by it for data isolation. The active center id comes from the session (`session.centerId`) or falls back to `DEFAULT_CENTER_ID` (a fixed UUID in `_lib.ts`). Helper: `getContextCenterId(context)`.
- `CenterTenant` (in `src/types.ts`) carries `plan`, `enabledModules`, `status`, `trialEndsAt`, `subscriptionEndsAt`, `billingCycle`, `monthlyPrice`, `centerType` (`jardin` | `formation`), `logoUrl` (ImageKit), and `scheduledPlan` (a deferred plan change that applies at the end of the current period).
- Plan keys: `trial` → `starter` → `growth` → `pro` → `custom`. Note **`starter` is stored internally but displayed as "Basic"**; `planLabel()` / `displayPlan()` handle this conversion. `ModuleKey` in `src/types.ts` lists all gated modules.

### Plan-Change & Billing Semantics

The plan-change/proration engine lives in `functions/api/planLogic.ts` as **pure functions** (so it's unit-testable without a DB). Key vocabulary used across the billing code:

- **period** = one billed window (30 days monthly, 365 days annual). `centers.monthly_price` stores the amount for one full period (already discounted for annual; a manual tariff for `custom`).
- `evaluatePlanChange()` classifies a change into a `PlanChangeMode`: `trial_preconfig`, `renewal`, `mid_period_increase`, `mid_period_decrease`, `mid_period_same_price`, `no_change`.
- `upgradeSettlement()` computes the prorated amount for a mid-period price increase (paid vs. unpaid window), and `subscriptionWindow()` derives current window bounds.
- The route `POST/PATCH /api/center-plans` applies plan actions (set-plan, add-trial, remove-plan, settle-now vs. schedule) and writes `center_plan_history`. `GET /api/center-plans` returns the billing view used by `PlatformAdminDashboard` and `RenewalModule`.

**Frontend mirror:** the client can't import from `functions/`, so `src/utils/planChange.ts` mirrors these rules (backend stays the source of truth) to drive what the platform admin sees and which request shape the UI sends. `src/utils/pricing.ts` is the module-pricing catalogue shared by the landing-page pricing simulator and the center's renewal module. `src/utils/dates.ts`, `format.ts`, `formationSchedule.ts`, `logger.ts` are small shared utilities.

### State Snapshot (`/api/state`) & the platform side

- `GET /api/state` (`functions/api/state.ts` → `readState()`) returns a full `AppState` snapshot of one center. `PUT /api/state` (`writeState()`) rewrites it **atomically** by deleting-and-reinserting every scoped table in a `batch()`. This powers JSON backup/export/import in settings and the landing page's demo workflow. On normal boot though, the frontend does **not** use `/api/state` — `fetchDatabase()` in `src/api.ts` issues concurrent GETs to the per-entity routes (`/settings`, `/students`, `/staff`, `/slots`, `/courses`, `/sessions`, `/meals`, `/expenses`, `/timesheets`, `/external-students`, `/revision-seances`, `/student-timesheets`, `/formations`), then individual mutations use per-entity endpoints.
- **Platform admin modules** (only for `platform_super_admin`): `centers.ts` (tenant CRUD + module editing), `center-plans.ts`, `platform-billing.ts` (invoices), `renewal-requests.ts`, `demo-requests.ts` (landing "request a demo" leads), `platform-advertisements.ts` + `_adPositions.ts` (two responsive ad formats, `rectangle` and `interstitial`, with legacy IAB id aliasing), `platform-upload-logo.ts`. `src/api.ts` has matching `fetch*Api`/`*Api` clients. The public-facing `GET /api/public-pricing.ts` feeds the landing page.

### Realtime Sync (PubNub) — unchanged behavior

- Server publishes **"refetch signal" messages only** (never trusted payloads) via `functions/api/_pubnub.ts` (`publish()` + PAM v3 `grantToken()`); silent no-op when keys are missing. `GET /api/pubnub-grant` returns a short-TTL token scoped to `center.{id}` or `platform`.
- Client: `src/realtime/pubnubClient.ts` (one shared connection per tab, token refresh at half-TTL), consumed by `src/hooks/usePubNubSync.ts`. Polling fallback `src/hooks/useLiveSync.ts` (30 s cadence, 5 s while a request is pending) takes over whenever PubNub isn't `active`.
- All keys optional — missing keys just means polling; zero console errors. Never put keys in `wrangler.toml`.

### Database Schema

**Migrations:** `migrations/0001_init.sql` is the full base schema; later files (`0002`…`0034`) are additive. Apply with `npm run d1:migrate[:local]`. Key tables: `centers`, `settings`, `fee_sets`, `users`, `sessions`, `students` (+ `student_parents`, `siblings`, `authorized_persons`, `academic_history`), `payments`, `meal_attendances`, `suivi_notes`, `staff` (+ schedules/payslips/advances/leave), `timesheets`, `student_time_sheets`, `etude_slots` + `slot_enrollments`, `external_courses` + `external_course_sessions` + `external_students`, `revision_seances`, `formations`, `meal_forfait_closures`, `demo_requests`, `center_plan_history`, `renewal_requests`, `invoices`, `platform_advertisements`.

## Key Patterns

### Adding a New Module (frontend-gated)

1. Add the key to `ModuleKey` in `src/types.ts`.
2. Create the tab id and add a `TAB_MODULE[id] → moduleKey` entry in `src/App.tsx`.
3. Create the component in `src/components/`, import it in `App.tsx`, and render it with `{activeTab === '<id>' && <Component … />}`.
4. Add the menu item in `App.tsx` (it's automatically hidden unless `hasCenterModule(item.id)` is true).
5. If it's a paid module, add pricing to `src/utils/pricing.ts` and (if it's factored into plan gating) use `center-module` APIs.
6. Platform admins choose the module via `enabledModules` in center management (`centers.ts` route); the module only shows for centers that have it enabled. There is **no `PLAN_DEFINITIONS` constant** — plan rules live in `functions/api/planLogic.ts` + `src/utils/planChange.ts`.

### Adding an API Endpoint

1. Create `functions/api/my-endpoint.ts`. Import `Env`, `json`, `readBody` (and `getContextCenterId` / `validateSession` as needed) from `./_lib`.
2. Export `onRequestGet` / `onRequestPost` / `…` typed as `PagesFunction<Env>`.
3. Auth is automatic for all `/api/*` (root `_middleware.ts`); read the session from `context.data.session`. Paths to expose anonymously must be added to `PUBLIC_PATHS` in `_lib.ts`… actually in `functions/api/_middleware.ts`.
4. In multi-tenant mode, derive the center with `getContextCenterId(context)` and filter every query by it.
5. Add the matching client function in `src/api.ts`.

### Working with D1

**D1 is async SQLite.**
```typescript
const result = await env.DB.prepare('SELECT * FROM students WHERE id = ?').bind(id).first();
const all = await env.DB.prepare('SELECT * FROM students WHERE center_id = ?').bind(centerId).all();
```

**No `BEGIN/COMMIT` transactions** — D1 rejects them. Use `batch([...])` for multi-statement atomicity (see `writeState()` in `_lib.ts` for the delete-and-reinsert pattern). Integer IDs and `center_id` foreign keys isolate tenants; always scope reads/writes by `center_id`.

### Fees & Academic Years

Fee sets are stored per academic year in `fee_sets` with a `'DEFAULT'` fallback. `getFeesForYear(settings, year)` (in `src/types.ts`) resolves the year-specific set or falls back. Current year comes from `getCurrentAcademicYear()` (September 1 cutoff); month constants and Arabic calendar helpers (`ARABIC_MONTHS`, `getCurrentAcademicIndex()`, `monthToArabic()`) are also in `src/types.ts`.

### Tunisian Curriculum Subjects

Subjects are bilingual `"العربية (Arabe)"` — Arabic name + French parenthetical — seeded in `DEFAULT_SUBJECTS` in `_lib.ts` and mirrored as `APP_SUBJECTS` in `src/types.ts`. UI renders both. `isMathSubject()` and grade/branch helpers for the Bac (2ème/3ème filières) live in `src/types.ts`.

### Payment Normalization

`normalizePaymentService()` (in `_lib.ts` and mirrored in `src/types.ts`) repairs legacy inconsistencies, e.g. `"Inscription"` → `"Inscription Suivi"`, `"Bibliothèque"` + Annuel → `"Inscription Bibliothèque"`. Always normalize before aggregating payment service names.

## Testing

**Vitest with two configs** (run both via `npm test`):
- `vitest.config.ts` — jsdom (browser) for React components: `src/components/*.test.tsx`, `src/**/*.test.ts`.
- `vitest.config.node.ts` — Node for Functions/server logic: `functions/api/*.test.ts`, `src/utils/*.test.ts`.

Run one test:
```bash
npx vitest run --config vitest.config.ts src/components/Dashboard.test.tsx
npx vitest run --config vitest.config.node.ts functions/api/planLogic.test.ts
```

Domain logic (billing, plan logic, live sync) has dedicated test files (`planLogic.test.ts`, `_lib.test.ts`, `center-plans.test.ts`, `platform-billing.test.ts`, `renewal-requests.test.ts`, `useLiveSync.test.ts`). Tests use fake `test-key` fixtures for PubNub, never real keys.

## Environment Variables

**Server (Cloudflare env bindings, Production + Preview; never commit):**
- `IMAGEKIT_PRIVATE_KEY` — ImageKit.io private key for logo uploads (routes: `upload-logo.ts`, `center-logo.ts`, `platform-upload-logo.ts`)
- `PUBNUB_PUBLISH_KEY`, `PUBNUB_SUBSCRIBE_KEY`, `PUBNUB_SECRET_KEY` — realtime sync (all optional; polling fallback otherwise)

**Client (Vite, `VITE_` prefix, baked at build; from Cloudflare env or local `.env`):**
- `VITE_PUBNUB_PUBLISH_KEY`, `VITE_PUBNUB_SUBSCRIBE_KEY`

Local server secrets go in `.dev.vars` (gitignored); client vars in `.env` (gitignored). The D1 binding `DB` → `academy-system-v2` is in the committed `wrangler.toml`.

## Common Gotchas

- **D1 async:** always `await` — `.first()`, `.all()`, `.run()`.
- **No transactions:** use `env.DB.batch()` (D1 rejects `BEGIN/COMMIT`).
- **Center ID isolation:** every multi-tenant query filters by `center_id` from the session; forgetting it leaks data across tenants. Use `getContextCenterId(context)`.
- **Auth is cookie+token, not just Bearer:** the client sends both an HttpOnly `tc_session` cookie and a Bearer header. Middleware accepts either. Session expiry is **24 hours**, in the `sessions` table.
- **Center lifecycle is re-checked per request** for center admins: an expired/suspended/trial-lapsed center is locked out until it's renewed, even mid-session.
- **`starter` = "Basic" in the UI.** Don't display raw plan strings.
- **PubNub silent fallback:** missing keys → polling mode, no errors. `console.warn` is the only signal.
- **Session length / launch:** every reload wipes the saved session and forces a fresh login — intentional.
- **RTL/Arabic:** UI and subject labels are Arabic-French; the Cairo font (loaded in `main.tsx`) is required for correct rendering.
- **Ad formats:** old IAB ids (`leaderboard_728x90`, etc.) alias to the current `rectangle`/`interstitial` ids — normalize via `_adPositions.ts`.