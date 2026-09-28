# Phase 0 Research: Compétences & Skills Module

**Feature**: `005-competences-skills` | **Date**: 2026-09-23

No NEEDS CLARIFICATION items — the spec pinned domains, levels, cascade semantics,
evaluator rules, and grouping. Research resolves the design choices the codebase left
open.

## R1 — Domain document shape (catalog + evaluations in one route)

**Decision**: One skills domain document `{ catalog: Skill[], evaluations:
SkillEvaluation[] }` served by `GET/PUT /api/skills` (formations pattern:
validate-and-replace). Identical to feature 001's drafted skills contract — the
features converge on one implementation.

**Rationale**: Catalog and evaluations are one ownership domain; the single write
enables atomic cascade (removing a skill and its evaluations in the same save —
FR-004's "same save" requirement is naturally satisfied by whole-document replace).
One inventory entry keeps the contract surface minimal.

**Alternatives considered**: separate `/api/child-skills` route — rejected: second
inventory entry, second ownership check, and cascade across two writes instead of
one; per-item REST verbs — rejected: diverges from the app's replace-domain
convention.

## R2 — Evaluator discriminator storage and rule

**Decision**: `SkillEvaluation` carries `evaluatedByStaffId` XOR `evaluatedByName`
(exactly one non-null; server-enforced). The UI rule is a pure helper
(`evaluatorMode(staffEnabled)` → 'roster' | 'freetext') driven by the center's
staff-entitlement signal (the same enabled-modules signal feature 003 derives) —
reusing Étude's roster source when 'roster'.

**Rationale**: The discriminated pair keeps reports truthful about who evaluated in
both entitlement modes, and the mutual exclusivity is testable at both layers
(FR-006/SC-005). Reusing 003's signal avoids a second definition of "has staff".

**Alternatives considered**: always store a name string (resolving roster ids to
names at save) — rejected: loses roster linkage for paid centers and drifts if names
change; optional both-fields — rejected: ambiguous data.

## R3 — Latest-save-wins semantics

**Decision**: Evaluations are keyed by `(studentId, skillId)`; the domain write
dedupes pairs keeping the last occurrence. No history is kept (spec assumption).

**Rationale**: Matches FR-007 exactly; dedupe-at-write means the stored document is
always the renderable current state, and the heatmap/report need no folding logic.

**Alternatives considered**: append-only history with a "current" flag — rejected:
out of scope for v1 (history explicitly excluded); client-side dedupe only —
rejected: server must guarantee the invariant for multi-session edits.

## R4 — Cascade removal

**Decision**: On write, evaluations whose `skillId` is absent from the same write's
catalog are dropped; evaluations whose `studentId` is not a child of the center are
dropped. Both rules live in `writeSkills` (server) and are mirrored by the client
save path composing the document.

**Rationale**: Implements FR-004 and the spec's edge case in one place; the
whole-document replace makes "same save" atomic by construction.

**Alternatives considered**: client-side-only cascade — rejected: unsafe under
multi-session edits; soft-delete of skills — rejected: complicates the catalog UI
for no v1 value.

## R5 — Heatmap bucketing and level rendering

**Decision**: Pure helpers in `src/utils/skills.ts`: `heatmap(rows, children, skills)`
→ ordered buckets (children grouped by class label, alphabetical, 'unassigned' last;
columns follow catalog order grouped by domain); `LEVEL_COLORS` fixed map
(non évalué=slate-neutral, émergent=amber, en cours=sky, acquis=emerald). Unevaluated
cells render neutral (explicit null handling — FR-008).

**Rationale**: View-only derivations stay pure and unit-testable; the class label is
read from the child at render time (spec edge case: label changes regroup
automatically — nothing stored on the evaluation).

**Alternatives considered**: percentage aggregation per class — rejected: spec wants
per-cell levels with summaries, not aggregated scores; library chart component —
rejected: new dependency for a simple grid.

## R6 — Report printing

**Decision**: A state-toggled print-only section using the app's established print
mechanism (`.print-area` / `.no-print` / `@media print` conventions in
`src/index.css`, same as BusDriverModule's printable route sheet), listing domains →
skills → level/evaluator/date, with the explicit "no evaluations" empty state.

**Rationale**: Zero new print infrastructure, visual consistency with bulletins by
construction (FR-009), and the print color-exactness rules already in the stylesheet
cover the level colors.

**Alternatives considered**: PDF generation library — rejected: new dependency,
divergent styling; server-rendered document — rejected: no such capability in this
deployment.

## R7 — App wiring

**Decision**: Standard chain (identical to 004's): `ModuleKey += 'competences'` → tab
map → sidebar (Brain icon) → existing module gate (automatic) → guard fallback
(automatic) → dashboard card filtered by the module check. State in App with
`saveSkills` inside `commitDomain` (queued saves, error toasts, session handling) and
the skills key added to the live-sync refetch list.

**Rationale**: Zero new machinery; matches 004's wiring so the two Growth/Pro modules
are symmetric and reviewable together.

**Alternatives considered**: module-local state — rejected: bypasses queue/sync
conventions.

## R8 — Commercial exposure

**Decision**: One `ALL_MODULES` entry (Brain icon, FR label, description) +
`PLAN_PRESET_MODULES.growth`/`.pro` += 'competences'; starter untouched. Landing
simulator and RenewalModule render from the shared catalog (verified in 001/004
planning), giving landing ≡ renewal agreement (SC-006) for free.

**Rationale**: Single source of truth; derive-plan-from-modules yields FR-010's
behavior without new logic.

**Alternatives considered**: separate per-surface lists — rejected: guaranteed
drift.
