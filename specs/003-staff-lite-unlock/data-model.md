# Phase 1 Data Model: Staff-Lite Unlock

**Feature**: `003-staff-lite-unlock` | **Date**: 2026-09-23

No new entities or fields. One consumed input (the center's enabled-modules list)
drives a **mode matrix** — this is the feature's complete behavioral contract.
No stored value is created, modified, or deleted by this feature.

## Consumed input (read-only)

### Center.enabledModules (existing)

Two memberships matter:

| membership | effect |
|---|---|
| `staff` present | staff module in **full** mode |
| `etude` present, `staff` absent | staff module in **lite** mode (visible, limited) |
| neither present (non-legacy list) | staff module hidden |
| legacy empty/absent module list | everything visible, staff **full** (today's behavior) |

## Mode matrix (the behavioral contract)

| Surface | Étude-only center (lite) | Staff center (full) | Neither (hidden) | Legacy list |
|---|---|---|---|---|
| Sidebar « إدارة الموظفين » | ✓ visible | ✓ visible | ✗ | ✓ |
| Staff list + add action | ✓ | ✓ | — | ✓ |
| Edit staff member | ✓ | ✓ | — | ✓ |
| Delete staff member | ✓ | ✓ | — | ✓ |
| Daily pointage sub-tab (button + view) | ✗ unreachable | ✓ | — | ✓ |
| Payslip generation | ✗ locked card | ✓ | — | ✓ |
| Salary advances (avances) | ✗ locked card | ✓ | — | ✓ |
| Congés management | ✗ locked card | ✓ | — | ✓ |
| Staff schedule | ✗ locked card | ✓ | — | ✓ |
| Locked card content | message + upgrade → التجديد | — (never renders) | — | — |
| restricted_admin role limits | ✓ compose unchanged | ✓ | ✓ | ✓ |
| Étude staff picker sees lite roster | ✓ (the unlock's purpose) | ✓ | — | ✓ |
| Existing payroll records | stored untouched, no surface | as today | — | as today |

## Invariants

1. **No payroll writes in lite**: every payroll write path renders only in full mode;
   lite CRUD composes the existing staff-profile save only (SC-002/004, FR-007).
2. **Data preservation**: historical payslips/advances/congés/pointage records are
   never mutated or displayed in lite; switching a center to full mode (purchase)
   reveals them verbatim (FR-008, SC-004).
3. **Full mode is untouched**: for staff-enabled centers every surface, flow, and test
   behaves exactly as before (FR-002/011, SC-003).
4. **Single derivation**: mode comes from one rule (etude-present && staff-absent over
   a non-legacy list); same modules ⇒ same mode everywhere (FR-011's consistency
   premise, spec assumption "mode is binary").
5. **Sync-follows**: mode flips with mid-session renewals via the existing live-sync
   refetch — no special-casing (FR-010).

## State transitions

None at the data level. Mode transitions (lite ⇄ full, visible ⇄ hidden) are pure
functions of the synced enabled-modules list and require no migration or backfill.
