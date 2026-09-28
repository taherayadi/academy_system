# Implementation Plan: Center Types & New Modules (Crèche, Garderie, Activités, Compétences)

**Branch**: `001-center-types-new-modules` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-center-types-new-modules/spec.md`

## Summary

Add two new center types (crèche, garderie) alongside jardin/formation, and make the
application type-aware: crèche/jardin centers see no school-level fields (grade,
establishment), no Suivi quick actions (Notes Devoirs, timesheet view), and none of the
four study modules. Centers with Étude but without the paid Staff module get a
staff-lite view (add/edit/delete only; payslips, advances, congés, pointage locked with a
renewal prompt). Two new modules ship: **Activités & Planning** (all center types; weekly
planner grid with category-colored chips, per-class/per-location grouping) and
**Compétences & Skills** (skill catalog by domain, 4-level child evaluations, class
heatmap, printable report), both preset in Growth and Pro plans only.

Technical approach (validated against the codebase): reuse the existing module-gating
chain (`ModuleKey` → `TAB_MODULE` → sidebar/menuItems → `hasCenterModule` guard →
Dashboard cards → pricing catalog) for the two new modules; add two pure helper
predicates (`hasSchoolLevel`, `hasStudyModules`) in a new `src/utils/centerType.ts` for
all type-branching; persist activities/skills/skill-evaluations as new tenant-scoped
tables in the shared D1 database, exposed via two new same-origin routes following the
formations pattern (read-own-domain / replace-own-domain), registered in the
`_middleware.ts` route inventory per constitution Principle IV. No new auth surface, no
mode switch, no admin-side migrations (admin repo owns the shared migration sequence).

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22.13+ (local dev and vitest integration
tests); Cloudflare Workers runtime (workerd) for `functions/`

**Primary Dependencies**: React 18 + Vite (SPA center app), TailwindCSS (styling,
existing design tokens), lucide-react (icons), Cloudflare Pages Functions (`functions/`),
Cloudflare D1 (shared SQLite), vitest (unit + `node:sqlite` integration tests)

**Storage**: Cloudflare D1 — new tables `activities`, `skills`, `skill_evaluations`
(tenant-scoped with `center_id`), plus `center_type` already available on the center
record; **migrations owned by the admin repository** (constitution Principle I)

**Testing**: vitest; component tests with Testing Library; integration tests against
real SQLite via `node:sqlite`; gates = `npm run lint` (tsc) + `npm test` + `npm run build`

**Target Platform**: Modern desktop + mobile browsers; SPA served by Cloudflare Pages
with same-origin `/api` Functions

**Project Type**: Web application — frontend SPA (`src/`) + Pages Functions backend
(`functions/`) in one repository

**Performance Goals**: Module switch and planner render feel instant for catalogs of up
to a few hundred activities/skills; state save round-trips reuse existing patterns (no
regression on current save times)

**Constraints**: Same-origin `/api` only; session credential solely the HttpOnly
`tc_center_session` cookie; every query verifies `center_id` ownership; no secrets in
`VITE_*`; no client token storage; unknown routes 404 / removed methods 405

**Scale/Scope**: Single-center tenancy per session; per-center data volume expected in
hundreds (activities, skills, evaluations); touches ~10 existing files + 5 new
components/routes/tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Deployment Split | ✅ PASS | Landing + center only. New modules are center-app features; pricing display reuses the existing public-pricing GET. No platform UI, no mode switch. **New D1 tables ship as migrations in the ADMIN repository's sequence — this repo must not create its own migration chain** (flagged as a coordination task, not a violation). |
| II. Tenant Isolation | ✅ PASS | All new reads/writes derive `centerId` from the authenticated context (`getContextCenterId`), every statement filtered by `center_id`; type/visibility logic reads the session's center record only. No new public auth surface. |
| III. Security by Default | ✅ PASS | New routes are authenticated (not on the public allowlist); unauthenticated-write rate limiting and audit logging come from the shared middleware/helpers exactly like existing modules. No uploads introduced. No secrets touched. |
| IV. Exact Contract Surface | ✅ PASS | Exactly two new route paths (`/api/activities`, `/api/skills` + child-evaluation path — see contracts) added to the `ROUTES` inventory in the same change; browser calls stay relative same-origin; tests for foreign roles + cross-origin + session isolation accompany them. |
| V. Test-First Verification | ✅ PASS | Feature ships with: helper unit tests, middleware-inventory test updates, handler isolation tests (foreign center → empty/403 per existing convention), staff-lite component test, type-gating tests; gates lint+test+build mandatory. |

**Post-design re-check (Phase 1)**: Re-verified after contracts were drafted — route
inventory additions match handlers 1:1; no data flows outside the tenant scope; no
platform capability reintroduced. Gates remain green-conceptual; runtime proof via
quickstart.md.

## Project Structure

### Documentation (this feature)

```text
specs/001-center-types-new-modules/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── activities-api.md
│   └── skills-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── utils/
│   └── centerType.ts                       # NEW: hasSchoolLevel / hasStudyModules + type lists
├── types.ts                                # ModuleKey += 'activites' | 'competences'; Activity,
│                                           #   Skill, SkillEvaluation interfaces; CenterTenant type doc
├── api.ts                                  # fetch/save helpers for the two new domains
├── App.tsx                                 # TAB_MODULE += 2; sidebar entries + type guards; staffLimited
│                                           #   computation; new module render branches + live-sync keys
├── components/
│   ├── ActivitiesModule.tsx                # NEW: weekly planner grid + activity CRUD
│   ├── CompetencesModule.tsx               # NEW: skill catalog + evaluations + heatmap + print
│   ├── LandingPage.tsx                     # centerTypes += crèche/garderie
│   ├── StudentRegistrationModule.tsx       # grade/établissement conditional on hasSchoolLevel
│   ├── SuiviScolaireModule.tsx             # quick-action buttons conditional; grade filter hidden
│   ├── Dashboard.tsx                       # study cards type-gated; 2 new module cards
│   ├── StaffManagementModule.tsx           # staffLite prop: hide pointage/payslip/avance/congé
│   └── RenewalModule.tsx                   # no code change (renders from pricing catalog)
├── utils/pricing.ts                        # ALL_MODULES += 2 entries; PLAN_PRESET_MODULES growth/pro
└── index.css                               # print styles reuse (bulletin) — verify only

functions/api/
├── activities.ts                           # NEW: GET + PUT (own-domain replace, formations pattern)
├── skills.ts                               # NEW: GET + PUT (catalog + evaluations in one domain doc)
├── _lib.ts                                 # readActivities/writeActivities, readSkills/writeSkills
└── _middleware.ts                          # ROUTES += the new paths/methods (same change)

tests (co-located per repo convention *.test.ts / *.test.tsx):
├── src/utils/centerType.test.ts            # NEW
├── functions/api/_middleware.test.ts       # extended: new inventory entries
├── functions/api/skills.test.ts            # NEW: isolation/foreign-role coverage
└── src/components/StaffManagementModule.test.tsx  # NEW: staff-lite behavior
```

**Structure Decision**: Single-repository web application (existing layout kept — no new
top-level directories). Frontend modules live in `src/components/`, server handlers in
`functions/api/` following the formations.ts reference pattern, shared helpers in
`functions/api/_lib.ts`, pricing catalog in `src/utils/pricing.ts`. Tests stay
co-located with the code they cover, matching current convention (73 test files).

## Complexity Tracking

> No constitution violations to justify — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
