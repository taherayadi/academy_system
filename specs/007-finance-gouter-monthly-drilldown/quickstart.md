# Quickstart: Finance ▸ Gestion des repas — Onglet Goûter dédié

**Feature**: `007-finance-gouter-monthly-drilldown` | **Date**: 2026-09-28

Prerequisites: a center with the cantine module enabled and students holding mixed lunch + goûter
attendance records across at least two academic months (some days carrying both services); the
Finance module opened on «🍽️ إدارة المطعم». Automated counterparts: the FinanceModule,
GouterMonthlyTable, meals and composed suites; run `npm test` for the full gate.

**W1 — The Goûter tab shows only Goûter content (US1 / FR-001–004)**: open the Gestion-des-repas
section on the Repas onglet → the «الفرفي المكتسب (Forfait ferme)» card and the meal-price banner
(سعر الوجبة … / حصة الـ Traiteur …) are visible as before → switch to the Goûter onglet → the
forfait card, its «إغلاق شهر» action and the price banner are all gone, and the old
«مداخيل واستهلاك خدمة اللمجة» strip no longer appears anywhere → the mirrored Goûter cards, the
Goûter detail table and the monthly grid remain → switch back to Repas: the forfait card and
banner are exactly as before (nothing was removed from Repas) → repeat in the other kitchen
operating mode: the blocks hide identically in both.

**W2 — Monthly Goûter grid with day drilldown (US2 / FR-005–010)**: on the Goûter onglet, the
«إجمالي استهلاك اللمجة في كل شهر» card shows one clickable cell per academic month with a
goûter-only total, in the same presentation as the Repas monthly table → click a month with
consumption: a detail panel opens, one collapsible panel per day, each listing that day's goûter
records only (student, level, لمجة الصباح/المساء, اشتراك/منفردة, paid status) in the Repas
day-panel style → click a day panel: it expands; click again: it collapses → click the active
month cell again (or the detail's «إغلاق» button): the detail closes → click a month with no
consumption: an explicit empty message shows instead of empty panels → change the school year: any
open detail closes and the cells recompute for the new year.

**W3 — Repas figures are lunch-only at the source (US3 / FR-011–013)**: with fixtures where goûter
and lunch records share the same days, read the Repas monthly table's month cells: each equals the
lunch-only count (a day with 2 lunch + 1 goûter contributes 2, not 3) → open that month's day
detail and expand the shared day: only lunch rows appear — no goûter record anywhere → the
synthesis cards and «الإجمالي الكلي» badge are unchanged from 006-E behavior → cross-check: the
Repas month cell + the Goûter monthly grid's same-month cell equal the combined attendance count
for that month → add a new goûter record for the period: no Repas figure changes.

**Expected end state**: W1–W3 behave exactly as described; the full gate (`npm run lint`,
`npm test`, `npm run build`) stays green with the extended suites; no schema change, no route
change, no rounding; 006 revision E behaviors outside the listed blocks untouched.
