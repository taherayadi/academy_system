# Feature Specification: Activités & Planning Module

**Feature Branch**: `004-activities-planning`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Phase 4 (of featuredPlan.md) — Activités & Planning module:
for all center types. Weekly planner grid (per class or per location), activities with
title, category (motricité / art / musique / jeu), weekday or date, start/end time,
optional location + class, optional supervising staff. Add the module to the landing page
(pricing simulator) and to Renouvellement inside the app. Growth/Pro plan placement."

> Scope note: Phase 4 of the approved plan `featuredPlan.md` (companion to feature 001's
> User Story 6, specced standalone). Location is free text in this phase; the deferred
> Salles & Espaces module will later upgrade it to a room reference.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Center plans its weekly activities (Priority: P1)

A center with the Activités & Planning module enabled opens the module and sees a weekly
planner: days as columns, time bands as rows. The center creates an activity — a required
title, a required category (motricité, art, musique, jeu), a required recurrence (a
weekday, or a specific date for one-off events), and a required start/end time — plus
optional details: a free-text location (room/space), a class/level label, and a
supervising staff member. The activity appears immediately as a color-coded chip in the
correct day and time position, and the plan persists.

**Why this priority**: The planner is the module; without create-and-see-on-the-grid
there is no product.

**Independent Test**: Enable the module for a center, create activities in two
categories on two different days, verify each renders as a chip in the right day/time
cell, reload, and confirm everything is still there. No other story needed.

**Acceptance Scenarios**:

1. **Given** the module open, **When** the user creates an activity with title,
   category, weekday, and time range, **Then** a category-colored chip appears in the
   correct day column within the correct time band.
2. **Given** the user creates an activity with a specific date instead of a weekday,
   **When** saved, **Then** the chip appears in that date's position (dated activities
   are distinguishable from weekly ones).
3. **Given** the planner, **When** the page is reloaded, **Then** all created
   activities reappear exactly as saved.
4. **Given** the create/edit form, **When** submitting without title, category,
   weekday-or-date, or with an end time not after the start time, **Then** submission
   is blocked with a clear message.
5. **Given** an existing activity, **When** the user edits it or deletes it, **Then**
   the grid updates immediately and the change persists.

---

### User Story 2 - Moving and grouping activities (Priority: P2)

Once activities exist, the center rearranges its week: an activity can be moved to a
different day/time slot (drag on desktop, with a tap-select-then-choose fallback for
touch), and the planner can switch its grouping between **per class** (each
class/level label gets its own view) and **per location** (each room/space gets its own
view), regrouping all activities accordingly.

**Why this priority**: The rearrangement workflow is what makes the planner a living
schedule rather than a static list; second only to creation.

**Independent Test**: Create activities across days and slots, move one to another
slot, verify it persisted after reload; toggle grouping class ↔ location and verify the
grid regroups; all without touching Story 3.

**Acceptance Scenarios**:

1. **Given** an existing activity, **When** the user moves it to a different day/time
   slot, **Then** the chip moves immediately and the new position persists after
   reload.
2. **Given** activities with class labels, **When** grouping is set to per class,
   **Then** the planner presents activities grouped by their class label.
3. **Given** activities with locations, **When** grouping is set to per location,
   **Then** the planner presents activities grouped by their location.
4. **Given** a grouping toggle, **When** activities lack the grouping field (no class
   or no location), **Then** they still appear in the grouped view under an
   "unassigned" group rather than disappearing.
5. **Given** a touch device, **When** the user moves an activity, **Then** the
   select-then-choose fallback achieves the same result as dragging.

---

### User Story 3 - Commercial availability (Priority: P2)

The module is discoverable and purchasable: it appears in the pricing simulator on the
public landing page and in the renewal module inside the app, as a selectable add-on
with label, description, icon, and price. It is pre-selected in the Growth and Pro plan
presets and never in Basic. Selecting it follows the existing plan-derivation rules
(base only → Basic; any add-on → Growth; all → Pro), and centers without the module
enabled never see it in navigation.

**Why this priority**: Revenue path — the module must be sellable before it ships
broadly; independent of the in-app UX stories.

**Independent Test**: Load the landing simulator and the renewal module: the module
appears as an add-on with price; Growth preset pre-selects it, Basic doesn't; a center
without it enabled shows no navigation entry.

**Acceptance Scenarios**:

1. **Given** the landing pricing simulator, **When** it renders, **Then** « Activités &
   Planning » appears among the selectable add-on modules with label, icon,
   description, and price.
2. **Given** the renewal module in-app, **When** it renders, **Then** the same module
   appears identically (same catalog source).
3. **Given** the Growth preset, **When** applied, **Then** the module is pre-selected;
   **given** the Basic preset, **when** applied, **then** it is not.
4. **Given** a base-only selection plus this module, **When** the plan is derived,
   **Then** the result is Growth; toggling it off returns to Basic.
5. **Given** a center without the module enabled, **When** the app renders, **Then**
   the module appears neither in the sidebar nor on the dashboard.

---

### Edge Cases

- What happens when two activities occupy the same day and time slot? → Both chips
  coexist in the same cell (stacked/visible); v1 does not force conflict resolution —
  the center sees the overlap and resolves it by moving one.
- What happens when an activity's supervising staff member is later deleted? → The
  activity keeps its other data and renders without the supervisor name (no dangling
  breakage).
- What happens when the module is disabled after activities were created (downgrade)? →
  The module disappears from navigation on next sync (existing module-gating
  behavior); the activities data is retained, not deleted, and reappears if the module
  is re-enabled.
- What happens when a center's week includes activities dated for a past date (one-off
  events)? → Dated activities remain visible in date mode for their date; they do not
  clutter the weekly recurrence view.
- What happens when the activity list grows large (hundreds)? → The grid renders by
  day/slot buckets; only a week's activities are in view at once, keeping rendering
  bounded.
- What happens when a user of a crèche center uses the module? → Fully available —
  the module serves all center types without restriction.
- What happens when the save fails (network error)? → The user sees the existing
  save-error feedback used across modules and the grid keeps showing the last saved
  state; retry by editing again.

## Requirements *(mandatory)*

### Functional Requirements

**Planner & activities**

- **FR-001**: The module MUST render a weekly planner grid with weekdays as columns
  and time bands as rows.
- **FR-002**: The user MUST be able to create an activity with: title (required,
  non-empty), category (required, one of motricité/art/musique/jeu), recurrence
  (required: a weekday OR a specific date), start and end time (required, end after
  start).
- **FR-003**: The user MAY attach to an activity: a free-text location, a class/level
  label, and a supervising staff member (all optional).
- **FR-004**: Each activity MUST appear on the grid as a chip colored by its category;
  chips occupy the day column of their weekday/date and the row band of their start
  time.
- **FR-005**: The user MUST be able to edit and delete an activity, with the grid
  updating immediately and changes persisting.
- **FR-006**: All activity data MUST persist and reload exactly as saved.

**Rearrangement & grouping**

- **FR-007**: The user MUST be able to move an activity to a different day/time slot,
  with the change persisted; a touch-friendly fallback MUST exist alongside dragging.
- **FR-008**: The planner MUST support grouping per class label and per location,
  regrouping all activities on toggle; activities missing the grouping field appear
  under an unassigned group.

**Commercial**

- **FR-009**: The module MUST appear in the landing pricing simulator and the in-app
  renewal module from the shared module catalog, with label, icon, description, and
  price.
- **FR-010**: The module MUST be pre-selected in Growth and Pro plan presets and MUST
  NOT be in the Basic preset; plan derivation follows existing rules.
- **FR-011**: The module MUST be visible in app navigation only for centers with the
  module enabled, and MUST be available to every center type.

**Cross-cutting**

- **FR-012**: All activity data MUST be scoped to the connected center — never
  readable or writable by another center.
- **FR-013**: The module MUST participate in the app's existing save/sync behavior:
  changes save in the standard way and propagate to other open sessions of the same
  center like other module data.
- **FR-014**: All existing automated quality gates MUST pass with the feature
  integrated, including new coverage for creation validation, chip placement,
  move persistence, grouping, catalog presence, and plan presets.

### Key Entities *(include if feature involves data)*

- **Activity**: a center's planned activity — title, category
  (motricité/art/musique/jeu), weekday-or-date recurrence, start/end time, optional
  free-text location, optional class label, optional supervising staff reference,
  creation timestamp. Owned by exactly one center.
- **Module entitlement (existing)**: the center's enabled-modules list determines
  whether the module renders; the shared module catalog determines its commercial
  presentation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user creates, moves, and regroups activities within a
  single session without documentation (all primary flows discoverable).
- **SC-002**: 100% of created/moved/edited activities survive a page reload with
  their day, time, category color, and optional fields intact.
- **SC-003**: Submission with missing required fields or an invalid time range is
  blocked 100% of the time with a clear message (no silent bad data).
- **SC-004**: The module's commercial presentation is identical on the landing
  simulator and in renewal (same label, price, preset behavior — 100% agreement).
- **SC-005**: Centers without the module see zero trace of it in navigation (100%).
- **SC-006**: All existing automated checks pass unchanged where behavior is
  untouched; every new rule above is covered by new checks; the complete
  quality-gate suite passes.

## Assumptions

- **Four fixed categories** (motricité / art / musique / jeu) with fixed category
  colors for v1; renaming/adding categories is a future change.
- **Location is free text in v1**; the deferred Salles & Espaces module will upgrade
  it to a room reference (migration noted in featuredPlan.md).
- **Weekly + dated recurrence only** (no multi-week patterns, no exceptions calendar)
  in this phase.
- **Time grid uses fixed half-hour bands** from the center's operating day; activities
  snap their chip to their start band regardless of exact minute offsets.
- **Grouping is a view toggle**, not a data change — switching grouping never modifies
  activities.
- **Pricing** reuses the existing pricing configuration (platform-set module price,
  same mechanism as current add-ons); no new pricing code beyond catalog membership.
- **Conflict handling is visual only** in v1 (overlaps coexist in a cell).
- **Mobile** receives the same planner with the tap-select move fallback instead of
  drag; no separate mobile design.
- **Dependency ordering**: safe to build in any order; module stays hidden until a
  center enables it. Activities storage follows the same model as feature 001's data
  layer (tenant-scoped, coordinated with the admin repository's shared migration
  sequence).
