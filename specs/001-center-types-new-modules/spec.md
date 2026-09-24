# Feature Specification: Center Types & New Modules (Crèche, Garderie, Activités, Compétences)

**Feature Branch**: `001-center-types-new-modules`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Return to featuredPlan.md and produce the specification for it:
add Crèche and Garderie center types; hide school-level fields (grade, establishment) and
Suivi quick actions (exam notes, timesheet) for crèche/jardin; restrict the four study modules
(cours particulier, étude surveillée, révision examens, formations) to garderie/formation;
unlock a limited Staff module (add/edit/delete only) for centers that enabled Étude without
paying for Staff; add two Growth/Pro modules — Activités & Planning (all center types) and
Compétences & Skills — listed on the landing page and in Renouvellement."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Center signs up as Crèche or Garderie (Priority: P1)

A prospective center owner opens the public landing page, starts a demo/trial request, and
selects their establishment type. Alongside the existing « Jardin d'enfant » and « Centre de
formation » choices, two new types are offered: « Crèche » (petite enfance, 0–3 ans) and
« Garderie » (garderie périscolaire). The chosen type is carried through the request and
becomes the center's type once provisioned, exactly like the existing types today.

**Why this priority**: Every other story keys off the center's type — without new types
existing and persisting, no visibility rule can apply.

**Independent Test**: Submit a demo request selecting « Crèche » and verify the stored
request records the crèche type; repeat for « Garderie ». Fully testable against the landing
page and the demo-request record alone.

**Acceptance Scenarios**:

1. **Given** the landing page signup form, **When** the user opens the establishment-type
   selector, **Then** four options are offered: Jardin d'enfant, Crèche, Garderie, Centre de
   formation — each with a short descriptive hint.
2. **Given** the user selects « Crèche » (or « Garderie ») and submits a valid request,
   **When** the request is recorded, **Then** the stored request carries the selected type.
3. **Given** the user submits without selecting any type, **When** the form is validated,
   **Then** submission is blocked with the existing "type required" message (behavior
   unchanged for the new options).

---

### User Story 2 - Registration form adapts to the center type (Priority: P2)

A staff member of a **crèche** or **jardin** registers a new child. The school-level fields —
« المستوى الدراسي » (grade, required today) and « المؤسسة التعليمية » (establishment) — do
not appear at all, and the form submits successfully without them. For **garderie** and
**formation** centers, both fields appear and behave exactly as today (grade required).
The grade must also disappear everywhere else it surfaces for crèche/jardin: student lists,
student cards, registration printouts, and filters.

**Why this priority**: This is the most visible daily-usage improvement for the new segment
and the core of the "crèche is not a school" requirement; P2 because it depends on the type
existing (Story 1) but delivers independent user value once it does.

**Independent Test**: With a center typed crèche, open child registration and confirm zero
school-level fields render and a child can be saved with empty grade; with a center typed
garderie, confirm both fields render and grade remains required.

**Acceptance Scenarios**:

1. **Given** a crèche or jardin center, **When** the add/edit child form opens, **Then** no
   « المستوى الدراسي » field and no « المؤسسة التعليمية » field are rendered.
2. **Given** a crèche or jardin center, **When** a child is submitted with every visible
   required field filled (grade/establishment absent), **Then** the child is saved
   successfully.
3. **Given** a garderie or formation center, **When** the add/edit child form opens,
   **Then** « المستوى الدراسي » and « المؤسسة التعليمية » render as today, with grade still
   mandatory.
4. **Given** a crèche/jardin center with registered children, **When** browsing student
   lists, student cards, and registration print views, **Then** no grade value or grade
   label is displayed, and no grade filter is offered.

---

### User Story 3 - Suivi quick actions match the center type (Priority: P2)

In the academic follow-up list (Suivi Scolaire), each student row today shows per-row quick
actions: entering exam/homework notes (Notes Devoirs) and viewing the student's weekly
timesheet. For **crèche** and **jardin** centers these two icons are hidden — those centers
do not run exams or weekly school timetables. For **garderie** and **formation** they remain
exactly as today.

**Why this priority**: Directly requested; small surface, high coherence gain for the new
types. Same dependency tier as Story 2.

**Independent Test**: Open the follow-up module as a crèche center and confirm neither the
notes icon nor the timesheet icon appears on any row; repeat as a formation center and
confirm both appear and function.

**Acceptance Scenarios**:

1. **Given** a crèche or jardin center, **When** the Suivi Scolaire student table renders,
   **Then** no row shows the Notes Devoirs icon or the timesheet view icon.
2. **Given** a garderie or formation center, **When** the table renders, **Then** both icons
   appear per row and open their existing dialogs unchanged.
3. **Given** a crèche or jardin center, **When** the follow-up list filter bar renders,
   **Then** no grade filter is offered.

---

### User Story 4 - Study modules only for garderie/formation (Priority: P2)

The four study-style modules — Cours Particuliers, Étude Surveillée, Révision Examens,
Formations — are meaningful only for centers doing school support. For **crèche** and
**jardin** centers they are absent everywhere: sidebar navigation, dashboard quick-access
cards, and direct navigation is prevented (a stale link or notification cannot open them).
Existing centers of type jardin/formation keep them as today.

**Why this priority**: Prevents crèches from seeing (and paying confusion about) modules
they can never use; completes the type-aware model.

**Independent Test**: Log into a crèche center and verify the four tabs appear nowhere and
deep-links to them fall back to the dashboard; log into a formation center and verify all
four remain usable.

**Acceptance Scenarios**:

1. **Given** a crèche or jardin center, **When** the sidebar renders, **Then** none of the
   four study modules appear in navigation.
2. **Given** a crèche or jardin center, **When** the dashboard renders, **Then** no
   quick-access card for the four study modules is shown.
3. **Given** a crèche or jardin center, **When** the user attempts to open one of the four
   study modules (e.g., via a stale bookmark), **Then** the app lands on the dashboard
   instead of the module.
4. **Given** a garderie or formation center with the modules enabled, **When** navigating,
   **Then** all four modules behave exactly as before this feature.

---

### User Story 5 - Staff-lite unlock for Étude centers (Priority: P3)

A center enables Étude Surveillée but has **not** purchased the Staff module. To supervise
étude sessions they still need a staff roster, so the Staff module (« إدارة الموظفين »)
becomes visible with a limited profile: adding, editing, and deleting staff members works
normally, but the paid features — payslip generation (bulletin de paie), salary advances
(avances), leave requests (congés), and daily staff timesheet pointage — are locked and
presented as upgrade prompts pointing to the renewal module. Centers that **have** paid for
Staff see everything exactly as today.

**Why this priority**: A monetization-relevant unlock that depends on Stories 1–4 being
stable; it changes an existing module's behavior, so it ships after the type work.

**Independent Test**: Simulate a center with étude enabled and staff not purchased: verify
the staff module opens, CRUD on staff members succeeds, and every payslip/advance/congé/
pointage surface is replaced by an upgrade prompt linking to renewal. Then verify a
staff-enabled center sees no change.

**Acceptance Scenarios**:

1. **Given** a center with étude enabled and staff not purchased, **When** the sidebar
   renders, **Then** « إدارة الموظفين » is visible.
2. **Given** that same center, **When** opening the staff module, **Then** only the staff
   profiles view is reachable (the daily pointage view is not offered).
3. **Given** that same center, **When** adding, editing, or deleting a staff member,
   **Then** the operations succeed and persist as normal.
4. **Given** that same center, **When** browsing a staff member's detail, **Then** the
   payslip, advance, leave, and schedule features are not operable and an upgrade prompt is
   shown directing the user to the renewal module.
5. **Given** a center with the Staff module purchased, **When** using the staff module,
   **Then** all features (payslips, advances, congés, pointage) work exactly as before.

---

### User Story 6 - Activités & Planning module (Priority: P3)

Any center (all four types) can enable the new « Activités & Planning » module from the
subscription simulator on the landing page or from the renewal module in-app. Inside the
app it provides a weekly planner: activities are created with a title, a category
(motricité, art, musique, jeu), a weekday or a specific date, a start and end time, an
optional free-text location (room/space), an optional class/level label, and an optional
supervising staff member. The planner shows the week as a grid (columns = days, rows = time
slots) with color-coded activity chips per category, switchable between "per class" and
"per location" grouping, and activities can be moved between slots.

**Why this priority**: First of the two revenue-expanding modules; independent of the
Skills module but shares the same infrastructure steps, so it ships first.

**Independent Test**: Enable the module for a trial center, create activities across
categories and days, move one to another slot, group by class and by location, and verify
the grid reflects every change after a reload.

**Acceptance Scenarios**:

1. **Given** a center without the module, **When** browsing the landing pricing simulator
   or the in-app renewal module, **Then** « Activités & Planning » is listed as an
   selectable module with its price.
2. **Given** a center with the module enabled, **When** the sidebar renders, **Then** the
   module appears in navigation and on the dashboard.
3. **Given** the module open, **When** creating an activity with title, category, weekday,
   and time range, **Then** it appears as a color-coded chip in the correct day/slot cell.
4. **Given** an existing activity, **When** moving it to a different day/slot, **Then** the
   change persists and survives a page reload.
5. **Given** activities with location and class labels set, **When** switching the planner
   between "per class" and "per location" grouping, **Then** the grid regroups accordingly.
6. **Given** a center without the module enabled, **When** the sidebar renders, **Then**
   the module is not offered in navigation.

---

### User Story 7 - Compétences & Skills module (Priority: P3)

Centers on Growth or Pro can enable the « Compétences & Skills » module. Staff maintain a
catalog of skills organized by domain (langage, motricité, social, autonomie), each with a
label and an optional age range. For each child, staff record skill evaluations on a
four-level scale (non évalué, émergent, en cours, acquis) with the evaluator and evaluation
date. The module offers a per-child view (list/radar of evaluated skills) and a per-class
mastery heatmap, plus a printable report in the same style as existing student bulletins.
The evaluator is picked from the staff roster using the same selection logic as the Étude
module; if the center has not purchased Staff, the evaluator is entered as free text
(consistent with the Staff-lite rule).

**Why this priority**: Completes the competitor-parity set for the new segment; depends on
the same enabling infrastructure as Story 6 and on the Staff-lite decision for the
evaluator picker.

**Independent Test**: Enable the module, add skills in two domains, evaluate a child on
several skills with different levels, open the class heatmap, and print the child's report.

**Acceptance Scenarios**:

1. **Given** a center with the module enabled, **When** opening it, **Then** the skill
   catalog is presented grouped by the four domains and skills can be added, edited, and
   removed.
2. **Given** a skill catalog, **When** evaluating a child, **Then** each skill can be set
   to one of the four levels with evaluator and date recorded.
3. **Given** the evaluator picker, **When** the center has purchased Staff, **Then**
   evaluators are chosen from the staff roster; **when** Staff is not purchased, **then** a
   free-text evaluator name is accepted instead.
4. **Given** a class with evaluated children, **When** the heatmap view opens, **Then**
   mastery per skill is summarized per child and per class.
5. **Given** an evaluated child, **When** the report is printed, **Then** a print-ready
   skills report is produced in the same visual style as the existing bulletins.
6. **Given** a center without the module enabled, **When** the sidebar renders, **Then**
   the module is not offered in navigation.

---

### User Story 8 - Plan gating for the new modules (Priority: P2)

The two new modules are positioned as Growth/Pro features. On the landing pricing
simulator and in the renewal module, selecting only the base modules maps to Basic;
adding Activités and/or Compétences participates in the plan calculation exactly like the
existing add-on modules, and both are pre-selected in the Growth and Pro plan presets but
never in Basic. Centers can still fine-tune module selection manually, as today.

**Why this priority**: Commercial correctness of the two new modules — needed for launch
but independent of the in-app module UX.

**Independent Test**: Load the pricing simulator: verify both modules appear as add-ons,
that the Growth preset includes both, the Basic preset includes neither, and the plan
label/price updates as they are toggled.

**Acceptance Scenarios**:

1. **Given** the landing pricing simulator, **When** it renders, **Then** both new modules
   appear among the selectable add-on modules with labels, icons, descriptions, and prices.
2. **Given** the Growth plan preset, **When** applied, **Then** both new modules are
   pre-selected; **given** the Basic preset, **when** applied, **then** neither is selected.
3. **Given** a selection consisting of base modules plus only the new modules, **When** the
   plan is derived, **Then** the result maps to Growth (not Basic), consistent with the
   existing derive-from-modules rule.
4. **Given** the renewal module in-app, **When** it renders, **Then** the same catalog and
   presets are shown (single shared source of truth).

---

### Edge Cases

- What happens when an existing center's type is unknown/legacy (empty type)? → All
  school-level fields and study modules remain visible (today's behavior); only explicit
  crèche/jardin types hide content. No existing center loses functionality.
- What happens when a crèche child record was imported with a grade value from a previous
  setup? → The value stays stored (never destroyed) but is not displayed anywhere in the
  app while the center is typed crèche/jardin.
- What happens when a center's modules change while a user is logged in (renewal processed
  mid-session)? → Existing live-sync behavior applies: the session refetches state and the
  newly disabled module tabs fall back to the dashboard, as they already do today.
- What happens when an activity is moved onto a slot occupied by another activity? → Both
  may coexist in the same cell (no forced conflict resolution in v1); overlap is visible.
- What happens when a skill is deleted after children were evaluated on it? → Evaluations
  referencing the removed skill are no longer displayed; the child's other evaluations and
  summaries remain intact.
- What happens when an activity references a staff member who is later deleted? → The
  activity keeps its other data and renders without the supervisor name.
- What happens when both Activités and Compétences are enabled but the center is on Basic
  (downgrade after enabling)? → The modules disappear from navigation on next sync, exactly
  like existing module downgrades; data is retained, not deleted.

## Requirements *(mandatory)*

### Functional Requirements

**Center types**

- **FR-001**: The signup type selector MUST offer exactly four establishment types:
  Jardin d'enfant, Crèche, Garderie, Centre de formation.
- **FR-002**: The selected type MUST be transmitted with the signup request and persisted
  as the center's type.
- **FR-003**: The system MUST treat the four types as the complete set of known center
  types; any other/empty value MUST behave as today (everything visible).

**Type-aware field visibility**

- **FR-004**: For crèche and jardin centers, the child registration form MUST NOT render
  the grade field (« المستوى الدراسي ») nor the establishment field (« المؤسسة التعليمية »),
  and MUST NOT require them for submission.
- **FR-005**: For garderie and formation centers, both fields MUST render and grade MUST
  remain mandatory (unchanged behavior).
- **FR-006**: For crèche and jardin centers, the application MUST NOT display grade values
  or grade labels in student lists, student cards, print views, or offer grade-based
  filters; stored data MUST NOT be deleted or overwritten by this hiding.
- **FR-007**: For crèche and jardin centers, the Suivi Scolaire row actions MUST NOT include
  the Notes Devoirs (exam/homework notes) action or the student timesheet view action.
- **FR-008**: For garderie and formation centers, all Suivi Scolaire row actions MUST remain
  unchanged.
- **FR-009**: For crèche and jardin centers, the four study modules (Cours Particuliers,
  Étude Surveillée, Révision Examens, Formations) MUST be absent from navigation and
  dashboard, and direct access attempts MUST fall back to the dashboard.
- **FR-010**: The type-based visibility rules MUST apply consistently across desktop and
  mobile navigation.

**Staff-lite**

- **FR-011**: A center with Étude enabled and Staff not purchased MUST see the staff module
  in navigation with add/edit/delete of staff members fully functional.
- **FR-012**: For such centers, payslip generation, salary advances, leave management, and
  daily staff pointage MUST be locked: not operable, with an upgrade prompt pointing to the
  renewal module.
- **FR-013**: Centers with Staff purchased MUST experience no change whatsoever.
- **FR-014**: The limited staff module MUST NOT allow any payslip, advance, or leave data
  to be created or modified.

**Activités & Planning**

- **FR-015**: The module MUST let users create an activity with: title (required),
  category among motricité/art/musique/jeu (required), weekday or specific date (required),
  start and end time (required), optional free-text location, optional class/level label,
  optional supervising staff member.
- **FR-016**: The module MUST render a weekly grid (days as columns, time as rows) with
  category-colored activity chips and MUST support moving an activity to another slot with
  the change persisted.
- **FR-017**: The module MUST support grouping the planner per class label and per
  location.
- **FR-018**: The module MUST be listed in the landing pricing simulator and the in-app
  renewal module, driven by the shared module catalog.
- **FR-019**: The module MUST be available to centers of every type.
- **FR-020**: Module data MUST be scoped to the connected center only — never readable or
  writable by another center.

**Compétences & Skills**

- **FR-021**: The module MUST let users manage a skill catalog with domains
  langage/motricité/social/autonomie, a label, and an optional age range, with
  add/edit/remove.
- **FR-022**: The module MUST let users evaluate a child on a catalog skill with one of
  four levels (non évalué, émergent, en cours, acquis), recording evaluator and evaluation
  date.
- **FR-023**: The evaluator MUST be selectable from the staff roster when Staff is
  purchased; otherwise a free-text evaluator name MUST be accepted.
- **FR-024**: The module MUST provide a per-child evaluation view and a per-class mastery
  heatmap.
- **FR-025**: The module MUST provide a printable per-child report consistent with the
  existing bulletin print styling.
- **FR-026**: The module MUST be listed in the landing pricing simulator and the in-app
  renewal module, driven by the shared module catalog.
- **FR-027**: Module data MUST be scoped to the connected center only.

**Plan gating**

- **FR-028**: Both new modules MUST be included in the Growth and Pro plan presets and
  MUST NOT be included in the Basic preset.
- **FR-029**: Toggling the new modules in the simulator/renewal MUST update the derived
  plan and price under the existing rules (base only → Basic; any add-on → Growth; all
  modules → Pro).
- **FR-030**: Existing modules' pricing, labels, and presets MUST remain unchanged.

**Cross-cutting**

- **FR-031**: Every new data-access capability introduced by this feature MUST enforce the
  same access contract as existing modules: authenticated context, scoped to the connected
  center, and unreachable through any unlisted access path (existing contract-surface rule).
- **FR-032**: All existing automated quality gates MUST pass with the feature integrated.

### Key Entities *(include if feature involves data)*

- **Center**: An establishment tenant; gains a **type** attribute with four known values
  (jardin, crèche, garderie, formation), an enabled-module list, and a subscription plan.
  Type drives field/module visibility; plan drives module availability.
- **Child (Student)**: A registered child of a center; keeps existing attributes including
  optional grade and establishment, which remain stored but hidden for crèche/jardin types.
- **Activity**: A planned activity of a center: title, category (motricité/art/musique/
  jeu), weekday-or-date, start/end time, optional location (free text in v1), optional
  class label, optional supervising staff reference.
- **Skill**: A catalog entry of a center: domain (langage/motricité/social/autonomie),
  label, optional age range (from/to).
- **SkillEvaluation**: A child's level on a skill: four-level scale, evaluator (staff
  reference or free-text name when Staff not purchased), evaluation date.
- **StaffMember**: Existing staff entity; unchanged, but its payroll-related features
  (payslips, advances, leave, pointage) become conditional on the Staff module purchase.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A crèche center completes a child registration without encountering a single
  school-level field, in the same number of steps as a garderie center filling its form
  today (no added friction from the type adaptation).
- **SC-002**: 100% of type-based visibility rules hold on both navigation surfaces
  (sidebar + dashboard): zero study-module entries visible for crèche/jardin, zero
  school-level fields in registration/lists/prints for crèche/jardin.
- **SC-003**: A crèche/jardin center's hidden data is provably preserved: existing records
  keep their stored grade/establishment values intact after the feature ships (no data
  loss in upgrade testing).
- **SC-004**: An Étude-only center can add a staff member and be supervised-productive
  without Staff purchased, and 100% of payroll features are shown as locked with a renewal
  path — while a Staff center shows zero behavioral change.
- **SC-005**: Both new modules are enabled, planned/evaluated in, and printable within a
  single session by a first-time user (activity created and moved in the planner; skill
  evaluated and report printed) without documentation.
- **SC-006**: The pricing simulator and renewal module always agree (single catalog
  source): the two modules appear identically on both surfaces with identical
  prices/presets.
- **SC-007**: All existing automated checks pass unchanged where behavior is untouched,
  every new rule is covered by new checks, and the complete quality-gate suite passes at
  feature completion.

## Assumptions

- **Garderie ≈ formation, crèche ≈ jardin**: the product owner validated that garderie
  centers show school-level fields and study modules, while crèche behaves like jardin
  (nothing school-level). One-line constant changes reverse this if needed.
- **Four-level skill scale** (non évalué / émergent / en cours / acquis) and the four
  activity categories (motricité / art / musique / jeu) are fixed for v1; catalogs of
  labels remain center-editable.
- **Location is free text in v1** for activities; the deferred Salles & Espaces module will
  later upgrade this to a room reference (out of scope here).
- **Type is set at signup** by the center (via the landing form) and provisioned with the
  center; changing an existing center's type is an administrative operation out of scope.
- **Existing centers with empty/unknown type keep today's full visibility** — the feature
  only restricts content for explicitly typed crèche/jardin centers.
- **No new billing/price values are defined here** — prices for the two new modules reuse
  the existing pricing configuration mechanism (platform-set, same as current add-ons).
- **Mobile/responsive behavior** follows the existing responsive patterns of each affected
  surface; no separate mobile design is produced.
- **Data retention**: hiding grade/establishment never deletes stored values; downgrade of
  modules retains data as the app already does for other modules.
