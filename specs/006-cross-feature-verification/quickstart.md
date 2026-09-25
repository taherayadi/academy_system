# Quickstart: Cross-Feature Verification — Release Walkthrough

**Feature**: `006-cross-feature-verification` | **Date**: 2026-09-23

## Prerequisites

- Node 22.13+, `npm install` done; features 001–005 implemented.
- Dev servers per constitution workflow (`npm run dev` + `npm run pages:dev`).
- Admin-repo migrations for `activities`, `skills`, `skill_evaluations` applied to
  local D1.
- Provision (or simulate via local data) the composed configurations from
  data-model.md: C1 (crèche + étude-only + both new modules), C2 (unknown type,
  legacy list), C3/C4 (formation/garderie, pre-program lists), C7 (étude-only with
  payroll history).

## Automated gates (run first — ALL must pass at the combined state)

```bash
npm run lint     # typecheck over the whole program
npm test         # EVERYTHING: pre-existing suite (unmodified) + all five features'
                 # suites + the composed suites from this feature
npm run build    # production build
```

New composed suites: `src/program.composed.test.tsx` (C1–C5),
`src/pricing.coherence.test.ts` (C10), `src/dataSafety.roundtrip.test.tsx` (C6–C9),
plus the configuration-factory sanity test.

## Manual composed walkthroughs (map to spec stories)

**W1 — The crèche full pass** (US1, config C1): log into the crèche center →
register a child (zero school fields, saves) → Suivi (no notes/timesheet icons,
payments work) → sidebar/dashboard: no study modules anywhere; deep-link a study
tab → dashboard → staff module: lite mode (CRUD works, payroll locked, upgrade →
التجديد) → Activités: create/move an activity → Compétences: evaluate a child,
print the report → process a mock renewal mid-session → visibility/modes update on
sync. Every step must behave per its owning feature while the others stay active.

**W2 — Legacy pass** (US2, configs C2/C3/C4): log into the unknown-type center →
everything visible as pre-program (registration fields, quick actions, full staff
if entitled) → repeat critical paths on the formation and garderie centers →
identical pre-program behavior throughout.

**W3 — Commercial coherence** (US3, config C10): landing simulator ↔ renewal
module side by side → every module entry identical → apply each preset on both →
same selections → derive plan for base-only / base+new / all → Basic/Growth/Pro.

**W4 — Data-safety round-trips** (US4, configs C6–C9): flip the crèche to
formation → hidden grades reappear verbatim → flip back → hidden again, values
intact → add staff to the étude-only center → payroll history reappears unchanged
→ disable/re-enable both new modules → data intact.

## Expected end state

All gates green at the combined state; W1–W4 behave exactly as described; zero
regressions in the pre-existing suite; coordination items (admin-repo migrations
scheduled, single canonical definitions) closed. The program is release-ready.

---

# Revision B walkthroughs — remarks alignment (`center-type-module-rules.md`)

Run on the same dev servers as W1 (`npm run dev` + `npm run pages:dev`).

**W5 — Registration age-appropriateness** (remark 1): log into the C1 crèche
center → «تسجيل التلاميذ» → open the add-child form → SECTION 5
«المسار الدراسي لآخر 3 سنوات» is absent entirely, sections renumber visually
intact, submit succeeds → print the fiche: no «Academic History» block → repeat
in a garden center (same result) → log into the formation center: the section is
present and works (regression).

**W6 — Staff-lite affordances** (remark 3): on the étude-without-staff center →
«إدارة الموظفين» → the «نظام الحضور والغياب اليومي» sub-tab is visible but
disabled with a lock glyph; clicking it does nothing and the profiles panel
stays → payroll surfaces (paie, avances, congés) show «ميزة مقفلة» with
«الذهاب إلى التجديد» → log into a staff-entitled center: the pointage sub-tab
opens normally (regression).

**W7 — Renewal compatibility filter** (remark 4): on the crèche center →
«التجديد» → the simulator lists cantine, transport, events, staff, activites,
competences — **no** étude/cours/revision/formations entries → the current-plan
display still shows what the center already has enabled (nothing vanishes) →
log into the formation center: all addons are offered (regression) →
legacy/unknown-type center: all addons offered (passthrough).

**W8 — Landing badges + demo guidance** (remarks 5+6): open the landing page →
the pricing simulator's addon rows each carry a «Disponible : …» badge line
(étude → Garderie, Formation; events → all four) → in the demo form select
Crèche then toggle Étude: the ℹ️ banner appears live and the submit button stays
enabled → remove Étude or switch the type to Garderie: banner disappears →
submit with a crèche + étude selection still goes through (informative, not
blocking).

**Expected end state (revision B)**: W5–W8 behave exactly as described; all
gates stay green with the new per-surface tests included; the compatibility
matrix has a single definition in `src/utils/centerType.ts` asserted by the
test suite.
