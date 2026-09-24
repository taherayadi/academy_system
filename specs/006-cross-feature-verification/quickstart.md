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
