# Implementation Plan: Compétences & Skills Module

**Branch**: `005-competences-skills` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-competences-skills/spec.md`

## Summary

Ship the **Compétences & Skills** module: a domain-grouped skill catalog (langage /
motricité / social / autonomie; label + optional age range), per-child evaluations on
the fixed four-level scale with evaluator + date (roster picker when Staff is
purchased, free-text name otherwise — feature 003's entitlement model), a per-class
mastery heatmap grouped by the child's class label, and a print-ready per-child report
reusing the app's established print-area mechanism. Commercial placement mirrors 004:
shared catalog on landing + renewal, Growth/Pro presets, hidden without entitlement.

Technical approach (aligned with 001's drafted skills design and contract): two new
tenant-scoped domain tables — `skills` (catalog) and `skill_evaluations` — managed as
one skills domain document exposed via `GET/PUT /api/skills` on the formations
pattern, DDL coordinated through the admin repository's migration sequence, route
registered in the inventory in the same change. Frontend: a new module component wired
through the standard gating chain and `commitDomain` save queue; catalog validation,
level color mapping, heatmap bucketing, and the evaluator discriminator are pure
helpers in a new utility; the report is a print-area section styled by the existing
print stylesheet (verified: `@media print` + `.print-area`/`.no-print` conventions in
`src/index.css`).

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22.13+; React 18 SPA; Cloudflare Workers
functions runtime

**Primary Dependencies**: React 18 + Vite, TailwindCSS, lucide-react, vitest +
Testing Library; Cloudflare Pages Functions + D1 (shared, admin-owned migrations)

**Storage**: new `skills` + `skill_evaluations` tables (tenant-scoped `center_id`) in
the shared D1 — migrations owned by the admin repository per constitution Principle I
(coordination task, same as 001/004)

**Testing**: vitest (unit + component) and `node:sqlite` integration tests for the
handler (isolation, methods, cascade, discriminator); gates = `npm run lint` +
`npm test` + `npm run build`

**Target Platform**: Modern desktop + mobile browsers; A4 print output via the
existing print stylesheet

**Project Type**: Web application — frontend + Pages Functions in one repo

**Performance Goals**: heatmap and catalog render instantly at center scale
(hundreds of skills/evaluations — bucketed rendering); save round-trips identical to
existing modules

**Constraints**: same-origin `/api` only; session-derived tenant scoping everywhere;
no new dependencies; one current evaluation per child-skill pair (latest save wins);
evaluator forms mutually exclusive; cascade removal only within the same domain
write

**Scale/Scope**: ~9 files touched/new: handler + `_lib` helpers + middleware entry,
module component (+1 test), pure utility (+1 test), pricing catalog/presets,
App/Dashboard registration, `src/api.ts` helper; data volume per center in the
hundreds

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-evaluated after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Deployment Split | ✅ PASS | Center-app module; commercial listing reuses existing public pricing GET; **skills + skill_evaluations DDL ships in the ADMIN repository's migration sequence** (coordination task, same as 001/004). |
| II. Tenant Isolation | ✅ PASS | Handler derives center from the authenticated context; every statement carries `center_id`; cascade and foreign-student drops enforce same-center references; isolation tests both directions. |
| III. Security by Default | ✅ PASS | Route authenticated (not on the public allowlist); rate limiting/audit inherited from shared middleware; error envelope never echoes internals; no uploads. |
| IV. Exact Contract Surface | ✅ PASS | Exactly one new inventory entry `"/api/skills": ["GET", "PUT"]` in the same change as the handler; same-origin only; tests cover foreign roles, cross-origin mutation, session isolation. |
| V. Test-First Verification | ✅ PASS | Failing-first suites: handler tests (isolation/cascade/discriminator/400s), utility tests (validation truth table, level map, heatmap bucketing, evaluator rule), component tests (catalog CRUD blocking, evaluation save, heatmap grouping, print section), pricing/preset tests; gates mandatory. |

**Post-design re-check (Phase 1)**: Re-verified — contract matches handler and
inventory 1:1; data model pins the spec's enums/cascade/discriminator verbatim; no
data flow leaves the tenant scope. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/005-competences-skills/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── skills-api.md    # Phase 1 output (aligned with 001's contract)
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

### Source Code (repository root)

```text
src/
├── types.ts                                # ModuleKey += 'competences'; Skill + SkillEvaluation
│                                           #   interfaces (exact enums, XOR evaluator)
├── api.ts                                  # saveSkills(doc) PUT helper
├── utils/skills.ts                         # NEW pure helpers: validateSkill, LEVEL_COLORS,
│                                           #   evaluator rule (roster vs free-text), heatmap bucketing
├── utils/skills.test.ts                    # NEW: truth tables for all of the above
├── utils/pricing.ts                        # ALL_MODULES += competences entry; growth/pro presets only
├── App.tsx                                 # TAB_MODULE + sidebar (Brain icon) + render branch + state
│                                           #   wiring + commitDomain save + live-sync key
├── components/
│   ├── CompetencesModule.tsx               # NEW: catalog manager, per-child evaluation view,
│   │                                       #   class heatmap, print-area report
│   └── CompetencesModule.test.tsx          # NEW: CRUD blocking, evaluation save, grouping, print section
├── components/Dashboard.tsx                # new card (isModuleAllowed filtered)
└── components/RenewalModule.tsx            # no change (renders shared catalog) — verify only

functions/api/
├── skills.ts                               # NEW: GET + PUT (catalog + evaluations document)
├── skills.test.ts                          # NEW: isolation, 401/405, cascade drop, foreign-student drop,
│                                           #   discriminator enforcement, 400s
├── _lib.ts                                 # readSkills/writeSkills (center_id everywhere; cascade rules)
└── _middleware.ts                          # ROUTES += "/api/skills": ["GET", "PUT"]

admin repository (coordination, not this repo):
└── migration: CREATE TABLE skills (...) + CREATE TABLE skill_evaluations (...)  # per data-model.md
```

**Structure Decision**: Mirrors 004's layout exactly (same handler pattern, same
utility/test placement, co-located component tests) so the two Growth/Pro modules
stay symmetric; converges with 001's skills design if 001 ships first (skip
duplicated foundational tasks).

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
