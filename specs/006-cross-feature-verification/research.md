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
