# Quickstart: Activités & Planning — End-to-End Validation

**Feature**: `004-activities-planning` | **Date**: 2026-09-23

## Prerequisites

- Node 22.13+, `npm install` done.
- Dev servers per constitution workflow: `npm run dev` (port 3000, `/api` proxy →
  8788) and `npm run pages:dev` (port 8788).
- Admin-repo migration applied to local D1: the `activities` table per
  [data-model.md](./data-model.md) (blocks handler tests/production, not UI work).
- A test center with the `activites` module enabled (via renewal simulation or local
  data), and one with it disabled for the gating check.

## Automated gates (run first — all must pass)

```bash
npm run lint     # typecheck
npm test         # unit + component + SQLite integration suites
npm run build    # production build
```

Suites proving this feature: `src/utils/planner.test.ts` (banding, grouping,
validation predicate, category colors), `src/components/ActivitiesModule.test.tsx`
(placement, validation blocking, move, grouping, persistence calls),
`functions/api/activities.test.ts` (isolation, 401/405, validation drops, dedupe),
middleware inventory test extension, pricing catalog/preset tests.

## Manual validation scenarios (map to spec stories)

**S1 — Create & see on the grid** (Story 1): enable the module → open it → create
« Atelier peinture » (art, Mercredi, 10:00–11:00) → a violet chip appears in the
Mercredi column at the 10:00 band. Create « Motricité libre » (motricite, Lundi,
08:30–09:15) → emerald chip at 08:30. Reload → both intact with all fields.

**S2 — Validation** (Story 1): try submitting with empty title → blocked with a
message; end time before start → blocked; category unset → blocked. Nothing is saved
in any of these cases.

**S3 — Move & group** (Story 2): drag « Atelier peinture » from Mercredi to Jeudi
(same band) → chip moves; reload → Jeudi persisted. Toggle grouping to per class
(with two class labels + one unassigned activity) → three group sections, unassigned
last; toggle to per location → regrouped by location. Switch back to plain week view.

**S4 — Touch fallback** (Story 2, mobile/touch): tap a chip (selected ring) → tap
another day/band cell → chip moves and persists.

**S5 — Commercial** (Story 3): landing simulator → « Activités & Planning » listed
among add-ons with price; apply Growth preset → pre-selected; Basic preset → not
selected; base + this module derives Growth. In-app renewal module → identical
listing. A center without the module → no sidebar/dashboard trace.

**S6 — Edge cases**: create two activities in the same day/band → both chips visible
in the cell; delete the supervising staff member of an activity → chip renders
without the supervisor name; disable the module → navigation entry gone, re-enable →
data reappears intact.

## Expected end state

All gates green; S1–S6 behave as described; other modules' behavior unchanged.
