# Quickstart: Compétences & Skills — End-to-End Validation

**Feature**: `005-competences-skills` | **Date**: 2026-09-23

## Prerequisites

- Node 22.13+, `npm install` done.
- Dev servers per constitution workflow: `npm run dev` (port 3000, `/api` proxy →
  8788) and `npm run pages:dev` (port 8788).
- Admin-repo migration applied to local D1: `skills` + `skill_evaluations` tables per
  [data-model.md](./data-model.md) (blocks handler tests/production, not UI work).
- Test centers: one with the `competences` module enabled (and Staff purchased), one
  with the module enabled but Staff NOT purchased (evaluator free-text mode), one
  without the module (gating check). A few children sharing a class label.

## Automated gates (run first — all must pass)

```bash
npm run lint     # typecheck
npm test         # unit + component + SQLite integration suites
npm run build    # production build
```

Suites proving this feature: `src/utils/skills.test.ts` (validation truth table,
level colors, evaluator rule, heatmap bucketing),
`src/components/CompetencesModule.test.tsx` (CRUD blocking, evaluation save,
grouping, print section), `functions/api/skills.test.ts` (isolation, 401/405,
cascade, discriminator, dedupe, 400s), middleware inventory extension, pricing
catalog/preset tests.

## Manual validation scenarios (map to spec stories)

**S1 — Catalog** (Story 1): enable the module → open it → add « Reconnaître les
lettres » (langage, 36–48 mois) and « Sauter à un pied » (motricité) → both appear
under their domains; enter an inverted age range (to < from) → blocked with a
message; edit a label; remove a skill → its evaluations disappear, others intact;
reload → catalog exactly as saved.

**S2 — Evaluations, staff center** (Story 2): pick a child → set « Reconnaître les
lettres » to « en cours » → evaluator picker offers the staff roster → save with
today's date → persists after reload; re-evaluate to « acquis » → level, evaluator,
date all replace (one current evaluation).

**S3 — Evaluations, non-staff center** (Story 2): in the non-staff center →
evaluator is a free-text name field (no roster); save an evaluation → persists with
the typed name shown.

**S4 — Heatmap & report** (Story 3): with 2–3 children sharing a class label and one
without → heatmap shows class groups (unassigned last), cells show levels, empty
cells neutral; print a child's report → print-ready A4 in the bulletin style listing
domains/skills/levels/evaluators/dates; print a child with no evaluations → explicit
empty state, not a broken document.

**S5 — Commercial** (Story 4): landing simulator → « Compétences & Skills » listed
with price; Growth preset pre-selects it, Basic doesn't; base + module derives
Growth. Renewal module → identical listing. Center without the module → no
sidebar/dashboard trace.

**S6 — Edge cases**: delete a staff member who evaluated → evaluations render
without breaking; disable the module → navigation entry gone, re-enable → data
intact; two sessions editing → latest save wins per child-skill pair after sync.

## Expected end state

All gates green; S1–S6 behave as described; other modules' behavior unchanged.
