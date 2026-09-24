---
description: "Task list for the 002-type-aware-gating feature"
---

# Tasks: Type-Aware Gating (Crèche/Jardin hide school-level content)

**Input**: Design documents from `/specs/002-type-aware-gating/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
quickstart.md ✅ (contracts/ intentionally omitted — no external interface)

**Tests**: Required — spec FR-012 and constitution Principle V; every story leads
with its failing-first test.

**Organization**: By user story (US1 registration fields, US2 Suivi actions, US3
study modules) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependencies)
- **[Story]**: owning user story (US1–US3)
- Exact file paths in every task

## Path Conventions

Frontend-only feature (per plan.md): all code under `src/`; tests co-located as
`*.test.ts(x)` beside the code they cover.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The single source of the type-behavior matrix everything consumes.

- [ ] T001 Create `src/utils/centerType.ts` exporting `hasSchoolLevel(type?: string): boolean` (true ONLY for 'garderie' and 'formation'), `hasStudyModules(type?: string): boolean` (true ONLY for 'garderie' and 'formation'), and `CENTER_TYPES = ['jardin', 'creche', 'garderie', 'formation']` — unknown/empty/undefined input returns true (legacy passthrough per data-model invariant 4)
- [ ] T002 Create `src/utils/centerType.test.ts` covering the full truth table: both predicates true for garderie + formation, false for creche + jardin, true for undefined / '' / 'unknown' / legacy values; CENTER_TYPES exact contents

**Checkpoint**: Predicates exist, tested, no UI change yet (feature is a no-op).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Thread `centerType` into the two gated components so story tasks touch
only gating logic.

- [ ] T003 In `src/App.tsx` add `centerType={currentCenter?.centerType}` to the `StudentRegistrationModule` render (~line 1103) and the `SuiviScolaireModule` render (~line 1122), and extend both components' props interfaces in `src/components/StudentRegistrationModule.tsx` and `src/components/SuiviScolaireModule.tsx` with optional `centerType?: string` (defaulting undefined — no behavior change)

**Checkpoint**: Prop plumbing compiles; zero behavioral change (existing tests still green).

---

## Phase 3: User Story 1 — Registration form adapts to center type (Priority: P1) 🎯 MVP

**Goal**: Crèche/jardin see no grade/établissement fields anywhere; garderie/formation
unchanged; hidden data preserved.

**Independent Test**: Crèche session → registration renders zero school fields and
saves with empty grade; lists/cards/prints/filters show no grade. Formation session →
unchanged.

### Tests for User Story 1 ⚠️

- [ ] T004 [P] [US1] Create `src/components/StudentRegistrationModule.test.tsx` (Testing Library, per LandingPage.smoke.test.tsx convention): rendering with `centerType='creche'` → « المستوى الدراسي » and « المؤسسة التعليمية » absent, no « + إضافة مؤسسة » button, submitting a child with empty grade calls the save callback; rendering with `centerType='formation'` → grade select present and required, établissement select present

### Implementation for User Story 1

- [ ] T005 [US1] In `src/components/StudentRegistrationModule.tsx` wrap the grade select block (~line 861) and the établissement block incl. add-establishment sub-form (~lines 877–910) in `{hasSchoolLevel(centerType) && (...)}`; make the grade `required` attribute conditional so hidden state submits (import from `../utils/centerType`)
- [ ] T006 [US1] Gate grade display surfaces in `src/components/StudentRegistrationModule.tsx` with `hasSchoolLevel(centerType)`: list row grade chip (~line 629), student card print title grade (~line 1583), registration print « المستوى الدراسي » line (~line 1763), sibling grade inputs stay (they are form data entry, not display — verify only)
- [ ] T007 [US1] In `src/components/SuiviScolaireModule.tsx` gate the receipt print grade (~line 1216) and the grade filter select + `matchesGrade`/search grade matching (~lines 80, 149–162, 607, 859–865) with `hasSchoolLevel(centerType)` — filter hidden and search falls back to name-only for crèche/jardin

**Checkpoint**: US1 fully functional and independently demoable (quickstart S1).

---

## Phase 4: User Story 2 — Suivi quick actions match type (Priority: P2)

**Goal**: Notes Devoirs + timesheet row icons only for garderie/formation; payments
untouched.

**Independent Test**: Crèche → no row action icons, payment flow works. Formation →
both icons present and functional.

### Tests for User Story 2 ⚠️

- [ ] T008 [P] [US2] Create `src/components/SuiviScolaireModule.test.tsx`: `centerType='creche'` → no element with title « إدخال نقاط الفروض (Notes Devoirs) », no « عرض الجدول الزمني » button, no disabled « لم يُسنَد جدول توقيت بعد » placeholder; registration/monthly payment buttons still render; `centerType='formation'` → all three row-action variants present

### Implementation for User Story 2

- [ ] T009 [US2] In `src/components/SuiviScolaireModule.tsx` wrap the NotebookPen button block (~lines 664–678) and the Clock button/disabled-placeholder pair (~lines 679–697) in `{hasSchoolLevel(centerType) && (...)}` — payment cells and all other row content untouched (FR-007)

**Checkpoint**: US1 + US2 both live; crèche Suivi table fully type-clean.

---

## Phase 5: User Story 3 — Study modules only for garderie/formation (Priority: P2)

**Goal**: Four study tabs absent from nav/dashboard for crèche/jardin; deep links fall
back to dashboard; composition with subscription gating preserved.

**Independent Test**: Crèche → four tabs nowhere, stale tab id lands on dashboard.
Formation → all four usable (subject to existing subscription gating).

### Tests for User Story 3 ⚠️

- [ ] T010 [P] [US3] Create `src/App.typeGating.test.tsx`: render the App shell with a crèche center → sidebar contains none of « الدروس الخصوصية », « تأطير Étude », « حصة مراجعة », « التكوينات والدورات »; setting activeTab to 'module4' renders the dashboard instead; with a formation center → all four labels present in nav

### Implementation for User Story 3

- [ ] T011 [US3] In `src/App.tsx` add `const hasStudy = hasStudyModules(currentCenter?.centerType)`; extend the restricted-tabs guard effect (~line 192) to redirect 'module3' | 'module4' | 'module4b' | 'formations' to 'dashboard' when `!hasStudy`; extend the existing not-enabled-module fallback effect (~line 197 region) the same way so deep links always land on dashboard
- [ ] T012 [US3] In `src/App.tsx` gate the four menuItems entries (~lines 869–872: module3, module4, module4b, formations) with `hasStudy &&` (composing with the existing `!hideRestrictedModules` conditions)
- [ ] T013 [US3] In `src/components/Dashboard.tsx` (~line 37) filter the four study quick-access cards with `hasStudyModules(centerType)` composed into the existing `isModuleAllowed` check

**Checkpoint**: All three stories done — full visibility matrix implemented (data-model.md).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification, regression safety, docs.

- [ ] T014 [P] Verify composition rule (FR-010) by test or manual check: a garderie center WITHOUT 'etude' in enabledModules still has no étude tab (subscription gating intact); an unknown-type center sees everything as today (quickstart S4)
- [ ] T015 Run full quickstart.md: `npm run lint`, `npm test`, `npm run build` green; manually verify S1–S5 including the data-preservation round-trip (S5)
- [ ] T016 Confirm no consumer of the touched components breaks: run the full vitest suite and check existing module tests (EventsModule, RenewalModule, Advertisement*, SubscriptionStatusCard, LandingPage smoke) pass unchanged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — start immediately
- **Phase 2 (Foundational)**: needs T001; blocks US1/US2 tasks (props must exist)
- **Phase 3 (US1)**: needs Phase 2
- **Phase 4 (US2)**: needs Phase 2; independent of US1 (same file as T007 — sequence US1's T007 before T009 or merge them)
- **Phase 5 (US3)**: needs only T001 (no prop threading — App/Dashboard already hold centerType); can run in parallel with Phases 3–4
- **Phase 6**: after all stories

### User Story Dependencies

- **US1 (P1)**: independent — MVP alone (Setup + Foundational + Phase 3)
- **US2 (P2)**: independent of US1 functionally; shares SuiviScolaireModule.tsx with T007 — coordinate edits
- **US3 (P2)**: fully independent of US1/US2 (different files: App.tsx gating logic vs module internals)

### Parallel Opportunities

- T004 ∥ T008 ∥ T010 (three test files, different targets) — all can be written first as failing tests
- Phase 5 entirely parallel with Phases 3–4 (App/Dashboard vs module files)
- T014 ∥ T016 in polish

---

## Parallel Example: failing tests first

```bash
# Write all three story test suites before any implementation:
Task: "T004 StudentRegistrationModule.test.tsx (fails)"
Task: "T008 SuiviScolaireModule.test.tsx (fails)"
Task: "T010 App.typeGating.test.tsx (fails)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phases 1 → 2 → 3 (T001–T007)
2. **STOP & VALIDATE**: quickstart S1 + gates green
3. Ship — crèche/jardin registration is clean even before US2/US3 land

### Incremental Delivery

- +US2 (row actions) → +US3 (nav/dashboard/deep-links) → full matrix
- Each checkpoint independently demoable; stop anywhere

### Notes

- Keep edits inside the flagged line neighborhoods only — shared surfaces with
  garderie/formation must remain byte-identical in behavior (SC-004)
- Feature is deliberately a no-op until center types exist (001-US1) — safe to ship first
