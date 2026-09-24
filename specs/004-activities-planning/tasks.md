---
description: "Task list for the 004-activities-planning feature"
---

# Tasks: Activités & Planning Module

**Input**: Design documents from `/specs/004-activities-planning/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
contracts/activities-api.md ✅, quickstart.md ✅

**Tests**: Required — spec FR-014 / constitution Principle V; every story leads with
its failing-first tests.

**Organization**: By user story — US1 weekly planning (P1), US2 move & group (P2),
US3 commercial availability (P2). US1+US2 share the module file (sequence edits);
US3 is fully independent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependencies)
- **[Story]**: owning user story (US1–US3)
- Exact file paths in every task

## Path Conventions

Web app (per plan.md): `src/` (SPA) + `functions/api/` (Pages Functions); tests
co-located as `*.test.ts(x)`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type vocabulary + pure planner logic every story consumes.

- [ ] T001 In `src/types.ts`: add `'activites'` to the `ModuleKey` union and the `Activity` interface exactly per data-model.md (fields id, centerId, title, category, weekday, date, timeStart, timeEnd, location?, levelClass?, staffId?, createdAt; `category` enum = motricite|art|musique|jeu; weekday 0–6; date YYYY-MM-DD)
- [ ] T002 [P] Create `src/utils/planner.ts` with pure helpers: `TIME_BANDS` (fixed half-hour bands 06:00–20:00), `bandIndexFor(timeStart: string): number` (band containing timeStart, minutes ignored), `CATEGORY_COLORS` (motricite=emerald, art=violet, musique=amber, jeu=sky), `validateActivity(a)` (title.trim() != '' AND category ∈ enum AND weekday ∈ 0–6 XOR date present AND timeStart < timeEnd), `groupActivities(list, by: 'class' | 'location')` (ordered buckets alphabetical, 'unassigned' last, view-only)
- [ ] T003 [P] Create `src/utils/planner.test.ts`: bandIndexFor edge cases (06:00 first band, 19:30 last, minute offsets snap), validateActivity truth table (each invalid branch + valid cases incl. weekday-XOR-date), groupActivities (alphabetical order, unassigned last, empty groups omitted, no data mutation)

**Checkpoint**: Pure logic exists and is fully tested; no wiring yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server domain + route inventory + client save plumbing — US1/US2 need
them; US3 does not.

**⚠️ CRITICAL**: The `activities` table must exist in local D1 (admin-repo migration
per constitution Principle I) before T007 runs.

- [ ] T004 Add `readActivities`/`writeActivities` to `functions/api/_lib.ts` following `readFormations`/`writeFormations`: SELECT/DELETE/INSERT on `activities` (columns id, center_id, title, category, weekday, date, time_start, time_end, location, level_class, staff_id, created_at) all filtered/stamped by the session-derived `center_id`; write drops rows failing the data-model predicate and dedupes ids (first wins)
- [ ] T005 Create `functions/api/activities.ts` per contracts/activities-api.md: `onRequestGet` returns the center's array (empty array when none, date null for weekly rows); `onRequestPut` requires a JSON array (400 otherwise), stamps server-side center_id (payload ownership ignored), returns `{ ok: true }` / shared error envelope
- [ ] T006 Add `"/api/activities": ["GET", "PUT"]` to the `ROUTES` inventory in `functions/api/_middleware.ts` (same change as the handler — constitution Principle IV)
- [ ] T007 Create `functions/api/activities.test.ts`: foreign-center isolation both directions, unauthenticated rejection, wrong method → 405, invalid-row drops, duplicate-id dedupe, payload centerId ignored, GET returns only own rows
- [ ] T008 Extend `functions/api/_middleware.test.ts` expected inventory with `/api/activities` [GET, PUT]
- [ ] T009 Extend `src/api.ts` with `saveActivities(activities: Activity[]): Promise<void>` (PUT to relative `/api/activities`, matching the `saveFormations` helper pattern)

**Checkpoint**: Domain API live and isolation-tested (`npm run lint && npm test`).

---

## Phase 3: User Story 1 — Center plans its weekly activities (Priority: P1) 🎯 MVP

**Goal**: Create/edit/delete activities that render as category-colored chips on the
weekly grid and persist.

**Independent Test**: Create activities in two categories on two days → chips in the
right day/band; reload → intact; invalid submissions blocked; edit/delete reflected.

### Tests for User Story 1 ⚠️

- [ ] T010 [P] [US1] Create `src/components/ActivitiesModule.test.tsx`: rendering activities places chips in the correct day column and band cell with the category color class (from CATEGORY_COLORS); opening the create dialog and submitting without title/category or with timeEnd <= timeStart is blocked (no save call); editing changes the chip; deleting removes it and calls the save callback with the updated list

### Implementation for User Story 1

- [ ] T011 [US1] Create `src/components/ActivitiesModule.tsx`: weekly grid (columns Lun–Dim + date-mode header for dated activities, rows = TIME_BANDS), chips positioned by bandIndexFor with CATEGORY_COLORS, create/edit dialog with fields per FR-002/003 (title required, category select, weekday-or-date toggle, timeStart/timeEnd validated by validateActivity with inline blocking message, optional location/levelClass/staffId — staff picker from the staff list prop), delete with confirm, all changes persisted via the `onSave` prop (App-side `commitDomain(saveActivities)`), overlapping chips stack within the cell
- [ ] T012 [US1] In `src/App.tsx`: add activities state (fetched with the domain data), `TAB_MODULE.activites = 'activites'`, sidebar entry `{ id: 'activites', label: 'الأنشطة والبرنامج', icon: Shapes }`, render branch (~module6 region) passing activities + `onSave={(list) => commitDomain(() => saveActivities(list))}` + staff list, and the guard-effect fallback via the existing tab map (no extra code — verify deep-link fallback works)
- [ ] T013 [US1] In `src/components/Dashboard.tsx` add the quick-access card (tab 'activites', icon Shapes, tile `bg-brand-600/10 text-brand-600`) filtered by the existing `isModuleAllowed` check

**Checkpoint**: US1 demoable end-to-end (quickstart S1–S2) with gates green.

---

## Phase 4: User Story 2 — Moving and grouping activities (Priority: P2)

**Goal**: Drag/tap-move with persistence; per-class/per-location grouping toggle with
unassigned group.

**Independent Test**: Move an activity → persists; toggle grouping → regroups with
unassigned last; touch fallback moves too.

### Tests for User Story 2 ⚠️

- [ ] T014 [P] [US2] Extend `src/components/ActivitiesModule.test.tsx`: drag events (dragstart on chip, drop on another day/band cell) move the chip and invoke the save callback with updated weekday/band times; tapping a chip then tapping a target cell achieves the same move (fallback); grouping toggle renders per-group sections (alphabetical, unassigned last) and switching never mutates the saved list

### Implementation for User Story 2

- [ ] T015 [US2] In `src/components/ActivitiesModule.tsx` add the move interaction: HTML5 dragstart/dragover/drop handlers on chips/cells computing the new weekday + snapped band time (update timeStart to the band start, keep duration), tap-select-then-choose fallback (selected ring state), both persisting via `onSave`
- [ ] T016 [US2] In `src/components/ActivitiesModule.tsx` add the grouping toggle (week view ↔ per class ↔ per location) rendering group sections via `groupActivities` — pure view change, `onSave` never called on toggle

**Checkpoint**: US1+US2 complete — full planner experience (quickstart S3–S4).

---

## Phase 5: User Story 3 — Commercial availability (Priority: P2)

**Goal**: Module listed/purchasable on landing + renewal; Growth/Pro presets; hidden
without entitlement.

**Independent Test**: Simulator + renewal list it with price; Growth pre-selects,
Basic doesn't; base+module derives Growth; no entitlement → no nav trace.

### Tests for User Story 3 ⚠️

- [ ] T017 [P] [US3] Create `src/utils/pricing.test.ts` (extend if a pricing test file already exists): ALL_MODULES contains key 'activites' with label/icon/description; PLAN_PRESET_MODULES.starter excludes 'activites'; growth and pro include it; derivePlanFromModules(base + activites) === 'growth', derivePlanFromModules(all) === 'pro'; LandingPage smoke test still green

### Implementation for User Story 3

- [ ] T018 [US3] In `src/utils/pricing.ts`: import `Shapes` from lucide-react and append `{ key: 'activites', label: 'Activités & Planning', icon: Shapes, description: 'Planning hebdomadaire des activités : motricité, art, musique, jeu.' }` to ALL_MODULES; add 'activites' to PLAN_PRESET_MODULES.growth and .pro only (starter untouched)
- [ ] T019 [US3] Verify (no code change expected) `src/components/RenewalModule.tsx` and the landing simulator render the new add-on from the shared catalog automatically; fix only if a hard-coded list bypasses ALL_MODULES

**Checkpoint**: All three stories complete (quickstart S5).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Sync wiring, edge-case verification, final gates.

- [ ] T020 [P] In `src/App.tsx` add the activities domain to the live-sync refetch key list (same mechanism as formations/events) so multi-session edits propagate (FR-013)
- [ ] T021 [P] Verify edge cases per quickstart S6: deleted staff reference renders chip without supervisor name; module disable/re-enable retains data; overlap stacking renders both chips
- [ ] T022 Run full quickstart.md: `npm run lint`, `npm test`, `npm run build` green; manually verify S1–S6
- [ ] T023 Confirm the admin-repo migration for the `activities` table (DDL per data-model.md) is scheduled — coordination item blocking production deploy only

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — start immediately
- **Phase 2 (Foundational)**: needs T001; blocks US1/US2 (API + save plumbing); US3 independent of it
- **Phase 3 (US1)**: needs Phases 1+2 — the MVP increment
- **Phase 4 (US2)**: needs Phase 3 (same module file — sequence after T011)
- **Phase 5 (US3)**: needs only T001 (type) — can run in parallel with everything
- **Phase 6**: after target stories

### User Story Dependencies

- **US1 (P1)**: independent — MVP alone (Phases 1→2→3)
- **US2 (P2)**: builds on US1's module (same file); no dependency on US3
- **US3 (P2)**: fully independent (pricing catalog only) — shippable before the module UI exists (listing precedes feature, as with any add-on)

### Parallel Opportunities

- T002 ∥ T003 (different files) after T001
- Phase 2: T004→T005→T006 sequential (same subsystem); T007 ∥ T008 after T005/T006
- US3 entirely parallel with Phases 3–4 (pricing vs module files)
- Test files T010 ∥ T017

---

## Parallel Example: US1 tests + US3 tests first

```bash
# Draft failing tests before implementation:
Task: "T010 ActivitiesModule.test.tsx (fails)"
Task: "T017 pricing.test.ts (fails — key absent)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phases 1 → 2 → 3 (T001–T013)
2. **STOP & VALIDATE**: quickstart S1–S2 + gates green
3. Ship behind the module entitlement (hidden until a center enables it)

### Incremental Delivery

- +US2 (move/group) → full planner
- +US3 (commercial) → sellable
- Each checkpoint gates green; stop anywhere

### Notes

- US3 can land before US1 (catalog listing ahead of feature) — but the module key
  must exist (T001) before presets reference it
- Local D1 migration (T023) blocks handler tests and production, not UI work
- Convergence: if 001 ships first, its activities domain IS this domain — skip T004–
  T009 duplicates and reuse
