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

---

# Revision B data model — module × center-type compatibility

No new persisted entities and no schema change. One new derived artifact:

## `moduleCenterTypes` (constant map)

| Module key | Label | Crèche | Jardin | Garderie | Formation |
|---|---|---|---|---|---|
| `etude` | Étude Surveillée | ❌ | ❌ | ✅ | ✅ |
| `coursParticuliers` | Cours Particuliers | ❌ | ❌ | ✅ | ✅ |
| `revision` | Révision Examens | ❌ | ❌ | ✅ | ✅ |
| `formations` | Formations | ❌ | ❌ | ✅ | ✅ |
| `cantine` | Cantine & Repas | ✅ | ✅ | ✅ | ✅ |
| `transport` | Transport Scolaire | ✅ | ✅ | ✅ | ✅ |
| `events` | Événements & Sorties | ✅ | ✅ | ✅ | ✅ |
| `staff` | Personnel & Salaires | ✅ | ✅ | ✅ | ✅ |
| `activites` | Activités & Planning | ✅ | ✅ | ✅ | ✅ |
| `competences` | Compétences & Skills | ✅ | ✅ | ✅ | ✅ |
| base (`scolaire`, `studentTimeSheets`, `finance`) | — | ✅ | ✅ | ✅ | ✅ |

Source: the remarks file's quick-reference matrix, transcribed verbatim. Base
modules are all-types by construction (they are the product's floor) and are not
re-offered as addons anywhere, so the map only needs addon keys — listing base
keys in the map is harmless but unnecessary.

**Derived rule**: the map must cover every `ALL_MODULES` key — a key missing from
the map is treated as garderie/formation-only **or** asserted as a coherence
test failure. Decision: the coherence test asserts full coverage (fails on a new
catalog module added without a compatibility entry), so the matrix can never
silently drift from the catalog.

**Consumers and their views of the same map**

1. `RenewalModule` — offers `ADDON_MODULES ∩ compatible(centerType)`; displays
   current `enabledModules` entries even when incompatible (R9).
2. `LandingPage` — renders «Disponible : …» badges per addon card from the map;
   demo form computes `incompatibleModules(selected, type)` for the live banner
   (R10, non-blocking).
3. `program.composed` — crèche renewal render must offer zero study modules.

## Invariants added (revision B)

1. **One compatibility definition** (extends FR-015): only `centerType.ts`
   expresses module↔type compatibility; no surface hardcodes its own list.
2. **Coverage coherence** (extends FR-009): every catalog key has a
   compatibility entry — no phantom gaps in either direction.
3. **Offering ≠ displaying** (R9): filtering the offer list never removes an
   enabled module from the current-plan display.
4. **Hiding is rendering-level** (extends FR-010): the section-5 gate strips
   *submitted* academic history for new entries (age-appropriate form), but
   pre-existing stored values are only ever hidden/revealed, never deleted.
