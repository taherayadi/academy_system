# Implementation Plan: Activités & Planning Module

**Branch**: `004-activities-planning` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-activities-planning/spec.md`

## Summary

Ship the **Activités & Planning** module for all center types: a weekly planner grid
(days × half-hour bands) with category-colored activity chips, create/edit/delete with
strict validation (title, category, weekday-or-date, end-after-start), drag-to-move
with a touch fallback, per-class/per-location grouping with an unassigned group, and
commercial placement (shared catalog on the landing simulator and in renewal;
Growth/Pro presets; hidden without entitlement).

Technical approach (aligned with feature 001's already-drafted activities design and
contract): one new tenant-scoped `activities` domain — DDL coordinated through the
admin repository's shared migration sequence — exposed via `GET/PUT /api/activities`
on the established formations pattern (read-own-domain / validate-and-replace),
registered in the route inventory in the same change. Frontend: a new planner module
wired through the standard gating chain (`ModuleKey` → tab map → sidebar → guard →
dashboard card) and the standard save pipeline (`commitDomain`), plus two catalog
entries/presets in the pricing module. Time banding, category colors, and the move
fallback are pure presentation helpers.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22.13+; React 18 SPA; Cloudflare Workers
functions runtime

**Primary Dependencies**: React 18 + Vite, TailwindCSS, lucide-react, vitest +
Testing Library; Cloudflare Pages Functions + D1 (shared, admin-owned migrations)

**Storage**: new `activities` table (tenant-scoped `center_id`) in the shared D1 —
migration owned by the admin repository per constitution Principle I (coordination
task, same as 001)

**Testing**: vitest (unit + component) and `node:sqlite` integration tests for the
handler (isolation, method, validation); gates = `npm run lint` + `npm test` +
`npm run build`

**Target Platform**: Modern desktop + mobile browsers (drag on desktop, tap fallback
on touch)

**Project Type**: Web application — frontend + Pages Functions in one repo

**Performance Goals**: planner renders a week's activities instantly (bucketing by
day/slot); save round-trips identical to existing modules (no regression)

**Constraints**: same-origin `/api` only; session-derived tenant scoping on every
statement; no new dependencies (HTML5 drag, no DnD library); grouping is view-only;
overlaps coexist visually (spec edge case)

**Scale/Scope**: ~8 files touched/new: 1 handler + `_lib` helpers + middleware entry,
1 module component (+1 test), pricing catalog/presets, App/Dashboard registration;
local D1 volume per center in the hundreds of activities

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Deployment Split | ✅ PASS | Center-app module; commercial listing reuses existing public pricing GET; **activities DDL ships in the ADMIN repository's migration sequence** (coordination task, not a repo violation). |
| II. Tenant Isolation | ✅ PASS | Handler derives center from the authenticated context; every SELECT/INSERT/DELETE carries `center_id`; payload center identity ignored. Integration tests prove cross-center isolation both directions. |
| III. Security by Default | ✅ PASS | Route is authenticated (not on the public allowlist); unauthenticated-write rate limiting and audit behavior inherited from shared middleware; error envelope never echoes internals. |
| IV. Exact Contract Surface | ✅ PASS | Exactly one new inventory entry `"/api/activities": ["GET", "PUT"]` added in the same change as the handler; same-origin calls only; tests cover foreign roles, cross-origin mutation, session isolation. |
| V. Test-First Verification | ✅ PASS | Failing-first suites: handler isolation/validation tests, planner component tests (chip placement, validation blocking, grouping), catalog/preset tests; gates lint+test+build mandatory. |

**Post-design re-check (Phase 1)**: Re-verified — contract (contracts/activities-api.md)
matches the handler and inventory 1:1; data model enforces the spec's validation rules
verbatim; no data flow leaves the tenant scope. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-activities-planning/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── activities-api.md  # Phase 1 output (aligned with 001's contract)
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

### Source Code (repository root)

```text
src/
├── types.ts                                # ModuleKey += 'activites'; Activity interface (exact enums)
├── api.ts                                  # saveActivities(activities) PUT helper
├── utils/planner.ts                        # NEW pure helpers: time bands, day columns, category colors,
│                                           #   grouping (per class / per location / unassigned)
├── utils/planner.test.ts                   # NEW: band mapping, grouping buckets, validation predicate
├── utils/pricing.ts                        # ALL_MODULES += activites entry; growth/pro presets only
├── App.tsx                                 # TAB_MODULE + sidebar + render branch + state wiring +
│                                           #   commitDomain save + live-sync key
├── components/
│   ├── ActivitiesModule.tsx                # NEW: weekly grid, chips, create/edit dialog,
│   │                                       #   drag + tap-fallback move, grouping toggle
│   └── ActivitiesModule.test.tsx           # NEW: placement, validation, move, grouping, persistence calls
├── components/Dashboard.tsx                # new card (isModuleAllowed filtered)
└── components/RenewalModule.tsx            # no change (renders shared catalog) — verify only

functions/api/
├── activities.ts                           # NEW: GET + PUT (formations pattern)
├── activities.test.ts                      # NEW: isolation, 401/405, validation drops, payload centerId ignored
├── _lib.ts                                 # readActivities/writeActivities (center_id everywhere)
└── _middleware.ts                          # ROUTES += "/api/activities": ["GET", "PUT"]

admin repository (coordination, not this repo):
└── migration: CREATE TABLE activities (...)  # per data-model.md; blocks production deploy only
```

**Structure Decision**: Follows 001's layout exactly (same handler pattern, same
helper placement, co-located tests) so the two features converge on identical code if
both ship; `utils/planner.ts` is the only new file kind (pure presentation logic,
unit-testable without rendering).

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
