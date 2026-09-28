# Phase 0 Research: Center Types & New Modules

**Feature**: `001-center-types-new-modules` | **Date**: 2026-09-23

All NEEDS CLARIFICATION items from Technical Context resolved below (there were none
blocking; the decisions here pin down the approach options the codebase left open).

## R1 — Persistence layout for the two new modules

**Decision**: Three new dedicated D1 tables — `activities`, `skills`,
`skill_evaluations` — each with a `center_id` column, following the formations
domain pattern (own read/write functions, full-domain replace on write). Not a new
column on an existing table, not documents inside the `state` bag.

**Rationale**: The codebase's per-domain table + `read*/write*` pair (see
`readFormations`/`writeFormations`) is the established pattern for structured domains
with child collections; it keeps queries tenant-filterable by `center_id` and matches
the existing `writeState` delete-then-insert cycle. Storing them as untyped JSON blobs
would lose validation and complicate the isolation tests; a single combined table for
skills+evaluations would blur ownership semantics.

**Alternatives considered**: (a) extend the generic `/api/state` bag — rejected: the
bag is the legacy aggregate; new modules deserve domain routes per the contract-surface
principle; (b) KV/JSON column — rejected: no per-center filtering, weak validation.

## R2 — Migration ownership

**Decision**: The `CREATE TABLE` statements for the three tables are added to the
**admin repository's** shared migration sequence. This repository's contribution
documents the required schema in `data-model.md`; no migration files are created here.

**Rationale**: Constitution Principle I explicitly assigns all shared D1 migrations to
the SaaS admin repository; creating a competing sequence here is prohibited.

**Alternatives considered**: local-only migration in this repo — rejected as a
constitution violation in production; waiting for schema without designing contracts —
rejected: the schema here is the coordination artifact the admin repo implements.

## R3 — Route surface for skills and evaluations

**Decision**: One route path per domain: `GET/PUT /api/activities` and
`GET/PUT /api/skills`, where the skills domain document contains both the catalog and
the per-child evaluations (same document the client renders from). Child evaluations
ride inside the skills domain write, mirroring how formations students/matieres ride
inside `/api/formations`.

**Rationale**: Fewest new inventory entries while preserving exact-method contracts;
matches how the app already saves whole-domain documents atomically; avoids a
`/api/child-skills` path that would duplicate ownership checks.

**Alternatives considered**: separate `/api/child-skills` route — rejected: extra
inventory surface without an ownership benefit; per-item POST/PATCH/DELETE — rejected:
diverges from the app's replace-domain convention used by formations/meals/events.

## R4 — Staff-lite enforcement point

**Decision**: Enforcement is client-side visibility (menu + module sections) driven by
the center's enabled-modules list; the underlying staff CRUD endpoint remains shared.
Server-side, nothing new is exposed: the staff route already exists and is gated by
authentication; payroll objects (payslips, advances, leave) are only ever *written*
through `/api/staff` PUT payloads — the lite UI simply never sends or renders them.

**Rationale**: Consistent with how every other module gate works in this app today
(`enabledModules` drives visibility; state sync refetches on plan change). Adding a
server-side payroll-permission system would be a new capability out of scope, and the
existing threat model treats the center tenant as one trust domain.

**Alternatives considered**: hard server split (reject payroll writes for unpaid
centers) — noted as a hardening follow-up, not required by the spec; a separate
"staff-lite" module key — rejected: spec says the same module, limited view.

## R5 — Type predicates and defaults

**Decision**: Two pure helpers in one shared utility: `hasSchoolLevel(type)` → true for
`garderie`/`formation`; `hasStudyModules(type)` → true for `garderie`/`formation`.
Empty/unknown types return **true** (legacy centers keep today's full visibility —
spec's edge case #1). Crèche behaves like jardin everywhere except module eligibility,
which it shares with all types for Activités & Planning.

**Rationale**: Encodes the validated product decision in exactly one place; unknown-type
default preserves backward compatibility with zero migration.

**Alternatives considered**: per-component string comparisons — rejected: scattered
logic, testable nowhere; a `centerTypes` config object with per-type feature maps —
rejected for now: over-engineered for two predicates, easy to grow into later.

## R6 — Where the new modules plug into gating

**Decision**: Follow the full existing chain: `ModuleKey` union += `activites`,
`competences` → `TAB_MODULE` entries → sidebar `menuItems` entries → automatic
`hasCenterModule` gating (already generic over `TAB_MODULE`) → dashboard cards filtered
by `isModuleAllowed` → `PLAN_PRESET_MODULES.growth`/`.pro` += both keys (starter
excluded) → pricing catalog entries in `ALL_MODULES` (which automatically feeds both the
landing simulator and RenewalModule since both render from it).

**Rationale**: Zero new gating machinery; the derive-plan-from-modules rule then makes
"any add-on selected → Growth" true automatically, satisfying FR-029 without new logic.

**Alternatives considered**: special-casing the two modules into a "premium tier"
constant — rejected: the presets + derive rule already express this exactly.

## R7 — Weekly planner interaction model

**Decision**: Grid columns = weekdays (or the single dated day when the planner is
switched to date mode), rows = fixed half-hour time bands; activities render as
category-colored chips inside their start-band cell, overlapping activities stack within
the cell; drag-to-move is implemented with the same HTML5 drag events already used in
the formation schedule modal. A simpler click-to-move fallback (select → pick slot) is
included for touch devices.

**Rationale**: Matches the existing interaction precedent (no new DnD dependency),
works on touch, and keeps the module shippable without a library decision.

**Alternatives considered**: external DnD library — rejected: new dependency for one
surface; absolute-positioned canvas — rejected: complexity, poor mobile support.

## R8 — Skills report printing

**Decision**: Reuse the app's established print approach: a dedicated print-only DOM
section toggled by state, styled by the existing print stylesheet patterns used for
bulletins/receipts (print CSS classes already present in `index.css`), producing an
A4 report listing each domain with skill levels, evaluator, and date.

**Rationale**: Consistency with every other printable document in the app; zero new
print infrastructure.

**Alternatives considered**: client PDF library — rejected: new dependency, divergent
styling; server-rendered PDF — rejected: no such capability exists in this deployment.

## R9 — Evaluator picker when Staff is not purchased

**Decision**: When the staff module is enabled for the center → staff roster dropdown
(same source as Étude's supervising-staff picker). Otherwise → free-text name input;
`evaluatedBy` stores either the staff id reference or `{ freeText: name }` so history
distinguishes the two.

**Rationale**: Implements FR-023 with one render branch; the discriminated storage
keeps reports truthful about who evaluated.

**Alternatives considered**: always free text — rejected: loses roster linkage for
paying centers; blocking evaluation without staff — rejected: contradicts the
staff-lite philosophy.

## R10 — Landing + renewal catalog exposure

**Decision**: Both new modules are entries in the single pricing catalog
(`ALL_MODULES`), therefore they automatically appear in the landing simulator and the
renewal module; presets (`PLAN_PRESET_MODULES`) place them in growth and pro only; the
starter preset omits them. Module prices come from the existing public-pricing source —
no pricing code changes beyond catalog entries.

**Rationale**: One catalog, two consumers (verified: both import from the shared
catalog); the derive-plan rule then maps base-only→Basic, any add-on→Growth, all→Pro
automatically, so FR-028/FR-029 hold with data, not code.

**Alternatives considered**: hard-coded plan-to-module map in the landing — rejected:
duplicates the renewal logic and drifts.
