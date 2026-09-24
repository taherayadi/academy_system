# Quickstart: Staff-Lite Unlock — End-to-End Validation

**Feature**: `003-staff-lite-unlock` | **Date**: 2026-09-23

## Prerequisites

- Node 22.13+, `npm install` done.
- Dev servers per constitution workflow: `npm run dev` (port 3000) and
  `npm run pages:dev` (port 8788) for login/data.
- Three centers (or one center whose enabled-modules you flip between checks):
  **A** = étude enabled, staff NOT (lite); **B** = staff enabled (full);
  **C** = neither (staff hidden). Until admin-side provisioning provides these,
  simulate by adjusting the center's enabled-modules in local data.

## Automated gates (run first — all must pass)

```bash
npm run lint     # typecheck
npm test         # full suite incl. new staff-lite tests + staff regression
npm run build    # production build
```

New suite proving this feature: `src/components/StaffManagementModule.test.tsx`
(lite CRUD + locks + renewal navigation; full mode regression guard) and the
App-level visibility assertion.

## Manual validation scenarios (map to spec stories)

**S1 — Lite roster CRUD** (Story 1): center A → « إدارة الموظفين » in sidebar → open:
staff list + add action present → add a supervisor, edit their role, delete a test
entry — every change persists after reload; the new supervisor appears in Étude's
staff picker.

**S2 — Lite locks** (Story 2): center A → staff module shows profiles only (no
pointage sub-tab); open a staff member: payslip/avance/congé/schedule surfaces show
the locked message; activate the upgrade action → app navigates to التجديد. Browse
every lite surface — no payroll control is operable anywhere.

**S3 — Full mode regression** (Story 3): center B → staff module identical to today:
profiles + pointage tabs, payslip generation flow, avance, congé, schedule; zero
locked messages or upgrade prompts.

**S4 — Hidden for neither** : center C → no staff entry in the sidebar; deep-linking
the staff tab id falls back to the dashboard (existing module gating).

**S5 — Mid-session flip** : with center A logged in, process a renewal adding the
staff module (or flip local data) → on sync the staff module becomes full (pointage
tab appears, locked cards gone) without re-login.

**S6 — Data preservation** : center A (which previously held payroll records from a
paid period) → confirm no lite surface lists them; flip to full → records reappear
verbatim.

## Expected end state

All gates green; S1–S6 behave as described; center B's flows and all pre-existing
staff tests unchanged.
