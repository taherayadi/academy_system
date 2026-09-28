# Data Model: Finance — Revenus, Traiteur et statut de paiement Goûter

**Feature**: `008-finance-traiteur-gouter-fixes` | **Date**: 2026-09-28

No new entities, no stored-shape change. Everything derives from the existing surfaces:
`payments` (service / month label / amount / discount / refund / cheque state),
`mealAttendances`, and `mealForfaitClosures` (per-student `items` snapshot).

## Derived artifacts

### Annual total recomposition (group A)

| Component | Before | After |
|---|---|---|
| Payment list | `service !== 'Repas'` (Goûter included) | `service !== 'Repas' && service !== 'Goûter'` |
| Restaurant benefit term | `+ repasBenefitYear` (plates × margin + forfait) | **deleted** |
| Pending-cheque deduction | derived from the payment list | derived from the (now smaller) same list |
| «إيرادات المطعم» card | rendered (`canteenEnabled && !hideRestrictedModules`) | **removed** |

### Repas-onglet card map (group B)

| Card | External traiteur | In-house kitchen |
|---|---|---|
| حصة الـ Traiteur | rendered (unchanged) | **hidden** (FR-004) |
| ربح السنتر من الوجبات | rendered (unchanged) | **hidden** (FR-004) |
| All other Repas-onglet cards | unchanged | unchanged (mode-invariant figures, 006-D guarantee) |

### Forfait per-student list (group B)

- Source before closure: the live estimate (`forfaitEstimate > 0` per student) — the exact
  records the closure persists.
- Source after closure: the snapshot's persisted `items` (`studentName` + `amount`).
- Presentation: collapsible list inside the forfait block; explicit empty message when no student
  holds a balance.

### Goûter status computation (group C)

`getGouterStatusFor` (single definition, consumed by both modules' surfaces):

- Lookup: `p.service === 'Goûter'` (service-type match) AND `p.month === \`${month}
  (${schoolYear})\`` (per-student, per-month match) — unchanged, pinned by test.
- Status: `paid` ⇔ the sum of **non-refund** payments covers the effective required total
  (discount-aware, as today); refund-shaped records net out instead of driving the sum negative;
  partial coverage keeps `advance`; zero coverage keeps `unpaid`.

## Invariants added (feature 008)

1. **Restaurant revenue has exactly one home**: the general view renders no restaurant card and
   its annual total is invariant under restaurant data mutations — the dedicated Repas/Goûter
   section is the single source of restaurant revenue truth.
2. **Card freeze for other revenue surfaces** (extends FR-003): annual inscriptions, المقبوضات
   بدون المطعم, formations, pending cheques and the period net figure keep byte-identical amounts
   on the same data.
3. **Traiteur economics are external-traiteur-only** (extends 006-D's F1): in-house, no
   traiteur-share or meal-benefit card renders, and no on-screen figure is derivable from
   unit-count × unit-price traiteur math.
4. **Closure list equals the closure data** (extends FR-006): the per-student list before closing
   matches what «إغلاق شهر» persists; after closing, the list is the snapshot — the aggregates
   and the list can never disagree.
5. **One Goûter status, everywhere** (extends FR-009): for the same student/month data, the
   MealsModule daily-grid gating, the mark-today typing and the finance Goûter table read one
   shared computation and always agree; discounts and advance semantics are byte-preserved.
