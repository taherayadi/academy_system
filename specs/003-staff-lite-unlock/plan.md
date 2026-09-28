# Implementation Plan: Staff-Lite Unlock (Étude centers get limited staff access)

**Branch**: `003-staff-lite-unlock` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-staff-lite-unlock/spec.md`

## Summary

Unlock the staff module in a **lite mode** for centers that enabled Étude but have not
purchased Staff: navigation shows « إدارة الموظفين », the module opens to staff profiles
with add/edit/delete fully working, while the daily pointage sub-tab is unreachable and
payslip/advance/congé/schedule surfaces are replaced by locked messages whose upgrade
action navigates to التجديد (renewal). Staff-purchasing centers keep the full module,
byte-for-byte unchanged; centers with neither module keep it hidden.

Technical approach: one derived boolean (`staffLite`) computed in App.tsx from the
center's enabled-modules list (already live-synced mid-session), passed with a
renewal-navigation callback into `StaffManagementModule`, which already splits its UI
into a profiles sub-tab and a pointage sub-tab — lite mode forces profiles, hides the
pointage tab button and branch, and wraps the payroll modals/sections. Pure-frontend:
no routes, no storage, no API changes.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22.13+; React 18 SPA

**Primary Dependencies**: React 18 + Vite, TailwindCSS, lucide-react, vitest + Testing
Library (component-test convention established)

**Storage**: none — behavioral gate over the existing staff data (payroll records
untouched, no write path added or removed)

**Testing**: vitest; new component tests for lite/full/hidden modes; gates =
`npm run lint` + `npm test` + `npm run build`

**Target Platform**: Modern desktop + mobile browsers

**Project Type**: Web application (frontend-only change)

**Performance Goals**: one boolean derivation per render; no added data fetching

**Constraints**: paying centers unchanged (FR-002/011); no payroll writes in lite
(FR-007/008); composition with restricted_admin and live sync preserved (FR-009/010)

**Scale/Scope**: 2 existing files touched (`src/App.tsx`,
`src/components/StaffManagementModule.tsx`), 1 new component test file; no new modules,
routes, or dependencies

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Deployment Split | ✅ PASS | Frontend-only; renewal navigation targets the existing in-app renewal module; no platform surface. |
| II. Tenant Isolation | ✅ PASS | Reads the session-loaded center's enabled-modules (already synced); no new data access; staff CRUD uses the existing authenticated center-scoped route unchanged. |
| III. Security by Default | ✅ PASS | No endpoints/uploads/secrets touched. Enforcement model = client-side visibility consistent with every existing module gate (recorded as spec assumption); the staff route itself is unchanged and authenticated. |
| IV. Exact Contract Surface | ✅ PASS | Zero route changes; inventory untouched; lite UI simply never emits payroll fields in the existing staff-save payloads. |
| V. Test-First Verification | ✅ PASS | New suite proves lite CRUD works, locks render + navigate to renewal, pointage unreachable, full mode unchanged (regression guard FR-011). Gates mandatory. |

**Post-design re-check (Phase 1)**: Re-verified — mode matrix in data-model.md is the
complete contract; no data flow added; per-mode test map in quickstart.md covers every
FR. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-staff-lite-unlock/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (mode matrix — no new entities)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

**Contracts/**: intentionally omitted — no external interface changes (no routes,
events, or schemas). The staff-save payload contract is unchanged; lite mode only
narrows what the UI emits.

### Source Code (repository root)

```text
src/
├── App.tsx                                 # derive staffLite (etude-present, staff-absent, non-legacy
│                                           #   module list); unlock sidebar module8 entry for etude centers;
│                                           #   whitelist module8 in the module-enablement fallback guard;
│                                           #   pass staffLite + onGoToRenewal={() => setActiveTab('renewal')}
│                                           #   into the module8 render branch (~line 1255)
├── components/
│   └── StaffManagementModule.tsx           # accept staffLite?/onGoToRenewal?; force profiles sub-tab,
│                                           #   hide pointage tab button (~742) + pointage branch (~1132),
│                                           #   lock payslip/avance/congé/schedule surfaces behind the flag
│                                           #   with an upgrade card → onGoToRenewal
└── components/StaffManagementModule.test.tsx  # NEW: lite CRUD + locks + navigation; full mode unchanged
```

**Structure Decision**: No new directories; test co-located with the component per
existing convention.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
