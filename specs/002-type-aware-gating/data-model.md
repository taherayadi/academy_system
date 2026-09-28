# Phase 1 Data Model: Type-Aware Gating

**Feature**: `002-type-aware-gating` | **Date**: 2026-09-23

No new entities, fields, or stored data — this feature is presentation-only. The
"data model" here is the **behavioral visibility matrix**: the complete mapping from
center type to visible content, which is the feature's contract. One input attribute
is consumed; nothing is mutated.

## Consumed attribute (read-only)

### Center.type

| Value | Meaning | School-level content |
|---|---|---|
| `jardin` | Jardin d'enfant (prescolaire) | hidden |
| `creche` | Crèche (petite enfance 0–3) | hidden |
| `garderie` | Garderie périscolaire | visible (≈ formation) |
| `formation` | Centre de formation | visible |
| *(empty/unknown/legacy)* | Pre-type center | visible (today's behavior; FR-004) |

Set by feature 001-US1 at signup; never written by this feature.

## Visibility matrix (the behavioral contract)

| Surface | Element | crèche / jardin | garderie / formation | unknown type |
|---|---|---|---|---|
| Registration form | « المستوى الدراسي » select (required) | ✗ not rendered, not required | ✓ required | ✓ required |
| Registration form | « المؤسسة التعليمية » select + add-establishment action | ✗ | ✓ | ✓ |
| Student list | Grade column/cell text, grade chip | ✗ | ✓ | ✓ |
| Student list | Grade filter select; grade in search matching | ✗ | ✓ | ✓ |
| Student card (print) | Grade line | ✗ | ✓ | ✓ |
| Registration print | « المستوى الدراسي » line | ✗ | ✓ | ✓ |
| Receipts (Suivi) | Grade in receipt header | ✗ | ✓ | ✓ |
| Suivi row actions | Notes Devoirs icon button | ✗ | ✓ | ✓ |
| Suivi row actions | Timesheet view icon (active or disabled placeholder) | ✗ | ✓ | ✓ |
| Suivi payments | Registration/monthly payment actions and labels | ✓ unchanged | ✓ unchanged | ✓ unchanged |
| Sidebar | الدروس الخصوصية (Cours Particuliers) | ✗ | ✓* | ✓ |
| Sidebar | تأطير Étude (Étude Surveillée) | ✗ | ✓* | ✓ |
| Sidebar | حصة مراجعة (Révision Examens) | ✗ | ✓* | ✓ |
| Sidebar | التكوينات والدورات (Formations) | ✗ | ✓* | ✓ |
| Dashboard | Quick-access cards for the four study modules | ✗ | ✓* | ✓ |
| Deep link / stale tab | Any of the four study tab ids | → dashboard | ✓ opens | ✓ opens |

\* = additionally subject to existing subscription gating (`enabledModules`); type
gating composes with it and never re-enables a subscription-disabled module (FR-010).
restricted_admin role restrictions also continue to apply unchanged.

## Invariants

1. **Presentation-only**: no rule in this feature writes, deletes, or migrates any
   stored value; toggling a center's type makes hidden data reappear verbatim
   (SC-003).
2. **Removal-only composition**: type gating can only subtract from visibility that
   subscription/role gating already yields — never add (FR-010).
3. **Type is the sole driver**: same type ⇒ same visibility for every user, device,
   and layout (FR-011).
4. **Unknown-type passthrough**: any value outside the four known keys behaves as
   legacy (everything visible) — the safe-build guarantee.

## State transitions

None. No entity gains states; the only transition is the App's existing
active-tab fallback when a gated module is targeted (mechanism reused, not changed).
