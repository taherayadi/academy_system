---
description: "Task list for the 006-cross-feature-verification feature"
---

# Tasks: Cross-Feature Verification & Release Readiness

**Input**: Design documents from `/specs/006-cross-feature-verification/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
quickstart.md ✅ (contracts/ intentionally omitted — no external interfaces)

**Hard prerequisite**: features 001–005 implemented (their chains are complete).
This feature verifies their combination; production fixes land in owning files
with their failing composed test (research R6).

**Tests**: This feature *is* tests: composed suites per the data-model matrix
(C1–C10), the immutable pre-existing baseline, and gate runs at the combined
state.

**Organization**: By user story — US1 crèche composed pass, US2 legacy safety,
US3 commercial coherence, US4 data round-trips.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependencies)
- **[Story]**: owning user story (US1–US4)
- Exact file paths in every task

## Path Conventions

Verification increment: composed suites at `src/` top level; helper module under
`src/testing/`; production edits only as integration fixes in owning files.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The composed-configuration factory everything consumes.

- [x] T001 Create `src/testing/programConfig.ts` exporting `makeCenter(overrides)` — a factory building composed center configurations (`type` including undefined/unknown, `enabledModules` list including legacy empty, `role`) with defaults equal to the legacy passthrough (type undefined, modules [], role 'admin'), returning the exact prop/config shapes the app shell and module renders consume
- [x] T002 Create `src/testing/programConfig.test.ts` pinning the factory: defaults are the legacy passthrough values; each override (type, modules, role) is applied; the shape matches what App renders consume (compile-time + render-sanity assertion)

**Checkpoint**: Factory exists and pinned; no composed suites yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Prove the combined program even compiles and passes its own baseline
before composed suites hunt interference.

- [x] T003 Run the full gate suite at the combined state: `npm run lint` (typecheck over all five features' code), `npm test` (pre-existing suite UNMODIFIED + all per-feature suites), `npm run build` — record failures; every failure is a program bug to fix in the owning feature's file with its test (research R6 protocol), NOT a baseline edit
- [x] T004 Verify canonical-definition convergence (FR-015): exactly one `src/utils/centerType.ts` definition exists (features 002/001 converge), exactly one shared catalog in `src/utils/pricing.ts` feeds landing + renewal, and no feature duplicated domain helpers (activities/skills domains exist once if 004/005 both shipped) — resolve by deleting duplicates in favor of the canonical file

**Checkpoint**: Combined state compiles, baseline green, single definitions asserted.

---

## Phase 3: User Story 1 — Crèche composed pass (Priority: P1) 🎯 MVP

**Goal**: The most restrictive configuration behaves per all five features
simultaneously (matrix C1, plus C5 for layered restrictions).

**Independent Test**: One composed render pass over C1 asserting every feature's
surface expectations at once; C5 layers restricted_admin on top.

### Tests for User Story 1 ⚠️

- [x] T005 [P] [US1] Create `src/program.composed.test.tsx`: render the app shell with C1 (crèche + étude-only + activites + competences, via makeCenter) and assert in ONE pass — registration without school fields saves; Suivi rows lack notes/timesheet actions with payment buttons present; sidebar/dashboard lack the four study labels; deep-linking a study tab id lands on dashboard; staff module renders lite (CRUD controls present, pointage tab absent, locked cards present, upgrade button present); activites + competences tabs render and function; then render C5 (restricted_admin on étude-only + a new module) and assert the three restriction layers compose (role limits ∩ lite locks ∩ type hiding, no error state)

### Implementation for User Story 1

- [x] T006 [US1] Fix any cross-feature interference the composed pass exposes: production edits go in the owning feature's file (e.g., a guard effect order issue in `src/App.tsx`, a prop collision in a module component) with the failing composed assertion from T005 going green in the same change

**Checkpoint**: C1+C5 green in one suite — the program's core composition proven.

---

## Phase 4: User Story 2 — Legacy regression safety (Priority: P1)

**Goal**: Unknown-type/legacy-list and garderie/formation configurations are
byte-equivalent to pre-program behavior (matrix C2/C3/C4).

**Independent Test**: Composed renders of C2/C3/C4 assert full visibility of every
pre-program surface; the unmodified pre-existing suite passes.

### Tests for User Story 2 ⚠️

- [x] T007 [P] [US2] Extend `src/program.composed.test.tsx`: render C2 (unknown type + legacy empty module list) — registration shows grade + établissement required, Suivi shows notes/timesheet actions, sidebar shows study modules per legacy entitlements, staff renders FULL mode; render C3/C4 (formation/garderie pre-program lists) — same full-visibility assertions; assert the composed render output for these configs matches the pre-program behavior baselines (per 002's legacy-passthrough rule)

### Implementation for User Story 2

- [x] T008 [US2] Fix any legacy-visibility regression the composed pass exposes (e.g., an unknown-type branch hiding content) in the owning feature's file with T007's failing assertion going green in the same change; confirm `npm test` still passes the pre-existing suite unmodified

**Checkpoint**: Legacy guarantee proven; the safety net holds.

---

## Phase 5: User Story 3 — Commercial coherence (Priority: P2)

**Goal**: One coherent catalog story across surfaces, presets, derivation, and
module reality (matrix C10).

**Independent Test**: Coherence suite asserts source identity, preset/derivation
rules, and no phantom catalog keys.

### Tests for User Story 3 ⚠️

- [x] T009 [P] [US3] Create `src/pricing.coherence.test.ts`: assert the landing simulator and RenewalModule render from the same catalog source (import identity + both render the full entry set identically — every key in ALL_MODULES appears on both surfaces with matching label/description); assert presets per tier (starter excludes BOTH new module keys, growth and pro include both); assert derivePlanFromModules for representative selections (base-only → starter, base+activites → growth, base+competences → growth, all → pro); assert every catalog key maps to a real enableable module (key exists in the ModuleKey union / tab map — no phantom entries)

### Implementation for User Story 3

- [x] T010 [US3] Fix any incoherence the suite exposes (e.g., a hard-coded list bypassing the shared catalog, a preset missing a key, a phantom catalog entry) in the owning file (`src/utils/pricing.ts`, `src/components/RenewalModule.tsx`) with T009's failing assertion going green in the same change

**Checkpoint**: Commercial story proven coherent at catalog level.

---

## Phase 6: User Story 4 — Data safety round-trips (Priority: P2)

**Goal**: Every gating rule reversible; cascade precise under a stale second
writer (matrix C6–C9).

**Independent Test**: Round-trip suite flips configurations through renders and
drives the domain write path with a stale-writer sequence.

### Tests for User Story 4 ⚠️

- [x] T011 [P] [US4] Create `src/dataSafety.roundtrip.test.tsx`: C6 — render crèche with stored grades (no grade text), flip type to formation (grades reappear VERBATIM), flip back (hidden again, values intact); C7 — render étude-only with payroll history (locked, no payroll surfaces), toggle staff enabled (full module reveals records unchanged); C8 — render activites + competences data, disable each module (nav trace gone), re-enable (data intact); C9 — through the skills domain write path (`functions/api/_lib.ts` writeSkills), sequence session-A save (catalog without skill S, evaluations without S) then stale session-B save (stale catalog WITH S + an evaluation on S + unrelated evaluations) and assert the stored document: B's write wins as a whole, cascade drops the S evaluation, unrelated evaluations persist, no orphans

### Implementation for User Story 4

- [x] T012 [US4] Fix any round-trip failure the suite exposes (e.g., a hide path mutating state, cascade eating unrelated rows, dedupe keeping first instead of last) in the owning feature's file with T011's failing assertion going green in the same change

**Checkpoint**: Trust guarantees proven reversible and precise.

---

## Phase 7: Polish & Cross-Cutting Concerns (Release Closure)

**Purpose**: Composed manual walkthroughs, coordination closure, final gates.

- [x] T013 [P] Re-run each feature's quickstart scenarios on the COMPOSED configurations (not isolated setups): 002's S1–S5, 003's S1–S6, 004's S1–S6, 005's S1–S6 against C1/C2/C3 where applicable (FR-014) — record results
- [x] T014 Run the manual walkthroughs W1–W4 from quickstart.md end to end (crèche full pass, legacy pass, commercial coherence, round-trips) and confirm zero cross-feature interference
- [x] T015 Close coordination items (FR-015): confirm the admin repository has migrations scheduled for `activities`, `skills`, `skill_evaluations` (DDL per 001's data-model.md); confirm canonical files exist as single definitions (T004's assertion stands)
- [x] T016 Final release gates at the combined state: `npm run lint`, `npm test` (pre-existing unmodified + all feature suites + all composed suites), `npm run build` — ALL green; declare the program release-ready

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — start immediately
- **Phase 2 (Foundational)**: needs features 001–005 implemented; BLOCKS all composed suites (baseline must be green first)
- **Phase 3 (US1)**: needs Phase 2 — the MVP increment (core composition)
- **Phase 4 (US2)**: needs Phase 2; independent of US1 (extends the same file — sequence after T005/T006)
- **Phase 5 (US3)**: needs Phase 2; fully independent of US1/US2/US4 (different file)
- **Phase 6 (US4)**: needs Phase 2; independent of US1–US3 (different file; C9 needs the skills domain implemented)
- **Phase 7**: after all stories — release closure

### User Story Dependencies

- **US1 (P1)**: independent — the core composition pass
- **US2 (P1)**: independent; shares `src/program.composed.test.tsx` with US1 — coordinate edits
- **US3 (P2)**: fully independent (pricing coherence)
- **US4 (P2)**: fully independent (round-trips + write-path concurrency)

### Parallel Opportunities

- T001→T002 sequential (same helper); after that:
- US1 ∥ US3 ∥ US4 entirely (three different test files) once Phase 2 is green
- US2 extends US1's file — sequence after it
- T013 ∥ T014 ∥ T015 in polish; T016 strictly last

---

## Parallel Example: the three independent suites

```bash
# After Phase 2 (baseline green), launch in parallel:
Task: "T005 program.composed.test.tsx C1+C5 (US1)"
Task: "T009 pricing.coherence.test.ts (US3)"
Task: "T011 dataSafety.roundtrip.test.tsx C6–C9 (US4)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phases 1 → 2 → 3 (T001–T006)
2. **STOP & VALIDATE**: C1+C5 green + baseline green
3. The program's riskiest composition (crèche × everything) is proven

### Incremental Delivery

- +US2 (legacy safety) → the release-blocking guarantee is proven
- +US3 +US4 (parallel) → commercial + trust guarantees proven
- +Phase 7 → release-ready declaration

### Notes

- The pre-existing suite is IMMUTABLE (FR-006): any failure there is a program bug
- Production fixes follow R6 strictly: owning file + failing test green in one change
- C9 is the only write-path test — it needs the skills domain from 005 implemented
- This feature completes when T016's gates are green: the program is release-ready

---

## Release closure record (T013–T016)

### T016 — final gates at the combined state (all green)

- `npx tsc --noEmit` ✅
- `npm test` ✅ **428 tests / 41 files** (315 browser + 113 worker), pre-existing suite unmodified
- `npm run build` ✅

### T013 / T014 — composed coverage of the quickstarts and walkthroughs

The quickstarts (002 S1–S5, 003 S1–S6, 004 S1–S6, 005 S1–S6) and W1–W4 run in the
gate as their automated counterparts at the **composed** configurations, not as
isolated setups:

| Walkthrough | Composed coverage |
|---|---|
| W1 crèche full pass (C1) | `src/program.composed.test.tsx` US1 pass — type hiding ∩ lite locks ∩ both new modules in one render |
| W2 legacy pass (C2/C3/C4) | same suite, US2 rows + the C2 full-staff and C3/C4 lite rows |
| W3 commercial coherence (C10) | `src/pricing.coherence.test.ts` — shared source, presets, derivation, phantom keys |
| W4 data-safety round-trips (C6–C9) | `src/dataSafety.roundtrip.test.tsx` — type flip, staff reveal, module toggle, write-path cascade |

**Honest limitation**: no human-in-the-loop browser pass was performed in this
environment. W1–W4 are recorded through their automated counterparts plus the
per-feature suites running unmodified in the same gate; a literal manual pass
(`npm run dev` + `npm run pages:dev`) remains available before deploy.

### R6 integration fixes this verification found

1. **`src/components/Dashboard.tsx`** — the staff quick-module card and the "Total
   Staff" tile ignored the `restricted_admin` role layer that the sidebar and the
   tab guard already applied (003's fix had not reached the dashboard). `module8`
   joined `RESTRICTED_TABS` and the summary tile gained the role check; the C5
   composed assertion went green in the same change.
2. **`src/App.tsx`** — `StudentRegistrationModule` (module1) and
   `SuiviScolaireModule` (module2) were rendered **without `centerType`**, so 002's
   type gating (grade/établissement fields, Suivi notes/timesheet actions, prints)
   never engaged in the real app shell. Both now receive
   `centerType={currentCenter?.centerType}`; the C1 registration and Suivi
   assertions went green in the same change.
3. **`src/App.tsx`** — `TAB_MODULE` is now exported so the C10 phantom-key
   cross-check can prove every catalog entry maps to a real enableable tab.

### T015 — coordination items

- Admin-repo migrations for `activities`, `skills` and `skill_evaluations` remain the
  single external item (already recorded in 004/005 T025); they block production
  deploy only — handler tests run against the local D1 mock.
- Canonical definitions verified single (T004): one `src/utils/centerType.ts`, one
  `src/utils/pricing.ts` feeding both landing and renewal, one activities and one
  skills domain under `functions/api/`, one planner and one skills pure-helper module.
