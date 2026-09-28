---
description: "Task list for the 007-finance-gouter-monthly-drilldown feature"
---

# Tasks: Finance ▸ Gestion des repas — Onglet Goûter dédié

**Input**: Design documents from `/specs/007-finance-gouter-monthly-drilldown/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
quickstart.md ✅ (contracts/ intentionally omitted — no external interfaces)

**Baseline**: 006 revision E shipped (commit `1c792bc`); the Finance restaurant
section already has the two service tabs, the mirrored Goûter cards, the
`GouterConsumptionTable` detail and a static `GouterMonthlyTable`. This feature
refines that state; tasks renumber from T001 (new feature directory).

**Tests mandatory**: constitution V — every implementation task follows its
failing-test task and lands green in the same change.

**Organization**: by user story — US1 tab de-mixing (P1), US2 monthly drilldown
(P1), US3 source-level Repas isolation (P2). US2's pure helper is foundational
(blocking); everything else is story-scoped.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependencies)
- **[Story]**: owning user story (US1–US3)
- Exact file paths in every task

## Path Conventions

Single project: component and util edits under `src/`; no new files except
none — all edits land in existing files (`FinanceModule.tsx`,
`GouterMonthlyTable.tsx`, `mealLogic.ts` + their suites + the composed suite).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: pin the plan's shared lunch predicate decision before any story
touches the aggregations.

- [x] T001 [P] Decide and pin the lunch predicate form in
      `src/utils/mealLogic.ts`: export `isLunchAttendance(a: MealAttendance):
      boolean` returning `!a.service || a.service === 'lunch'` (research R4's
      one-liner exception — it stays a single definition instead of a fourth
      inline copy), with a failing test first in `src/meals.test.ts`: a lunch
      attendance (with and without explicit `service`), a `gouter_matin` and a
      `gouter_apres_midi` attendance classify correctly
- [x] T002 Implement `isLunchAttendance` in `src/utils/mealLogic.ts` and switch
      the three existing 006-E inline sites to it (the FinanceModule card split
      L2258/L2278 and the `computeGouterMonthly` complement) — behavior
      byte-identical, until T001 passes

**Checkpoint**: `npm run lint` + `src/meals.test.ts` green; no surface change.

---

## Phase 2: User Story 1 — The Goûter tab shows only Goûter content (Priority: P1) 🎯 MVP

**Goal**: the three Repas-only blocks disappear from the Goûter onglet and stay
byte-identical on Repas (FR-001–004).

**Independent Test**: render the Finance restaurant section in both kitchen
modes; on Goûter the forfait block, price banner and strip are absent; on Repas
the forfait block and banner remain with the «إغلاق شهر» action.

### Tests for User Story 1 ⚠️

- [x] T003 [P] [US1] Write failing tests first in
      `src/components/FinanceModule.test.tsx` (extend the revision-E describe):
      Goûter tab — the «الفرفي المكتسب (Forfait ferme)» heading, the price
      banner's «سعر الوجبة» and the strip's «مداخيل واستهلاك خدمة اللمجة» are
      all absent in external-traiteur AND in-house modes; Repas tab — the
      forfait heading and «سعر الوجبة» are present, and with a finished-month
      fixture the «إغلاق شهر» action renders (FR-004 regression); the strip is
      absent on BOTH tabs (A3 removal per research R1)

### Implementation for User Story 1

- [x] T004 [US1] In `src/components/FinanceModule.tsx`: wrap the Forfait ferme
      card and the pricing banner in `{financeServiceTab === 'repas' && (…)}`
      (the existing panel pattern), and delete the Goûter summary strip IIFE
      with its dead local helpers (`countGouter`, `gouterPrefix`,
      `gouterMatinCount`, `gouterSoirCount`, `gouterSubscribersCount`), until
      T003 passes; closure logic (`activeClosure`,
      `onUpdateMealForfaitClosures`) untouched

**Checkpoint**: US1 green in both modes; Repas tab byte-identical for its own
blocks; composed C1 finance assertions still pass.

---

## Phase 3: User Story 2 — Monthly Goûter grid with day drilldown (Priority: P1)

**Goal**: the Goûter monthly grid becomes the Repas table's interactive twin —
clickable month cells opening a per-day expandable detail (FR-005–010).

**Independent Test**: seed goûter attendances across months and days; clicking
a month opens the day-grouped detail, panels toggle open/closed, re-click or
«إغلاق» closes, an empty month shows the explicit message.

### Tests for User Story 2 ⚠️

- [x] T005 [P] Write failing tests first in `src/meals.test.ts` (new revision-E
      describe extension): `computeGouterMonthDetail(students, month,
      schoolYear)` — groups the month's gouter attendances by date ascending
      (gouter_matin/gouter_apres_midi only — `isLunchAttendance` rows never
      appear), each row carrying student name, grade, service, type
      (subscription/unit) and paid status; an empty month returns an empty
      array
- [x] T006 [P] [US2] Write failing tests first in
      `src/components/GouterMonthlyTable.test.tsx`: the card container and
      «الإجمالي الكلي» badge render; month cells are buttons — clicking one
      opens the day-grouped detail for that month only; each day panel toggles
      open (shows its gouter rows) and closed; clicking the active month again
      or the «إغلاق» action closes the detail; opening another month switches;
      a consumption-free month shows the explicit empty message; records are
      goûter-only (a same-day lunch row appears nowhere); the component keeps
      `finance-gouter-monthly` and `gouter-monthly-{month}` testids

### Implementation for User Story 2

- [x] T007 Implement `computeGouterMonthDetail` in `src/utils/mealLogic.ts`:
      filter gouter attendances by the `academicMonthPrefix(month, schoolYear)`
      prefix, exclude lunch via `isLunchAttendance`, group by date sorted
      ascending, until T005 passes
- [x] T008 [US2] Upgrade `src/components/GouterMonthlyTable.tsx` in place (same
      props `students`/`schoolYear`): the `rounded-3xl` card container with
      header row and «الإجمالي الكلي» badge mirroring the Repas table; month
      cells become buttons (Repas cell classes) toggling internal
      `selectedMonth` (FR-009); the open month renders the day-detail panel —
      one collapsible panel per day (internal `expandedDays: Set<string>`,
      per-day toggle, closed by default, FR-007; research R3) listing that
      day's rows from `computeGouterMonthDetail` with a «إغلاق» action; a
      consumption-free month shows the explicit empty message (FR-010); keep
      both testids, until T006 passes

**Checkpoint**: US2 green; the host wiring needs no change (same props), the
finance-goûter-panel test keeps passing.

---

## Phase 4: User Story 3 — Repas tab data isolated at the source (Priority: P2)

**Goal**: the 3.1 month cells and the day-detail rows become lunch-only at the
aggregation step, with the vacuous-test hole closed (FR-011–013).

**Independent Test**: mixed fixtures where goûter and lunch share days; every
Repas figure equals the lunch-only count; an expanded day panel shows zero
goûter rows; Repas + Goûter month cells sum to the combined count.

### Tests for User Story 3 ⚠️

- [x] T009 [P] [US3] Write failing tests first in
      `src/components/FinanceModule.test.tsx`: with mixed fixtures (a day
      holding 2 lunch + 1 goûter in the selected month) — the 3.1 month cell
      for that month shows the lunch-only count (2, not 3); open that month's
      day detail AND expand the shared day panel: zero goûter rows render
      (research R4 — the expansion is mandatory, collapsed-panel assertions are
      vacuous); the day badge reads the lunch-only count; the sum invariant at
      cell level: Repas 3.1 cell + Goûter monthly grid same-month cell equals
      the combined attendance count

### Implementation for User Story 3

- [x] T010 [US3] In `src/components/FinanceModule.tsx`: filter the 3.1 month
      cell aggregation and the month-detail row collection through
      `isLunchAttendance` at the reduce/collection step (research R4 — not at
      display time), until T009 passes; the day badges and «الإجمالي الكلي»
      inherit the honest counts

**Checkpoint**: US3 green; every Repas-tab figure derives from the same
lunch-only view.

---

## Phase 5: Polish & Cross-Cutting Concerns (Release Closure)

- [x] T011 [P] Extend `src/program.composed.test.tsx`: the C1 finance
      walkthrough adds — on the Goûter tab the forfait block is absent and the
      monthly grid is interactive (a month cell click opens the day detail);
      on the Repas tab the forfait block remains (composed remark assertions
      through the real App shell)
- [x] T012 Final gates at the combined state: `npm run lint`, `npm test`
      (pre-existing suite unmodified + all extended suites), `npm run build` —
      all green; record the closure (test-count reconciliation, W1–W3 coverage
      note) in a closure record appended here

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — start immediately; BLOCKS US3 (its filter task
  consumes `isLunchAttendance`) and pre-stages US2's helper (T007 uses it)
- **Phase 2 (US1)**: needs nothing beyond the baseline — fully independent of
  Phases 3–4 (same file as US3's impl but disjoint regions; coordinate edits)
- **Phase 3 (US2)**: T005→T007 (test-first) then T006→T008; T007 needs T002
- **Phase 4 (US3)**: needs Phase 1 (T002) and T009 before T010
- **Phase 5**: after all stories — composed + gates

### User Story Dependencies

- **US1 (P1)**: independent — the de-mixing scoping
- **US2 (P1)**: independent of US1/US3 (different component; its helper task
  touches `mealLogic.ts` after Phase 1)
- **US3 (P2)**: depends on Phase 1 only; shares `FinanceModule.tsx` with US1 —
  sequence T010 after T004 to avoid edit collisions

### Within Each User Story

- Tests fail first, then implement, then re-run green
- The Repas regression assertions ride along in each story's test task

### Parallel Opportunities

- T001 stands alone; after T002:
- T003 (US1 tests) ∥ T005+T006 (US2 tests) ∥ T009 (US3 tests) — three
  different files (T003/T009 both touch FinanceModule.test.tsx but disjoint
  describes; sequential if preferred)
- Then: T004 | T007→T008 | T010 (T010 after T004)
- Finally: T011 composed | T012 gates

```text
T001 → T002
# After T002, launch the failing-test tasks together:
T003 FinanceModule tests | T005 meals.test helper | T006 GouterMonthlyTable tests | T009 FinanceModule 3.1/detail tests
# Then their impls (each after its own test):
T004 | T007 → T008 | T010 (after T004)
# Finally:
T011 composed | T012 gates
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 (T001–T002) → Phase 2 (T003–T004)
2. **STOP & VALIDATE**: the Goûter tab shows only Goûter content in both
   modes; the Repas tab unchanged
3. The client's primary complaint is closed with two render scopes and one
   deletion

### Incremental Delivery

- +US2 (T005–T008) → the Goûter tab gains its interactive monthly twin
- +US3 (T009–T010) → the totals guarantee is provable, not assumed
- +Phase 5 (T011–T012) → composed re-proof + gates green

### Notes

- The pre-existing suite is IMMUTABLE (FR-006): the only editable old
  assertions are 006-E-owned finance/Goûter tests whose tab-scoping this
  feature legitimately changes
- No schema, route, endpoint, or stored-shape change anywhere in this feature
- This feature completes when T012's gates are green

---

## Closure record (T001–T012)

### T012 — final gates at the combined state (all green)

- `npm run lint` (tsc --noEmit): clean.
- `npm test`: **577 passing** — browser project 35 files / 464 tests,
  node/worker project 13 files / 113 tests. Pre-existing suites unmodified;
  the only edited old assertion is 006-E's GouterMonthlyTable empty-state test,
  updated to the FR-010 contract (grid always renders with clickable cells;
  the empty message lives in the month detail).
- `npm run build`: green (pre-existing chunk-size advisory only).

### What feature 007 shipped

1. **T001/T002** — `isLunchAttendance` in `src/utils/mealLogic.ts`: the single
   lunch predicate (research R4's one-liner single definition); the 006-E card
   split in FinanceModule and `computeGouterMonthly` now consume it.
2. **T003/T004 (US1)** — the Forfait ferme card and the meal-price banner are
   scoped `{financeServiceTab === 'repas' && …}` (FR-001/002, both kitchen
   modes); the «مداخيل واستهلاك خدمة اللمجة» strip deleted with its dead local
   helpers (FR-003, research R1); both Repas blocks regression-pinned present
   with the «إغلاق شهر» action path (FR-004).
3. **T005–T008 (US2)** — `computeGouterMonthDetail` (pure, gouter-only, day-
   grouped, date-ascending); `GouterMonthlyTable` upgraded in place: Repas-
   style `rounded-3xl` card with «الإجمالي الكلي» badge, clickable month cells
   (toggle-to-close), per-day expandable/collapsible panels (internal
   `selectedMonth`/`expandedDays` state, research R2/R3), «إغلاق» action,
   explicit empty month message, goûter-only rows (FR-005–010).
4. **T009/T010 (US3)** — the two source-level bugs fixed: the 3.1 month cells
   and the month-detail row collection filter through `isLunchAttendance` at
   the aggregation step (FR-011/012); tests expand the shared day panel before
   asserting zero goûter rows (research R4's vacuous-test guard); the cell-
   level sum invariant pinned (FR-013).
5. **T011** — composed C1 walkthrough: the finance Goûter onglet de-mixing
   (forfait/banner absent on Goûter, present on Repas) plus an interactive
   month drilldown through the real App shell.

### Test count reconciliation

Pre-feature 558 → post-feature 577 (+19): meals.test.ts +5 (29 total),
FinanceModule.test.tsx +7 (20 total), GouterMonthlyTable.test.tsx +5 (8
total), program.composed +1 (13 total); 1 revision-E assertion updated in
place. No new test files.

### Honest limitation

No human browser pass has been performed. W1–W3 (quickstart.md) are covered by
their automated counterparts and remain available as a manual pre-deploy pass
(`npm run dev` + `npm run pages:dev`).
