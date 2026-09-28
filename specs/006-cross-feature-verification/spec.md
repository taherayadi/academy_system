# Feature Specification: Cross-Feature Verification & Release Readiness

**Feature Branch**: `006-cross-feature-verification`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Phase 6 (of featuredPlan.md) — Tests & gates: verify the
whole program (features 001–005) as one release. Composition rules across features
(type gating × staff-lite × new modules), legacy regression safety (unknown center
types, pre-existing centers keep everything they paid for), data-preservation
round-trips, pricing/plan coherence across all new modules, and the complete
quality-gate suite passing with per-feature coverage intact."

> Scope note: Phase 6 of the approved plan `featuredPlan.md`. This is a verification
> and hardening feature: it introduces no new user-facing capability of its own. It
> exists to prove the five shipped features behave correctly **together**, to catch
> cross-feature regressions before release, and to close the coordination items the
> other features deferred (admin-repo migrations scheduled, canonical-file
> convergence when features share code).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A crèche center experiences the full adapted application (Priority: P1)

A center typed **crèche** — the most restricted configuration — exercises the whole
application end to end: registration has zero school-level fields, the follow-up list
has no exam-notes or timesheet quick actions, none of the four study modules exist
anywhere (and deep links fall back to the dashboard), the staff module is
either hidden or in lite mode (per entitlement), and the new Activités & Compétences
modules work fully when enabled. Every restriction and every unlock coexists
correctly.

**Why this priority**: The crèche configuration is where all five features intersect;
if composition breaks anywhere, it breaks here first.

**Independent Test**: Provision a crèche center with étude enabled (staff not
purchased) and both new modules enabled; walk registration → follow-up → each nav
surface → staff → both new modules; verify every feature's behavior from its own
quickstart still holds simultaneously.

**Acceptance Scenarios**:

1. **Given** that crèche center, **When** the child registration flow is used,
   **Then** no school-level field appears and saving works (feature 002 rules hold).
2. **Given** that center, **When** the sidebar, dashboard, and deep links are
   exercised, **Then** the four study modules are absent everywhere and inaccessible
   directly (002 composes with module gating).
3. **Given** that center with étude and without staff, **When** the staff module
   opens, **Then** it is in lite mode: roster CRUD works, payroll surfaces locked
   (003 rules hold under the crèche type).
4. **Given** that center with both new modules enabled, **When** the planner and
   skills module are used, **Then** both are fully functional (004/005 serve all
   center types).
5. **Given** all of the above in one session, **When** a renewal changes the module
   list mid-session, **Then** visibility/modes update on sync without errors or
   stale UI.

---

### User Story 2 - Legacy and garden-variety centers regress nothing (Priority: P1)

Centers that predate the program — unknown/empty center type, legacy module lists —
and existing garderie/formation centers must experience **zero** behavioral change:
every field, quick action, and module they had before remains exactly as before. All
pre-existing automated tests pass unchanged.

**Why this priority**: The program must never take anything away from centers that
were not its target; this is the release-blocking safety guarantee.

**Independent Test**: Log into an unknown-type center and a formation center with
the old module list; verify every surface matches the pre-program behavior; run the
full pre-existing test suite unmodified — all green.

**Acceptance Scenarios**:

1. **Given** an unknown/empty center type, **When** any surface renders, **Then**
   school-level fields, quick actions, and modules all appear exactly as before the
   program (002's legacy passthrough).
2. **Given** a garderie or formation center, **When** registration, follow-up, and
   study modules are used, **Then** behavior is unchanged from before the program.
3. **Given** any pre-program center configuration, **When** the complete pre-existing
   automated suite runs unmodified, **Then** it passes without edits.
4. **Given** a legacy module list (empty), **When** the app renders, **Then** the
   legacy full-visibility behavior applies to staff mode and module gating alike.

---

### User Story 3 - Commercial coherence across the catalog (Priority: P2)

The pricing simulator and the renewal module present one coherent commercial story
for the whole catalog — base modules plus every add-on, including the two new
modules: identical labels, prices, icons, and preset behavior on both surfaces;
Growth/Pro pre-selections; plan derivation consistent with the published rules; and
no module listed that the application cannot actually enable.

**Why this priority**: Commercial correctness at the catalog level — the individual
features proved their own listing; this proves the *combined* catalog reads as one
product.

**Independent Test**: Load both surfaces, compare every module entry for equality,
apply each plan preset, and walk the derive rules for representative selections.

**Acceptance Scenarios**:

1. **Given** the landing simulator and the renewal module, **When** both render,
   **Then** every module entry (label, icon, description, price) is identical
   between them.
2. **Given** each plan preset (Basic, Growth, Pro), **When** applied on either
   surface, **Then** the pre-selected module sets match the published tier rules —
   new modules in Growth/Pro only, never Basic.
3. **Given** representative selections (base-only; base + each new module; all
   modules), **When** the plan is derived, **Then** results are Basic / Growth /
   Growth…Pro respectively, consistent on both surfaces.
4. **Given** the full catalog, **When** each listed module key is checked against
   the application, **Then** every key corresponds to a real, enableable module
   (no phantom catalog entries).

---

### User Story 4 - Data safety round-trips across features (Priority: P2)

The program's hiding/gating rules never destroy data, proven by round-trip checks:
a crèche center's hidden grade values reappear verbatim when the type flips to
formation; a lite center's payroll history reappears when staff is purchased; module
data (activities, skills, evaluations) survives disable/re-enable cycles; and
cascade removals remain precise across simultaneous edits.

**Why this priority**: The trust guarantee behind every gating rule — reversibility
must be provable, not assumed.

**Independent Test**: For each round-trip (type flip, staff purchase, module
disable/re-enable, cascade), mutate the configuration, verify hiding, flip back,
verify verbatim restoration.

**Acceptance Scenarios**:

1. **Given** a crèche center whose children hold grade values, **When** the center
   type flips to formation, **Then** every hidden grade reappears verbatim in
   lists/cards/prints; flipping back hides them again without altering the values.
2. **Given** a lite (étude-only) center with historical payroll records, **When**
   the staff module is added, **Then** the full staff module reveals those records
   unchanged.
3. **Given** a center with activities and skills data, **When** each module is
   disabled and re-enabled, **Then** all data reappears intact.
4. **Given** concurrent skill-catalog edits from two sessions (one removing a skill,
   one evaluating it), **When** the saves resolve, **Then** the stored state is
   coherent under the defined rules (latest save wins; cascade applies to the
   removed skill only) with no orphaned evaluations.

---

### Edge Cases

- What happens when a center combines the most restrictive and most permissive
  settings (crèche type + all modules enabled + étude without staff)? → Every rule
  applies independently: type gating hides school content, entitlement gating shows
  only enabled modules, staff-lite applies — no rule overrides or leaks into
  another.
- What happens when the restricted_admin role is combined with lite staff mode and
  type gating? → All three restriction layers compose (role limits, lite locks,
  type hiding); the union is the most restrictive combination, never an error state.
- What happens when the admin migration for the new tables is not yet applied and a
  center somehow reaches a new module route? → The request fails with the standard
  error feedback; the UI keeps the last saved state (no partial writes, no crash) —
  this is why migrations gate production, not development.
- What happens when a center toggles type and entitlements repeatedly in a short
  window (rapid admin changes)? → Each sync refetch applies the current combined
  state; the UI converges to the latest configuration with no accumulation of stale
  restrictions.
- What happens when the canonical shared files (e.g., the center-type utility)
  receive edits from two features shipping in sequence? → The second feature
  consumes the first's file unchanged (designed convergence); the verification
  suite asserts a single definition exists.
- What happens when the demo-request pipeline receives the new center types and
  forwards them to provisioning? → The type value round-trips from landing form to
  stored request to provisioned center unchanged (prerequisite for every type rule).

## Requirements *(mandatory)*

### Functional Requirements

**Composition**

- **FR-001**: Every visibility rule from the five features MUST hold simultaneously
  under any combined center configuration (type × entitlements × role); no rule may
  override, weaken, or leak into another.
- **FR-002**: The most restrictive crèche configuration MUST show zero school-level
  content across every surface while remaining fully functional for the modules it
  is entitled to.
- **FR-003**: Restriction layers (center type, module entitlements, staff-lite mode,
  role limits) MUST compose by intersection of visibility — the user sees a surface
  only if every layer permits it.

**Legacy safety**

- **FR-004**: Centers with unknown/empty type and legacy (empty) module lists MUST
  retain exactly their pre-program behavior on every surface, including full staff
  mode.
- **FR-005**: Garderie and formation centers MUST retain exactly their pre-program
  behavior; the program may add nothing unwanted and remove nothing.
- **FR-006**: The complete pre-existing automated suite MUST pass unmodified after
  the whole program lands.

**Commercial coherence**

- **FR-007**: The landing simulator and renewal module MUST render the catalog from
  one shared source with identical entries on both surfaces, for the whole catalog
  including both new modules.
- **FR-008**: Plan presets and plan derivation MUST follow the published tier rules
  across the whole catalog, consistently on both surfaces.
- **FR-009**: Every catalog module key MUST correspond to a real, enableable module
  in the application.

**Data safety**

- **FR-010**: Every hiding/gating rule MUST be reversible: type flips reveal hidden
  grade data verbatim; staff purchase reveals payroll history verbatim; module
  disable/re-enable restores module data verbatim.
- **FR-011**: Cascade removals MUST remain precise under concurrent edits (latest
  save wins per the domain rules; no orphaned evaluations; unrelated data intact).
- **FR-012**: Center-type values MUST round-trip unchanged from the landing signup
  form through the stored request to the provisioned center.

**Release gates**

- **FR-013**: The complete quality-gate suite (typecheck, full test suite including
  all new per-feature suites, production build) MUST pass at the combined state.
- **FR-014**: Each feature's own quickstart scenarios MUST pass at the combined
  state, re-verified on the composed configurations (not just per-feature setups).
- **FR-015**: The coordination items deferred by features 001/004/005 (admin-repo
  migrations for the three new tables) MUST be scheduled with the admin repository
  before release; canonical shared files MUST exist as single definitions.

### Key Entities *(include if feature involves data)*

No new entities. The verification operates over the union of existing entities:
centers (type, entitlements, legacy lists), children (hidden grade data), staff
(payroll history), activities, skills, evaluations, and the shared module catalog.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the composed-configuration walkthroughs (crèche full pass,
  legacy pass, garderie/formation pass) behave exactly as each underlying feature
  specifies — no cross-feature interference observed.
- **SC-002**: The pre-existing automated suite passes unmodified (100%) after the
  entire program lands.
- **SC-003**: 100% of round-trip checks (type flip, staff purchase, module
  disable/re-enable, cascade) restore data verbatim.
- **SC-004**: Landing and renewal catalogs are 100% identical entry-by-entry, and
  every catalog key maps to a real module (100%).
- **SC-005**: The complete quality-gate suite passes at the combined state, with
  every feature's suite included.
- **SC-006**: All coordination items (admin-repo migration scheduling, canonical
  file convergence) are closed before release.

## Assumptions

- **Features 001–005 are implemented** (each has a complete speckit chain); this
  feature verifies their combination and may add cross-feature tests and fixes, but
  does not re-implement them.
- **Test environments can provision composed configurations** (type × entitlements ×
  role) by local data adjustment until admin-side provisioning covers all
  combinations.
- **Fixes discovered during verification** belong to the owning feature's code and
  tests; this feature's deliverables are the composed tests, the verification
  passes, and any integration fixes those tests force.
- **The pre-existing suite is the regression baseline** — it runs unmodified; any
  failure is a program bug, never a reason to weaken an old test.
- **Admin-repo coordination** (migrations for `activities`, `skills`,
  `skill_evaluations`) follows the established model: scheduled there, blocking
  production only.
- **Scope excludes**: new user-facing capabilities, per-feature re-verification that
  their own quickstarts already cover in isolation (only composed configurations
  are re-run here), and any pricing/value changes.
