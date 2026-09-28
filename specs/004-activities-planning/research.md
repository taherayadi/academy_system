# Phase 0 Research: Activités & Planning Module

**Feature**: `004-activities-planning` | **Date**: 2026-09-23

No NEEDS CLARIFICATION items — the spec's assumptions pinned categories, bands,
grouping semantics, and conflict handling. Research resolves the design choices the
codebase left open.

## R1 — Storage and route pattern (convergence with 001)

**Decision**: A dedicated tenant-scoped `activities` table read/written through
`readActivities`/`writeActivities` in `functions/api/_lib.ts` (formations pattern:
whole-domain read; validate-and-replace write with `center_id` on every statement),
exposed as `GET/PUT /api/activities`. Identical to feature 001's Phase-4 design and
its drafted contract — the two features converge on the same code.

**Rationale**: The formations pattern is the established convention for structured
domains with child data; reusing it verbatim minimizes review surface and lets 001
and 004 share a single migration and handler if shipped together.

**Alternatives considered**: `/api/state` bag entry — rejected: legacy aggregate,
loses the domain-route contract; per-item REST verbs — rejected: diverges from the
replace-domain convention used by formations/meals/events.

## R2 — Time model: bands vs arbitrary minutes

**Decision**: Fixed half-hour bands (06:00–20:00) computed by a pure helper;
activities store exact `timeStart`/`timeEnd` but their chip renders in the band
containing `timeStart`.

**Rationale**: Matches the spec assumption (chips snap to the start band); a pure
banding function is trivially unit-testable and keeps the grid layout a simple
two-dimensional bucketing problem. Editing keeps exact minutes (display in the
dialog), so no data precision is lost.

**Alternatives considered**: pixel-proportional positioning (calendar-app style) —
rejected: substantially more layout complexity for no v1 user value; operating-hours
config per center — deferred: fixed band window covers all realistic schedules; can
become a setting later without data change.

## R3 — Move interaction

**Decision**: HTML5 drag events for pointer devices (dragstart on chip, drop on day/
band cells), plus a tap-select-then-choose fallback: tapping a chip selects it (visual
ring), then tapping a target cell moves it. Same mechanism family as the existing
formation schedule modal (native events, no library).

**Rationale**: No new dependency (constraint); the dual interaction covers touch
(FR-007) without device sniffing — both mechanisms coexist harmlessly.

**Alternatives considered**: external DnD library — rejected: new dependency for one
surface; long-press-to-drag polyfill — rejected: complexity, inconsistent mobile UX.

## R4 — Grouping implementation

**Decision**: View-level bucketing by a pure function: `groupBy: 'class' | 'location'`
splits activities into ordered groups (alphabetical by label, 'unassigned' last); the
grid renders one mini-planner per group. No data change on toggle (spec assumption).

**Rationale**: Keeps the data model flat (no group entities), matches "grouping is a
view toggle", and makes grouping trivially unit-testable (bucket in → groups out).

**Alternatives considered**: filter-by-tabs UI — rejected: spec says the planner
regroups (presents all groups), not filters to one; color-coding by group — rejected:
colors are already category semantics.

## R5 — Category colors

**Decision**: A fixed category→color-class map (Tailwind classes from the existing
brand palette family): motricite (emerald), art (violet), musique (amber), jeu (sky)
— constants in the shared planner utility.

**Rationale**: Deterministic, accessible-contrast palette colors already used across
the app; a single map keeps chips consistent everywhere (grid, dialogs, dashboards).

**Alternatives considered**: user-chosen colors per activity — rejected: out of spec
(colors are category semantics per FR-004); dynamic palette generation — rejected:
unpredictable contrast.

## R6 — Validation placement

**Decision**: Two layers, one truth: a pure `validateActivity` predicate in the
planner utility (title non-empty; category in enum; weekday 0–6 XOR date present;
timeStart < timeEnd) consumed by the dialog for inline blocking, and mirrored by the
server write (invalid rows dropped per the contract). Client blocks submission with a
clear message; server is the backstop.

**Rationale**: Same rules enforced at both layers prevents drift; the pure predicate
is unit-tested directly (FR-014/SC-003).

**Alternatives considered**: server-only validation — rejected: poor UX for a
form-heavy flow; a form library — rejected: heavy for one dialog.

## R7 — App wiring and sync

**Decision**: Standard chain: `ModuleKey += 'activites'` → tab-map entry → sidebar
entry (Shapes icon) → existing `hasCenterModule` gate (automatic via the tab map) →
guard effect fallback (automatic) → dashboard card filtered by the existing module
check. State lives in App with a `saveActivities` call inside the existing
`commitDomain` queue (App.tsx ~336, which chains saves, toasts errors, and handles
session expiry), plus the activities key added to the live-sync refetch list so
multi-session edits propagate.

**Rationale**: Zero new gating or save machinery; `commitDomain` already provides
queued, error-toasting, session-aware saves — the exact behavior FR-013 requires.

**Alternatives considered**: module-local state with its own save — rejected:
bypasses the queue and sync conventions; a separate store — rejected: architectural
divergence.

## R8 — Landing/renewal exposure

**Decision**: One `ALL_MODULES` entry (Shapes icon, FR/AR labels, description) +
`PLAN_PRESET_MODULES.growth`/`.pro` += 'activites'; starter untouched. Both consumer
surfaces (landing simulator, RenewalModule) render from this shared catalog already —
verified during 001 planning (RenewalModule.tsx ~287–294, LandingPage imports
`ALL_MODULES` directly).

**Rationale**: Single source of truth gives SC-004 (landing ≡ renewal) for free;
derive-plan-from-modules then yields FR-010's Growth/Pro behavior without new logic.

**Alternatives considered**: separate hard-coded lists per surface — rejected:
guaranteed drift.
