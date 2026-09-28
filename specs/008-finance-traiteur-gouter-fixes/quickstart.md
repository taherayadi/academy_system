# Quickstart: Finance — Revenus, Traiteur et statut de paiement Goûter

**Feature**: `008-finance-traiteur-gouter-fixes` | **Date**: 2026-09-28

Prerequisites: a cantine-enabled center with (1) Repas + Goûter + other-service payments recorded
across the school year, (2) students holding unconsumed prepaid Repas balances for a finished
month, (3) a student with a settled Goûter subscription payment plus a day goûter marked. The
Finance module's general view and Gestion-des-repas section. Automated counterparts: the
FinanceModule, MealsModule, meals and composed suites; `npm test` for the full gate.

**W1 — The general view stops double-counting the restaurant (US1 / FR-001–003)**: open the
Finance general view → the «إيرادات المطعم» card is gone (both with and without the cantine
entitlement) → read «الإيرادات الكلية (السنة)»: add or remove Repas and Goûter payments for the
year and re-check — the total never moves → confirm the other cards (التسجيلات السنوية,
المقبوضات بدون المطعم, التكوينات, الشيكات القادمة, الصافي المالي للفترة) show exactly their
pre-feature amounts on the same data.

**W2 — The Repas onglet follows the kitchen mode and shows the closure detail (US2 /
FR-004–006)**: in settings select «🤝 متعاقد مع Traiteur خارجي» → the Repas onglet shows «حصة الـ
Traiteur» and «ربح السنتر من الوجبات» cards as before → switch to «👨‍🍳 مطبخ داخلي (طباخ قار)» →
both cards are gone; every other card keeps its number (identical to the traiteur-mode run on the
same data) → back in traiteur mode with a finished month holding prepaid balances: press «إغلاق
شهر …» → the forfait block now lists each student with his forfait amount to return, matching the
students who held balances → re-close (replace) and re-check the list → switch to a month with no
balances: the list shows the explicit empty message.

**W3 — A paid Goûter month reads paid everywhere (US3 / FR-007–009)**: for a student with a
settled Goûter subscription for the month, mark a day goûter via the Goûter tab's mark button →
open Finance ▸ Gestion des repas, Goûter onglet → the student's payment status reads مسدد (paid),
not غير مسدد → cross-check the meals module's daily grid for the same student and month: the
goûter service reads paid there too (one shared status) → negative checks: a Repas payment in the
same month does not satisfy the Goûter status; a Goûter payment in another month does not satisfy
this one; a partial payment still reads تسبيق (advance).

**Expected end state**: W1–W3 behave exactly as described; the full gate (`npm run lint`,
`npm test`, `npm run build`) stays green with the extended suites; no schema change, no route
change, no rounding; 006/007 behaviors outside the listed blocks untouched.
