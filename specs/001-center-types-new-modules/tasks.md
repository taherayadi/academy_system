---
description: "Task list for the 001-center-types-new-modules feature"
---

# Tasks: Center Types & New Modules (Crèche, Garderie, Activités, Compétences)

**Input**: Design documents from `/specs/001-center-types-new-modules/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
contracts/ ✅, quickstart.md ✅

**Tests**: Explicitly required — spec FR-032 / constitution Principle V make the
quality gates mandatory, and every story below includes its test-first tasks.

**Organization**: Tasks grouped by user story (US1–US8 from spec.md) so each story is
independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Owning user story (US1…US8)
- Exact file paths included in every task

## Path Conventions

Single-repository web app (per plan.md): `src/` (SPA) + `functions/api/` (Pages
Functions); tests co-located as `*.test.ts(x)` next to the code they cover.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New domain plumbing that every story touches, created once.

- [x] T001 Add `'activites' | 'competences'` to the `ModuleKey` union in `src/types.ts` and add the `Activity`, `Skill`, `SkillEvaluation` interfaces exactly per data-model.md (enums `category` = motricite|art|musique|jeu, `domain` = langage|motricite|social|autonomie, `level` = non_evalue|emergent|en_cours|acquis; `timeStart` < `timeEnd`; `evaluatedByStaffId` XOR `evaluatedByName`)
- [x] T002 [P] Create `src/utils/centerType.ts` exporting `hasSchoolLevel(type?: string): boolean` (true for 'garderie' and 'formation'), `hasStudyModules(type?: string): boolean` (true for 'garderie' and 'formation'), and `CENTER_TYPES` list with the four keys jardin|creche|garderie|formation — unknown/empty input returns true (legacy visibility, research R5)
- [x] T003 [P] Create `src/utils/centerType.test.ts` covering: both predicates true for garderie/formation, false for creche/jardin, true for undefined/empty/unknown values

**Checkpoint**: Type vocabulary + predicates exist and are tested; nothing user-visible yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server domain layer + route inventory — both new modules and several
stories depend on these. NO user story work before this phase completes.

**⚠️ CRITICAL**: The three D1 tables must exist in the environment (admin-repo
migration per constitution Principle I / research R2) before any handler test runs.

- [x] T004 Add `readActivities`/`writeActivities` and `readSkills`/`writeSkills` to `functions/api/_lib.ts` following the `readFormations`/`writeFormations` pattern: SELECT/DELETE/INSERT all filtered by `center_id` from the session-derived argument; skills write drops evaluations whose `skillId` is absent from the same write's catalog and drops evaluations with foreign-center `studentId` (data-model cascade rules)
- [x] T005 Create `functions/api/activities.ts` with `onRequestGet` (return caller center's activity array) and `onRequestPut` (array required else 400; stamp server-side `center_id`; drop invalid rows: empty title, category outside motricite|art|musique|jeu, `timeStart` >= `timeEnd`, weekday outside 0–6 with no date) per contracts/activities-api.md
- [x] T006 Create `functions/api/skills.ts` with `onRequestGet` (return `{ catalog, evaluations }` document) and `onRequestPut` (same shape required else 400; enforce `evaluatedByStaffId` XOR `evaluatedByName`; `ageFrom` <= `ageTo`; levels limited to non_evalue|emergent|en_cours|acquis) per contracts/skills-api.md
- [x] T007 Add `"/api/activities": ["GET", "PUT"]` and `"/api/skills": ["GET", "PUT"]` to the `ROUTES` inventory in `functions/api/_middleware.ts` (same change as handlers — constitution Principle IV)
- [x] T008 Create `functions/api/activities.test.ts`: foreign-center isolation both directions, unauthenticated rejection, wrong method → 405 via middleware, payload `centerId` ignored/stamped
- [x] T009 Create `functions/api/skills.test.ts`: isolation both directions, orphaned-evaluation cascade drop, foreign `studentId` drop, evaluator discriminator enforcement, 400 on non-array/invalid shape, wrong method → 405
- [x] T010 Extend `functions/api/_middleware.test.ts` expected inventory with the two new paths and their exact methods [GET, PUT]
- [x] T011 Extend `src/api.ts` with `saveActivities(activities)` and `saveSkills(doc)` PUT helpers matching the existing `saveFormations` pattern (relative same-origin `/api` URLs only)

**Checkpoint**: `curl`-testable domain APIs live behind auth with inventory + tests green (`npm run lint && npm test`).

---

## Phase 3: User Story 1 — Center signs up as Crèche or Garderie (Priority: P1) 🎯 MVP

**Goal**: Landing signup offers four establishment types and persists the choice.

**Independent Test**: Submit demo requests for each new type; stored request carries
`centerType: 'creche'` / `'garderie'`.

### Tests for User Story 1 ⚠️

- [ ] T012 [P] [US1] Extend `src/components/LandingPage.smoke.test.tsx`: type selector renders Crèche and Garderie options; submitting selects sends `centerType: 'creche'` in the demo-request payload; type-omitted submission still blocked

### Implementation for User Story 1

- [ ] T013 [US1] Add Crèche (`key: 'creche'`, label « Crèche », hint 'Petite enfance · 0–3 ans') and Garderie (`key: 'garderie'`, label « Garderie », hint 'Garderie périscolaire') to the `centerTypes` array (~line 348) and widen the `useState` generic at ~line 154 in `src/components/LandingPage.tsx` to include them
- [ ] T014 [US1] Update the `centerType` doc comment in `src/types.ts` (line ~35) to the four accepted values — no behavioral change

**Checkpoint**: US1 independently demoable on the landing page.

---

## Phase 4: User Story 2 — Registration form adapts to center type (Priority: P2)

**Goal**: Crèche/jardin centers never see school-level fields; garderie/formation
keep them; grade hidden app-wide for crèche/jardin.

**Independent Test**: Crèche/jardin session → registration renders zero school fields
and saves; student lists/cards/prints show no grade. Garderie/formation → unchanged.

### Tests for User Story 2 ⚠️

- [ ] T015 [P] [US2] Create `src/components/StudentRegistrationModule.test.tsx`: with `centerType='creche'` the form has no « المستوى الدراسي » / « المؤسسة التعليمية » fields and a save with empty grade succeeds; with `centerType='formation'` both render and grade is required

### Implementation for User Story 2

- [ ] T016 [US2] In `src/components/StudentRegistrationModule.tsx` accept a `centerType?: string` prop (passed from App.tsx render branch ~line 1132); wrap the grade select block (~line 861) and the établissement block (~line 877–910) in `{hasSchoolLevel(centerType) && (...)}`, making the grade `required` attribute conditional so hidden state submits
- [ ] T017 [US2] Gate grade display in StudentRegistration lists/cards (~line 629), student card print (~line 1583), registration print (~line 1763) and the sibling/academic-history grade lines with `hasSchoolLevel(centerType)` in `src/components/StudentRegistrationModule.tsx`
- [ ] T018 [US2] Gate the grade value in Suivi receipt print (~line 1216) and the grade filter select + `matchesGrade` logic (~lines 80, 149–162, 607, 859–865) with `hasSchoolLevel(centerType)` in `src/components/SuiviScolaireModule.tsx` (shared prop plumbing with T021)
- [ ] T019 [US2] In `src/components/Dashboard.tsx` no change needed for this story (verify only) — grade never appears on dashboard cards

**Checkpoint**: US2 + US1 demoable together; crèche center registration flow clean.

---

## Phase 5: User Story 3 — Suivi quick actions match type (Priority: P2)

**Goal**: Notes Devoirs + timesheet row icons only for garderie/formation.

**Independent Test**: Crèche session → no NotebookPen/Clock row icons; formation
session → both present and functional.

### Tests for User Story 3 ⚠️

- [ ] T020 [P] [US3] Create `src/components/SuiviScolaireModule.test.tsx`: `centerType='creche'` renders no row quick-action icons and no grade filter; `centerType='formation'` renders both icons (assert by title text « إدخال نقاط الفروض (Notes Devoirs) » and « عرض الجدول الزمني »)

### Implementation for User Story 3

- [ ] T021 [US3] In `src/components/SuiviScolaireModule.tsx` accept `centerType` prop from App.tsx (~line 1249 region); wrap the NotebookPen button block (~lines 664–678) and the Clock button/disabled placeholder pair (~lines 679–697) in `{hasSchoolLevel(centerType) && (...)}`
- [ ] T022 [US3] Hide the grade filter select (~line 607) for non-school types (completes T018's filter half; same guard)

**Checkpoint**: Suivi table fully type-aware; US2+US3 share the prop plumbing.

---

## Phase 6: User Story 4 — Study modules only for garderie/formation (Priority: P2)

**Goal**: The four study tabs absent from nav/dashboard for crèche/jardin; deep links
fall back to dashboard.

**Independent Test**: Crèche session → four tabs nowhere; stale tab id → dashboard.
Formation session → all four work.

### Tests for User Story 4 ⚠️

- [ ] T023 [P] [US4] Create `src/App.typeGating.test.tsx`: with center `centerType='creche'` the rendered sidebar contains none of the four study labels (« الدروس الخصوصية », « تأطير Étude », « حصة مراجعة », « التكوينات والدورات »); with `centerType='formation'` all four appear

### Implementation for User Story 4

- [ ] T024 [US4] In `src/App.tsx`: add `const hasStudy = hasStudyModules(currentCenter?.centerType)`; extend the restricted-modules guard effect (~line 192) and the `menuItems` array (~lines 869–872) so `module3`/`module4`/`module4b`/`formations` are excluded when `!hasStudy` (existing `hasCenterModule` then still applies on top)
- [ ] T025 [US4] In `src/components/Dashboard.tsx` (~line 37) filter the four study quick-access cards with the same `hasStudyModules(centerType)` predicate in addition to the existing `isModuleAllowed` check

**Checkpoint**: Type gating complete across nav surfaces; combined with US1–US3 a crèche sees zero school artifacts.

---

## Phase 7: User Story 8 — Plan gating for the new modules (Priority: P2)

**Goal**: Both new modules listed as add-ons; Growth/Pro presets include them;
starter doesn't; plan derivation unaffected.

**Independent Test**: Simulator + renewal show both modules; presets match
FR-028; toggling updates derived plan per FR-029.

### Tests for User Story 8 ⚠️

- [ ] T026 [P] [US8] Extend pricing tests (`src/utils/pricing.test.ts` — create if absent): `ALL_MODULES` contains keys 'activites' and 'competences'; `PLAN_PRESET_MODULES.starter` excludes both; growth and pro include both; `derivePlanFromModules(base + both)` === 'growth' and `derivePlanFromModules(all)` === 'pro'; `LandingPage.smoke.test.tsx` pricing section still passes

### Implementation for User Story 8

- [ ] T027 [US8] In `src/utils/pricing.ts`: append `{ key: 'activites', label: 'Activités & Planning', icon: Shapes, description: 'Planning hebdomadaire des activités : motricité, art, musique, jeu.' }` and `{ key: 'competences', label: 'Compétences & Skills', icon: Brain, description: 'Catalogue de compétences et évaluations par enfant avec rapport imprimable.' }` to `ALL_MODULES` (import `Shapes`, `Brain` from lucide-react — verified present); add both keys to `PLAN_PRESET_MODULES.growth` and `.pro` only (starter untouched)
- [ ] T028 [US8] Verify (no code change expected) that `src/components/RenewalModule.tsx` renders the two new add-ons from the shared catalog (~lines 287–294) and the landing simulator picks them up automatically via `ALL_MODULES` — fix only if a hard-coded list exists

**Checkpoint**: Commercial surface correct before the in-app modules land (landing/renewal can list them ahead of US6/US7).

---

## Phase 8: User Story 5 — Staff-lite unlock (Priority: P3)

**Goal**: Étude-without-Staff centers get add/edit/delete staff only; payroll
surfaces locked with renewal prompt.

**Independent Test**: Center with etude, without staff → staff tab visible, CRUD
works, pointage/payslip/avance/congé unreachable. Staff-enabled center → unchanged.

### Tests for User Story 5 ⚠️

- [ ] T029 [P] [US5] Create `src/components/StaffManagementModule.test.tsx`: with `staffLite` true — pointage sub-tab absent, payslip/advance/congé/schedule surfaces replaced by an upgrade card whose button requests the renewal tab, staff add/edit/delete controls present; with `staffLite` false — pointage sub-tab present

### Implementation for User Story 5

- [ ] T030 [US5] In `src/App.tsx`: compute `const staffLite = !centerModuleKeys.includes('staff')` and make the staff sidebar entry (~line 876) visible when `currentCenter?.enabledModules` includes 'etude' OR 'staff'; pass `staffLite` into the StaffManagementModule render branch (~line 1280 region) — the existing `hasCenterModule('module8')` gate now admits etude-only centers, and the tab-guard effect must whitelist 'module8' for etude-only centers
- [ ] T031 [US5] In `src/components/StaffManagementModule.tsx`: accept `staffLite?: boolean`; when true force `activeSubTab='profiles'`, hide the pointage sub-tab button (~line 742) and the `activeSubTab === 'pointage'` branch (~line 1132); in the profiles detail view hide payslip generation (~line 193+), advances, congés and schedule sections behind the same flag, rendering a locked-feature card (« فعّل وحدة Personnel & Salaires من التجديد ») whose button calls `setActiveTab('renewal')` (thread a new `onGoToRenewal` prop from App.tsx)

**Checkpoint**: US5 independently testable; existing staff centers regression-safe via T029.

---

## Phase 9: User Story 6 — Activités & Planning module (Priority: P3)

**Goal**: Weekly planner module for all center types, registered end-to-end.

**Independent Test**: Enable module → create/move activities across categories and
days → persists after reload; grouping class ↔ location works.

### Tests for User Story 6 ⚠️

- [ ] T032 [P] [US6] Create `src/components/ActivitiesModule.test.tsx`: rendering an activity places a chip in the correct day column; category values map to the four color classes; grouping toggle re-chunks activities; add form requires title/category/weekday/times per FR-015

### Implementation for User Story 6

- [ ] T033 [US6] Create `src/components/ActivitiesModule.tsx`: weekly grid (columns Lun–Dim or date mode, half-hour row bands per research R7), category-colored chips (motricite|art|musique|jeu), create/edit dialog with fields exactly per FR-015 (title required, category required, weekday-or-date, `timeStart` < `timeEnd`, optional location/levelClass/staffId), HTML5 drag-to-move with click-to-move fallback, grouping toggle per `levelClass` vs per `location`; local state follows the existing save-on-change pattern (`commitDomain` style) wired to `saveActivities` from T011
- [ ] T034 [US6] Register the module in `src/App.tsx`: `TAB_MODULE.activites = 'activites'`, sidebar entry `{ id: 'activites', label: 'الأنشطة والبرنامج', icon: Shapes }` (visible via existing `hasCenterModule` gate), render branch passing activities state + setter (sync key added in T040), fallback-guard coverage automatic via `TAB_MODULE`
- [ ] T035 [US6] Add the dashboard card in `src/components/Dashboard.tsx` (icon Shapes, tile `bg-brand-600/10 text-brand-600`, tab 'activites') filtered by `isModuleAllowed`

**Checkpoint**: US6 fully functional for enabled centers; hidden for others.

---

## Phase 10: User Story 7 — Compétences & Skills module (Priority: P3)

**Goal**: Skill catalog + child evaluations + heatmap + printable report.

**Independent Test**: Enable module → manage catalog → evaluate child (roster picker
or free-text by staff entitlement) → heatmap → print report.

### Tests for User Story 7 ⚠️

- [ ] T036 [P] [US7] Create `src/components/CompetencesModule.test.tsx`: catalog CRUD groups by the four domains; evaluator picker renders roster select when staff enabled vs free-text input when not (FR-023); level values restricted to the four-level enum; heatmap cells aggregate evaluations; print section renders per-child report

### Implementation for User Story 7

- [ ] T037 [US7] Create `src/components/CompetencesModule.tsx`: domain-grouped catalog manager (add/edit/remove, optional ageFrom/ageTo with `ageFrom` <= `ageTo`), per-child evaluation view storing level enum + evaluator (staff select sourced like Étude's supervising-staff picker when staff enabled, else free-text name — discriminated fields per data-model) + `evaluatedAt` date, per-class mastery heatmap grid, print-only A4 report section reusing the bulletin print CSS patterns (research R8); persistence via `saveSkills` from T011
- [ ] T038 [US7] Register the module in `src/App.tsx`: `TAB_MODULE.competences = 'competences'`, sidebar entry `{ id: 'competences', label: 'المهارات والكفاءات', icon: Brain }`, render branch with state + setter (sync key in T040)
- [ ] T039 [US7] Add the dashboard card in `src/components/Dashboard.tsx` (icon Brain, tab 'competences') filtered by `isModuleAllowed`

**Checkpoint**: US7 independently complete; both new modules demoable end-to-end.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Sync wiring, cosmetic type labels, final verification.

- [ ] T040 [P] In `src/App.tsx` add `activities` and `skills` to the state fetch/save wiring and the live-sync refetch key list (same mechanism as formations/events) so plan/module changes and multi-session edits propagate
- [ ] T041 [P] Cosmetic pass: in `src/components/StudentTimeSheetModule.tsx` and `src/components/TimeSheetModal.tsx` extend `centerType === 'jardin'` label branches to include 'creche' (crèche reads the jardin wording); BusDriverModule untouched except verifying no school-only copy assumes formation
- [ ] T042 Run full quickstart.md: `npm run lint`, `npm test`, `npm run build` all green; manually verify scenarios S1–S8 including legacy-center regression (empty centerType keeps everything visible)
- [ ] T043 Confirm the admin repository migration for `activities`, `skills`, `skill_evaluations` (DDL per data-model.md) is scheduled — coordination item, blocking production deploy only

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none → start immediately
- **Phase 2 (Foundational)**: needs T001 (types) — **blocks all API-bearing stories**
- **Phases 3–7 (US1–US4, US8)**: need Phase 1; US2/US3 need only the predicates (T002); US4 needs T002; US8 needs only T001+T027 — all independent of Phase 2 EXCEPT none require it (pure frontend) → can run while Phase 2 lands
- **Phases 8–10 (US5–US7)**: US5 needs App wiring context (T024 helps but not required); US6 needs T005/T011 (activities API) + T034 sync; US7 needs T006/T011 (skills API)
- **Phase 11**: after all target stories

### User Story Dependencies

- **US1 (P1)**: independent — MVP alone
- **US2, US3 (P2)**: independent of each other (share prop plumbing — do sequentially in one pass); need US1's types only via T002
- **US4 (P2)**: independent; completes type-gating matrix
- **US8 (P2)**: fully independent — pure catalog data
- **US5 (P3)**: independent of US6/US7; US7's evaluator picker reads the US5 staff-entitlement signal
- **US6 (P3)**: needs activities API (Phase 2)
- **US7 (P3)**: needs skills API (Phase 2) + US5's staff-lite signal for the evaluator picker

### Within Each Story

Tests first (fail) → component/module implementation → App/Dashboard registration → checkpoint validation.

### Parallel Opportunities

- Phase 1: T002 ∥ T003-group with T001 (different files)
- Phase 2: T005 ∥ T006 (separate handlers) after T004; T008 ∥ T009 ∥ T010
- US phases: US1 ∥ US4 ∥ US8 entirely; US2+US3 sequential pair; US5 ∥ US6 ∥ US7
- Test files (T012, T015, T020, T023, T026, T029, T032, T036) all [P]

---

## Parallel Example: User Story 1 / US8

```bash
# Both are frontend-only and independent:
Task: "T012 LandingPage.smoke.test.tsx extension (fails first)"
Task: "T013 LandingPage.tsx centerTypes array"
Task: "T026 pricing tests"
Task: "T027 pricing.ts catalog entries"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phases 1 → 3 (T001–T003, T012–T014)
2. **STOP & VALIDATE**: signup carries crèche/garderie; gates green
3. Ship as the first increment

### Incremental Delivery

- +US2/US3/US4 (type-aware app) → +US8 (commercial listing) → +US5 (staff-lite) → +US6/US7 (new modules, need admin migration live)
- Each checkpoint = independently demoable increment; stop anywhere

### Notes

- Admin-repo DDL (T043) gates production, not development — handler tests run on local D1 with the migration applied
- Verify tests fail before implementing (Principle V)
- Commit after each checkpoint
