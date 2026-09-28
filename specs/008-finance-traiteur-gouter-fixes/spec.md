# Feature Specification: Finance — Revenus, Traiteur et statut de paiement Goûter

**Feature Branch**: `008-finance-traiteur-gouter-fixes`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "return to remarques-finance-revenus-traiteur.md and create new spec 008" —
the client's technical remarks on the Finance module, three groups: **A.** the general finance view
(remove the «إيرادات المطعم» card; exclude Repas and Goûter amounts from the annual total revenue),
**B.** the Repas onglet's kitchen-mode logic (hide the traiteur-share and meal-benefit cards in
in-house mode, never compute them from unit count × unit price; show each student's forfait to
return at month closure), **C.** an anomaly: a paid Goûter subscription displayed as unpaid.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The general finance view no longer double-counts the restaurant (Priority: P1)

A center owner opens the Finance module's general view to read the year's revenue. The
«إيرادات المطعم» metric card is gone — restaurant revenue lives exclusively in the dedicated
Repas/Goûter section where the detailed follow-up happens. The «الإيرادات الكلية (السنة)» total no
longer includes any Repas or Goûter amounts: those services are already fully tracked in their own
section, and counting them here as well inflated the headline figure and double-counted the
restaurant's contribution.

**Why this priority**: The headline revenue number is what the owner reads first and reports from;
today it mixes two counting regimes (a dedicated-section benefit plus a general-view inclusion)
and produces a wrong total. This is a correctness fix on the most visible number in the module.

**Independent Test**: Seed Repas, Goûter and other-service payments for the year; read the annual
total revenue and verify it equals the sum of the non-restaurant services only, and that the
restaurant card no longer renders.

**Acceptance Scenarios**:

1. **Given** the general finance view, **When** the metric cards render, **Then** the
   «إيرادات المطعم» card does not appear (whatever the module entitlements, including a
   cantine-enabled center where it used to render).
2. **Given** Repas and Goûter payments recorded during the year, **When** the
   «الإيرادات الكلية (السنة)» card renders, **Then** its amount equals the year's revenue from all
   services EXCEPT Repas and Goûter — changing restaurant data never changes this total.
3. **Given** the same data, **When** other revenue cards render (التسجيلات السنوية, المقبوضات
   بدون المطعم, التكوينات, الشيكات القادمة), **Then** their amounts are unchanged from before this
   feature.
4. **Given** a center without the cantine module, **When** the general view renders, **Then** the
   annual total behaves identically (no restaurant amounts were ever included there, and none are
   now).

---

### User Story 2 - The Repas onglet respects the kitchen mode end-to-end (Priority: P1)

With «👨‍🍳 مطبخ داخلي (طباخ قار)» selected (in-house kitchen, no external traiteur), the Repas
onglet must stop presenting traiteur economics: the «حصة الـ Traiteur» and «ربح السنتر من الوجبات»
cards disappear, and no amount on the screen may ever be computed as unit count × unit price for
traiteur purposes — that sharing logic only exists when an external traiteur is contracted.
Additionally, at month closure the «الفرفي المكتسب (Forfait ferme)» block must let the
administrator see, for each student, the forfait amount to return — per-student visibility, not
just the two aggregate figures.

**Why this priority**: In-house centers currently see traiteur-sharing concepts that do not apply
to them (a correctness/misleading-display problem fixed for the strip and table columns in an
earlier revision, but not for these two cards), and the closure moment — when real money moves —
needs per-student amounts to be actionable.

**Independent Test**: Render the Repas onglet in both kitchen modes with the same data; assert
the two cards are absent in-house and present in traiteur mode with identical other numbers; then
close a month and verify the per-student forfait list matches the students holding unconsumed
prepaid balances.

**Acceptance Scenarios**:

1. **Given** in-house kitchen mode, **When** the Repas onglet renders, **Then** the «حصة الـ
   Traiteur» card and the «ربح السنتر من الوجبات» card do not appear.
2. **Given** external-traiteur mode, **When** the Repas onglet renders, **Then** both cards appear
   exactly as before this feature.
3. **Given** in-house kitchen mode, **When** any Repas figure renders, **Then** no amount on the
   onglet is derived from a unit-count × unit-price traiteur computation — the same data renders
   the same non-traiteur figures regardless of the mode cards' visibility.
4. **Given** a month closure performed on a month where students hold unconsumed prepaid
   balances, **When** the closure completes, **Then** the forfait block displays the per-student
   list of forfait amounts to return (each student with his amount), alongside the existing
   aggregate figures.

---

### User Story 3 - A paid Goûter subscription is never shown as unpaid (Priority: P1)

A student's Goûter subscription for the month is fully paid; when a goûter is then added for a
day, the Finance surfaces display the student as non-paying — an anomaly that erodes trust in the
payment follow-up. The payment-status computation must recognize the paid subscription: the
payment lookup must account for the service type (Goûter payments, not only Repas), and must
match the right student for the right month, so a settled Goûter month reads as settled wherever
its status is displayed.

**Why this priority**: It is a correctness anomaly in money-handling display: staff see "unpaid"
for students who paid, risking duplicate collection or wrong refusal at the door. P1 alongside the
other two because it directly misrepresents payment state.

**Independent Test**: Seed a student with a paid Goûter subscription payment for a month and a
goûter attendance in that month; render the finance Goûter payment-status surfaces and verify the
status reads paid — then flip the payment to a different month or service and verify it correctly
reads unpaid (the matching must not over-match).

**Acceptance Scenarios**:

1. **Given** a student with a settled Goûter subscription for the month and a goûter attendance
   that month, **When** the finance Goûter status renders, **Then** it displays as paid (مسدد),
   never as unpaid.
2. **Given** the payment lookup, **When** a Goûter payment exists for that student and month,
   **Then** it is matched regardless of which surface computes the status (all finance views
   agree).
3. **Given** a Goûter payment for a different month, or a Repas payment in the same month,
   **When** the status renders, **Then** it does not over-match — the student's unpaid Goûter
   month still reads unpaid.
4. **Given** the Repas onglet's own payment statuses, **When** Goûter data changes, **Then** no
   Repas status is affected (service-type isolation holds).

---

### Edge Cases

- What happens when the annual total is computed for a center without any restaurant data? → The
  total equals the other services' revenue alone; the exclusion is a no-op.
- What happens when a Goûter payment covers only part of the month (partial/advance)? → The
  status keeps its existing advance semantics (partially paid ≠ paid); only a fully settled month
  reads as paid.
- What happens when a Goûter payment carries a discount? → The discount continues to reduce the
  effective required amount exactly as today; the fix must not change discount handling, only the
  recognition of matching payments.
- What happens when the month closure is re-run (a closure already exists for the month)? → The
  existing replace-on-close behavior is kept; the per-student list reflects the latest snapshot.
- What happens when no student holds an unconsumed prepaid balance at closure? → The per-student
  list renders an explicit empty message rather than an empty shell.
- What happens when a student's payments mix Goûter and Repas in the same month? → Each service's
  status is computed from its own payments only; the Goûter fix must not borrow Repas amounts.

## Requirements *(mandatory)*

### Functional Requirements

**Group A — general finance view**

- **FR-001**: The system MUST NOT render the «إيرادات المطعم» metric card in the general finance
  view, for any module configuration.
- **FR-002**: The «الإيرادات الكلية (السنة)» total MUST exclude all Repas and Goûter amounts;
  restaurant data changes MUST leave it unchanged.
- **FR-003**: All other general-view revenue cards MUST keep their pre-feature amounts unchanged
  (the exclusion is scoped to the annual total).

**Group B — Repas onglet kitchen-mode logic**

- **FR-004**: In in-house kitchen mode, the «حصة الـ Traiteur» card and the «ربح السنتر من الوجبات»
  card MUST NOT render on the Repas onglet; in external-traiteur mode both MUST render unchanged.
- **FR-005**: In in-house kitchen mode, no Repas-onglet amount MUST be computed as unit count ×
  unit price for traiteur-sharing purposes; traiteur-share computation occurs only when an
  external traiteur is contracted.
- **FR-006**: Performing a month closure MUST present, for each student holding an unconsumed
  prepaid balance, his individual forfait amount to return, alongside the existing aggregate
  figures; the existing closure semantics (replace-on-close, finished-month gating) are kept.

**Group C — Goûter payment-status anomaly**

- **FR-007**: The Goûter payment-status computation MUST match payments by service type (Goûter)
  in addition to student and month, so that a settled Goûter subscription month is recognized as
  paid on every finance surface that displays it.
- **FR-008**: The matching MUST NOT over-match: payments of other services (e.g. Repas) in the
  same month, or Goûter payments in other months, MUST NOT satisfy a Goûter month's status.
- **FR-009**: The fix MUST apply uniformly wherever the Goûter status is displayed in the finance
  module, so all surfaces agree for the same data.

### Key Entities *(include if data involved)*

- **Payment record**: the per-student payment entry carrying service (Repas / Goûter / others),
  month label (with school year), amount, discount, refund and cheque state. The anomaly fix
  concerns only how these are matched to a Goûter month's status — no stored shape changes.
- **Meal attendance record**: per-student, per-date, per-service consumption; unchanged by this
  feature.
- **Forfait closure snapshot**: the persisted end-of-month closure items (per student); this
  feature only adds per-student visibility of an existing snapshot at closure time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 occurrences of the «إيرادات المطعم» card render in the general view under any
  configuration; 100% of other revenue cards keep byte-identical amounts on the same data.
- **SC-002**: With restaurant payments seeded, the annual total revenue changes by exactly 0 when
  restaurant data is mutated — 100% of its amount derives from non-restaurant services.
- **SC-003**: In in-house mode, 0 traiteur-economics cards render on the Repas onglet and no
  amount derives from unit count × unit price; in traiteur mode both cards render as before.
- **SC-004**: After a month closure, 100% of students holding unconsumed prepaid balances appear
  in the per-student forfait list with their exact amounts; students without balances never
  appear.
- **SC-005**: With a settled Goûter month, 100% of finance status displays read paid; with
  mismatched service or month, 100% read unpaid — 0 over-matches, 0 false negatives.

## Assumptions

- «Supprimer ce bloc» (remark 1) means removing the «إيرادات المطعم» card from the general view
  only; the dedicated Repas/Goûter section introduced by 006/007 is untouched and remains the
  single place restaurant revenue is followed.
- The annual-total exclusion (remark 2) covers both Repas and Goûter amounts in whatever form
  they enter the computation today (including the restaurant-benefit term); other cards' formulas
  are frozen (FR-003).
- The in-house computations to remove (remark 3's «ne jamais calculer») concern the two hidden
  cards' underlying amounts; already-mode-invariant figures (established by an earlier revision's
  mode-invariance guarantee) are unchanged by this feature.
- The forfait per-student list (remark 4) reuses the per-student amounts already persisted in the
  closure snapshot; no new persistence is introduced.
- The Goûter anomaly (remark 5) is a matching defect in the status computation shared by finance
  surfaces; the fix lands in the shared computation so every display agrees, and discount and
  advance semantics are preserved.
- Cheque-related deductions (pending cheques) in the annual total keep their current treatment;
  this feature changes only which payment services are included, not how pending cheques are
  handled.
