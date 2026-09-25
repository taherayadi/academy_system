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

---

# Revision B tasks — remarks alignment (`center-type-module-rules.md`)

**Input**: plan.md Revision B, research.md R7–R10, data-model.md revision-B matrix,
quickstart.md W5–W8. Original tasks T001–T016 above are complete and untouched;
these tasks continue the ID sequence and map to the existing user stories:
remark 1+3 tighten US1's crèche composition (with US2 regressions baked into each
test), remarks 4+5+6 serve US3's commercial coherence. Tests are mandatory here:
constitution Principle V requires every delta to land with its test.

## Phase R-B1: Foundational (blocks all revision-B stories)

**Purpose**: the single canonical compatibility definition consumed by renewal,
landing and the demo form (research R7).

- [x] T017 [P] Write failing tests first in `src/utils/centerType.test.ts`: per-type
      matrix cases from the data-model revision-B table (etude/coursParticuliers/
      revision/formations incompatible with creche and jardin; cantine/transport/
      events/staff/activites/competences compatible with all four types; base keys
      all-types), unknown/empty/undefined type → compatible (legacy passthrough),
      `incompatibleModules(selection, type)` returns incompatible keys in
      selection order, and a catalog-coverage assertion that every `ALL_MODULES`
      key has a `moduleCenterTypes` entry (data-model invariant 2 — fails on any
      future catalog module added without a compatibility entry)
- [x] T018 Extend `src/utils/centerType.ts` with `moduleCenterTypes`
      (module key → served center types, transcribed verbatim from the remarks
      matrix), `isModuleCompatible(moduleKey, centerType)` (unknown/empty type →
      true), `incompatibleModules(keys, centerType)` and the French/Arabic
      type-label map for badges and banner text, until T017 passes

**Checkpoint**: `npm run lint` + `npm test` green with the compatibility tests;
no surface consumes the helpers yet.

## Phase R-B2: User Story 1 — crèche composition tightenings (remarks 1+3)

**Goal**: registration hides the entire academic-history section for crèche/jardin
(remark 1); staff-lite locks the pointage sub-tab instead of dead-clicking
(remark 3).

**Independent Test**: on the C1 crèche config the add-child form shows no
«المسار الدراسي لآخر 3 سنوات» section and its print has no Academic History block;
on the étude-without-staff config the pointage sub-tab is visible but disabled.
Formation/legacy configs keep everything (US2 regression).

- [x] T019 [P] [US1] Write failing tests first in
      `src/components/StudentRegistrationModule.test.tsx`: crèche and jardin
      renders omit SECTION 5 «المسار الدراسي لآخر 3 سنوات» and the print-view
      Academic History block; formation render keeps both (US2 regression);
      crèche submit sends a student with no academicHistory values (mirrors the
      existing grade stripping)
- [x] T020 [US1] In `src/components/StudentRegistrationModule.tsx`, wrap the
      SECTION 5 form block and the print Academic History block in
      `showSchoolLevel`, and store `academicHistory` in `handleSubmit` only when
      `showSchoolLevel` (mirror the grade/établissement stripping), until T019
      passes
- [x] T021 [P] [US1] Write failing tests first in
      `src/components/StaffManagementModule.test.tsx`: staff-lite renders the
      pointage sub-tab button disabled with the lock glyph and clicking it does
      not open the pointage panel; full-staff mode opens it normally (US2
      regression); keep the existing LOCKED_MESSAGE + «الذهاب إلى التجديد»
      assertions intact
- [x] T022 [US1] In `src/components/StaffManagementModule.tsx`, render the
      pointage sub-tab `disabled` with locked styling when `staffLite` (panel
      stays gated by `activeSubTab === 'pointage' && !staffLite`), until T021
      passes

**Checkpoint**: US1 composed walkthrough (W5, W6 behaviors) holds for the two
tightened surfaces; formation/legacy configs unchanged.

## Phase R-B3: User Story 3 — commercial coherence (remarks 4+5+6)

**Goal**: renewal offers only type-compatible modules (remark 4), landing shows
«Disponible : …» badges (remark 5), the demo form live-warns informatively
(remark 6) — all from the single T018 definition.

**Independent Test**: crèche renewal lists no study addons; landing addon rows
carry per-type badges; selecting crèche + étude in the demo form shows the ℹ️
banner while submit stays enabled and the payload is unmodified.

- [x] T023 [P] [US3] Write failing tests first in
      `src/components/RenewalModule.test.tsx`: with `centerType="creche"` the
      simulator lists no etude/coursParticuliers/revision/formations addons but
      does list cantine/transport/events/staff/activites/competences; an
      already-enabled incompatible module still appears as enabled in the
      current-plan display (research R9 — never hide what is paid for);
      `centerType="formation"` and legacy/undefined type list every addon
- [x] T024 [US3] In `src/components/RenewalModule.tsx` accept a `centerType`
      prop and filter the addon grid through `isModuleCompatible`; in
      `src/App.tsx` pass `centerType={currentCenter?.centerType}` to
      `RenewalModule`, until T023 passes
- [x] T025 [P] [US3] Write failing tests first in
      `src/components/LandingPage.smoke.test.tsx`: every addon row renders a
      «Disponible : …» badge line derived from `moduleCenterTypes` (étude →
      Garderie, Formation; events → all four); base rows stay badge-free;
      selecting Crèche + Étude in the demo form shows the informational ℹ️
      banner «Ce module n'est pas disponible pour les centres Crèche / Jardin
      d'enfants…» live, the banner clears when the module is removed or the
      type flips to Garderie, submit remains enabled and the request payload is
      sent unmodified
- [x] T026 [US3] In `src/components/LandingPage.tsx`, render the addon-row
      badges from the T018 helpers and add the non-blocking
      `incompatibleModules` info banner to the demo form (matching the
      existing ℹ️/info styling, never the error styling), until T025 passes

**Checkpoint**: US3 coherence extends to type compatibility: one map, three
surfaces, no surface-local lists.

## Phase R-B4: Composed verification & closure

**Purpose**: fold the tightenings into the composed suites and close the gates.

- [x] T027 Extend `src/program.composed.test.tsx`: the C1 crèche walkthrough now
      asserts the pointage sub-tab is present-but-disabled (replacing the
      «tab label absent» assertion, T021/T022 fallout) and adds a composed
      crèche-renewal render asserting zero study modules are offered (T023/T024
      fallout); keep every other C1 assertion untouched
- [x] T028 Run the full gates at the combined state — `npm run lint`, `npm test`,
      `npm run build` — confirm the pre-existing suite is green unmodified
      (FR-006), record the revision-B results in the release-closure record
      below, and note that W5–W8 (quickstart.md) remain available as the manual
      browser pass

## Dependencies & execution order (revision B)

- T017 → T018 (test-first; blocks every story task)
- After the checkpoint: T019/T021 (US1 tests) and T023/T025 (US3 tests) are all
  independent files → parallel; each impl task follows only its own test
  (T020, T022, T024, T026)
- T027 depends on T020–T026; T028 depends on T027

## Parallel example (revision B)

```text
# After T018, launch the four failing-test tasks together:
T019 StudentRegistrationModule.test.tsx | T021 StaffManagementModule.test.tsx
T023 RenewalModule.test.tsx             | T025 LandingPage.smoke.test.tsx
# Then the four implementation tasks (each after its own test):
T020 | T022 | T024 | T026
```

## Implementation strategy (revision B)

MVP = Phases R-B1 + R-B2 (foundational helper + the two crèche tightenings):
the client-facing correctness remarks are closed with two files and their tests.
R-B3 delivers the commercial surfaces (renewal filter, badges, demo guidance);
R-B4 re-proves the whole composition and closes the gates.

---

# Revision B closure record (T017–T028)

## T028 — final gates at the combined state (all green)

- `npm run lint` (tsc --noEmit): clean.
- `npm test`: **449 passing** — browser project 28 files / 336 tests,
  node/worker project 13 files / 113 tests. Pre-existing suites unmodified;
  the only edited old assertions are 006's own C1/C3 composed checks and C7's
  pre-upgrade expectation, updated from the "pointage tab absent" behavior to
  the remark-3 "visible but disabled" affordance.
- `npm run build`: green (pre-existing chunk-size advisory only).

## What revision B shipped

1. **T018** — `src/utils/centerType.ts`: `moduleCenterTypes` (single canonical
   compatibility map, transcribed verbatim from the remarks matrix),
   `isModuleCompatible` / `incompatibleModules` (legacy passthrough for
   unknown/empty types), `CENTER_TYPE_LABELS`. T017's tests include the
   catalog-coverage invariant: a future catalog module without a compatibility
   entry fails the suite.
2. **T019/T020** — `StudentRegistrationModule`: the academic-history section
   (form) and the print block are gated by `showSchoolLevel` (remark 1);
   submissions store empty history only for **fresh** registrations — edits in
   crèche/jardin centers preserve the stored history verbatim (FR-010; a test
   regression during implementation exposed the first draft's violation and it
   was corrected in the same task). The print-preview close button gained a
   `title` (a11y) to stay addressable.
3. **T021/T022** — `StaffManagementModule`: the pointage sub-tab is
   visible-but-`disabled` with a lock glyph and locked styling in lite mode
   (remark 3: show value, don't hide it); the pane stays unreachable.
4. **T023/T024** — `RenewalModule`: addon grid and the availability counter
   filter through compatibility; tier presets (`chooseTier`) pass through the
   same filter so Pro cannot re-introduce study modules for a crèche; an
   incompatible-but-enabled module is displayed as «— reste actif» and never
   re-offered (research R9). App.tsx passes `centerType`.
5. **T025/T026** — `LandingPage`: every pricing addon row renders a single
   «Disponible : …» text-run badge (per-type chips were rejected: their labels
   collided with the demo form's type-radio buttons in the smoke tests); the
   demo form shows the live ℹ️ banner for incompatible selections —
   informative, non-blocking, payload unmodified (remark 6).
6. **T027** — composed suite: C1 staff asserts the disabled pointage tab; new
   composed crèche-renewal test proves zero study offers + R9 display; C3/C4
   updated likewise; dataSafety C7 updated to the locked-visible affordance
   (disable → mid-session purchase → enabled).

## Test count reconciliation

Pre-revision 428 → post-revision 449 (+21): centerType.test.ts +9,
StudentRegistration +4, StaffManagement net 0 (one removed for the disabled-tab
replacement, one added), RenewalModule +4, LandingPage +3, program.composed +1.

## Honest limitation (unchanged from T013–T016)

No human browser pass has been performed. W5–W8 (quickstart.md revision B) are
covered by their automated counterparts and remain available as a manual
pre-deploy pass (`npm run dev` + `npm run pages:dev`).

---

# Revision C tasks — remarks alignment (`remarques-modules-centre.md`)

**Input**: plan.md Revision C, research.md R11–R14, data-model.md revision-C
derivations, quickstart.md W9–W11. Original tasks T001–T016 and revision-B tasks
T017–T028 are complete and untouched; these tasks continue the ID sequence.

**Mapping to user stories**: remark 1 tightens US1's crèche composition; remarks
3+4+5 are the new modules' presentation (US1 surfaces, coherence-checked in US3);
remark 7 serves US3's commercial coherence. Remarks 2 and 6 are SATISFIED —
no tasks; their verifying suites already run in the gate.

**Conventions**: test-first (constitution V) — every impl task follows its own
failing-test task and lands green in the same change; the pre-existing suite is
IMMUTABLE (only revision-C-owned assertions may change); no schema change, no
new routes, no new dependencies.

## Phase R-C1: Foundational (blocks all revision-C stories) ✅

**Purpose**: the two single-definition changes every surface consumes — the
planner day start (remark 3) and the type-aware plan derivation (remark 7).

- [x] T029 [P] Write failing tests first in `src/utils/planner.test.ts`:
      re-pin `TIME_BANDS` — 24 half-hour bands covering 08:00–20:00 (first band
      08:00–08:30, last 19:30–20:00, no 06:00/06:30/07:00/07:30 bands);
      re-pin `bandIndexFor` — '08:00'→0, '08:29'→0, '19:30'→23, '19:59'→23,
      minute snap '10:00'/'10:15'/'10:29'→4 and '10:30'→5, sub-08:00 clamp
      ('06:00', '07:15', '00:00' → 0) and over-20:00 clamp ('20:00', '23:45' →
      23); keep the `validateActivity` and `groupActivities` truth tables
      UNTOUCHED (they must still pass unmodified — FR-006)
- [x] T030 In `src/utils/planner.ts`: set `DAY_START_MIN = 8 * 60` and the band
      count 28 → 24 (update the constant's comment: « bands from 08:00 to
      20:00 (24 bands) »), until T029 passes; verify
      `src/components/ActivitiesModule.test.tsx` placement tests still pass
      unchanged (their `[data-band="10:00"]` anchors remain valid band starts)
- [x] T031 [P] Write failing tests first in `src/utils/pricing.test.ts`:
      `applicableModuleKeys` per type (creche/jardin = exactly the 9 keys
      scolaire, studentTimeSheets, finance, cantine, transport, events, staff,
      activites, competences — never etude/coursParticuliers/revision/
      formations; garderie/formation = all 13; unknown/undefined/null = all 13
      — legacy passthrough); type-aware `derivePlanFromModules` truth table —
      creche selecting all 9 applicable → 'pro' (remark 7 regression), creche
      base+cantine → 'growth', creche base-only → 'starter', formation all 13 →
      'pro'; no-type calls frozen: [...BASE_KEYS] → 'starter', base+activites →
      'growth', ALL_MODULES keys → 'pro'; `modulesForPlan` — ('pro','creche') →
      the 9 applicable keys, ('growth','creche') → base + activites +
      competences, ('starter', any) → starter preset, unknown plan → starter
      preset, no type → today's presets verbatim. In
      `src/utils/centerType.test.ts` add one mutual-coherence invariant:
      for every CenterType, `applicableModuleKeys(t)` equals exactly the
      catalog keys `isModuleCompatible(key, t)` accepts (no drift in either
      direction)
- [x] T032 In `src/utils/pricing.ts`: export `applicableModuleKeys(centerType?:
      string | null): string[]` (ALL_MODULES keys filtered through
      `isModuleCompatible` imported from './centerType'); extend
      `derivePlanFromModules(selected, centerType?)` — Pro ⇔ every applicable
      key selected (no type → today's global comparison, byte-identical); extend
      `modulesForPlan(plan, centerType?)` — preset filtered through
      `isModuleCompatible` (no type → today's presets verbatim), until T031
      passes. Derivation is pure: it never mutates selections (FR-010)

**Checkpoint**: `npm run lint` + `npm test` green; no surface consumes the new
helpers yet; the no-type derivation verdicts are pinned frozen.

## Phase R-C2: User Story 1 — attendance register without levels (remark 1) ✅

**Goal**: the crèche/jardin register (« نظام تسجيل حضور التلاميذ ») hides the
« كل المستويات » grade filter; every other type keeps it (US2 regression).

**Independent Test**: on the C1 crèche config the register renders without the
filter (search + حاضر/غائب intact, pointage saves); formation/unknown types
render it.

- [x] T033 [P] [US1] Write failing tests first: create
      `src/components/StudentAttendanceModule.test.tsx` — crèche and jardin
      renders omit the « كل المستويات » grade select while the search input and
      the حاضر/غائب buttons remain; with the filter absent the rendered list is
      the unfiltered student list; formation and undefined/unknown-type renders
      show the filter and filtering by grade still works (US2 regression);
      create `src/components/StudentTimeSheetModule.test.tsx` (first suite for
      this component) — with `centerType="creche"` the register branch renders
      and inherits the filter-less behavior, with `centerType="formation"` the
      time-sheets view renders as before (regression)
- [x] T034 [US1] In `src/components/StudentAttendanceModule.tsx` accept
      `centerType?: string` and render the grade `<select>` (and only it)
      behind `hasSchoolLevel(centerType)` (import from '../utils/centerType');
      in `src/components/StudentTimeSheetModule.tsx` forward
      `centerType={centerType}` to the register branch; `App.tsx` already
      passes `centerType` to `StudentTimeSheetModule` — verify only, until T033
      passes. The filter defaults to «all», so hiding it touches no stored
      attendance row (FR-010)

**Checkpoint**: W9 behavior holds; formation/legacy configs unchanged.

## Phase R-C3: Module presentation — planner day + banners (remarks 3+4+5) ✅

**Goal**: the week grid starts at 08:00 (remark 3, rendered) and both module
banners show the icon before the title text, outside the green badge (remarks
4+5).

**Independent Test**: the C1 planner renders first band 08:00 and no 06:00–07:30
rows; both banners render an icon inside the `text-2xl` title row preceding the
title text and no icon inside the green badge span.

- [x] T035 [P] [US1] Write failing tests first in
      `src/components/ActivitiesModule.test.tsx`: the week grid renders a
      `[data-band="08:00"]` cell and no `[data-band="06:00"]`/`"06:30"`/
      `"07:00"`/`"07:30"` cells; an activity stored at 06:45 renders in the
      08:00 band (clamp, no data loss); the banner's `text-2xl` title element
      contains an svg icon before the title text (DOM order) and the green
      badge span (`bg-brand-600/[0.06]`) contains no svg
- [x] T036 [P] [US1] Write failing tests first in
      `src/components/CompetencesModule.test.tsx`: the banner's `text-2xl`
      title element contains an svg icon before the «المهارات والكفايات» title
      text and the green badge span contains no svg (remark 5)
- [x] T037 [US1] In `src/components/ActivitiesModule.tsx`: render the Puzzle
      icon (add to the lucide-react import) inside the `text-2xl` title as a
      flex row with gap-2 preceding the text — mirroring the existing
      `StudentTimeSheetModule` header pattern (research R14); verify the week
      grid derives every row from `TIME_BANDS` with no local hour list, until
      T035 passes
- [x] T038 [US1] In `src/components/CompetencesModule.tsx`: render the Brain
      icon (add to the lucide-react import) in the same title-row pattern,
      until T036 passes

**Checkpoint**: W10 behavior holds; stored times untouched (banding is
render-time, FR-010); RTL «before» placement comes free from the existing
pattern.

## Phase R-C4: User Story 3 — Pro is reachable for every type (remark 7) ✅

**Goal**: the renewal simulator derives the tier from the type-applicable set:
selecting all offered modules for a crèche yields **Pro**.

**Independent Test**: on the crèche center, tick every offered addon → the
submitted request carries `requestedPlan: "pro"`; the Pro tier button loads
exactly the applicable set; formation/legacy behavior unchanged.

- [x] T039 [P] [US3] Write failing tests first in
      `src/components/RenewalModule.test.tsx`: use a LOCAL extended price
      fixture (add `activites: 45`, `competences: 45`) inside the new cases so
      the shared `PRICES` fixture and every existing assertion (e.g. «330 TND»)
      stay untouched; with `centerType="creche"` — tick all six offered addon
      checkboxes and submit: `createRenewalRequestApi` receives
      `requestedPlan: 'pro'` and `requestedModules` exactly the ticked keys
      (remark 7 end-to-end); pressing the Pro tier button selects exactly the
      9 applicable keys; with `centerType="formation"` — ticking everything
      still derives Pro with the full catalog (regression); a crèche center
      with base only still derives Basic
- [x] T040 [US3] In `src/components/RenewalModule.tsx`: derive the tier via
      `derivePlanFromModules(selected, centerType)` and preset loading via
      `modulesForPlan(key, centerType)` in `chooseTier`, until T039 passes;
      `App.tsx` already passes `centerType` — verify only
- [x] T041 [P] [US3] Extend `src/pricing.coherence.test.ts`: pin the frozen
      no-type derivation verdicts explicitly as the FR-006 baseline (the
      representative combinations from T009/T031); add the type-aware preset
      invariant — for creche, deriving from each filtered preset returns that
      preset's own tier (starter→starter, growth→growth, pro→pro) and
      `modulesForPlan('pro','creche')` ⊆ `ALL_MODULES` keys with every key
      `isModuleCompatible`-compatible

**Checkpoint**: US3 coherence extends to derivation: one applicable-set
definition, consumed by the simulator, presets and the coherence suite.

## Phase R-C5: Composed verification & closure ✅

**Purpose**: fold the revision-C deltas into the composed suites and close the
gates.

- [x] T042 Extend `src/program.composed.test.tsx`: the C1 crèche walkthrough
      additionally renders «تسجيل حضور التلاميذ» and asserts the grade filter
      is absent (T033/T034 fallout); extend the composed crèche-renewal render:
      ticking every offered addon and submitting derives `requestedPlan: 'pro'`
      (T039/T040 fallout); keep every other C1/C5 assertion untouched
- [x] T043 Run the full gates at the combined state — `npm run lint`,
      `npm test`, `npm run build` — confirm the pre-existing suite is green
      unmodified (FR-006), record the revision-C results in the closure record
      below, and note that W9–W11 (quickstart.md revision C) remain available
      as the manual browser pass

## Dependencies & execution order (revision C)

- T029 → T030 (test-first) and T031 → T032 (test-first): the four foundational
  tasks block every story task; T029∥T031 are independent files
- After the checkpoint: T033 (US1 tests), T035/T036 (presentation tests) and
  T039/T041 (US3 tests) are all independent files → parallel; each impl task
  follows only its own test (T034, T037, T038, T040)
- T042 depends on T030, T034, T037/T038 (indirectly), T040; T043 depends on T042

## Parallel example (revision C)

```text
# Foundational (two independent files):
T029 planner.test.ts | T031 pricing.test.ts + centerType.test.ts
# Then their impls:
T030 planner.ts      | T032 pricing.ts

# After the checkpoint, launch the failing-test tasks together:
T033 StudentAttendance/TimeSheet tests | T035 ActivitiesModule.test.tsx
T036 CompetencesModule.test.tsx        | T039 RenewalModule.test.tsx | T041 coherence
# Then the four implementation tasks (each after its own test):
T034 | T037 | T038 | T040
```

## Implementation strategy (revision C)

MVP = Phases R-C1 + R-C2: the derivation fix (remark 7, the client-facing
correctness bug) plus the register filter (remark 1) close the two behavioral
gaps with three files and their tests. R-C3 delivers the presentation remarks
(3+4+5); R-C4 wires the derivation into the simulator and pins the coherence
invariants; R-C5 re-proves the whole composition and closes the gates.

Explicitly out of scope (per plan.md Revision C): pricing/value changes, new
modules or routes, backend changes, any change to the four study modules'
visibility, removing or hiding already-paid modules, and any schema change
(remarks 2 and 6 are satisfied and re-verified only).

---

# Revision C closure record (T029–T043)

## T043 — final gates at the combined state (all green)

- `npm run lint` (tsc --noEmit): clean.
- `npm test`: **484 passing** — browser project 30 files / 371 tests,
  node/worker project 13 files / 113 tests. Pre-existing suites unmodified;
  the only edited old assertions are revision-C-owned re-pins of 004's
  `planner.test.ts` band expectations (28→24 bands, 06:00→08:00 origin).
- `npm run build`: green (pre-existing chunk-size advisory only).

## What revision C shipped

1. **T029/T030** — `src/utils/planner.ts`: `DAY_START_MIN = 8*60`, band count
   28→24 (08:00–20:00, remark 3). Stored `timeStart`/`timeEnd` untouched —
   banding is render-time; pre-08:00 activities clamp to band 0 (FR-010),
   asserted by a new component test.
2. **T031/T032** — `src/utils/pricing.ts`: `applicableModuleKeys(centerType?)`,
   `derivePlanFromModules(selected, centerType?)` (Pro ⇔ every applicable key
   selected; no type → frozen global comparison) and
   `modulesForPlan(plan, centerType?)` (presets filtered through the canonical
   `isModuleCompatible`). Mutual-coherence invariant added in
   `centerType.test.ts` (applicable set ≡ compatibility predicate for every
   type).
3. **T033/T034** — `StudentAttendanceModule` gains `centerType?` and hides the
   « كل المستويات » grade filter for crèche/jardin via `hasSchoolLevel`
   (remark 1); `StudentTimeSheetModule` forwards the prop; search + status
   buttons unaffected; attendance rows untouched (FR-010). New suites for both
   components.
4. **T035–T038** — `ActivitiesModule` + `CompetencesModule` banners render the
   module icon inside the `text-2xl` title row, before the title text, outside
   the green badge (remarks 4+5, existing repo header pattern); the week grid
   asserts 08:00 start, no 06:00–07:30 bands, and clamped rendering of
   pre-08:00 activities.
5. **T039–T041** — `RenewalModule` derives the tier from
   `(selected, centerType)` and loads presets via `modulesForPlan(key,
   centerType)`; a crèche ticking all six offered addons submits
   `requestedPlan: 'pro'` (remark 7 end-to-end); formation/legacy Pro behavior
   unchanged; the coherence suite pins the frozen no-type verdicts and the
   preset-derives-its-own-tier invariant per type.
6. **T042** — composed suite: the C1 crèche walkthrough adds the filter-less
   attendance register; a new composed test ticks every offered addon on the
   crèche renewal and asserts `requestedPlan: 'pro'` through the real submit
   path (`createRenewalRequestApi` mock added to the suite's api factory).

## Test count reconciliation

Pre-revision 449 → post-revision 484 (+35): planner.test.ts re-pinned (same
count), pricing.test.ts +12, centerType.test.ts +1, StudentAttendanceModule
+6 (new file), StudentTimeSheetModule +4 (new file), ActivitiesModule +3,
CompetencesModule +1, RenewalModule +4, pricing.coherence +3, program.composed
+1.

## Honest limitation (unchanged from T013–T016)

No human browser pass has been performed. W9–W11 (quickstart.md revision C) are
covered by their automated counterparts and remain available as a manual
pre-deploy pass (`npm run dev` + `npm run pages:dev`).
