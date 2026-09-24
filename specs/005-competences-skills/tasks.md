---
description: "Task list for the 005-competences-skills feature"
---

# Tasks: Compétences & Skills Module

**Input**: Design documents from `/specs/005-competences-skills/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
contracts/skills-api.md ✅, quickstart.md ✅

**Tests**: Required — spec FR-014 / constitution Principle V; every story leads with
its failing-first tests.

**Organization**: By user story — US1 catalog (P1), US2 evaluations (P1), US3
heatmap + report (P2), US4 commercial (P2). US1+US2+US3 share the module file
(sequence edits); US4 is fully independent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependencies)
- **[Story]**: owning user story (US1–US4)
- Exact file paths in every task

## Path Conventions

Web app (per plan.md): `src/` (SPA) + `functions/api/` (Pages Functions); tests
co-located as `*.test.ts(x)`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type vocabulary + pure skills logic every story consumes.

- [ ] T001 In `src/types.ts`: add `'competences'` to the `ModuleKey` union and the `Skill` + `SkillEvaluation` interfaces exactly per data-model.md (`Skill`: id, centerId, domain enum langage|motricite|social|autonomie, label, ageFrom?, ageTo?, createdAt; `SkillEvaluation`: id, centerId, studentId, skillId, level enum non_evalue|emergent|en_cours|acquis, evaluatedByStaffId XOR evaluatedByName, evaluatedAt)
- [ ] T002 [P] Create `src/utils/skills.ts` with pure helpers: `validateSkill(s)` (label.trim() != '' AND domain ∈ enum AND ageFrom absent-or-≥0 AND ageTo absent-or-≥ageFrom), `LEVEL_COLORS` (non_evalue=neutral, emergent=amber, en_cours=sky, acquis=emerald), `evaluatorMode(staffEnabled: boolean)` → 'roster'|'freetext', `heatmapBuckets(children, skills)` (rows grouped by child class label, alphabetical, 'unassigned' last; columns in catalog order grouped by domain)
- [ ] T003 [P] Create `src/utils/skills.test.ts`: validateSkill truth table (each invalid branch incl. inverted age range + valid cases), LEVEL_COLORS completeness over the four levels, evaluatorMode both values, heatmapBuckets ordering/unassigned-last/no-mutation

**Checkpoint**: Pure logic exists and is fully tested; no wiring yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server domain + route inventory + client save plumbing — US1/US2/US3
need them; US4 does not.

**⚠️ CRITICAL**: The `skills` + `skill_evaluations` tables must exist in local D1
(admin-repo migration per constitution Principle I) before T007 runs.

- [ ] T004 Add `readSkills`/`writeSkills` to `functions/api/_lib.ts` following `readFormations`/`writeFormations`: SELECT/DELETE/INSERT on both tables (columns per data-model.md) all filtered/stamped by the session-derived `center_id`; write enforces the write-time rules verbatim — drop evaluations whose skillId is absent from the same write's catalog (cascade), drop evaluations whose studentId is not a child of the center, dedupe (studentId, skillId) pairs keeping the last occurrence, enforce exactly one of evaluatedByStaffId/evaluatedByName non-null
- [ ] T005 Create `functions/api/skills.ts` per contracts/skills-api.md: `onRequestGet` returns `{ catalog, evaluations }` (empty arrays when none); `onRequestPut` requires the document shape (400 otherwise), stamps server-side center_id, returns `{ ok: true }` / shared error envelope
- [ ] T006 Add `"/api/skills": ["GET", "PUT"]` to the `ROUTES` inventory in `functions/api/_middleware.ts` (same change as the handler — constitution Principle IV)
- [ ] T007 Create `functions/api/skills.test.ts`: foreign-center isolation both directions, unauthenticated rejection, wrong method → 405, cascade drop precision (removed skill's evaluations gone, others intact), foreign-studentId drop, evaluator XOR enforcement, pair dedupe latest-wins, 400 on invalid shape, payload centerId ignored
- [ ] T008 Extend `functions/api/_middleware.test.ts` expected inventory with `/api/skills` [GET, PUT]
- [ ] T009 Extend `src/api.ts` with `saveSkills(doc: { catalog: Skill[]; evaluations: SkillEvaluation[] }): Promise<void>` (PUT to relative `/api/skills`, matching the `saveFormations` helper pattern)

**Checkpoint**: Domain API live and isolation-tested (`npm run lint && npm test`).

---

## Phase 3: User Story 1 — Center maintains its skills catalog (Priority: P1) 🎯 MVP

**Goal**: Domain-grouped catalog with validated add/edit/remove and cascade removal.

**Independent Test**: Add skills in two domains, edit one, remove one (with
evaluations present) → catalog persists exactly, cascade precise.

### Tests for User Story 1 ⚠️

- [ ] T010 [P] [US1] Create `src/components/CompetencesModule.test.tsx`: catalog renders grouped under the four domains; submitting a skill with empty label or inverted age range is blocked (no save call); editing updates the entry; removing a skill removes it and its dependent evaluations from the saved document while unrelated evaluations persist

### Implementation for User Story 1

- [ ] T011 [US1] In `src/components/CompetencesModule.tsx` build the catalog manager: domain-grouped listing, add/edit dialog with fields per FR-002 (domain select, label required, optional ageFrom/ageTo in months validated by validateSkill with inline blocking message), remove with cascade applied to the local document before `onSave` (per FR-004), persistence via the `onSave` prop (App-side `commitDomain(() => saveSkills(doc))`)
- [ ] T012 [US1] In `src/App.tsx`: add skills-domain state (fetched with the domain data), `TAB_MODULE.competences = 'competences'`, sidebar entry `{ id: 'competences', label: 'المهارات والكفاءات', icon: Brain }`, render branch passing the domain document + `onSave` + staff list + staff-entitlement signal, guard fallback via the existing tab map (verify deep-link fallback)
- [ ] T013 [US1] In `src/components/Dashboard.tsx` add the quick-access card (tab 'competences', icon Brain, tile `bg-brand-600/10 text-brand-600`) filtered by the existing `isModuleAllowed` check

**Checkpoint**: US1 demoable end-to-end (quickstart S1) with gates green.

---

## Phase 4: User Story 2 — Staff evaluate children on skills (Priority: P1)

**Goal**: Per-child evaluations with four levels, evaluator (roster or free-text by
entitlement), editable date; latest-save-wins.

**Independent Test**: Evaluate a child on several skills in both entitlement modes →
all persist with level/evaluator/date; re-evaluation replaces all three.

### Tests for User Story 2 ⚠️

- [ ] T014 [P] [US2] Extend `src/components/CompetencesModule.test.tsx`: with staff-entitlement signal true — evaluator control is a roster select; with false — a free-text input; setting a level and saving invokes `onSave` with the evaluation (level, evaluator, today's date); re-evaluating the same child-skill replaces the previous entry (one current evaluation in the saved document); per-child view renders evaluated skills grouped by domain

### Implementation for User Story 2

- [ ] T015 [US2] In `src/components/CompetencesModule.tsx` build the per-child evaluation view: child selector, domain-grouped skill list with level control per skill (four-level enum via LEVEL_COLORS), evaluator control driven by `evaluatorMode(staffEntitled)` (roster select sourcing the same staff list as Étude, or free-text input — mutually exclusive per FR-006), date field defaulting to today and editable, save composing the document with the new evaluation replacing any existing pair (client mirror of R3 dedupe), all via `onSave`

**Checkpoint**: US1+US2 complete — the module's daily-use core (quickstart S2–S3).

---

## Phase 5: User Story 3 — Class mastery overview and printable report (Priority: P2)

**Goal**: Per-class heatmap with neutral empty cells + print-ready per-child report.

**Independent Test**: Heatmap reflects each child's levels grouped by class label
(unassigned last, neutral empties); report prints bulletin-style with an explicit
empty state.

### Tests for User Story 3 ⚠️

- [ ] T016 [P] [US3] Extend `src/components/CompetencesModule.test.tsx`: heatmap rows group children by class label (unassigned group last) with columns per catalog skill grouped by domain; a child with no evaluation for a skill renders a neutral cell (no level color); the print section renders the per-child report (domains → skills → level/evaluator/date) and an explicit empty state for a child with no evaluations

### Implementation for User Story 3

- [ ] T017 [US3] In `src/components/CompetencesModule.tsx` build the heatmap view using `heatmapBuckets` (rows = children by class label, columns = skills by domain, cells = LEVEL_COLORS with explicit neutral for unevaluated) — view-only, no `onSave` on render/toggle
- [ ] T018 [US3] In `src/components/CompetencesModule.tsx` add the print-ready per-child report as a state-toggled print-only section using the established print conventions (`.print-area` / `.no-print` per `src/index.css`): domains → skills with level, evaluator (roster-resolved name or free-text), date; explicit "no evaluations" empty state; visually consistent with the existing bulletin print styling

**Checkpoint**: US1–US3 complete — full module experience (quickstart S4).

---

## Phase 6: User Story 4 — Commercial availability (Priority: P2)

**Goal**: Module listed/purchasable on landing + renewal; Growth/Pro presets; hidden
without entitlement.

**Independent Test**: Simulator + renewal list it with price; Growth pre-selects,
Basic doesn't; base+module derives Growth; no entitlement → no nav trace.

### Tests for User Story 4 ⚠️

- [ ] T019 [P] [US4] Create `src/utils/pricing.test.ts` (extend if a pricing test file already exists — coordinate with 004's T017 if both land): ALL_MODULES contains key 'competences' with label/icon/description; PLAN_PRESET_MODULES.starter excludes 'competences'; growth and pro include it; derivePlanFromModules(base + competences) === 'growth', derivePlanFromModules(all) === 'pro'; LandingPage smoke test still green

### Implementation for User Story 4

- [ ] T020 [US4] In `src/utils/pricing.ts`: import `Brain` from lucide-react and append `{ key: 'competences', label: 'Compétences & Skills', icon: Brain, description: 'Catalogue de compétences et évaluations par enfant avec rapport imprimable.' }` to ALL_MODULES; add 'competences' to PLAN_PRESET_MODULES.growth and .pro only (starter untouched)
- [ ] T021 [US4] Verify (no code change expected) `src/components/RenewalModule.tsx` and the landing simulator render the new add-on from the shared catalog automatically; fix only if a hard-coded list bypasses ALL_MODULES

**Checkpoint**: All four stories complete (quickstart S5).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Sync wiring, edge-case verification, final gates.

- [ ] T022 [P] In `src/App.tsx` add the skills domain to the live-sync refetch key list (same mechanism as formations/events) so multi-session edits propagate (FR-013) — latest-save-wins then holds across sessions
- [ ] T023 [P] Verify edge cases per quickstart S6: deleted staff evaluator renders without breaking; module disable/re-enable retains data; two-session edit resolves to latest per pair
- [ ] T024 Run full quickstart.md: `npm run lint`, `npm test`, `npm run build` green; manually verify S1–S6
- [ ] T025 Confirm the admin-repo migration for `skills` + `skill_evaluations` (DDL per data-model.md) is scheduled — coordination item blocking production deploy only

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — start immediately
- **Phase 2 (Foundational)**: needs T001; blocks US1–US3 (API + save plumbing); US4 independent of it
- **Phase 3 (US1)**: needs Phases 1+2 — the MVP increment
- **Phase 4 (US2)**: needs Phase 3 (same module file — sequence after T011)
- **Phase 5 (US3)**: needs Phase 4 (renders evaluation data; same file)
- **Phase 6 (US4)**: needs only T001 (type) — can run in parallel with everything
- **Phase 7**: after target stories

### User Story Dependencies

- **US1 (P1)**: independent — MVP alone (Phases 1→2→3)
- **US2 (P1)**: builds on US1's module (same file); needs the staff-entitlement signal (App provides)
- **US3 (P2)**: builds on US2 (renders its data; same file)
- **US4 (P2)**: fully independent (pricing catalog only) — shippable before the module UI exists

### Parallel Opportunities

- T002 ∥ T003 (different files) after T001
- Phase 2: T004→T005→T006 sequential; T007 ∥ T008 after T005/T006
- US4 entirely parallel with Phases 3–5 (pricing vs module files)
- Test files T010 ∥ T019

---

## Parallel Example: US1 tests + US4 tests first

```bash
# Draft failing tests before implementation:
Task: "T010 CompetencesModule.test.tsx (fails)"
Task: "T019 pricing.test.ts (fails — key absent)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phases 1 → 2 → 3 (T001–T013)
2. **STOP & VALIDATE**: quickstart S1 + gates green
3. Ship behind the module entitlement (hidden until a center enables it)

### Incremental Delivery

- +US2 (evaluations) → daily-use core
- +US3 (heatmap/report) → outward-facing value
- +US4 (commercial) → sellable
- Each checkpoint gates green; stop anywhere

### Notes

- US4 can land before US1 (catalog listing ahead of feature) — module key (T001)
  must exist first; coordinate T019 with 004's T017 if both pricing test files land
- Local D1 migration (T025) blocks handler tests and production, not UI work
- Convergence: if 001 ships first, its skills domain IS this domain — skip T004–T009
  duplicates and reuse
- The staff-entitlement signal reuses feature 003's staff-lite derivation — if 003
  shipped, consume it; otherwise derive from enabledModules in App (same rule)
