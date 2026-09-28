# Data Model: Finance ▸ Gestion des repas — Onglet Goûter dédié

**Feature**: `007-finance-gouter-monthly-drilldown` | **Date**: 2026-09-28

No new entities and no stored-shape change (FR-010 lineage). Every figure in this feature derives
from the existing surfaces: `mealAttendances` (per-student, per-date, per-service), `payments`
(`service: 'Repas' | 'Goûter'`), and `mealForfaitClosures` (read-only here).

## Derived artifacts

### Tab-scoped rendering map (group A)

| Block | Repas tab | Goûter tab |
|---|---|---|
| Synthesis cards 3.0.x (lunch-only) | rendered | — (mirrored Goûter cards instead) |
| «الفرفي المكتسب (Forfait ferme)» + «إغلاق شهر» actions | rendered (unchanged) | **hidden** (FR-001) |
| Meal-price banner (سعر الوجبة / traiteur / مطبخ داخلي hint) | rendered (unchanged) | **hidden** (FR-002) |
| «مداخيل واستهلاك خدمة اللمجة» summary strip | — (forbidden by group C) | **removed** (FR-003) |
| Lunch detail table + monthly table 3.1 + day detail | rendered (lunch-only at source) | — |
| Goûter mirrored cards + detail table 3.2 + monthly grid 3.3 (now with drilldown) | — | rendered |

### New pure helper (group B)

`computeGouterMonthDetail(students, month, schoolYear)` in `src/utils/mealLogic.ts` — mirrors the
existing `computeGouterMonthly`/`computeGouterRows` family (FR-015 single definition, pure,
presentational-free):

- Input: the students array, an academic month, the school year (fees not needed — the detail is
  consumption-only).
- Output: day groups for the selected month — per date, the gouter attendances
  (`gouter_matin` / `gouter_apres_midi` only; lunch excluded at the source) with student name,
  grade, service, type (subscription/unit) and paid status; days sorted ascending.
- Empty result for a consumption-free month (drives FR-010's empty message).

### Upgraded component surface (group B)

`GouterMonthlyTable` keeps its props (`students`, `schoolYear`) and testids
(`finance-gouter-monthly`, `gouter-monthly-{month}`) and gains internal state only:

- `selectedMonth: AcademicMonth | null` — the open month detail; clicking the active month again
  closes it (FR-009).
- `expandedDays: Set<string>` — ISO dates of the open day panels, defaulting empty, toggled per
  day (FR-007).
- Card container + «الإجمالي الكلي» badge mirror the Repas monthly table's presentation.

### Source-level filters (group C)

The Repas monthly table's month cells and the month-detail row collection filter attendances to
lunch (`!a.service || a.service === 'lunch'`) at the aggregation step — the same predicate the
006-E card split uses. After this feature, every Repas-tab figure (cards, «الإجمالي الكلي», month
cells, day panels, day badges) derives from the same lunch-only view; no display-time exclusion
remains.

## Invariants added (feature 007)

1. **Tab scope is exhaustive per service**: on the Repas tab, zero goûter-derived figures render;
   on the Goûter tab, zero Repas-only blocks (forfait, price banner) render. The two tabs share
   only the neutral surfaces (tab strip, filters).
2. **Repas aggregation is source-filtered** (extends 006-E disjointness): month cells and day
   details exclude goûter records where the numbers are computed, so totals stay exact as data
   grows — display-level filtering alone fails the spec.
3. **Sum invariant holds across every level** (extends FR-013): for the same data, Repas + Goûter
   figures equal the combined consumption per month cell, per day, and per grand total — no
   record double-counted, none lost.
4. **Drilldown state is ephemeral and self-contained** (extends FR-010): the Goûter drilldown's
   state lives inside its component, is never persisted, and resets when the school year changes;
   the Repas detail's state is untouched by it.
5. **Forfait closures stay Repas-scoped**: closure snapshots and actions remain reachable only
   from the Repas tab; the Goûter tab can neither display nor mutate them.
