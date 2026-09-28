# Phase 1 Data Model: Compétences & Skills

**Feature**: `005-competences-skills` | **Date**: 2026-09-23

Two new tenant-scoped entities; conventions match the app's existing domains
(client-generated id strings, ISO timestamps). Migrations are coordinated through the
admin repository's shared sequence (constitution Principle I) — the DDL below is the
coordination contract, identical to feature 001's skills design.

## New entities

### Skill (catalog entry)

| Field | Type | Rules (verbatim from spec FR-002) |
|---|---|---|
| `id` | string (uuid) | required, stable, client-generated |
| `centerId` | string | **server-derived from session; never accepted from payload** |
| `domain` | enum | `langage` \| `motricite` \| `social` \| `autonomie` — required |
| `label` | string | required, non-empty |
| `ageFrom` | number (months) | optional ≥ 0 |
| `ageTo` | number (months) | optional ≥ `ageFrom` |
| `createdAt` | ISO datetime | set on creation |

DB columns: `id, center_id, domain, label, age_from, age_to, created_at`.

**Validation predicate** (client dialog + server backstop): `label.trim() != ''` AND
`domain ∈ enum` AND (`ageFrom` absent OR ≥ 0) AND (`ageTo` absent OR ≥ `ageFrom`).

### SkillEvaluation (child's current level on one skill)

| Field | Type | Rules (verbatim from spec FR-005/006/007) |
|---|---|---|
| `id` | string (uuid) | required |
| `centerId` | string | server-derived |
| `studentId` | string | required; must reference a child of the same center |
| `skillId` | string | required; must reference a catalog skill of the same center |
| `level` | enum | `non_evalue` \| `emergent` \| `en_cours` \| `acquis` — required |
| `evaluatedByStaffId` | string | **XOR** `evaluatedByName` (exactly one non-null) |
| `evaluatedByName` | string | free-text evaluator when Staff not purchased |
| `evaluatedAt` | ISO date | required; editable, defaults to today |

DB columns: `id, center_id, student_id, skill_id, level, evaluated_by_staff_id,
evaluated_by_name, evaluated_at`.

**Uniqueness (latest-save-wins)**: one current evaluation per `(studentId, skillId)`
pair; the domain write dedupes keeping the last occurrence (R3). No history kept.

**Referential rules on write** (cascade, R4):
1. evaluations whose `skillId` is absent from the same write's catalog → dropped;
2. evaluations whose `studentId` is not a child of the center → dropped.

## Modified registry (code-level)

- `ModuleKey` union += `'competences'`; tab map += `competences: 'competences'`.
- Shared module catalog += Compétences & Skills entry; `growth`/`pro` presets include
  `'competences'`; `starter` excludes it.
- Live-sync refetch key list += the skills domain.

## Relationships

```
Center 1──N Skill             (center_id)
Center 1──N SkillEvaluation   (center_id)
Skill  1──N SkillEvaluation   (skill_id, cascade on removal)
Child  1──N SkillEvaluation   (student_id, same center)
Staff 0..1──N SkillEvaluation (evaluated_by_staff_id, optional, XOR name)
```

The child's class label is **read at render time** from the child record (never
stored on the evaluation) — heatmap regrouping on label change is automatic (spec
edge case).

## Invariants

1. **Tenant scoping**: every statement filtered/stamped by the session-derived
   `center_id`; payload ownership identity ignored (FR-012).
2. **Evaluator exclusivity**: exactly one of staff-reference / free-text name per
   evaluation, enforced at write (FR-006, SC-005).
3. **Latest-save-wins**: one current evaluation per child-skill pair; stored document
   is always the renderable state (FR-007).
4. **Atomic cascade**: skill removal and the removal of its evaluations occur in the
   same write — unrelated evaluations untouched (FR-004, SC-004).
5. **Persistence fidelity**: catalog and evaluations reload verbatim (FR-003,
   SC-002).
6. **Downgrade retention**: disabling the module hides it, deletes nothing (spec
   edge case).

## State transitions

- **Skill**: created → edited (label/domain/age range) → removed (cascade). No
  status workflow.
- **SkillEvaluation**: set/updated (level, evaluator, date replace together) →
  implicitly removed only via skill removal. No history.
- **Module entitlement**: disabled ⇄ enabled via the standard synced module list;
  data retained across the transition.

## Render-time derivations (pure, unit-tested)

- **Level colors**: fixed map (non évalué=neutral, émergent=amber, en cours=sky,
  acquis=emerald); unevaluated cells explicitly neutral.
- **Heatmap**: children bucketed by current class label (alphabetical, 'unassigned'
  last); columns follow catalog order grouped by domain.
- **Evaluator display**: staff reference resolved to a roster name when resolvable;
  free-text rendered as stored; deleted-staff references render without breaking
  (spec edge case).
