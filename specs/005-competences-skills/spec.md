# Feature Specification: Compétences & Skills Module

**Feature Branch**: `005-competences-skills`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Phase 5 (of featuredPlan.md) — Compétences & Skills module:
skill catalog per domain (langage / motricité / social / autonomie) with label and optional
age range; per-child evaluations on a 4-level scale (non évalué / émergent / en cours /
acquis) with evaluator and evaluation date; per-child view (list/radar), per-class mastery
heatmap; printable report like the bulletins; evaluator picked from the staff roster with
the same logic as Étude, falling back to free-text name when Staff is not purchased;
Growth/Pro plan placement."

> Scope note: Phase 5 of the approved plan `featuredPlan.md` (companion to feature 001's
> User Story 7, specced standalone). Completes the competitor-parity set for the
> crèche/jardin segment. Storage follows the same coordination model as features 001/004
> (tenant-scoped, admin-repository migration sequence).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Center maintains its skills catalog (Priority: P1)

A center with the module enabled maintains a catalog of observable skills, organized in
four fixed domains: langage, motricité, social, autonomie. Each skill has a label
(required) and an optional age range (from/to, in months, from ≤ to). Skills can be
added, edited, and removed; the catalog renders grouped by domain.

**Why this priority**: The catalog is the foundation — evaluations, heatmap, and
reports all reference it. Nothing works without it.

**Independent Test**: Enable the module, add skills in two domains, edit one, remove
one, reload — catalog persists exactly, grouped correctly.

**Acceptance Scenarios**:

1. **Given** the module open, **When** the catalog renders, **Then** skills appear
   grouped under the four domains.
2. **Given** the add-skill form, **When** the user submits with a non-empty label and
   a domain, **Then** the skill appears in its domain group and persists after reload.
3. **Given** the age-range inputs, **When** a user enters a "to" months value less
   than the "from" value, **Then** submission is blocked with a clear message.
4. **Given** an existing skill, **When** edited or removed, **Then** the catalog
   updates immediately and the change persists.
5. **Given** a skill removal that children were already evaluated on, **When** the
   removal is saved, **Then** the evaluations referencing that skill are removed with
   it; the children's other evaluations remain intact.

---

### User Story 2 - Staff evaluate children on skills (Priority: P1)

For each child, staff record skill evaluations: each catalog skill can be set to one of
four levels — non évalué, émergent, en cours, acquis — together with the evaluator and
the evaluation date. The evaluator is picked from the staff roster using the same
selection logic as the Étude module when the center has the Staff module; when Staff is
not purchased (see feature 003's staff-lite model), the evaluator is entered as a
free-text name instead. A per-child view presents the child's evaluated skills as a
clear list organized by domain.

**Why this priority**: Evaluation is the module's daily-use core; co-equal with the
catalog because the catalog alone delivers no value.

**Independent Test**: Evaluate a child on several skills with different levels
(roster picker in a staff center; free text in a non-staff center), reload — every
evaluation persists with level, evaluator, and date. No other story needed.

**Acceptance Scenarios**:

1. **Given** a child's evaluation view, **When** the user sets a skill's level to one
   of the four levels and saves, **Then** the evaluation persists with the chosen
   level, evaluator, and today's date (editable).
2. **Given** a center with Staff purchased, **When** choosing an evaluator, **Then**
   the evaluator is selected from the staff roster (same roster source as Étude).
3. **Given** a center without Staff purchased, **When** evaluating, **Then** a
   free-text evaluator name is entered and stored instead.
4. **Given** the per-child view, **When** it renders, **Then** evaluated skills are
   presented grouped by domain with their levels at a glance.
5. **Given** a re-evaluation of the same skill, **When** saved, **Then** the level,
   evaluator, and date update to the new values (one current evaluation per
   child-skill pair).

---

### User Story 3 - Class mastery overview and printable report (Priority: P2)

The module offers a per-class mastery heatmap: children (grouped by their class label)
crossed with skills, each cell showing the child's level at a glance, with per-skill
and per-child summaries visible. For any child, a print-ready report can be produced
in the same visual style as the existing student bulletins, listing each domain with
the child's skills, levels, evaluators, and evaluation dates.

**Why this priority**: The overview and report are the module's outward-facing value
(parent meetings, progress tracking); they build entirely on Stories 1–2.

**Independent Test**: With several children evaluated in a class, open the heatmap —
cells reflect each child's levels; print a child's report — a complete, print-ready
document in the bulletin style is produced. No new data needed beyond Stories 1–2.

**Acceptance Scenarios**:

1. **Given** a class label used by several children, **When** the heatmap opens,
   **Then** each child appears as a row and catalog skills as columns, cells showing
   each child's current level.
2. **Given** the heatmap, **When** a child has no evaluation for a skill, **Then**
   that cell is visibly empty/neutral — never rendered as a zero or failure.
3. **Given** the heatmap, **When** children share a class label, **Then** they are
   grouped under it; children without a class label appear under an unassigned
   group.
4. **Given** an evaluated child, **When** the report is printed, **Then** a
   print-ready skills report is produced listing every evaluated skill by domain
   with level, evaluator, and date, visually consistent with the existing bulletin
   style.
5. **Given** a child with no evaluations, **When** the report is printed, **Then**
   the report renders with the domains and an explicit "no evaluations" state rather
   than a broken/empty document.

---

### User Story 4 - Commercial availability (Priority: P2)

The module is discoverable and purchasable: it appears in the landing pricing
simulator and in the in-app renewal module as a selectable add-on (label, description,
icon, price), pre-selected in Growth and Pro presets and never in Basic, following the
existing plan-derivation rules. Centers without the module enabled see no trace of it
in navigation; every center type may enable it.

**Why this priority**: Revenue path; independent of the in-app UX stories.

**Independent Test**: Landing simulator + renewal list it with price; Growth preset
pre-selects, Basic doesn't; base + module derives Growth; a center without it shows
no navigation entry.

**Acceptance Scenarios**:

1. **Given** the landing pricing simulator, **When** it renders, **Then** « Compétences
   & Skills » appears among the add-ons with label, icon, description, and price.
2. **Given** the renewal module in-app, **When** it renders, **Then** the same
   module appears identically (shared catalog source).
3. **Given** the Growth preset, **When** applied, **Then** the module is
   pre-selected; **given** the Basic preset, **when** applied, **then** it is not.
4. **Given** a base-only selection plus this module, **When** the plan is derived,
   **Then** the result is Growth.
5. **Given** a center without the module enabled, **When** the app renders, **Then**
   the module appears neither in the sidebar nor on the dashboard.

---

### Edge Cases

- What happens when a skill is deleted after children were evaluated on it? → Its
  evaluations are removed with it (same save); all other evaluations, summaries, and
  reports remain intact (heatmaps recount automatically).
- What happens when the evaluator staff member is later deleted? → Evaluations keep
  their recorded evaluator rendering from the stored reference as a name where
  possible; nothing breaks (historical record semantics).
- What happens when the module is disabled after catalog/evaluations exist
  (downgrade)? → The module disappears from navigation on next sync; all data is
  retained and reappears if re-enabled (existing module-gating behavior).
- What happens when two staff evaluate the same child-skill at different times? →
  The current evaluation is the latest save (level, evaluator, date all from the
  newest); evaluation history beyond the current value is out of scope for v1.
- What happens when a child's class label changes? → The heatmap regroups the child
  under the new class automatically (class is a child attribute, not stored on the
  evaluation).
- What happens when a catalog is empty (new center)? → The evaluation view shows a
  helpful empty state directing to add skills first; heatmap shows the class rows
  with no columns; report prints the empty state.
- What happens when a save fails (network error)? → The app's existing save-error
  feedback shows and the UI keeps the last saved state; retry by saving again.

## Requirements *(mandatory)*

### Functional Requirements

**Catalog**

- **FR-001**: The module MUST present the skill catalog grouped by the four fixed
  domains: langage, motricité, social, autonomie.
- **FR-002**: The user MUST be able to add a skill with a domain (required, one of
  the four), a label (required, non-empty), and an optional age range in months
  (from/to, from ≤ to).
- **FR-003**: The user MUST be able to edit and remove skills; changes persist and
  reload exactly.
- **FR-004**: Removing a skill MUST also remove the evaluations referencing it in the
  same save; all other evaluations MUST remain intact.

**Evaluations**

- **FR-005**: The user MUST be able to evaluate a child on a catalog skill with one
  of four levels: non évalué, émergent, en cours, acquis — recorded with an evaluator
  and an evaluation date (date editable, defaulting to today).
- **FR-006**: The evaluator MUST be selectable from the staff roster (same roster
  source as Étude) when the center has the Staff module; otherwise a free-text
  evaluator name MUST be entered and stored (mutually exclusive forms).
- **FR-007**: The per-child view MUST present evaluated skills grouped by domain
  with levels at a glance; re-evaluating a skill MUST replace the previous level,
  evaluator, and date (one current evaluation per child-skill pair).

**Overview & report**

- **FR-008**: The module MUST provide a per-class mastery heatmap: children grouped
  by class label (unassigned group for none) as rows, catalog skills as columns,
  cells showing current levels; unevaluated cells MUST render neutral.
- **FR-009**: The module MUST provide a print-ready per-child report in the same
  visual style as the existing bulletins, listing each domain's evaluated skills
  with level, evaluator, and date; children with no evaluations MUST render an
  explicit empty state.

**Commercial & cross-cutting**

- **FR-010**: The module MUST appear in the landing pricing simulator and the in-app
  renewal module from the shared catalog, pre-selected in Growth and Pro presets and
  never in Basic; plan derivation follows existing rules.
- **FR-011**: The module MUST be visible in navigation only for centers with the
  module enabled; every center type may enable it.
- **FR-012**: All catalog and evaluation data MUST be scoped to the connected center
  — never readable or writable by another center.
- **FR-013**: All changes MUST save and sync through the app's standard module save
  behavior (persistence, error feedback, multi-session propagation).
- **FR-014**: All existing automated quality gates MUST pass with the feature
  integrated, including new coverage for catalog validation, cascade removal,
  evaluator mutual exclusion, heatmap grouping, report rendering, and plan presets.

### Key Entities *(include if feature involves data)*

- **Skill**: a center's catalog entry — domain (langage/motricité/social/autonomie),
  label, optional age range (from/to months), creation timestamp. Owned by exactly
  one center.
- **SkillEvaluation**: a child's current level on one skill — level
  (non évalué/émergent/en cours/acquis), evaluator (staff reference XOR free-text
  name), evaluation date. One current evaluation per child-skill pair; owned by the
  same center as the child and skill.
- **Child (existing)**: the evaluated subject; contributes its class label for
  heatmap grouping (label is a child attribute, not stored on evaluations).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user builds a two-domain catalog, evaluates a child on
  several skills, opens the heatmap, and prints the child's report within a single
  session without documentation.
- **SC-002**: 100% of catalog edits and evaluations survive a page reload with all
  fields intact (level, evaluator, date).
- **SC-003**: Invalid submissions (empty label, domain missing, age range inverted,
  missing evaluator) are blocked 100% of the time with a clear message.
- **SC-004**: Removing a skill removes 100% of its referenced evaluations and 0% of
  unrelated evaluations.
- **SC-005**: The evaluator form is exactly one of roster-picker / free-text per
  center entitlement — never both, never neither (100% of sessions).
- **SC-006**: The module's commercial presentation is identical on landing and
  renewal (100% agreement); centers without the module show zero trace (100%).
- **SC-007**: All existing automated checks pass unchanged where behavior is
  untouched; every new rule above is covered by new checks; the complete
  quality-gate suite passes.

## Assumptions

- **Four fixed domains and four fixed levels** for v1 (names above); level colors are
  fixed presentation constants. Renaming/adding is a future change.
- **One current evaluation per child-skill pair** (latest save wins); evaluation
  history/audit trail is out of scope for v1.
- **Age ranges are informational** (months, shown on the catalog); they do not
  filter or gate evaluations in v1.
- **Evaluator follows feature 003's entitlement model**: staff roster picker when
  Staff is purchased; free-text name otherwise (mutually exclusive, stored so
  reports can always render who evaluated).
- **Class grouping uses the child's existing class/level label** (the same free-text
  label used by feature 004's grouping); no new class entity in this phase.
- **Report styling** reuses the app's established bulletin print approach — same
  visual family, no new print infrastructure.
- **Pricing** reuses the existing module pricing configuration; catalog membership
  only, no new pricing code.
- **Storage coordination**: skills and evaluations are tenant-scoped and added to the
  admin repository's shared migration sequence, the same model as features 001/004
  (blocks production, not development).
- **Scope excludes**: skills marketplace/templates between centers, per-skill
  observation notes/photos, term-based evaluation periods, parent-facing portals,
  and any changes to existing modules beyond registration points.
