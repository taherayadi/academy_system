# Feature Specification: Type-Aware Gating (Crèche/Jardin hide school-level content)

**Feature Branch**: `002-type-aware-gating`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Phase 2 (of featuredPlan.md) — type-aware UI gating:
crèche/jardin centers see no school-level content. Hide « المستوى الدراسي » (grade) and
« المؤسسة التعليمية » (establishment) in child registration for crèche/jardin (visible only
for garderie/formation); grade disappears app-wide for crèche/jardin. Hide the Suivi Scolaire
quick actions (add exam/homework notes icon and the timesheet view icon) for crèche/jardin —
those quick actions appear only for garderie/formation. The four study modules (cours
particulier, étude surveillée, révision examens, formations) are not displayed when the
center type is crèche/jardin — those modules exist only for garderie/formation."

> Scope note: this spec extracts Phase 2 from the approved plan `featuredPlan.md`
> (companion to feature 001). Signup with the new types is 001-US1; Staff-lite is
> 001-US5; the two new modules are 001-US6/US7. This feature covers 001-US2, US3,
> US4 behavior, specced standalone so it can build and ship independently once center
> types exist.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registration form adapts to the center type (Priority: P1)

A staff member of a **crèche** or **jardin** registers a new child (or edits an existing
one). The school-level fields — « المستوى الدراسي » (grade, mandatory today) and
« المؤسسة التعليمية » (establishment picker with add-establishment action) — are not
rendered at all, and the form submits successfully without them. For **garderie** and
**formation** centers, both fields render and behave exactly as today (grade required,
establishment optional). The grade also disappears everywhere else it can surface for
crèche/jardin: student list rows and filters, the student card, the registration
printout, and the receipts area.

**Why this priority**: The core daily-usage value of the phase — a crèche is not a school
and must not confront school paperwork. Everything else in this feature is secondary to
the registration flow.

**Independent Test**: With a center typed crèche, open child registration: zero
school-level fields render and a child saves with empty grade. With a formation center,
both fields render and grade remains mandatory. No other feature of this phase needed.

**Acceptance Scenarios**:

1. **Given** a crèche or jardin center, **When** the add-child form opens, **Then** no
   « المستوى الدراسي » field and no « المؤسسة التعليمية » field (including the
   add-establishment sub-form) are rendered.
2. **Given** a crèche or jardin center, **When** a child is submitted with all visible
   required fields filled, **Then** the child is saved successfully — absence of
   grade/establishment does not block submission.
3. **Given** a garderie or formation center, **When** the add/edit child form opens,
   **Then** both fields render as today, grade still mandatory and establishment
   optional.
4. **Given** a crèche/jardin center with registered children, **When** browsing the
   student list, opening a student card, printing the registration form, or viewing
   receipts, **Then** no grade value or grade label appears anywhere in those views.
5. **Given** a crèche/jardin center, **When** filtering or searching the student list,
   **Then** no grade-based filter option is offered (search by name still works).

---

### User Story 2 - Suivi quick actions match the center type (Priority: P2)

In the academic follow-up list (Suivi Scolaire), each student row shows per-row quick
actions. For **crèche** and **jardin** centers the two school-specific actions — entering
exam/homework notes (Notes Devoirs) and viewing the student's weekly timesheet — are
hidden. The remaining row content (student name, registration payment status, monthly
payment cells and their actions) stays unchanged for every type. For **garderie** and
**formation** the two actions remain exactly as today, opening their existing dialogs.

**Why this priority**: Direct follow-on to Story 1 (same center-type signal, same
module); removes the second most visible school artifact for the new segment.

**Independent Test**: Open the follow-up module as a crèche center: neither the notes
icon nor the timesheet icon appears on any row, and payment actions still work. Repeat
as a formation center: both icons present and functional.

**Acceptance Scenarios**:

1. **Given** a crèche or jardin center, **When** the Suivi Scolaire table renders,
   **Then** no row shows the Notes Devoirs icon or the timesheet view icon (neither the
   active nor the disabled placeholder variant).
2. **Given** a crèche or jardin center, **When** a payment cell is used (registration
   fee or monthly payment), **Then** the payment flow works exactly as today.
3. **Given** a garderie or formation center, **When** the table renders, **Then** both
   icons appear per row and open their existing dialogs unchanged.

---

### User Story 3 - Study modules only for garderie/formation (Priority: P2)

The four study-style modules — Cours Particuliers (الدروس الخصوصية), Étude Surveillée
(تأطير Étude), Révision Examens (حصة مراجعة), Formations (التكوينات والدورات) — are
meaningful only for centers doing school support. For **crèche** and **jardin** centers
they are absent from the sidebar navigation and from the dashboard quick-access cards,
and direct navigation attempts (stale bookmark, notification link) fall back to the
dashboard instead of opening the module. Existing garderie/formation centers keep the
modules exactly as today, including any subscription-based visibility they already have.

**Why this priority**: Completes the phase's promise — a crèche sees zero school
artifacts anywhere — but has lower daily impact than Stories 1–2.

**Independent Test**: Log into a crèche center: the four tabs appear nowhere and a
deep-link to one lands on the dashboard. Log into a formation center: all four remain
usable (subject to existing subscription gating).

**Acceptance Scenarios**:

1. **Given** a crèche or jardin center, **When** the sidebar renders (desktop and
   mobile), **Then** none of the four study modules appear in navigation.
2. **Given** a crèche or jardin center, **When** the dashboard renders, **Then** no
   quick-access card for the four study modules is shown.
3. **Given** a crèche or jardin center, **When** the user attempts to open one of the
   four study modules via a stale link or bookmark, **Then** the app lands on the
   dashboard, never inside the module.
4. **Given** a garderie or formation center with the modules enabled, **When**
   navigating, **Then** all four modules behave exactly as before this feature.

---

### Edge Cases

- What happens when an existing center's type is unknown/legacy (empty value)? → All
  school-level fields, quick actions, and study modules remain visible — today's
  behavior; the feature only restricts content for explicitly typed crèche/jardin.
  No existing center loses functionality.
- What happens when a crèche child record already holds a grade value (imported or
  left from before)? → The value stays stored and untouched; it is simply not displayed
  while the center is typed crèche/jardin.
- What happens when a garderie/formation center uses every hidden element today? →
  Nothing changes for them; the type rules only ever remove content for
  crèche/jardin.
- What happens when the center's subscription already disables a study module for a
  garderie center? → Both rules compose: subscription gating and type gating apply
  together; type gating never re-enables a subscription-disabled module.
- What happens when a user of a crèche center follows a printed document or exported
  data referencing grades? → Historical printed/exported documents are unaffected;
  only in-app rendering is gated.
- What happens when the active tab is a study module and the center type changes
  between sessions (administrative change)? → On next load the module guard redirects
  to the dashboard, consistent with existing module-disable behavior.

## Requirements *(mandatory)*

### Functional Requirements

**Field visibility (registration and app-wide)**

- **FR-001**: For crèche and jardin centers, the child registration form MUST NOT render
  the grade field (« المستوى الدراسي ») nor the establishment field (« المؤسسة التعليمية »),
  including the add-establishment sub-form, and MUST NOT require them for submission.
- **FR-002**: For garderie and formation centers, both fields MUST render with today's
  semantics: grade mandatory, establishment optional.
- **FR-003**: For crèche and jardin centers, the application MUST NOT display grade
  values or grade labels in the student list, student card, registration print, or
  receipts views; MUST NOT offer grade-based filters; and MUST NOT delete or overwrite
  stored grade/establishment data by hiding it.
- **FR-004**: The four known center types are jardin, crèche, garderie, formation;
  school-level content shows only for garderie and formation; any other/empty type
  value MUST behave as today (everything visible).

**Suivi quick actions**

- **FR-005**: For crèche and jardin centers, the Suivi Scolaire row actions MUST NOT
  include the Notes Devoirs action nor the timesheet view action (active or disabled
  placeholder).
- **FR-006**: For garderie and formation centers, both actions MUST remain present and
  functional, unchanged.
- **FR-007**: Type gating MUST NOT alter any payment-related action or display in the
  Suivi Scolaire list.

**Study modules**

- **FR-008**: For crèche and jardin centers, the four study modules (Cours Particuliers,
  Étude Surveillée, Révision Examens, Formations) MUST be absent from navigation and
  dashboard quick access, on both desktop and mobile layouts.
- **FR-009**: For crèche and jardin centers, direct access attempts to any of the four
  study modules MUST fall back to the dashboard.
- **FR-010**: For garderie and formation centers, the four modules MUST behave exactly
  as today, including composition with existing subscription-based module gating (type
  gating only ever removes visibility, never restores it).
- **FR-011**: Every rule in this feature MUST derive from the connected center's type
  alone — no per-user or per-device variation.

**Cross-cutting**

- **FR-012**: All existing automated quality gates MUST pass with the feature
  integrated, including coverage for each new rule (type predicates, hidden-field
  submission, quick-action gating, module-access fallback).

### Key Entities *(include if feature involves data)*

- **Center**: An establishment tenant; carries a **type** among jardin, crèche,
  garderie, formation (unknown/empty = legacy full visibility). The type is the sole
  driver of every visibility rule in this feature. (Type values themselves are
  introduced by feature 001.)
- **Child (Student)**: A registered child; keeps existing attributes including optional
  grade and establishment, which remain stored but hidden for crèche/jardin types.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A crèche center completes child registration without encountering a
  single school-level field, with no extra steps compared to today's form flow.
- **SC-002**: 100% of the phase's visibility rules hold on every affected surface for
  crèche/jardin: registration form, student list/filters, student card, registration
  print, receipts, Suivi row actions, sidebar, dashboard — zero school artifacts.
- **SC-003**: A crèche/jardin center's stored grade/establishment values survive the
  upgrade untouched (verifiable by switching the center type back and observing the
  data reappear correctly).
- **SC-004**: A garderie/formation center experiences zero behavioral change on any
  affected surface (form fields, quick actions, modules all as before).
- **SC-005**: A stale deep-link to a study module from a crèche session always lands
  on the dashboard (100% of attempts).
- **SC-006**: All existing automated checks pass unchanged where behavior is
  untouched, every new rule is covered by new checks, and the complete quality-gate
  suite passes.

## Assumptions

- **Center type already exists on the center record** (delivered by feature 001-US1);
  this feature consumes it and never sets or changes it. Building before 001-US1 ships
  is safe: with no typed centers, every center is "unknown type" and everything stays
  visible.
- **Garderie ≈ formation, crèche ≈ jardin** for all rules here — the validated product
  decision recorded in featuredPlan.md; reversible in one place if revised.
- **Hiding is presentation-only**: stored data is never mutated, migrated, or deleted
  by this feature.
- **No new permissions or roles**: the center type is center-wide; every user of the
  center sees the same adapted interface.
- **Mobile and desktop** share the same rules; no separate per-layout behavior beyond
  each layout's existing presentation of the same elements.
- **Scope excludes**: signup type selection (001-US1), Staff-lite (001-US5), Activités
  & Planning and Compétences modules (001-US6/7), Salles & Espaces and rééducation
  (deferred), and any pricing/subscription changes.
