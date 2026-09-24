# Quickstart: Type-Aware Gating — End-to-End Validation

**Feature**: `002-type-aware-gating` | **Date**: 2026-09-23

## Prerequisites

- Node 22.13+, `npm install` done.
- Dev server: `npm run dev` (frontend, port 3000) — no Functions changes in this
  feature, but `npm run pages:dev` (port 8788) is needed if login/data are exercised
  against local API (constitution workflow §2).
- A center typed `crèche` (or `jardin`) and one typed `formation` (or `garderie`) to
  compare against. Until feature 001-US1 ships, simulate by setting the center's type
  in local data; unknown-type centers must show today's full visibility.

## Automated gates (run first — all must pass)

```bash
npm run lint     # typecheck
npm test         # includes the four new suites + full regression
npm run build    # production build
```

New suites proving this feature:
- predicate truth table (`src/utils/centerType.test.ts`)
- registration gating (`src/components/StudentRegistrationModule.test.tsx`)
- Suivi quick-actions gating (`src/components/SuiviScolaireModule.test.tsx`)
- App nav/deep-link gating (`src/App.typeGating.test.tsx`)

## Manual validation scenarios (map to spec stories)

**S1 — Registration adapts** (Story 1): crèche center → add child: no « المستوى
الدراسي », no « المؤسسة التعليمية », save succeeds. formation center → both fields
present, grade required. Crèche student list/cards/prints/receipts: zero grade text
anywhere; no grade filter.

**S2 — Suivi quick actions** (Story 2): crèche center → no NotebookPen icon, no Clock
icon (or disabled placeholder) on any row; pay a monthly fee — payment flow intact.
formation center → both icons present, dialogs open.

**S3 — Study modules** (Story 3): crèche center → sidebar (desktop + mobile) shows
none of the four study tabs; dashboard shows none of their cards; bookmark a study
tab URL, reload → lands on dashboard. formation center → all four open normally
(subject to their subscription, as before).

**S4 — Legacy safety**: center with empty/unknown type → everything visible exactly
as today (registration fields, quick actions, all enabled modules).

**S5 — Data preservation**: crèche center → confirm a child that previously had a
grade still holds it (switch the type to formation in local data: grade reappears in
list/card; switch back: hidden again, value intact).

## Expected end state

All gates green; S1–S5 behave as described; garderie/formation and legacy centers
show zero behavioral change.
