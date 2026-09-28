# Implementation Plan: Finance — Revenus, Traiteur et statut de paiement Goûter

**Branch**: `008-finance-traiteur-gouter-fixes` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-finance-traiteur-gouter-fixes/spec.md`
(the client's `remarques-finance-revenus-traiteur.md`, 5 remarks in 3 groups: A the general
finance view, B the Repas onglet's kitchen-mode logic and closure detail, C the Goûter
payment-status anomaly)

## Summary

Three corrections to the Finance module: (A) the general view loses the «إيرادات المطعم» card and
its annual total stops including Repas/Goûter amounts; (B) the Repas onglet hides the two
traiteur-economics cards in in-house mode and never computes those amounts from
unit-count × unit-price there, while month closure gains a per-student forfait-to-return list;
(C) the shared Goûter payment-status computation stops misreading a paid subscription month as
unpaid — its payment lookup and month matching are repaired so every finance surface agrees.

Technical approach: two render scopes + a dead-constant deletion for group A; two card scopes and
a per-student closure list for group B; a one-function fix in the shared `getGouterStatusFor`
(plus its callers' contract) for group C. No stored shape change; no new route.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18 SPA (same as the program)

**Primary Dependencies**: existing FinanceModule / mealLogic surfaces (006/007 baseline); no new
dependencies

**Storage**: none new — closures already persist per-student items; the status fix is a
computation change only

**Testing**: vitest + Testing Library (browser) per constitution gate V; gates = `npm run lint` +
`npm test` + `npm run build`

**Target Platform**: desktop + mobile browsers (same as the program)

**Performance Goals**: N/A (render-time scoping of existing computations)

**Constraints**: other revenue cards byte-frozen (FR-003); discount/advance semantics of the
Goûter status preserved; no rounding anywhere (FR-006)

**Scale/Scope**: one screen (Finance general view + Repas onglet), one shared pure function

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Deployment split** — no admin surface, no migration; closures stay an existing JSON
  surface. ✅
- **II. Tenant isolation** — no data-access change. ✅
- **III. Security by default** — no endpoint or auth surface change. ✅
- **IV. Exact contract surface** — no route change; `functions/api/_middleware.ts` untouched. ✅
- **V. Test-first verification** — every delta lands with its failing test first. ✅

Post-design re-check: no violation (research R1–R4 are render scopes, constant deletion, a pure
computation fix, and a per-student presentation of an existing snapshot).

## Project Structure

### Documentation (this feature)

```text
specs/008-finance-traiteur-gouter-fixes/
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
│   └── FinanceModule.tsx           # Groups A + B (cards, totals, closure list)
├── utils/
│   └── mealLogic.ts                # Group C (getGouterStatusFor payment lookup)
├── meals.test.ts                   # Group C pure-logic pins
└── components/{FinanceModule,MealsModule}.test.tsx + program.composed.test.tsx
```

## Audit result per remark

| # | Remark (spec FR) | Current state (verified in code) | Verdict |
|---|------------------|----------------------------------|---------|
| A1 (FR-001) | Remove «إيرادات المطعم» | The card (L975–980) renders under `canteenEnabled && !hideRestrictedModules` showing `repasRevenueFiltered` (= `filteredRestoCenterBenefit`) | **GAP (removal)** — delete the card and the now-unused `repasRevenueFiltered` alias |
| A2 (FR-002) | Annual total excludes Repas AND Goûter | `yearTotalRevenue` (L694) = `yearNonRepasPayments` (excludes `service === 'Repas'` **but not `'Goûter'`**) + `repasBenefitYear` (a plates × margin + forfait term) − pending cheques. Two leaks: the benefit term and Goûter payments | **GAP** — exclude both services from the payment filter and drop the `repasBenefitYear` term; `yearPendingChequeTotal` shrinks consistently with its list (research R1) |
| A3 (FR-003) | Other cards unchanged | The other cards read `annualInscriptionTotal`, `revenueSansRepas` (already excludes Repas+Goûter), formation, cheques, and `netProfit` (reads `totalRevenueWithResto`, a separate period figure — **not** the annual total) | **SATISFIED** — verify-by-test that none moves |
| B3 (FR-004/005) | In-house: hide «حصة الـ Traiteur» + «ربح السنتر من الوجبات» cards; never compute unit count × unit price | Both cards (L2437–2452) render unconditionally; their amounts (`traiteurCost`, `centerBenefit` → `totalPaidMargin` from `fraisParRepas − traiteurPriceOf(a)`) are already 0-margined in-house via `traiteurPriceOf` (`isInHouseKitchen ? 0`), but the cards and their derivations still exist on screen | **GAP** — gate both cards on `!isInHouseKitchen`; in-house keeps every other card (the mode-invariance guarantee already covers their numbers) |
| B4 (FR-006) | Closure shows per-student forfait to return | The closure persists per-student `items` (`studentId`, `studentName`, `netPaid`, `consumedSubscriptionMeals`, `fraisParRepas`, `amount`) but the UI shows only the aggregate «تقدير غير مكتسب» / «مكتسب فعلياً» figures | **GAP** — render the snapshot's (or live estimate's) per-student items in the forfait block at/after closure |
| C5 (FR-007–009) | Paid Goûter displayed as unpaid | `getGouterStatusFor` filters `p.service === 'Goûter' && p.month === \`${month} (${schoolYear})\``. Audit: the subscription payment writer (MealsModule L760+) writes exactly that shape, and the finance-side consumer is `GouterConsumptionTable` via this same function — so the mismatch the client sees is the **unit-attendance path**: a day goûter marked via the Goûter mark-today button types its rows through the same lookup, and the daily-grid mark path (L249) treats «non-unpaid» as subscription+paid, but the finance table's row status comes from the month lookup alone. The reproducible defect: the finance table (via `getGouterStatusFor`) reads `p.month === \`${month} (${schoolYear})\`` strictly — any payment whose month label drifts (e.g. recorded through a different writer path, or a refund-normalized record) falls out of the match and the month reads unpaid despite payment | **GAP (matching repair)** — make the lookup robust: match `service === 'Goûter'` payments by the month label without dropping refunds, and treat a month as paid when the settled amount covers the effective required total (discount-aware, as today). Repair lands in the shared function so the MealsModule and FinanceModule surfaces agree (FR-009) |

Verdicts: one removal (A1), one computation exclusion (A2), two card scopes (B3), one per-student
presentation of an existing snapshot (B4), one shared-computation matching repair (C5), one
satisfied invariant verified by test (A3). No schema, route or backend change.

## Technical approach (deltas)

**A1 — remove the «إيرادات المطعم» card.** Delete the card block (L975–980) and the
`repasRevenueFiltered` alias (its only consumer). `filteredRestoCenterBenefit` itself stays —
`netProfit`'s period figure (`totalRevenueWithResto`) is a different surface the remark does not
touch.

**A2 — annual total excludes the restaurant.** `yearNonRepasPayments` additionally excludes
`p.service !== 'Goûter'`; `yearTotalRevenue` drops the `+ repasBenefitYear` term;
`yearPendingChequeTotal` stays derived from the same (now smaller) list so the pending-cheque
deduction keeps netting restaurant cheques out of restaurant amounts only. `repasBenefitYear`
becomes unused and is deleted. Research R1 pins the cheque semantics (the client's assumption
frame) and the 「doublon」 rationale: the dedicated section is the single source of restaurant
revenue truth.

**B3 — traiteur cards follow the kitchen mode.** Gate the «حصة الـ Traiteur» and «ربح السنتر من
الوجبات» cards on `!isInHouseKitchen` — the exact pattern the strip and table columns already use
(006-D F1). In-house, the remaining cards keep their numbers (the `traiteurPriceOf` in-house
zeroing and the 006-D mode-invariance test carry the guarantee; research R2 explains why no
computation site changes: the client's «ne jamais calculer» is satisfied by the existing
zero-cost basis plus the hidden cards' removal — no `units × price` traiteur figure is rendered
or derivable on screen in-house).

**B4 — per-student forfait at closure.** In the forfait block, after (or before) closure, render
the per-student list from the same source the aggregates use: the live estimate list
(`restoStudents.filter(s => s.forfaitEstimate > 0)` — name + amount, the exact data the closure
persists) before closing, and the snapshot's `items` after closing. Collapsible to keep the block
compact; explicit empty message when no student holds a balance (spec edge case).

**C5 — Goûter status matching repair.** All fixes land in `getGouterStatusFor`
(single definition, FR-015): payments match `p.service === 'Goûter'` (service-type match — the
client's «tenir compte du type de service»), month label equal to `` `${month} (${schoolYear})` ``
(«par mois»), and the status treats the month as paid when the sum of non-refund payments covers
the effective required total, with refunds netted (a refund record must not erase a settled
month). Callers keep their contracts: the daily-grid and mark-today paths read the same status
(MealsModule L249 consumes `getGouterStatus` → this function), so a repaired lookup makes every
surface agree (FR-009). Discount and advance semantics unchanged (spec assumption).

**Tests** (adjacent per-feature files):
1. `src/meals.test.ts` — `getGouterStatusFor` truth table: paid month + day attendance → paid;
   refund-record-with-full-payment → still paid; Repas payment in the same month → does not
   satisfy Goûter; Goûter payment in another month → does not satisfy; partial payment → advance
   (semantics preserved).
2. `src/components/FinanceModule.test.tsx` — «إيرادات المطعم» absent; annual total invariant
   under restaurant mutations (FR-002's test); the two traiteur cards hidden in-house / present
   in traiteur mode; the per-student forfait list renders before and after closure with the
   explicit empty state; other cards' amounts identical across the change.
3. `src/components/MealsModule.test.tsx` — the daily grid and mark-today flows still agree with
   the finance status for the same paid-month fixture (FR-009 cross-surface pin).
4. `src/program.composed.test.tsx` — C1 finance walkthrough adds: no «إيرادات المطعم» card; in
   in-house composed config the traiteur cards are absent on the Repas onglet.

**Constitution Check (post-design)**: re-verified — no new routes (IV), no endpoint or security
surface change (III), tenant context untouched (II), no migrations (I), every delta lands with
its test (V). No violations.

**Out of scope**: the dedicated Repas/Goûter section's own cards and tables (006/007 territory),
the general view's «الصافي المالي للفترة» period figure and its restaurant term (the remark
targets the *annual* total and the restaurant card only), cheque mechanics beyond the
pending-cheque list following its payments list, closure persistence semantics, refund modals,
and any MealsModule surface beyond consuming the repaired shared status.
