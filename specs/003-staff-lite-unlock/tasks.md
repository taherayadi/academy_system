---
description: "Task list for the 003-staff-lite-unlock feature"
---

# Tasks: Staff-Lite Unlock (Étude centers get limited staff access)

**Input**: Design documents from `/specs/003-staff-lite-unlock/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
quickstart.md ✅ (contracts/ intentionally omitted — no external interface changes)

**Tests**: Required — spec FR-012 / constitution Principle V; the mode matrix
(data-model.md) is proven by the three-mode component suite plus an App-level
visibility check.

**Organization**: By user story — US1 lite roster CRUD (P1), US2 payroll locks (P1),
US3 full-mode regression (P1). The three ship as one coherent increment; task order
inside phases reflects file-edit sequencing, not priority.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependencies)
- **[Story]**: owning user story (US1–US3)
- Exact file paths in every task

## Path Conventions

Frontend-only feature (per plan.md): all code under `src/`; tests co-located as
`*.test.tsx` beside the code they cover.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The App-side derivation and plumbing every story consumes.

- [x] T001 In `src/App.tsx` derive `const staffLite = centerModuleKeys.length > 0 && centerModuleKeys.includes('etude') && !centerModuleKeys.includes('staff');` next to the existing `centerModuleKeys` computation (~line 179), and add `onGoToRenewal={() => setActiveTab('renewal')}` plus `staffLite={staffLite}` to the module8 render branch (~line 1255) — no behavior change yet (prop undefined elsewhere)

**Checkpoint**: Derivation exists; module untouched; all tests green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make the staff module reachable (or hidden) correctly per mode before
any in-module work.

- [x] T002 In `src/App.tsx` extend the module8 sidebar entry (~line 877) to render when the center's enabled modules include 'staff' OR 'etude' (composing with the existing `hideRestrictedModules` condition), and whitelist 'module8' in the module-enablement fallback guard (~line 197 region) when étude is present so live-sync never bounces a lite center out of the staff tab
- [x] T003 In `src/components/StaffManagementModule.tsx` extend `StaffManagementModuleProps` with optional `staffLite?: boolean` and `onGoToRenewal?: () => void` (both defaulting undefined = full mode — every existing render/test unchanged)

**Checkpoint**: Étude-only centers see « إدارة الموظفين » and open it in full mode; paying centers unchanged; neither-centers still hidden (existing gating).

---

## Phase 3: User Story 1 — Étude center manages its staff roster (Priority: P1) 🎯 MVP

**Goal**: Lite centers get fully working staff add/edit/delete.

**Independent Test**: Étude-only center → staff module opens, roster CRUD works and
persists.

### Tests for User Story 1 ⚠️

- [x] T004 [P] [US1] Create `src/components/StaffManagementModule.test.tsx`: with `staffLite` — module renders profiles view, add/edit/delete controls present; performing an add then an edit invokes `onUpdateStaff` with the modified roster; with `staffLite` undefined — same CRUD controls present (full mode, regression baseline)

### Implementation for User Story 1

- [x] T005 [US1] In `src/components/StaffManagementModule.tsx` verify (and adjust only if needed) that staff CRUD controls live in the profiles sub-tab so lite mode inherits them unchanged — the profiles view is the default `activeSubTab` value (~line 123), which lite mode keeps

**Checkpoint**: US1 demoable (quickstart S1) — roster CRUD works for étude-only centers.

---

## Phase 4: User Story 2 — Payroll features locked behind paid Staff (Priority: P1)

**Goal**: Lite mode structurally hides every payroll surface; upgrade action navigates
to renewal.

**Independent Test**: Lite center → no pointage sub-tab; payslip/avance/congé/schedule
show locked cards; upgrade action invokes the renewal navigation; no payroll write
possible.

### Tests for User Story 2 ⚠️

- [x] T006 [P] [US2] Extend `src/components/StaffManagementModule.test.tsx`: with `staffLite` — the pointage sub-tab button is absent, the pointage view never renders, a locked message renders in place of payslip/avance/congé/schedule surfaces, and clicking the upgrade button calls `onGoToRenewal`; with `staffLite` undefined — none of these locked cards render

### Implementation for User Story 2

- [x] T007 [US2] In `src/components/StaffManagementModule.tsx` when `staffLite`: force `activeSubTab` to 'profiles' (ignore/default any other value), hide the pointage sub-tab button (~line 742), and short-circuit the `activeSubTab === 'pointage'` branch (~line 1132) so it renders nothing
- [x] T008 [US2] In `src/components/StaffManagementModule.tsx` when `staffLite`: render a locked-feature card (« وحدة Personnel & Salaires الكاملة غير مفعّلة — فعّلها من التجديد ») in place of the payslip generation control (~line 193 state, its button in the profile detail), the advances section, the congés section, and the schedule section; the card's button calls `onGoToRenewal` (no-op fallback if the prop is absent)

**Checkpoint**: US1+US2 demoable together (quickstart S2) — the full lite experience.

---

## Phase 5: User Story 3 — Paid Staff centers keep the full module (Priority: P1)

**Goal**: Regression guard — staff-enabled centers see zero change.

**Independent Test**: Staff-enabled center → pointage tab present, payslip/avance/
congé flows work, no locked cards.

### Tests for User Story 3 ⚠️

- [x] T009 [P] [US3] Extend `src/components/StaffManagementModule.test.tsx`: with `staffLite` undefined — both sub-tab buttons render, the pointage view renders when selected, payslip/avance/congé controls render (assert by their existing labels), and no locked cards or upgrade buttons exist anywhere

### Implementation for User Story 3

- [x] T010 [US3] Verify full-mode behavioral parity in `src/components/StaffManagementModule.tsx`: every `staffLite` branch is strictly conditional (default undefined = today's code path); run the full existing staff-related tests to confirm zero regressions — fix only if a diff leaks into the default path

**Checkpoint**: All three stories done — the complete mode matrix (data-model.md) implemented.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Composition rules, mid-session flip, final verification.

- [x] T011 [P] Verify composition (FR-009/010): restricted_admin limits still apply to module8 for lite centers; simulate an enabled-modules flip (étude-only → +staff) and confirm the module transitions lite→full on next sync without re-login (quickstart S5)
- [x] T012 Run full quickstart.md: `npm run lint`, `npm test`, `npm run build` green; manually verify S1–S6 including data preservation (S6)
- [x] T013 Confirm no consumer of the staff module breaks: full vitest suite green including Dashboard (`openAddStaff` → module8 navigation still valid for both modes) and any existing staff references in module tests

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — start immediately
- **Phase 2 (Foundational)**: needs T001; blocks in-module story work (props must exist)
- **Phase 3 (US1)**: needs Phase 2; US1 is the MVP increment
- **Phase 4 (US2)**: needs Phase 2; same file as US1 — sequence T007/T008 after T005 (or edit together)
- **Phase 5 (US3)**: needs Phase 2 (the undefined-prop baseline); verify after US2 lands
- **Phase 6**: after all stories

### User Story Dependencies

- **US1 (P1)**: independent — MVP alone (Phases 1→2→3)
- **US2 (P1)**: independent functionally; shares StaffManagementModule.tsx with US1 — coordinate edits; the unlock is commercially complete only with US2
- **US3 (P1)**: verification-focused; runs last within the increment as the regression gate

### Parallel Opportunities

- T004 ∥ T006 ∥ T009 are all assertions over the same test file — write as one suite in three commits, or draft together before implementation
- App-side (T001–T002) parallel with module-side (T003+) after T001

---

## Parallel Example: failing tests first

```bash
# Draft the whole suite before implementing:
Task: "T004 lite CRUD assertions (fails)"
Task: "T006 lock + navigation assertions (fails)"
Task: "T009 full-mode parity assertions (passes today — guards regressions)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phases 1 → 2 → 3 (T001–T005)
2. **STOP & VALIDATE**: quickstart S1 + gates green
3. Ship — étude centers can manage rosters even before locks land (acceptable only
   as a same-release precursor; do not ship US1 to production without US2)

### Incremental Delivery

- +US2 (locks + renewal navigation) → commercially complete increment
- +US3 verification pass → regression-proofed release
- Each checkpoint gates green; stop anywhere

### Notes

- Default prop values keep full mode byte-identical — any diff leaking into the
  undefined-prop path is a bug (T010 exists to catch exactly that)
- Locked-card wording finalized in the app's Arabic UI style (spec assumption)
- No API, pricing, or data changes anywhere in this feature
