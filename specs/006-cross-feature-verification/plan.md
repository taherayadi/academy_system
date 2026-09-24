# Implementation Plan: Cross-Feature Verification & Release Readiness

**Branch**: `006-cross-feature-verification` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-cross-feature-verification/spec.md`

## Summary

Verification feature over the combined program (features 001–005): composed
configuration tests (crèche full pass, legacy pass, garderie/formation pass), the
immutable pre-existing regression suite, commercial catalog coherence checks
(landing ≡ renewal, presets, derivation, no phantom keys), data-safety round-trip
tests (type flip, staff purchase, module disable/re-enable, cascade precision under
concurrency), and release-gate closure (all gates green at the combined state,
per-feature quickstarts re-run on composed configurations, admin-repo migration
scheduling confirmed, canonical shared files asserted single-definition).

Technical approach: a small number of **composed test files** that render the app
shell / invoke handlers with combined configurations, plus a **program matrix
document** (data-model.md) enumerating every configuration × surface cell the
composed tests cover, plus verification tooling already provided by the gates. The
only production-code changes allowed are integration fixes forced by these tests,
each landing in the owning feature's files together with its test.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22.13+; React 18 SPA; vitest +
Testing Library; `node:sqlite` integration harness (existing)

**Primary Dependencies**: the five features' code and suites; existing test
conventions (`*.test.ts(x)` co-located); no new dependencies

**Storage**: none new — verification operates over existing domains; the admin-repo
migrations for the three program tables are a coordination check, not code here

**Testing**: this feature *is* testing: composed suites + gate runs; gates =
`npm run lint` + `npm test` + `npm run build` at the combined state

**Target Platform**: same as the program (desktop + mobile browsers; CI/local Node)

**Project Type**: Web application (verification increment)

**Performance Goals**: composed suites run within the existing test budget (no
per-cell server spawns; reuse harnesses)

**Constraints**: pre-existing tests are immutable (failures are program bugs);
production-code changes only as integration fixes with their tests; no new
user-facing behavior

**Scale/Scope**: ~3–4 new composed test files + 1 program matrix doc; touches
production code only if a composed test exposes a cross-feature bug

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-evaluated after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Deployment Split | ✅ PASS | Verification only; the admin-repo migration check strengthens the split's coordination rule (no migrations created here). |
| II. Tenant Isolation | ✅ PASS | Composed tests re-assert isolation across features (isolation tests from 001/004/005 remain in the suite; nothing bypasses session-derived context). |
| III. Security by Default | ✅ PASS | No endpoints/uploads/secrets; composed suites include the security-relevant suites' continued greenness (route inventory, isolation) as part of the gate. |
| IV. Exact Contract Surface | ✅ PASS | No route changes; the coherence check includes asserting the inventory covers exactly the program's routes (catalog-keys ↔ modules ↔ routes agreement). |
| V. Test-First Verification | ✅ PASS | The feature is the embodiment of this principle: composed failing-capable tests, immutable legacy baseline, gates at the combined state. |

**Post-design re-check (Phase 1)**: Re-verified — the matrix (data-model.md) maps
every FR to a composed test cell; no production behavior is designed here, so no
new constitution exposure exists. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-cross-feature-verification/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (the composed-configuration matrix)
├── quickstart.md        # Phase 1 output (composed manual walkthroughs)
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

**Contracts/**: intentionally omitted — no external interfaces; the catalog ↔
module ↔ route agreement is asserted inside the composed tests.

### Source Code (repository root)

```text
src/testing/                               # NEW: composed-test helpers (config factories)
└── programConfig.ts                       # factory: makeCenter({ type, modules, role }) → composed props

src/testing/programConfig.test.ts          # NEW: factory sanity (defaults = legacy passthrough)

src/program.composed.test.tsx              # NEW: US1+US2 composed suites (crèche pass, legacy pass,
                                           #   garderie/formation pass; nav+modules+staff-lite in one render)
src/pricing.coherence.test.ts              # NEW: US3 catalog coherence (landing≡renewal source identity,
                                           #   presets, derivation, catalog-key ↔ module existence)
src/dataSafety.roundtrip.test.tsx          # NEW: US4 round-trips (type flip grade reveal, staff purchase
                                           #   payroll reveal, module disable/re-enable, cascade precision)

(production code: touched ONLY if a composed test exposes an integration bug —
 fix lands in the owning feature's file together with the failing test)
```

**Structure Decision**: Composed suites live at `src/` top level (they span
components), with a tiny `src/testing/` helper module for configuration factories —
mirroring the existing test-adjacency convention without nesting inside any single
feature's files.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
