# Implementation Plan: Type-Aware Gating (Crèche/Jardin hide school-level content)

**Branch**: `002-type-aware-gating` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-type-aware-gating/spec.md`

## Summary

Make the center application type-aware: for centers typed **crèche** or **jardin**, all
school-level content disappears — the grade and establishment fields in child
registration (and every grade surface app-wide: lists, filters, cards, prints), the two
school-specific Suivi Scolaire row actions (Notes Devoirs, timesheet view), and the four
study modules (Cours Particuliers, Étude Surveillée, Révision Examens, Formations) from
navigation, dashboard, and direct access. Garderie/formation centers and
legacy/unknown-type centers see everything exactly as today. Hiding is presentation-only;
no stored data is touched.

Technical approach (validated against the codebase): two pure predicates
(`hasSchoolLevel`, `hasStudyModules`) in one shared utility — single source of the
validated garderie≈formation / crèche≈jardin matrix — consumed by
`StudentRegistrationModule`, `SuiviScolaireModule`, `App.tsx` (menu + tab guard), and
`Dashboard.tsx`, with `centerType` threaded as an explicit prop following the existing
Dashboard precedent. Pure-frontend feature: no routes, no storage, no migration.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22.13+ (dev/tests); React 18 SPA

**Primary Dependencies**: React 18 + Vite, TailwindCSS, lucide-react, vitest + Testing
Library (component-test convention already present: `*.test.tsx` with `render()`)

**Storage**: none — presentation-only feature (reads `CenterTenant.centerType`, mutates
nothing)

**Testing**: vitest; new component tests for registration/Suivi gating + App nav gating;
gates = `npm run lint` + `npm test` + `npm run build`

**Target Platform**: Modern desktop + mobile browsers (same rules both layouts)

**Project Type**: Web application (frontend-only change in this feature)

**Performance Goals**: zero added perceivable cost — two boolean predicate calls per
render pass

**Constraints**: no behavioral change for garderie/formation/unknown types; no data
mutation; composition with existing subscription gating (type gating only removes)

**Scale/Scope**: ~6 existing files touched, 1 new util + 1 test file, 3 new component
test files; no new modules or routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Deployment Split | ✅ PASS | Frontend-only; no platform surface, no routes, no migrations. |
| II. Tenant Isolation | ✅ PASS | Reads only the session-loaded center record (`currentCenter.centerType`); no server change; no new data access. |
| III. Security by Default | ✅ PASS | No endpoints, uploads, secrets, or credential handling touched. |
| IV. Exact Contract Surface | ✅ PASS | No route changes — inventory untouched. All calls remain existing same-origin data paths. |
| V. Test-First Verification | ✅ PASS | Each rule ships with its failing-first test: predicate unit tests, registration gating test, Suivi quick-actions test, App nav/deep-link fallback test. Gates lint+test+build mandatory. |

**Post-design re-check (Phase 1)**: Re-verified — the design adds no server surface and
no data flow; the visibility matrix in data-model.md is the complete behavioral
contract, covered test-by-test in quickstart.md. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-type-aware-gating/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (visibility matrix — no new entities)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

**Contracts/**: intentionally omitted — the feature introduces no external interface
(no new routes, events, or schemas). Its behavioral contract IS the visibility matrix,
captured in `data-model.md` and proven in `quickstart.md`.

### Source Code (repository root)

```text
src/
├── utils/
│   └── centerType.ts                       # NEW: hasSchoolLevel / hasStudyModules (+ CENTER_TYPES)
├── utils/centerType.test.ts                # NEW: predicate truth table incl. unknown/empty → true
├── App.tsx                                 # thread centerType; menuItems + guard-effect exclusion of
│                                           #   module3/module4/module4b/formations for non-study types
├── components/
│   ├── StudentRegistrationModule.tsx       # centerType prop; hide grade + établissement blocks & print lines
│   ├── StudentRegistrationModule.test.tsx  # NEW: crèche hides+saves, formation unchanged
│   ├── SuiviScolaireModule.tsx             # centerType prop; hide NotebookPen + Clock row actions, grade filter
│   ├── SuiviScolaireModule.test.tsx        # NEW: crèche no icons, formation has icons, payments intact
│   ├── Dashboard.tsx                       # type-check added to existing isModuleAllowed filter for 4 study cards
│   └── App.typeGating.test.tsx (or src/)   # NEW: sidebar excludes 4 labels for crèche, includes for formation
└── (RenewalModule, LandingPage: untouched in this feature)
```

**Structure Decision**: No new directories beyond `src/utils/` (convention-consistent).
Tests co-located next to components per existing `*.test.tsx` practice; the App-level
gating test lives beside the other component tests under `src/`.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
