# Phase 1 Data Model: Activités & Planning

**Feature**: `004-activities-planning` | **Date**: 2026-09-23

One new entity, tenant-scoped; conventions match the app's existing domains
(client-generated id strings, booleans as 0/1, ISO timestamps). The `CREATE TABLE`
migration is coordinated through the admin repository's shared sequence
(constitution Principle I) — the DDL below is the coordination contract, identical to
feature 001's activities design so the two features converge.

## New entity

### Activity

| Field | Type | Rules (verbatim from spec FR-002/003) |
|---|---|---|
| `id` | string (uuid) | required, stable, client-generated |
| `centerId` | string | **server-derived from session; never accepted from payload** |
| `title` | string | required, non-empty (FR-002) |
| `category` | enum | `motricite` \| `art` \| `musique` \| `jeu` — required (FR-002) |
| `weekday` | 0–6 (Lun–Dim) | required when `date` absent; ignored when `date` present |
| `date` | YYYY-MM-DD | optional single-occurrence override of `weekday` (FR-002: weekday OR date) |
| `timeStart` | HH:MM | required; `< timeEnd` (FR-002) |
| `timeEnd` | HH:MM | required; `> timeStart` |
| `location` | string | optional free text (FR-003; room reference in a later phase) |
| `levelClass` | string | optional class/level label (FR-003; grouping key) |
| `staffId` | string | optional supervising staff reference (FR-003; dangling ref renders empty) |
| `createdAt` | ISO datetime | set on creation |

DB columns: `id, center_id, title, category, weekday, date, time_start, time_end,
location, level_class, staff_id, created_at` (index on `center_id`).

**Validation predicate** (shared by dialog and server backstop):
`title.trim() != ''` AND `category ∈ enum` AND (`weekday ∈ 0–6` XOR `date present`)
AND `timeStart < timeEnd`. Server write drops rows failing the predicate (contract
behavior); client dialog blocks submission with a message (SC-003).

## Modified registry (code-level)

- `ModuleKey` union += `'activites'`; tab map += `activites: 'activites'`.
- Shared module catalog += Activités & Planning entry; `growth`/`pro` presets include
  `'activites'`; `starter` excludes it.
- Live-sync refetch key list += the activities domain.

## Relationships

```
Center 1──N Activity        (center_id — the only ownership edge)
Staff 0..1──N Activity      (staff_id, optional, same center, dangling tolerated)
```

No links to students/classes beyond the free-text `levelClass` label in v1 (by
design — class entities vary per center type; a structured link arrives with Salles &
Espaces or class management later).

## Invariants

1. **Tenant scoping**: every read/write derives `center_id` from the authenticated
   session; payload identity fields for ownership are ignored (FR-012).
2. **Persistence fidelity**: saved state reloads verbatim — day, time, category,
   optional fields (FR-006, SC-002).
3. **View-only grouping**: grouping toggles never mutate activities (spec assumption;
   FR-008).
4. **Overlap tolerance**: multiple activities may share a day/band cell; both render
   (spec edge case — no forced conflict resolution).
5. **Downgrade retention**: disabling the module hides it but deletes nothing
   (spec edge case).

## State transitions

- **Activity**: created → edited (any field) → moved (= weekday/date/timeStart/timeEnd
  update) → deleted. No status workflow in v1.
- **Module entitlement**: disabled → enabled renders the module with prior data intact;
  enabled → disabled hides it (data retained).

## Render-time derivations (pure, unit-tested)

- **Banding**: band index = floor of `timeStart` into fixed half-hour bands (06:00–
  20:00); chip position uses the band containing `timeStart` regardless of minutes.
- **Grouping**: `per class` / `per location` → ordered buckets (alphabetical,
  'unassigned' last) — view-only.
- **Color**: category → fixed palette class (motricite=emerald, art=violet,
  musique=amber, jeu=sky).
