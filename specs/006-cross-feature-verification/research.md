# Phase 0 Research: Cross-Feature Verification & Release Readiness

**Feature**: `006-cross-feature-verification` | **Date**: 2026-09-23

No NEEDS CLARIFICATION items — the spec pins composition semantics (intersection of
visibility), the immutable legacy baseline, and the closure list. Research resolves
the verification-design choices.

## R1 — Composed test strategy: renders vs per-feature re-runs

**Decision**: Composed suites render the app shell (or invoke handlers) with
**combined configurations** in a single render/call — crèche + étude-without-staff +
both new modules in one pass — rather than re-running each feature's quickstart in
isolation. Per-feature quickstarts are re-run only on the composed configurations
(cross-feature walkthroughs), as the spec's FR-014 states.

**Rationale**: Cross-feature interference (the thing this feature hunts) only
manifests when features are active simultaneously; isolated re-runs prove nothing
new. Single-render composition also catches provider/state conflicts that
sequential per-feature testing would mask.

**Alternatives considered**: only manual composed walkthroughs — rejected: not
repeatable, violates the gates principle; full E2E browser suite — rejected: heavy
new infrastructure for states the component-level renders already reach.

## R2 — Configuration factories

**Decision**: A `src/testing/programConfig.ts` factory builds composed center
configurations (`type`, enabled modules, role) with defaults equal to the legacy
passthrough (unknown type, empty module list). Composed suites consume the factory;
the factory's own test pins the defaults.

**Rationale**: One definition of each composed configuration keeps the matrix
(data-model.md) and the tests in lockstep; defaults-as-legacy makes the factory
self-documenting about the passthrough guarantee (FR-004).

**Alternatives considered**: inline literal configs per test — rejected: drift
between suites reproducing "the same" configuration; fixtures on disk — rejected:
heavier, harder to keep in sync with type changes.

## R3 — Catalog coherence assertions

**Decision**: The coherence suite imports the catalog once and asserts: (a) both
consumer surfaces render from that same source (their imports/components are
resolved and rendered in the test), (b) presets match the tier rules per key,
(c) `derivePlanFromModules` matches for representative selections, and (d) every
catalog key maps to a registered module key/tab (no phantom entries).

**Rationale**: (d) is the novel cross-check — it catches the "listed but not
buildable" failure mode the spec calls out (FR-009), which no per-feature test
covers.

**Alternatives considered**: snapshot tests of the rendered catalog — rejected:
brittle against label copy edits; comparing rendered DOM strings across surfaces —
rejected: indirect; asserting the shared source is the robust invariant.

## R4 — Round-trip tests without mutation side effects

**Decision**: Round-trip suites operate on in-memory state through the same props
the app uses (flip type prop, toggle module lists, compose skill-catalog saves),
asserting reveal/verbatim-restoration on re-render. No test writes to persistent
storage; the persistence-layer guarantees are already covered by the features'
handler suites.

**Rationale**: The round-trip guarantees are presentation-layer invariants (hiding
never destroys); exercising them at the render boundary proves FR-010 without
duplicating storage tests.

**Alternatives considered**: database round-trips — rejected: duplicates 001/005
handler coverage; manual-only verification — rejected: not repeatable in gates.

## R5 — Concurrency cascade test

**Decision**: The cascade-under-concurrency check simulates two sequential saves
with different document states (session A removes a skill; session B, stale,
evaluates it) through the domain write path and asserts the stored result follows
the defined rules: latest write wins as a whole document; cascade applies within
it; no orphaned evaluations survive; unrelated evaluations intact.

**Rationale**: The spec's FR-011 names concurrent edits explicitly; modeling the
stale-second-writer through the real write function catches ordering bugs the
single-writer tests cannot.

**Alternatives considered**: real two-client integration with PubNub — rejected:
out of scope, nondeterministic; pure unit test of the dedupe helper — rejected:
misses the cascade interaction.

## R6 — Integration-fix protocol

**Decision**: When a composed test exposes a cross-feature bug, the fix lands in
the owning feature's production file, in the same change as the failing composed
test, and the composed test moves to green in that same change. No fix is deferred
to "later" and no composed test is skipped or weakened.

**Rationale**: Mirrors the constitution's fix-with-test rule at program level;
keeps 006's deliverable honest (a verification feature that skips failures is
worthless).

**Alternatives considered**: TODO-marking failures as known issues — rejected:
contradicts the gates; weakening legacy tests to make composed ones pass —
rejected: FR-006 forbids it explicitly.

---

# Revision B research — remarks alignment (`center-type-module-rules.md`)

## R7 — Where does module × center-type compatibility live?

**Decision**: Extend the existing canonical `src/utils/centerType.ts` with a
`moduleCenterTypes` map (module key → served center types) plus
`isModuleCompatible` / `incompatibleModules` helpers. No new file, no new
catalog field.

**Rationale**: The program already asserts single canonical definitions (T004,
FR-015); adding a second compatibility source (e.g. a field on `PricedModule` in
`pricing.ts`) would fork the concept between commercial catalog and type rules.
The remarks matrix is a *type* rule, not a pricing rule, so it belongs with the
type predicates. Three surfaces (renewal, landing cards, demo form) consume one
map, keeping the coherence guarantee trivially testable. Unknown/empty type →
compatible (legacy passthrough) preserves FR-004.

**Alternatives considered**: a `centerTypes?: CenterType[]` field on
`PricedModule` — rejected: couples type rules into the pricing catalog and makes
the landing/renewal identity check carry semantics it doesn't need; per-surface
hardcoded lists — rejected: three copies of the matrix, drift guaranteed;
backend/column on centers — rejected: presentation-level concern, no schema
change warranted, admin repo untouched.

## R8 — Locking vs hiding the pointage sub-tab in staff-lite

**Decision**: Keep the pointage sub-tab button visible but `disabled` with the
locked style and a lock glyph in lite mode; the panel never opens.

**Rationale**: Remark 3's principle is explicit for payroll: "show them as locked
… rather than hiding them, so the value of upgrading is visible." The shipped
behavior hides pointage's content but leaves a clickable dead tab — worse than
either clean option. Aligning on visible-but-locked is consistent with the
payroll treatment and turns an empty panel into an upgrade signal.

**Alternatives considered**: hiding the tab entirely (current behavior) —
rejected: contradicts the remark's visibility principle and leaves the dead-click
bug; leaving clickable with a toast — rejected: an interactive control that does
nothing but complain is a worse affordance than a disabled one.

## R9 — Renewal offering vs. already-enabled incompatible modules

**Decision**: The renewal *simulator* lists only compatible modules; an
incompatible module already present in `enabledModules` still appears in the
current-plan display (enabled, priced) but is never re-offered as an option.

**Rationale**: Remark 4 says "incompatible modules are never offered" — offering
is the simulator's job, not the current-plan summary's. Hiding an existing paid
module from its own display would make a paid capability vanish without any
change (contradicts FR-010's reversibility trust guarantee and confuses billing).

**Alternatives considered**: filtering `enabledModules` itself in the display —
rejected: data disappearance without a data change; stripping incompatible keys
from the payload — rejected: 006 forbids silent data mutation outside explicit
round-trips.

## R10 — Demo-form compatibility feedback: informative, not blocking

**Decision**: A live info banner (ℹ️, non-error styling) lists incompatible
selections and suggests removal or a type switch; submit stays enabled and the
payload is sent unmodified.

**Rationale**: Remark 6's text is a directive: "Keep it informative rather than
blocking: guide the choice instead of rejecting the submission outright." The
provisioning flow (FR-012 round-trip) stays untouched.

**Alternatives considered**: blocking submit — rejected: explicitly against the
remark; silently removing incompatible modules from the selection — rejected:
mutates the visitor's choice without consent, and the remark wants them to
choose.
