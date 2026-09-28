---
description: "Task list for the 008-finance-traiteur-gouter-fixes feature"
---

# Tasks: Finance — Revenus, Traiteur et statut de paiement Goûter

**Input**: Design documents from `/specs/008-finance-traiteur-gouter-fixes/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
quickstart.md ✅ (contracts/ intentionally omitted — no external interfaces)

**Baseline**: features 006 (through revision E) and 007 shipped (commit
`09b1ed0`). This feature refines the Finance module's general view, Repas
onglet and the shared Goûter status; tasks renumber from T001 (new feature
directory).

**Tests mandatory**: constitution V — every implementation task follows its
failing-test task and lands green in the same change.

**Organization**: by user story — US1 general-view de-double-counting (P1),
US2 Repas-onglet kitchen mode + closure detail (P1), US3 Goûter status
anomaly (P1). No foundational phase: the shared status function is US3's own
artifact, and US1/US2 need no setup beyond the baseline.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependencies)
- **[Story]**: owning user story (US1–US3)
- Exact file paths in every task

## Path Conventions

Single project: all production edits land in `src/components/FinanceModule.tsx`
and `src/utils/mealLogic.ts`; suites extended in place; no new files.

---

## Phase 1: User Story 1 — The general view stops double-counting the restaurant (Priority: P1) 🎯 MVP

**Goal**: the «إيرادات المطعم» card is removed and the annual total excludes
Repas and Goûter amounts, with every other revenue card byte-frozen
(FR-001–003).

**Independent Test**: with Repas/Goûter/other payments seeded, the annual
total is invariant under restaurant mutations and the other cards keep their
amounts; the restaurant card renders nowhere.

### Tests for User Story 1 ⚠️

- [X] T001 [P] [US1] Write failing tests first in `src/components/FinanceModule.test.tsx`:
      the «إيرادات المطعم» card label never renders (cantine-enabled and
      cantine-less configurations); read «الإيرادات الكلية (السنة)» with
      Repas + Goûter payments seeded — the amount equals the non-restaurant
      services only, and mutating the restaurant payments (add/remove, paid
      plates and forfait-bearing months) leaves it unchanged (FR-002
      mutation-invariance); the other cards (التسجيلات السنوية, المقبوضات
      بدون المطعم, التكوينات والدورات, مبالغ الشيكات القادمة, الصافي المالي
      للفترة) keep byte-identical amounts across the change (FR-003 freeze)

### Implementation for User Story 1

- [X] T002 [US1] In `src/components/FinanceModule.tsx`: delete the «إيرادات
      المطعم» card block and the `repasRevenueFiltered` alias (its only
      consumer); exclude `service !== 'Goûter'` from `yearNonRepasPayments`
      and drop the `+ repasBenefitYear` term from `yearTotalRevenue` (delete
      the now-unused `repasBenefitYear` IIFE), keeping `yearPendingChequeTotal`
      derived from the same smaller list (research R1), until T001 passes

**Checkpoint**: US1 green; the composed C1 finance walkthrough still passes.

---

## Phase 2: User Story 2 — Repas onglet kitchen mode + closure detail (Priority: P1)

**Goal**: traiteur-economics cards follow the kitchen mode, and month closure
gains the per-student forfait list (FR-004–006).

**Independent Test**: render the Repas onglet in both modes with the same data
(cards hidden in-house, present in traiteur, other numbers identical); close a
month and verify the per-student list against the students holding balances.

### Tests for User Story 2 ⚠️

- [X] T003 [P] [US2] Write failing tests first in
      `src/components/FinanceModule.test.tsx`: in-house mode — the «حصة الـ
      Traiteur» and «ربح السنتر من الوجبات» cards are absent on the Repas
      onglet while every other card keeps its number (identical amounts to the
      traiteur-mode run on the same data, extending the 006-D mode-invariance
      pin); traiteur mode — both cards render as before (FR-004 regression);
      closure — with a finished-month fixture and students holding
      `forfaitEstimate > 0`, the forfait block renders the per-student list
      (each student's name + amount) before closing, and after clicking «إغلاق
      شهر» the list reflects the persisted snapshot items; a re-close replaces
      it; a month with no balances shows the explicit empty message (FR-006,
      research R3)
- [X] T004 [P] [US2] Write failing tests first in
      `src/program.composed.test.tsx`: the C1 in-house composed config renders
      the Repas onglet without the two traiteur cards (composed FR-004 pin
      through the real App shell)

### Implementation for User Story 2

- [X] T005 [US2] In `src/components/FinanceModule.tsx`: gate the «حصة الـ
      Traiteur» and «ربح السنتر من الوجبات» cards on `!isInHouseKitchen` (the
      006-D strip/table pattern — research R2, render-only), until T003's
      mode assertions and T004 pass
- [X] T006 [US2] In `src/components/FinanceModule.tsx` (forfait block): add a
      collapsible per-student list — before closure from the live estimate
      (`restoStudents.filter(s => s.forfaitEstimate > 0)`, name + amount),
      after closure from the snapshot's persisted `items` (`studentName` +
      `amount`), with the explicit empty message when no student holds a
      balance (FR-006, research R3), until T003's closure assertions pass

**Checkpoint**: US2 green in both modes; closure aggregates unchanged.

---

## Phase 3: User Story 3 — A paid Goûter month reads paid everywhere (Priority: P1)

**Goal**: the shared Goûter payment-status computation recognizes settled
months, nets refund records, and never over-matches (FR-007–009).

**Independent Test**: a settled Goûter month + day attendance reads paid on
the finance table AND the meals-module daily gating; refund records,
cross-service payments and cross-month payments are pinned negative.

### Tests for User Story 3 ⚠️

- [X] T007 [P] [US3] Write failing tests first in `src/meals.test.ts`
      (`getGouterStatusFor` truth table, research R4): settled month
      (non-refund payments covering the effective required total) + a day
      goûter attendance → status 'paid'; the same fixture plus a refund-shaped
      month-labelled record (negative `amountPaid`) → still 'paid' (refunds
      net out — the anomaly's repro); a Repas payment in the same month → the
      Goûter month stays unpaid (no over-match, FR-008); a Goûter payment in
      another month → unpaid; partial coverage → 'advance' (semantics
      preserved); discount handling unchanged (a discounted settled month reads
      paid)
- [X] T008 [P] [US3] Write failing tests first in
      `src/components/MealsModule.test.tsx` and
      `src/components/FinanceModule.test.tsx` (FR-009 cross-surface pin): the
      same paid-month fixture renders مسدد on the finance Goûter table while
      the meals module's daily-grid mark path treats the service as paid —
      both surfaces consume the one shared status and agree

### Implementation for User Story 3

- [X] T009 [US3] In `src/utils/mealLogic.ts` (`getGouterStatusFor`): keep the
      lookup `p.service === 'Goûter' && p.month === \`${month} (${schoolYear})\``
      (service-type + per-student + per-month match — FR-007/008), and compute
      the status from the sum of non-refund payments against the effective
      required total, netting refund-shaped records instead of letting them
      drag the settled sum below the threshold (research R4); discounts and
      'advance' semantics byte-preserved, until T007 and T008 pass

**Checkpoint**: US3 green; every finance/meals Goûter status surface agrees.

---

## Phase 4: Polish & Cross-Cutting Concerns (Release Closure)

- [X] T010 Final gates at the combined state: `npm run lint`, `npm test`
      (pre-existing suite unmodified + all extended suites), `npm run build` —
      all green; record the closure (test-count reconciliation, W1–W3 coverage
      note) in a closure record appended here

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: none — start immediately (FinanceModule general view only)
- **Phase 2 (US2)**: independent of US1/US3, but shares
  `src/components/FinanceModule.tsx` with both — sequence T005/T006 after T002,
  T009's mealLogic edit is a different file (parallel-safe)
- **Phase 3 (US3)**: independent of US1/US2 (mealLogic + its consumers' pins);
  its FinanceModule test file (T008) is disjoint from T001/T003 describes
- **Phase 4**: after all stories — gates

### User Story Dependencies

- **US1 (P1)**: independent — general-view scoping and deletion
- **US2 (P1)**: independent logic; file-sequenced after US1's T002 (same file)
- **US3 (P1)**: fully independent (shared function + its pins)

### Parallel Opportunities

- T001 (US1 tests) ∥ T003+T004 (US2 tests) ∥ T007+T008 (US3 tests) — the four
  failing-test tasks cover three files; FinanceModule describes are disjoint
- Then: T002 → T005 → T006 (FinanceModule sequence) with T009 parallel
  (different file)
- Finally: T010 gates

```text
# Launch the failing-test tasks together:
T001 FinanceModule general-view tests | T003 FinanceModule mode/closure tests
T004 composed mode pin | T007 meals.test status table | T008 cross-surface pins
# Then their impls (FinanceModule sequential, mealLogic parallel):
T002 → T005 → T006 | T009 (mealLogic, parallel with the FinanceModule chain)
# Finally:
T010 gates
```

---

## Implementation Strategy

### MVP First (US1 only)

1. T001 → T002
2. **STOP & VALIDATE**: the annual total is restaurant-invariant and the card
   is gone; every other card byte-frozen
3. The client's headline-number complaint is closed with one filter edit and
   one deletion

### Incremental Delivery

- +US2 (T003–T006) → the Repas onglet respects the kitchen mode and closure
  shows the per-student forfait
- +US3 (T007–T009) → the paid-Goûter anomaly is dead at the source, every
  surface agreeing
- +T010 → gates green, closure recorded

### Notes

- The pre-existing suite is IMMUTABLE (FR-006): the only editable old
  assertions are 006/007-owned finance tests whose subject this feature
  legitimately changes (the «إيرادات المطعم» card's own test if one exists, and
  the composed general-view references)
- No schema, route, endpoint, or stored-shape change anywhere in this feature
- This feature completes when T010's gates are green

---

## Closure record

**Appended by T010 after implementation.** — Feature `008-finance-traiteur-gouter-fixes`
closed 2026-09-28 on `new_feature_center` (baseline `09b1ed0`).

### Gates (combined state, all green)

- `npm run lint` (tsc --noEmit): clean.
- `npm test`: **595 passed** (browser project 482/482 across 35 files + worker
  project 113/113 across 13 files) — pre-existing suite unmodified except the
  three T008 assertion scoping noted below; zero failures.
- `npm run build`: ✓ built in 3.7s (pre-existing >500 kB chunk-size warning only).

### Test-count reconciliation (baseline → closed)

| Suite | Baseline | Closed | Δ |
|---|---|---|---|
| `src/meals.test.ts` | 29 | 35 | +6 (T007 truth table) |
| `src/components/FinanceModule.test.tsx` | 20 | 29 | +9 (4 US1 + 4 US2 + 1 US3) |
| `src/components/MealsModule.test.tsx` | 19 | 21 | +2 (T08 pins) |
| `src/program.composed.test.tsx` | 13 | 14 | +1 (T04 composed pin) |
| `src/components/GouterMonthlyTable.test.tsx` | 8 | 8 | 0 |
| **Full suite** | **577** | **595** | **+18** |

All 18 new tests were written failing-first and landed green in the same change
(constitution V). During T008 two of the new assertions were scoped (the
«حصة الـ Traiteur» label also exists as the lunch-table `<th>`: assert on the
card `div`), and the T008 mark-path pin was pointed at the real daily-grid
toggle (`handleToggleMealService`) after inspection showed the shared
`ensureGouterAttendanceForDate` hardcodes `paid: false` by design (pinned by
the immutable 006-E5 suite). No pre-existing test was edited.

### W1–W3 coverage note (quickstart walkthroughs ↔ automated counterparts)

- **W1 — general view de-double-counting (US1 / FR-001–003)**: FinanceModule
  US1 describe — card absence in both module configurations, annual total
  equals non-restaurant services only (180 not 240/300/360), mutation
  invariance under Repas/Goûter changes, byte-identical sibling cards.
  Composed counterpart: C1 feature-008 walkthrough asserts the card is gone
  through the real App shell.
- **W2 — Repas onglet kitchen mode + closure detail (US2 / FR-004–006)**:
  FinanceModule US2 describe — cards hidden in-house / kept in traiteur with
  other numbers identical, per-student forfait list from the live estimate
  before closure and from the persisted snapshot after, replace-on-close kept,
  explicit empty message when no balance holders. Composed counterpart: C1
  Repas-onglet mode pin through the App shell.
- **W3 — paid Goûter reads paid everywhere (US3 / FR-007–009)**: meals.test
  truth table — settled month → paid, settled + refund-shaped record → paid
  (the anomaly repro, fixed by netting non-refund payments), Repas-in-month
  and Goûter-other-month → unpaid (no over-match), partial → advance with
  exact remaining, discount semantics unchanged. Cross-surface pins: the same
  paid+refund fixture renders مسدد on the finance Goûter table (shared
  `getGouterStatusFor` via `computeGouterRows`) and drives the meals daily-grid
  mark path to a paid subscription attendance (shared status at
  `handleToggleMealService`), with the monthly-grid paid mark as render pin.

### Implementation footprint

- `src/components/FinanceModule.tsx`: «إيرادات المطعم» card deleted;
  `yearNonRepasPayments` excludes Goûter, `repasBenefitYear` IIFE and
  `repasRevenueFiltered` alias deleted, cheque deduction follows the filtered
  list (R1); traiteur cards gated on `!isInHouseKitchen` (R2); per-student
  forfait list added to the forfait block (R3).
- `src/utils/mealLogic.ts`: `getGouterStatusFor` computes `paidAmount` from
  non-refund payments only (R4); lookup, discounts and advance semantics
  byte-preserved.
- No schema, route, endpoint, or stored-shape change anywhere.
