# Phase 1 Data Model: Center Types & New Modules

**Feature**: `001-center-types-new-modules` | **Date**: 2026-09-23

Conventions: all tables tenant-scoped by `center_id` (TEXT, NOT NULL, indexed);
primary keys are client-generated id strings (existing app convention); booleans stored
as 0/1; timestamps ISO-8601 strings. Migrations live in the ADMIN repository sequence
(research R2) — the DDL below is the coordination contract.

## New entities

### Activity

A planned activity in a center's weekly calendar.

| Field | Type | Rules |
|---|---|---|
| `id` | string (uuid) | required, stable |
| `centerId` | string | set server-side from session; never from payload |
| `title` | string | required, non-empty (FR-015) |
| `category` | enum | `motricite` \| `art` \| `musique` \| `jeu` — required (FR-015) |
| `weekday` | 0–6 (Lun–Dim) | required when `date` absent; ignored when `date` present |
| `date` | ISO date (YYYY-MM-DD) | optional single-occurrence override of `weekday` |
| `timeStart` | HH:MM | required, < `timeEnd` (FR-015) |
| `timeEnd` | HH:MM | required, > `timeStart` |
| `location` | string | optional free text (v1; migrates to room ref when Salles ships) |
| `levelClass` | string | optional class/level label (grouping key) |
| `staffId` | string | optional supervising staff reference; dangling ref renders empty |
| `createdAt` | ISO datetime | set on creation |

DB columns: `id, center_id, title, category, weekday, date, time_start, time_end,
location, level_class, staff_id, created_at`.

Validation: title non-empty; category in set; timeStart<timeEnd; weekday 0–6 XOR date
present. Invalid items are dropped on write (existing replace-write convention drops
malformed rows silently-by-validation in handlers).

### Skill

A catalog entry of observable skills, grouped by domain.

| Field | Type | Rules |
|---|---|---|
| `id` | string (uuid) | required |
| `centerId` | string | server-derived |
| `domain` | enum | `langage` \| `motricite` \| `social` \| `autonomie` — required (FR-021) |
| `label` | string | required, non-empty |
| `ageFrom` | number (months) | optional ≥ 0 |
| `ageTo` | number (months) | optional ≥ `ageFrom` |
| `createdAt` | ISO datetime | |

DB columns: `id, center_id, domain, label, age_from, age_to, created_at`.

### SkillEvaluation

A child's assessed level on one skill.

| Field | Type | Rules |
|---|---|---|
| `id` | string (uuid) | required |
| `centerId` | string | server-derived |
| `studentId` | string | required; must reference a student of the same center |
| `skillId` | string | required; must reference a skill of the same center |
| `level` | enum | `non_evalue` \| `emergent` \| `en_cours` \| `acquis` — required (FR-022) |
| `evaluatedByStaffId` | string | XOR `evaluatedByName` (FR-023) |
| `evaluatedByName` | string | free-text evaluator when staff not purchased |
| `evaluatedAt` | ISO date | required |

DB columns: `id, center_id, student_id, skill_id, level, evaluated_by_staff_id,
evaluated_by_name, evaluated_at`.

Referential policy: write replaces the whole domain document; rows referencing skills
removed from the same write are dropped (evaluations follow catalog deletion — spec
edge case #5). Dangling `staffId` (staff deleted later) is tolerated at read/render
(edge case #6).

## Modified entities

### Center (existing `centers` row / `CenterTenant`)

- `center_type` gains two accepted values: `'creche'`, `'garderie'` (alongside
  `jardin`, `formation`). Unknown/empty keeps legacy full-visibility behavior
  (research R5). Set at signup from the landing form; provisioning copies it to the
  center record.

### Module registry (code-level)

- `ModuleKey` union += `'activites' | 'competences'`.
- `TAB_MODULE` += `activites: 'activites'`, `competences: 'competences'` (tab ids
  `activites`, `competences`).
- Pricing catalog += two entries; plan presets: `growth` and `pro` include both keys;
  `starter` excludes both.

## Relationships

```
Center 1──N Activity            (center_id)
Center 1──N Skill               (center_id)
Center 1──N SkillEvaluation     (center_id)
Skill  1──N SkillEvaluation     (skill_id, same center)
Student 1──N SkillEvaluation    (student_id, same center)
Staff  0..1──N SkillEvaluation  (evaluated_by_staff_id, optional)
Staff  0..1──N Activity         (staff_id, optional)
```

## State transitions

- **Activity**: created → (moved between slots = field update in next domain write) →
  deleted. No status machine in v1.
- **Skill**: catalog entry → referenced by evaluations → removal drops dependent
  evaluations at the next domain write (single-transaction replace).
- **SkillEvaluation**: created/updated with each child-evaluation save; level enum has
  no ordering constraints enforced in v1 beyond membership.
- **Center type**: set at signup; no in-app mutation path (admin-side operation).

## Isolation invariants (constitution II / IV)

1. Every read/write derives `center_id` from the authenticated session context.
2. Every statement (SELECT/DELETE/INSERT) filters or stamps `center_id`.
3. Cross-center references are impossible by construction: writes are whole-domain
   documents validated per center; inserts never accept client `centerId`.
4. Route inventory lists exactly: `/api/activities` [GET, PUT], `/api/skills`
   [GET, PUT]; unknown paths 404, wrong methods 405.
