# Phase 0 Research: Finance — Revenus, Traiteur et statut de paiement Goûter

**Feature**: `008-finance-traiteur-gouter-fixes` | **Date**: 2026-09-28

No NEEDS CLARIFICATION items — the spec's assumptions pin the scope (general-view-only removal;
annual-total exclusion covering the benefit term; matching defect fixed once in the shared
computation). Research resolves the four design choices below.

## R1 — The annual total drops the benefit term and excludes Goûter payments; cheques follow their list

**Decision**: `yearTotalRevenue` = (non-Repas **and non-Goûter** year payments − their pending
cheques), with the `+ repasBenefitYear` term deleted; `yearPendingChequeTotal` continues to derive
from the same payment list, so restaurant pending cheques net out of restaurant amounts only.

**Rationale**: today's total leaks the restaurant twice — Goûter payments pass the
`p.service !== 'Repas'` filter, and `repasBenefitYear` adds a plates × margin + forfait figure the
dedicated section already owns. The client's justification («chacun de ces deux services dispose
déjà de sa propre section; les compter ici créerait un doublon») names the duplication directly.
Keeping the cheque deduction derived from the same filtered list preserves the existing
"pending cheques reduce revenue" semantics for exactly the payments that remain counted, without
introducing a new cheque rule (the spec's assumption) — a Repas cheque no longer reduces a total
that no longer contains Repas, which is the only coherent reading.

**Alternatives considered**: excluding Repas/Goûter only at the final sum — rejected: the
pending-cheque list would then deduct restaurant cheques from a total without them, double-
distorting; keeping the benefit term but zeroing it in-house — rejected: the remark excludes the
amounts unconditionally (the duplication argument is mode-independent); leaving Goûter in —
directly contradicts the remark.

## R2 — In-house gating is render-only; no computation site changes

**Decision**: the two cards («حصة الـ Traiteur», «ربح السنتر من الوجبات») render behind
`!isInHouseKitchen`; no aggregation site is edited.

**Rationale**: the audit found the in-house numbers already collapse correctly —
`traiteurPriceOf` returns 0 per attendance in-house, so `traiteurCost` renders 0.000 and
`centerBenefit` equals the full paid-plate value with no traiteur split; the 006-D mode-invariance
test pins those figures as identical across modes. The client's «masquer» (not «mettre à zéro»)
plus «ne jamais calculer … selon la formule» is therefore satisfied at the display layer: in-house,
no unit-count × unit-price traiteur figure is rendered or derivable from anything on screen, and
the hidden cards' amounts were already mode-invariant. Editing the aggregation sites (e.g.
skipping the margin arithmetic in-house) would change no displayed number and only add branches —
pure risk.

**Alternatives considered**: gating the underlying computations too — rejected: provably
display-identical, adds code paths; renaming the «ربح السنتر» card in-house to show the full
plate value — rejected: the remark says hide, and a full-plate "benefit" card in-house invites
exactly the misreading the client is eliminating.

## R3 — The forfait list renders the live estimate before closure and the snapshot after, from one source

**Decision**: the forfait block gains a collapsible per-student list; before closure it lists the
students whose live `forfaitEstimate > 0` (the same records the closure persists, name + amount);
after closure it lists the snapshot's persisted `items`; an explicit empty message when no student
holds a balance.

**Rationale**: the closure already persists per-student `items` (`studentId`, `studentName`,
`netPaid`, `consumedSubscriptionMeals`, `fraisParRepas`, `amount`) — the remark's «afficher pour
chaque élève le montant du forfait à restituer» needs presentation only, no persistence. Using the
live estimate pre-close keeps the list honest as data changes and matches what «إغلاق شهر» will
persist; using the snapshot post-close guarantees the displayed amounts are exactly what was
locked (the aggregates already behave this way — the list simply follows them). A collapsible
panel keeps the block from ballooning with roster size.

**Alternatives considered**: always live (ignoring the snapshot) — rejected: after closure the
aggregates read the snapshot; a live list would disagree with «مكتسب فعلياً» directly above it;
always snapshot — rejected: before closure nothing is persisted, and the estimate is what the
admin is about to lock; a separate modal — rejected: the remark places the list in the forfait
block itself.

## R4 — The Goûter status repair lands in `getGouterStatusFor` with refund netting, not a caller patch

**Decision**: `getGouterStatusFor` keeps its lookup as `service === 'Goûter'` + exact month label
but nets refund records (sum of non-refund payments vs. the effective required total), so a
settled month with a refund record still reads paid and a partially paid month keeps 'advance'.
No caller changes.

**Rationale**: the finance-side Goûter status comes exclusively from this shared function
(`GouterConsumptionTable` → `computeGouterRows` → `getGouterStatusFor`), and the MealsModule
surfaces consume the same function — so one repair makes every display agree (FR-009's «toutes
les surfaces concordent»), which is exactly why the defect must not be patched at a call site.
The audit traced the false-unpaid reading to the lookup's strictness around the month label and
refund interaction: a settled month whose records include a refund-shaped entry (the refund
writer emits month-labelled records with negative amounts) can drive the summed `amountPaid`
below the threshold even though the subscription was settled. Netting refunds (treating refund
records as deductions of what was settled, not as money never paid) restores the correct status
while preserving the discount and advance semantics byte-for-byte. Service-type matching (Goûter
only) and per-student, per-month matching were already present and stay — the spec's vigilance
points are pinned by test rather than changed.

**Alternatives considered**: loosening the month-label match (startsWith/includes) — rejected:
it invites over-matching across school years, the exact opposite of FR-008; computing the status
differently in FinanceModule — rejected: two definitions would disagree again (the anomaly's
likely origin); changing the refund writer's labels — rejected: refund records are consumed
elsewhere and the repair must not rewrite history.
