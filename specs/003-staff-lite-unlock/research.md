# Phase 0 Research: Staff-Lite Unlock

**Feature**: `003-staff-lite-unlock` | **Date**: 2026-09-23

No NEEDS CLARIFICATION items — the spec's assumptions section pinned the product and
enforcement decisions. Research resolves the design choices the codebase left open.

## R1 — How lite mode is derived and communicated

**Decision**: App.tsx derives `staffLite = etudeEnabled && !staffEnabled` from the
center's enabled-modules list (module lists present and non-empty; a legacy empty list
keeps everything visible and therefore full mode), and passes it as an explicit
`staffLite?: boolean` prop plus an `onGoToRenewal?: () => void` callback into
`StaffManagementModule`.

**Rationale**: Matches the established data-flow style (Dashboard receives
`centerType`, `hideRestrictedModules`; modules receive behavior props). Deriving once
in App keeps the rule in one testable place and lets the module stay dumb; the
undefined default keeps every existing render and test compiling unchanged.

**Alternatives considered**: (a) module derives lite itself from a passed
enabledModules array — rejected: spreads the business rule into the component and
duplicates what App already computes for gating; (b) context — rejected: over-engineering
for one consumer, diverges from precedent.

## R2 — Navigation unlock mechanics

**Decision**: The sidebar's `module8` entry renders when staff is enabled **or** étude
is enabled (plus the existing restricted_admin condition). The existing
module-enablement fallback guard (which redirects active tabs to the dashboard when the
module list no longer includes their key) must whitelist `module8` when étude is
present, otherwise a mid-session sync could bounce a lite center out of the staff tab.

**Rationale**: The guard is generic over `TAB_MODULE` and would otherwise treat the
unlocked-but-unpaid staff tab as disabled. Whitelisting at the same site where
`hasCenterModule` computes keeps both behaviors consistent.

**Alternatives considered**: a new pseudo-module key for "staff-lite" — rejected: the
spec says the same module in a limited view; a pseudo-key would ripple into pricing and
admin provisioning.

## R3 — What gets locked, precisely

**Decision**: In lite mode: (1) the profiles/pointage sub-tab switcher renders
profiles-only (pointage tab button hidden); (2) the pointage branch never renders; (3)
payslip generation, advances, congés, and the staff schedule sections/modals in the
profile detail are replaced by a single locked-feature card with an upgrade button
calling `onGoToRenewal`. Daily pointage state syncing and payroll rendering code stay
intact but unreachable.

**Rationale**: The staff module already organizes its surface by `activeSubTab`
('profiles' | 'pointage') and by per-feature modals — the lock is a render-time
branch per surface, no restructuring. Keeping code intact-but-unreachable minimizes
diff size and regression risk for paying centers (FR-011).

**Alternatives considered**: deleting payroll code paths in lite builds — rejected:
same bundle serves both modes; a separate lite component — rejected: duplicates 2000+
lines and guarantees drift.

## R4 — Guaranteeing no payroll writes from lite sessions

**Decision**: The lock is structural: every payroll write in the module flows through
UI surfaces that render only in full mode (payslip modal, avance modal, congé modal,
pointage day form). In lite mode those modals/buttons never render, so no payroll
payload can be composed or sent; the staff-save path (which lite uses for CRUD) is the
existing staff-record PUT, unchanged.

**Rationale**: Structural unreachability is verifiable by render assertions (locked
card present, modals absent) without adding a payload-inspection layer; matches the
spec's client-side enforcement assumption.

**Alternatives considered**: stripping payroll fields from the save payload in lite —
unnecessary: lite's save path never carries them (staff-profile fields only);
server-side rejection of payroll fields for unpaid centers — a hardening follow-up,
explicitly out of scope per the spec.

## R5 — Mid-session flip (renewal processed while logged in)

**Decision**: No special handling. `staffLite` derives from the same synced
enabled-modules list that drives every module gate; when a renewal lands, live sync
refetches and the staff module transitions lite→full (or hidden) exactly like other
modules. The active tab stays valid because module8 is whitelisted for étude centers
in both modes (R2).

**Rationale**: Reuses the existing subscription-sync behavior the app already tests;
zero new machinery.

**Alternatives considered**: forcing logout/reload on mode flip — rejected: breaks the
established seamless-renewal UX.

## R6 — Test strategy

**Decision**: One component test file with three render modes: (1) lite — profiles
visible, add/edit/delete controls present, pointage tab absent, locked cards present
with upgrade button that invokes the renewal callback, and a CRUD interaction
asserting the save callback receives the updated roster; (2) full — pointage tab
present, no locked cards (regression guard); (3) an App-level assertion that the
sidebar shows module8 for an étude-only center and hides it for a neither-module
center.

**Rationale**: All three FR clusters map to visible, assertable output; callback
invocation proves the upgrade path without rendering the whole renewal module.

**Alternatives considered**: end-to-end purchase flow test — rejected: out of scope
(renewal module unchanged); payload-level tests — rejected: no payload changes exist
to test.
