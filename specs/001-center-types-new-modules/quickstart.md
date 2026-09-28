# Quickstart: Center Types & New Modules — End-to-End Validation

**Feature**: `001-center-types-new-modules` | **Date**: 2026-09-23

## Prerequisites

- Node 22.13+, `npm install` done.
- Admin-repo migration applied to the local D1: the three new tables `activities`,
  `skills`, `skill_evaluations` per [data-model.md](./data-model.md).
- Two terminals: `npm run dev` (frontend, port 3000, `/api` proxy → 8788) and
  `npm run pages:dev` (Functions, port 8788) — constitution workflow §2.

## Automated gates (run first — all must pass)

```bash
npm run lint     # typecheck
npm test         # unit + SQLite integration suites
npm run build    # production build
```

Test suites specific to this feature: `src/utils/centerType.test.ts`,
`functions/api/activities` + `skills` handler isolation tests,
`_middleware.test.ts` (new inventory entries), staff-lite component test,
type-gating tests for crèche.

## Manual validation scenarios (map to spec stories)

**S1 — Signup with the new types** (Story 1): open `http://localhost:3000`, start a
demo request, open the establishment-type selector → four options (Jardin, Crèche,
Garderie, Formation). Select « Crèche », submit, verify the request payload carries
`centerType: 'creche'` (network tab).

**S2 — Registration adapts** (Story 2): log into a center typed `jardin` (or provision
one typed `crèche`) → add child: no « المستوى الدراسي », no « المؤسسة التعليمية »;
save succeeds. Switch to a `formation` center: both fields present, grade required.
List/card/print views of the crèche/jardin center show no grade anywhere.

**S3 — Suivi quick actions** (Story 3): same crèche/jardin session → Suivi Scolaire:
no NotebookPen icon, no Clock icon on student rows, no grade filter. Formation
session: both icons present and functional.

**S4 — Study modules hidden** (Story 4): crèche/jardin session → sidebar shows no
Cours Particuliers / Étude / Révision / Formations; navigating to a study tab id
falls back to the dashboard. Formation session: all four behave as before.

**S5 — Staff-lite** (Story 5): center with `etude` enabled and `staff` NOT enabled →
« إدارة الموظفين » visible; inside: only profiles; add/edit/delete staff works;
payslip/advance/congé/pointage surfaces show an upgrade prompt (link jumps to
التجديد). Center with `staff` enabled: unchanged full module.

**S6 — Activités & Planning** (Story 6): enable module (renewal simulation or preset)
→ sidebar + dashboard card appear; create activities in 2 categories on 2 days; drag
one to another slot; reload → persisted; switch grouping class ↔ location.

**S7 — Compétences & Skills** (Story 7): enable module → add skills in 2 domains;
evaluate a child (staff center → roster picker; non-staff center → free-text name);
open class heatmap; print the child report (bulletin-style A4).

**S8 — Plan gating** (Story 8): landing simulator shows both modules as add-ons;
Growth preset pre-selects both, Basic selects neither; toggling updates derived plan
(both toggled on a base selection → Growth; all modules → Pro). Renewal module shows
the identical catalog.

## Expected end state

All gates green; every scenario above behaves as described; existing flows (jardin/
formation centers without the feature) unchanged.
