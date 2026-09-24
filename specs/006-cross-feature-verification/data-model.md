# Phase 1 Data Model: Cross-Feature Verification

**Feature**: `006-cross-feature-verification` | **Date**: 2026-09-23

No new entities. The deliverable data artifact is the **composed-configuration
matrix**: every configuration the composed suites must cover, crossed with the
surface assertions each requires. This matrix is the contract between the spec's
FRs and the composed test files.

## Configuration dimensions

| Dimension | Values used in verification |
|---|---|
| Center type | `creche`, `jardin`, `garderie`, `formation`, *(unknown/empty)* |
| Entitlements | staff ⊕ étude ⊕ activites ⊕ competences combinations; legacy empty list |
| Role | admin, restricted_admin |
| Data state | children with stored grades; staff with payroll history; activities/skills/evaluations present |

## Composed configurations (the matrix rows)

| # | Configuration | Serves |
|---|---|---|
| C1 | crèche + étude (no staff) + activites + competences, admin | US1 (the intersection pass) |
| C2 | unknown type + legacy empty module list, admin | US2 (legacy passthrough) |
| C3 | formation + pre-program module list, admin | US2 (garderie/formation unchanged) |
| C4 | garderie + pre-program module list, admin | US2 |
| C5 | any type + restricted_admin + étude-only + a new module | Edge: three restriction layers |
| C6 | crèche with stored grades; flip type → formation → back | US4 round-trip 1 |
| C7 | étude-only with payroll history; add staff | US4 round-trip 2 |
| C8 | activites + competences data; disable/re-enable each | US4 round-trip 3 |
| C9 | two-session skill saves (remove vs stale evaluate) | US4 cascade concurrency |
| C10 | catalog rendered on both surfaces; each preset applied | US3 coherence |

## Matrix: configuration × assertions

| Assertion (surface → expected) | C1 | C2 | C3/C4 | C5 | C6–C9 | C10 |
|---|---|---|---|---|---|---|
| Registration: no school fields / full fields per type (002) | ✅ hidden | ✅ full | ✅ full | n/a | ✅ flip | — |
| Suivi: no notes/timesheet actions; payments intact (002) | ✅ hidden | ✅ full | ✅ full | ✅ | — | — |
| Study modules absent everywhere; deep-link → dashboard (002) | ✅ | ✅ present | ✅ present | ✅ | — | — |
| Staff: lite locks / full / hidden per entitlements (003) | ✅ lite | ✅ full | ✅ full | ✅ lite+role | ✅ reveal | — |
| Planner + skills modules functional per entitlement (004/005) | ✅ on | ✅ n/a | ✅ per list | ✅ | ✅ retain | — |
| Mid-session sync updates modes without stale UI | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Pre-existing suite passes unmodified | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Landing ≡ renewal; presets; derivation; no phantom keys | — | — | — | — | — | ✅ |
| Round-trip verbatim restoration | — | — | — | — | ✅ | — |
| Cascade precision under stale-writer sequence | — | — | — | — | ✅ (C9) | — |

Legend: ✅ = asserted in the composed suite for that configuration; n/a = feature
not applicable to that configuration; — = not exercised by that row.

## Invariants asserted across ALL rows

1. **Intersection of visibility** (FR-003): no surface renders unless every
   restriction layer permits it — never a union, never an override.
2. **No data destruction by gating** (FR-010): hiding/locking never mutates stored
   values; restoration is verbatim.
3. **Single canonical definitions** (FR-015): exactly one type-utility definition,
   one catalog source — asserted by import identity in the composed suites.
4. **Legacy baseline immutability** (FR-006): the pre-existing suite runs
   unmodified as part of every gate run.

## State transitions

None new. Verification drives existing transitions (type flips, entitlement
changes, module toggles, domain writes) and asserts their composed outcomes.
