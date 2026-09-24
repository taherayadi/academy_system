# Feature Specification: Staff-Lite Unlock (Étude centers get limited staff access)

**Feature Branch**: `003-staff-lite-unlock`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Phase 3 (of featuredPlan.md) — Staff-lite: when a center
adds/enable the Étude (module), we need to unlock the staff module, but only adding staff
without all the staff features — just add, remove, update staff. He can't create bulletin
de paie, no avance, no congé, no day timesheet (pointage) — all of these are locked until
paying for the staff module."

> Scope note: Phase 3 of the approved plan `featuredPlan.md` (companion to feature 001's
> User Story 5, specced standalone). The staff module becomes visible in a limited mode
> for centers that enabled Étude but have not purchased the Staff module; centers that
> purchased Staff keep the full module, unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Étude center manages its staff roster (Priority: P1)

A center enables Étude Surveillée but has not purchased the Staff module. The staff
module (« إدارة الموظفين ») now appears in its navigation and opens to a **staff-lite**
view: the staff member list with full add, edit, and delete — enough for the center to
maintain the roster of supervisors that Étude scheduling needs. Creating, editing, and
deleting staff members works and persists exactly as it does today.

**Why this priority**: This is the entire unlock — without a usable roster the feature
delivers nothing. Everything else in the feature restricts or protects.

**Independent Test**: With a center that has étude enabled and staff not purchased:
open the staff module, add a staff member, edit them, delete them — all succeed and
persist. No other story needed.

**Acceptance Scenarios**:

1. **Given** a center with étude enabled and staff not purchased, **When** the sidebar
   renders, **Then** « إدارة الموظفين » is visible in navigation (desktop and mobile).
2. **Given** that center, **When** the staff module opens, **Then** the staff member
   list renders with the add-staff action available.
3. **Given** that center, **When** adding, editing, or deleting a staff member,
   **Then** each operation succeeds and the change persists after reload.
4. **Given** that center, **When** the staff list is used by other modules that need
   staff references (e.g., étude supervision assignment), **Then** the new staff
   members appear there like any other staff.

---

### User Story 2 - Payroll features are locked behind the paid Staff module (Priority: P1)

In that same staff-lite view, every paid staff feature is locked: payslip generation
(bulletin de paie), salary advances (avances), leave management (congés), and the daily
staff timesheet pointage. The daily pointage view/sub-tab is not offered at all; within
a staff member's detail, the payroll-related surfaces are replaced by a clear locked
message with an upgrade action that takes the user to the renewal module (التجديد),
where the Staff module can be purchased. Nothing about the locked features is operable
in lite mode.

**Why this priority**: The commercial boundary of the unlock — co-equal with Story 1
because the unlock is only correct if the paid surface stays paid. Ship together.

**Independent Test**: In a lite center: the pointage sub-tab is absent; the payslip,
advance, congé, and schedule surfaces show an upgrade prompt whose action navigates to
renewal; no payroll data can be created or modified from the UI.

**Acceptance Scenarios**:

1. **Given** a lite center, **When** the staff module renders, **Then** only the staff
   profiles view is reachable — the daily pointage sub-tab is not offered.
2. **Given** a lite center, **When** a staff member's detail opens, **Then** payslip
   generation, advances, congés, and schedule features are not operable and each shows
   a locked message with an upgrade action.
3. **Given** the locked message, **When** the user activates the upgrade action,
   **Then** the app navigates to the renewal module (التجديد).
4. **Given** a lite center, **When** using any staff operation, **Then** no payslip,
   advance, leave, or schedule/pointage record is created or modified.

---

### User Story 3 - Paid Staff centers keep the full module (Priority: P1)

Centers that have purchased the Staff module see zero change: the full staff module
with profiles, daily pointage, payslip generation, advances, congés, and schedules
behaves exactly as today. Existing automated behavior and tests around the staff
module continue to pass unchanged.

**Why this priority**: Regression guard for paying customers — must hold from the
first release, hence P1 alongside the two unlock stories.

**Independent Test**: With a center that has staff purchased: every existing staff
feature works exactly as before (profiles, pointage sub-tab, payslip flow, advances,
congés).

**Acceptance Scenarios**:

1. **Given** a center with the Staff module purchased, **When** the staff module
   opens, **Then** both the profiles and pointage views are reachable as today.
2. **Given** that center, **When** generating a payslip, recording an advance or
   congé, or doing daily pointage, **Then** each flow works exactly as before.
3. **Given** that center, **When** the module renders, **Then** no upgrade prompts or
   locked messages appear anywhere in it.

---

### Edge Cases

- What happens when a center has neither étude nor staff enabled? → The staff module
  remains hidden in navigation, exactly as today (the unlock requires étude; it does
  not widen visibility beyond étude centers).
- What happens when a center's plan changes mid-session (renewal processed while the
  user is logged in)? → Existing live-sync behavior applies: the session refetches
  the center's modules and the staff module flips between lite and full (or hides) on
  next sync, consistent with how every other module gate behaves today.
- What happens when a lite center's staff member already has historical payslips or
  advances (recorded before, or by a paid sibling flow)? → Existing records remain
  stored and untouched; lite mode simply offers no surface to view or modify payroll
  data.
- What happens when the restricted_admin role opens the staff module in lite mode? →
  Existing role restrictions continue to apply unchanged on top of lite mode.
- What happens when a lite center deletes a staff member who supervises étude
  sessions? → Standard delete semantics as today; étude assignments follow their
  existing behavior for deleted staff.
- What happens when a lite center tries the upgrade action while offline / the
  renewal page fails? → Navigation to renewal is plain in-app navigation and cannot
  fail independently; no data operation is behind the upgrade action.

## Requirements *(mandatory)*

### Functional Requirements

**Visibility & unlock**

- **FR-001**: The staff module MUST be visible in navigation for centers whose enabled
  modules include étude OR staff (visibility today: staff only).
- **FR-002**: Centers whose enabled modules include staff MUST experience the full,
  unchanged staff module (profiles + pointage + payslips + advances + congés +
  schedules); no upgrade prompts anywhere.
- **FR-003**: Centers with étude but without staff MUST get the limited (lite) mode:
  staff profiles with add, edit, delete fully functional and persisting.

**Locks**

- **FR-004**: In lite mode, the daily staff pointage view/sub-tab MUST NOT be offered
  (not reachable by navigation).
- **FR-005**: In lite mode, payslip generation, salary advances, congé management, and
  the staff schedule features MUST NOT be operable; each surface MUST be replaced by a
  locked message with an upgrade action.
- **FR-006**: The upgrade action MUST navigate the user to the renewal module
  (التجديد) where the Staff module can be purchased.
- **FR-007**: Lite mode MUST NOT allow creating or modifying any payslip, advance,
  leave, or pointage/schedule record from any surface it renders.
- **FR-008**: Lite mode MUST preserve existing payroll data untouched (read or write
  paths for stored payroll records are simply not offered; nothing is deleted).

**Composition & consistency**

- **FR-009**: Role-based restrictions (restricted_admin) MUST continue to apply
  unchanged on top of lite mode.
- **FR-010**: Module-enablement changes (renewal, plan change) MUST behave like every
  other module gate today: the staff module visibility/mode follows the center's
  enabled-modules as synced mid-session.
- **FR-011**: The full staff module for paying centers MUST remain byte-for-byte
  equivalent in behavior — all existing staff tests pass unchanged.
- **FR-012**: All existing automated quality gates MUST pass with the feature
  integrated, including new coverage: lite-mode CRUD works, locks render with upgrade
  navigation, pointage unreachable, paid centers unchanged.

### Key Entities *(include if feature involves data)*

- **Center**: tenant; its enabled-modules list (includes étude? includes staff?) is the
  sole driver of staff-module visibility and mode (full vs lite). No new entity.
- **StaffMember**: existing entity; all attributes and payroll sub-records (payslips,
  advances, leave requests, schedule/pointage entries) unchanged. Lite mode adds
  nothing to the data model — it only gates which parts of the staff surface render
  and operate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An étude-only center can go from login to a persisted staff roster
  entry in under two minutes with no documentation (add/edit/delete all functional).
- **SC-002**: In lite mode, 100% of payroll surfaces (payslip, avance, congé,
  pointage) are non-operable and present the upgrade path; zero payroll records can
  be created or modified from a lite session.
- **SC-003**: 100% of existing behaviors for staff-purchased centers are unchanged
  (all pre-existing staff tests pass without modification).
- **SC-004**: Historical payroll records of any center remain byte-identical through
  lite-mode usage (no write path exists in lite mode).
- **SC-005**: The upgrade action always lands on the renewal module (100% of
  activations).
- **SC-006**: All existing automated checks pass unchanged where behavior is
  untouched; every new rule (FR-001…FR-008) is covered by new checks; the complete
  quality-gate suite passes.

## Assumptions

- **Client-side enforcement, consistent with the app's existing module gating**: the
  enabled-modules list already drives every module's visibility and updates
  mid-session via live sync; lite mode follows the same trust model. A hardened
  server-side payroll-permission layer is a possible follow-up, out of scope here.
- **The unlock is additive**: centers without étude and without staff see no change
  (staff stays hidden for them).
- **Mode is binary**: étude-without-staff ⇒ lite; staff ⇒ full. No intermediate tier
  in this phase.
- **Locked message copy** directs the user to enable the full module via التجديد
  (renewal); exact wording finalized at implementation in the app's Arabic UI style.
- **Étude's own staff picker** keeps working for lite centers (roster is the point of
  the unlock); nothing in étude changes.
- **Scope excludes**: pricing/pricing-page changes (Staff pricing already exists in
  the renewal catalog), the two new modules (001-US6/7), type-aware gating (002), and
  any changes to staff data APIs — this is a presentation/behavioral gate only.
