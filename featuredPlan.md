# Featured Plan — Crèche/Garderie center types, type-aware gating, Staff-lite, Activités & Compétences modules

> Status: approved 2026-09-23. This file is the reference for the feature spec in
> `specs/001-center-types-new-modules/`.

## Work items

- **A. New center types**: `crèche` and `garderie` join `jardin`/`formation` in the landing
  signup selector, demo-requests API, `CenterTenant.centerType`, Settings.
- **B. Field visibility**: hide « المستوى الدراسي » (grade) and « المؤسسة التعليمية »
  (establishment) in child registration for `crèche`/`jardin`; show for `garderie`/`formation`.
  Grade hidden app-wide (lists, cards, prints) for crèche/jardin.
- **C. Suivi quick actions**: hide the Notes Devoirs button and the timesheet view button in
  Suivi Scolaire for `crèche`/`jardin`; show them only for `garderie`/`formation`.
- **D. Module gating**: Cours Particuliers, Étude Surveillée, Révision Examens, Formations are
  hidden when type is `crèche`/`jardin` — sidebar, dashboard cards, and tab guards.
- **E. Staff-lite**: when a center enables Étude but has not paid for the Staff module, show a
  limited « إدارة الموظفين »: add/edit/delete staff profiles only. Bulletin de paie, avances,
  congés, and pointage (day timesheet) are locked behind the paid `staff` module.
- **F. Two new modules (Growth/Pro only)** — **Activités & Planning** (all center types) and
  **Compétences & Skills**:
  - Activités & Planning: weekly planner grid (per class or per location), category-colored
    chips (motricité / art / musique / jeu), weekday or date, start/end time, optional
    location + class, optional supervising staff. Location is free text until the deferred
    Salles & Espaces module ships, then migrates to a room reference.
  - Compétences & Skills: skill catalog per domain (langage / motricité / social / autonomie)
    with optional age ranges; per-child evaluations on a 4-level scale
    (non évalué / émergent / en cours / acquis) with evaluator + date; per-child radar/list
    view, per-class mastery heatmap; print/PDF report like bulletins.
  - Skills evaluator picker uses the same staff-selection logic as Étude; if the center has
    not paid for staff, the evaluator falls back to free-text name (consistent with E).
- **G. Plan gating**: both new modules are preset in `growth` and `pro` only; Basic (starter)
  excludes them. They appear on the landing pricing simulator and in Renouvellement
  (both render from the shared pricing catalog).

## Decision (validated with product owner)

`garderie` ≈ `formation` (grade + study modules visible); `crèche` ≈ `jardin` (nothing
school-level). Existing `jardin`/`formation` centers keep everything they paid for.

## Implementation phases

### Phase 1 — centerType plumbing (~2h)
- LandingPage `centerTypes` array += Crèche / Garderie options; state type widened.
- types.ts comment update; smoke test updated.

### Phase 2 — type-aware UI gating (~3h)
- New `src/utils/centerType.ts`: `hasSchoolLevel(t)` and `hasStudyModules(t)` helpers.
- StudentRegistration: wrap grade (~line 861) + établissement (~line 877) blocks and print
  view; `required` dropped when hidden.
- SuiviScolaire: wrap NotebookPen (~line 666) + Clock timesheet (~line 680) buttons; hide
  grade filter.
- App.tsx: exclude `module3/module4/module4b/formations` when `!hasStudyModules(centerType)`
  in menuItems (~line 869) + tab guard effect (~line 192); Dashboard type-check in the same
  filter.
- Cosmetic label pass on TimeSheetModal / StudentTimeSheetModule / BusDriverModule for the
  new types.

### Phase 3 — Staff-lite (~3h)
- App computes `staffLimited`; staff tab visible when `etude` enabled.
- StaffManagementModule: force profiles sub-tab, hide pointage (~line 742), replace
  payslip/advance/congé/schedule UI with a locked card → renewal tab button. CRUD unchanged.

### Phase 4 — Activités & Planning (~1 day)
- `ModuleKey += 'activites'`; `Activity` type (weekday/date, timeStart/End, category,
  location free text until Salles ships).
- `functions/api/activities.ts` (GET/PUT) on the formations.ts pattern via `_lib` state-bag
  helpers; `/api/activities` added to `_middleware.ts` ROUTES inventory.
- ActivitiesModule: weekly planner grid, category-colored chips, drag-move reusing the
  FormationScheduleModal pattern.
- pricing.ts ADDON entry (Shapes icon) + growth/pro presets → auto-appears on landing +
  renewal. TAB_MODULE + sidebar + Dashboard card.

### Phase 5 — Compétences & Skills (~1.5 days)
- `ModuleKey += 'competences'`; `Skill` (domain/label/age range) + `ChildSkill`
  (level 1–4, evaluatedBy, evaluatedAt).
- `functions/api/skills.ts` + `/api/child-skills` (GET/PUT), both in middleware inventory.
- CompetencesModule: catalog CRUD per domain, per-child evaluation (evaluator staff picker
  falls back to free text when staff unpaid — consistent with Phase 3), per-class heatmap,
  PDF print like bulletins.
- pricing.ts ADDON entry (Brain icon) + growth/pro presets; TAB_MODULE + sidebar + Dashboard
  card.

### Phase 6 — Tests & gates (~3h)
- centerType helper tests; smoke test for new types + `centerType:'creche'` request;
  middleware inventory test for the 2 new routes; staff-lite component test; study-tab
  gating test for crèche.
- `npm run lint` + `npm test` + `npm run build` all green.

## Out of scope (deferred)

- **Salles & Espaces** — activities use free-text `location`, migrate to `room_id` later.
- **Séances de rééducation** — no rééducation center type yet.
- Existing jardin/formation centers keep every module they paid for; only the new types
  change what is hidden.

## Order & effort

Phase 1→2 → 3 → 4 → 5 → 6; each phase ends green (lint/test/build) so work can stop after
any phase. Total ≈ 3–4 days.
