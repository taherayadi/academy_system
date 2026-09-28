# Implementation Plan: Finance ▸ Gestion des repas — Onglet Goûter dédié

**Branch**: `007-finance-gouter-monthly-drilldown` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-finance-gouter-monthly-drilldown/spec.md`
(the client's `remarques-finance-gouter-tab.md`, three groups: A hide Repas-only blocks from the
Goûter tab, B a Goûter monthly grid with day drilldown «à l'identique», C source-level Repas
isolation)

## Summary

Refine the Finance ▸ Gestion-des-repas two-onglet layout shipped by 006's revision E: the Goûter
onglet must show only Goûter content (hide the Forfait ferme block, the meal-price banner; remove
the Goûter summary strip), gain a monthly consumption grid with the Repas table's per-day
expandable drilldown, and the Repas tab's monthly table and day detail must exclude goûter records
at the aggregation source. Pure client-side scoping and presentation: no record-shape change, no
backend change, no new route.

Technical approach: three conditional-rendering scopes in `FinanceModule` (the same
`financeServiceTab` pattern the panels already use), an upgraded self-contained
`GouterMonthlyTable` (internal drilldown state + a new pure `computeGouterMonthDetail` in
`mealLogic.ts`), and two source-level service filters the audit found missing (3.1 month cells and
the day-detail row collection).

## Technical Context

**Language/Version**: TypeScript 5.x, React 18 SPA (same as the program)

**Primary Dependencies**: existing FinanceModule / GouterConsumptionTable / GouterMonthlyTable /
mealLogic surfaces from 006; no new dependencies

**Storage**: none new — everything derives from the existing `mealAttendances`, `payments` and
`mealForfaitClosures` JSON surfaces (FR-010 lineage: no stored shape change)

**Testing**: vitest + Testing Library (browser project) per the constitution's gate V; gates =
`npm run lint` + `npm test` + `npm run build`

**Target Platform**: desktop + mobile browsers (same as the program)

**Project Type**: web app (center application)

**Performance Goals**: N/A (render-time filtering of existing lists; no new data volume)

**Constraints**: totals must stay exact (source-level filtering, not display-time hiding); the
Repas tab's three blocks and behaviors are regression-frozen; no rounding anywhere (FR-006)

**Scale/Scope**: one screen (Finance restaurant section), one upgraded component, one pure helper

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Deployment split** — no admin surfaces, no migrations; forfait closures remain an existing
  JSON surface consumed read-only. ✅
- **II. Tenant isolation** — no data-access change; all derivations stay inside the center-scoped
  props FinanceModule already receives. ✅
- **III. Security by default** — no endpoint, no auth surface, no client storage change. ✅
- **IV. Exact contract surface** — no new route, no method change; `functions/api/_middleware.ts`
  untouched. ✅
- **V. Test-first verification** — every delta lands with its failing test first; gates re-run at
  the combined state. ✅

Post-design re-check: no violation introduced (see research R1–R3 — all decisions are
client-side rendering scope and pure-logic extraction).

## Project Structure

### Documentation (this feature)

```text
specs/007-finance-gouter-monthly-drilldown/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── FinanceModule.tsx          # Group A scoping + Group C source filters (existing file)
│   ├── GouterMonthlyTable.tsx     # Group B: drilldown upgrade (existing file from 006-E)
│   └── GouterMonthlyTable.test.tsx
├── utils/
│   └── mealLogic.ts               # New pure computeGouterMonthDetail (existing file)
└── program.composed.test.tsx      # Composed remark assertions (existing file)
```

## Audit result per remark

| # | Remark (spec FR) | Current state (verified in code) | Verdict |
|---|------------------|----------------------------------|---------|
| A1 (FR-001) | Hide «الفرفي المكتسب (Forfait ferme)» from the Goûter tab | The block (`FinanceModule.tsx` L2458) and its «إغلاق شهر» actions render **unconditionally** — visible on both onglets | **GAP** — scope the block to `financeServiceTab === 'repas'` |
| A2 (FR-002) | Hide the meal-price banner from the Goûter tab | The banner (L2526: سعر الوجبة / حصة الـ Traiteur / ربح السنتر للوجبة / مطبخ داخلي — بدون وسيط) renders **unconditionally** | **GAP** — same Repas-only scope |
| A3 (FR-003) | Hide the «مداخيل واستهلاك خدمة اللمجة (Goûter)» strip from the Goûter tab | The strip (L2546) renders **only on the Goûter tab** today; its figures are superseded by the mirrored Goûter cards (same مداخيل total) plus the detail table | **GAP (removal)** — delete outright; it cannot move to Repas because group C forbids goûter data there (research R1) |
| B4 (FR-005–010) | Monthly grid «إجمالي استهلاك اللمجة في كل شهر» à l'identique of the Repas table, with per-day expandable drilldown | `GouterMonthlyTable` (006-E) is a **static** grid: non-clickable cells, no month detail, no day panels, and it is hosted without the expected `rounded-3xl` card container | **GAP** — upgrade the component: Repas-style card + clickable month cells + internal drilldown state + day panels fed by a new pure `computeGouterMonthDetail` |
| C5a (FR-011) | «إجمالي الوجبات المستهلكة في كل شهر» computes Repas only, at the source | The 3.1 **month cells** count every attendance in the prefix (`a.date.startsWith(prefix)` — no service filter); goûter rows inflate the Repas per-month counts. Revision E's test only asserted the header card (already lunch-only) | **GAP (bug)** — filter lunch at the cell aggregation |
| C5b (FR-012) | «تفاصيل الوجبات المستهلكة في شهر» shows no goûter record | The detail's **row collection** pushes every attendance in the prefix (no service filter); revision E's test inspected only **collapsed** day panels, so the leak passed vacuously | **GAP (bug)** — filter lunch at row collection; add an expanded-day test |
| C5c (FR-013) | Totals exact (no double counting) | The three synthesis cards, the detail table and the «الإجمالي الكلي» badge already aggregate lunch-only (006-E split); the sum invariant is pinned by test | **SATISFIED** — extend the sum invariant to the 3.1 month cells |

Verdicts: three scoping gaps (A1, A2, A3-removal), one component upgrade (B4), two real
source-level bugs (C5a, C5b) and one satisfied invariant to extend. No schema, route or backend
change.

## Technical approach (deltas)

**A1 + A2 — Repas-only blocks.** Wrap the Forfait ferme card and the pricing banner in
`{financeServiceTab === 'repas' && (…)}` — the exact conditional pattern the other panels already
use, so both blocks disappear from the Goûter onglet and remain byte-identical on Repas. No state,
no prop, no calculation change; the closure logic (`onUpdateMealForfaitClosures`, `activeClosure`)
is untouched and simply unreachable from the Goûter tab.

**A3 — remove the Goûter summary strip.** Delete the strip's IIFE block and its local helpers
(`countGouter`, `gouterPrefix`, per-service counts) — nothing else references them. Rationale in
research R1: the client scopes the strip to «masquer … dans l'onglet Goûter», group C forbids
relocating goûter figures to the Repas tab, and its headline number (مداخيل اللمجة) already equals
the mirrored Goûter card's «إجمالي الاشتراكات».

**B4 — GouterMonthlyTable drilldown, self-contained.** Upgrade the component in place (same props:
students, schoolYear): (1) render the expected `rounded-3xl` card container with a header row and
the «الإجمالي الكلي» badge, mirroring the Repas monthly table's card; (2) month cells become
buttons with the Repas cell classes; clicking a month sets internal `selectedMonth`
(toggle-to-close per FR-009), closing any other month; (3) an open month renders the detail panel:
one expandable/collapsible panel per day (internal `expandedDays` set, Repas day-panel interaction
per FR-007) listing that day's goûter records — student, level, service (لمجة الصباح / لمجة
المساء), subscription vs. one-off, paid status — with a «إغلاق» action; (4) a month without
consumption shows the explicit empty message (FR-010). Day rows derive from the new pure
`computeGouterMonthDetail(students, month, schoolYear)` in `mealLogic.ts` (gouter attendances
only, grouped by date, sorted) — the component maps service discriminators to labels; the helper
stays presentational-free (FR-015 single definition). Changing the school year resets the internal
state (key on schoolYear at the host, or reset in the helper consumer — research R2). Root keeps
`data-testid="finance-gouter-monthly"`; month cells keep `gouter-monthly-{month}`.

**C5a + C5b — source-level lunch filters.** In the Repas monthly table's cell aggregation and in
the month-detail row collection, filter attendances to lunch (`!a.service || a.service === 'lunch'`)
**at the reduce/collection step** — the aggregation source — so per-month counts and every
day-panel row are lunch-only regardless of display state. The day panel's service-label rendering
stays (all remaining rows are lunch); the «وجبة / لمجة» day badges read «وجبة» counts only.

**Tests** (adjacent per-feature files; composed re-check):
1. `src/components/FinanceModule.test.tsx` — Goûter tab: forfait block, price banner and strip all
   absent (both kitchen modes); Repas tab: forfait + banner present with the «إغلاق شهر» action
   (strip absent on both tabs — removed); 3.1 month cell equals the lunch-only count with mixed
   fixtures; expanding a day panel that holds a same-day goûter record shows zero goûter rows.
2. `src/components/GouterMonthlyTable.test.tsx` — clicking a month opens the detail; day panels
   toggle open/closed; «إغلاق» and re-click close the detail; a consumption-free month shows the
   empty message; the card container and «الإجمالي الكلي» render; records are goûter-only.
3. `src/meals.test.ts` — `computeGouterMonthDetail` pins: per-day grouping, gouter-only records,
   lunch exclusion, sort order, empty result shape.
4. `src/program.composed.test.tsx` — the C1 finance walkthrough adds: on the Goûter tab the
   forfait block is absent and the monthly grid is interactive; on Repas the forfait block remains.

**Constitution Check (post-design)**: re-verified — no new routes (IV), no endpoint or security
surface change (III), tenant context untouched (II), no migrations (I: closures stay a read-only
JSON surface), every delta lands with its test (V). No violations.

**Out of scope**: the meals module's own surfaces (the banner/forfait concepts there are separate),
any change to closure logic or payment math, the Goûter cards' and detail table's existing
behaviors (except hosting context), new entities or record shapes, the month filter's semantics
for cards/detail (unchanged), and any revision A–E behavior outside the listed blocks.
