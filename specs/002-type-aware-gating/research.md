# Phase 0 Research: Type-Aware Gating

**Feature**: `002-type-aware-gating` | **Date**: 2026-09-23

No NEEDS CLARIFICATION items — the spec's assumptions section pinned the product
decisions. The research below resolves the design choices the codebase left open.

## R1 — Single source of the type-behavior matrix

**Decision**: Two pure predicate functions in one shared utility module —
`hasSchoolLevel(type)` (true for garderie/formation) and `hasStudyModules(type)`
(true for garderie/formation) — with unknown/empty input returning **true**.

**Rationale**: The two predicates currently coincide, but they answer different
questions (fields/actions vs modules); keeping them separate means a future product
decision ("garderie hides grades") is a one-word change, exactly as featuredPlan.md
records. Unknown→true preserves legacy centers with zero migration (spec edge case 1,
FR-004).

**Alternatives considered**: (a) inline `centerType === 'jardin' || ...` comparisons at
each call site — rejected: scattered logic, no single testable truth; (b) a config
object mapping each type to feature flags — rejected for now: two functions cover every
current rule, and the config grows trivially from them if a third axis appears.

## R2 — How centerType reaches the gated components

**Decision**: Explicit prop threading, following the existing precedent —
`Dashboard` already receives `centerType` as a prop and `StudentTimeSheetModule` too.
App.tsx renders `StudentRegistrationModule` (~line 1103) and `SuiviScolaireModule`
(~line 1122); both gain the same optional prop from `currentCenter?.centerType`.

**Rationale**: Matches the codebase's established data-flow style (props down from the
App root, where `currentCenter` lives); no context/store machinery needed for two
consumers; optional prop keeps every existing test and usage compiling unchanged.

**Alternatives considered**: React context for center settings — rejected: over-engineering
for two consumers and diverges from how Dashboard/StudentTimeSheet already do it;
reading from a global — rejected: breaks the test-first convention of rendering
components with explicit props.

## R3 — Gating modules in the sidebar vs the guard effect

**Decision**: Both. The `menuItems` array excludes the four study tabs for
non-study types (so they never render), and the existing tab-guard effect (which today
bounces `restricted_admin` users off restricted tabs) is extended with the same
predicate (so stale active tabs / deep links always fall back to the dashboard). The
existing `hasCenterModule` subscription gate continues to apply on top — composition
per FR-010.

**Rationale**: Menu exclusion alone leaves the active-tab state reachable via
bookmarks/links; the guard closes that hole with a mechanism that already exists and is
already tested for the role-based case.

**Alternatives considered**: only filtering menu items — rejected: FR-009 requires
deep-link fallback; a new route-level guard — rejected: the app is a single-page tab
switcher; the effect IS the route guard here.

## R4 — Which grade surfaces are in scope

**Decision**: Registration form (grade + établissement blocks), student list rows and
grade filter, student card print, registration print, Suivi receipt grade display, and
Suivi grade filter/`matchesGrade` search logic. Out of scope: `FormationModule` and
`TimeSheetModal` grade selects (they serve the study modules themselves — unreachable
for crèche/jardin once Story 3 lands, and unchanged for garderie/formation), and
`BusDriverModule`'s establishment column (it reads the stored value for transport
rosters; data remains valid there and hiding it is not required by the spec).

**Rationale**: The spec's FR-003 enumerates the surfaces (list, card, registration
print, receipts, filters). The exclusions are all either unreachable for the affected
types after Story 3 or are data-completeness surfaces the spec doesn't cover; this
matches the plan's "fewest changes" rule.

**Alternatives considered**: hiding grade in every file containing the string —
rejected: over-reach beyond the spec, risks degrading garderie/formation surfaces that
share the same components.

## R5 — Test strategy for gated UI

**Decision**: Four test files, all failing-first: (1) predicate truth-table unit test;
(2) StudentRegistrationModule component test rendering with `centerType='creche'` vs
`'formation'` (asserting field absence/presence and successful empty-grade submit);
(3) SuiviScolaireModule test asserting icon presence/absence by their accessibility
titles; (4) an App-level test rendering the shell with a crèche center asserting the
four study labels are absent from nav and that setting the tab id falls back to
dashboard. Testing Library render convention per existing `*.test.tsx` files.

**Rationale**: Every FR maps to exactly one assertion site; component tests avoid
full-app rendering except where gating genuinely lives at App level (menu, guard).

**Alternatives considered**: only App-level tests — rejected: slow and brittle;
only unit tests — rejected: cannot prove FR-001/FR-005 render behavior.

## R6 — Compatibility with feature 001

**Decision**: This feature builds standalone: it creates the same
`src/utils/centerType.ts` that 001's Phase 1 anticipates. If 001 lands first, its
Setup phase consumes this file unchanged; if 002 lands first, 001 reuses it. Either
order converges on one file with identical content.

**Rationale**: Both specs derive from the same approved plan; the utility is the
shared seam, and the unknown→true default makes 002 a functional no-op until typed
centers exist (recorded in the spec's assumptions).

**Alternatives considered**: duplicating predicates inside each component — rejected:
guarantees drift between the two features.
