# Implementation Plan: Cross-Feature Verification & Release Readiness

**Branch**: `006-cross-feature-verification` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-cross-feature-verification/spec.md`

## Summary

Verification feature over the combined program (features 001–005): composed
configuration tests (crèche full pass, legacy pass, garderie/formation pass), the
immutable pre-existing regression suite, commercial catalog coherence checks
(landing ≡ renewal, presets, derivation, no phantom keys), data-safety round-trip
tests (type flip, staff purchase, module disable/re-enable, cascade precision under
concurrency), and release-gate closure (all gates green at the combined state,
per-feature quickstarts re-run on composed configurations, admin-repo migration
scheduling confirmed, canonical shared files asserted single-definition).

Technical approach: a small number of **composed test files** that render the app
shell / invoke handlers with combined configurations, plus a **program matrix
document** (data-model.md) enumerating every configuration × surface cell the
composed tests cover, plus verification tooling already provided by the gates. The
only production-code changes allowed are integration fixes forced by these tests,
each landing in the owning feature's files together with its test.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22.13+; React 18 SPA; vitest +
Testing Library; `node:sqlite` integration harness (existing)

**Primary Dependencies**: the five features' code and suites; existing test
conventions (`*.test.ts(x)` co-located); no new dependencies

**Storage**: none new — verification operates over existing domains; the admin-repo
migrations for the three program tables are a coordination check, not code here

**Testing**: this feature *is* testing: composed suites + gate runs; gates =
`npm run lint` + `npm test` + `npm run build` at the combined state

**Target Platform**: same as the program (desktop + mobile browsers; CI/local Node)

**Project Type**: Web application (verification increment)

**Performance Goals**: composed suites run within the existing test budget (no
per-cell server spawns; reuse harnesses)

**Constraints**: pre-existing tests are immutable (failures are program bugs);
production-code changes only as integration fixes with their tests; no new
user-facing behavior

**Scale/Scope**: ~3–4 new composed test files + 1 program matrix doc; touches
production code only if a composed test exposes a cross-feature bug

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-evaluated after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Deployment Split | ✅ PASS | Verification only; the admin-repo migration check strengthens the split's coordination rule (no migrations created here). |
| II. Tenant Isolation | ✅ PASS | Composed tests re-assert isolation across features (isolation tests from 001/004/005 remain in the suite; nothing bypasses session-derived context). |
| III. Security by Default | ✅ PASS | No endpoints/uploads/secrets; composed suites include the security-relevant suites' continued greenness (route inventory, isolation) as part of the gate. |
| IV. Exact Contract Surface | ✅ PASS | No route changes; the coherence check includes asserting the inventory covers exactly the program's routes (catalog-keys ↔ modules ↔ routes agreement). |
| V. Test-First Verification | ✅ PASS | The feature is the embodiment of this principle: composed failing-capable tests, immutable legacy baseline, gates at the combined state. |

**Post-design re-check (Phase 1)**: Re-verified — the matrix (data-model.md) maps
every FR to a composed test cell; no production behavior is designed here, so no
new constitution exposure exists. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-cross-feature-verification/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (the composed-configuration matrix)
├── quickstart.md        # Phase 1 output (composed manual walkthroughs)
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

**Contracts/**: intentionally omitted — no external interfaces; the catalog ↔
module ↔ route agreement is asserted inside the composed tests.

### Source Code (repository root)

```text
src/testing/                               # NEW: composed-test helpers (config factories)
└── programConfig.ts                       # factory: makeCenter({ type, modules, role }) → composed props

src/testing/programConfig.test.ts          # NEW: factory sanity (defaults = legacy passthrough)

src/program.composed.test.tsx              # NEW: US1+US2 composed suites (crèche pass, legacy pass,
                                           #   garderie/formation pass; nav+modules+staff-lite in one render)
src/pricing.coherence.test.ts              # NEW: US3 catalog coherence (landing≡renewal source identity,
                                           #   presets, derivation, catalog-key ↔ module existence)
src/dataSafety.roundtrip.test.tsx          # NEW: US4 round-trips (type flip grade reveal, staff purchase
                                           #   payroll reveal, module disable/re-enable, cascade precision)

(production code: touched ONLY if a composed test exposes an integration bug —
 fix lands in the owning feature's file together with the failing test)
```

**Structure Decision**: Composed suites live at `src/` top level (they span
components), with a tiny `src/testing/` helper module for configuration factories —
mirroring the existing test-adjacency convention without nesting inside any single
feature's files.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |

---

## Revision B — Remarks alignment (`center-type-module-rules.md`)

**Date**: 2026-09-25 | **Input**: the client's remarks file listing 6 numbered
remarks on the original implementation.

An implementation audit against the remarks file found **three gaps** (remarks 4,
5, 6) and **two tightenings** (remarks 1, 3). Remarks 2 and the matrix are already
satisfied verbatim by the shipped program. This revision adjusts the technical
approach accordingly; it does not re-open the verified 001–005 scope.

### Audit result per remark

| # | Remark | Current state | Verdict |
|---|--------|---------------|---------|
| 1 | Hide «المسار الدراسي لآخر 3 سنوات» (section 5) for crèche/jardin | Only grade/établissement fields are gated by `showSchoolLevel` (001); the whole SECTION 5 block **still renders** | TIGHTEN — gate the section itself + print view + submitted-value stripping |
| 2 | Menu by center type (crèche/jardin = 7 modules, no study tabs) | `hasStudyModules` + `hasCenterModule` filter the sidebar; composed tests C1 pass | SATISFIED — covered by existing tests |
| 3 | Staff-lite: locked payroll visible with upgrade hint, pointage locked too | Payroll surfaces show «ميزة مقفلة» + «الذهاب إلى التجديد»; **pointage sub-tab hides its content but its tab button stays clickable** (dead empty panel) | TIGHTEN — disable/lock the pointage tab button itself |
| 4 | Renewal: only center-type-compatible modules listed | `ADDON_MODULES` renders every addon for every center | **GAP** — add type compatibility filter with helper + tests |
| 5 | Landing cards show «Available for: …» badges | Catalog has no per-module compatibility data at all | **GAP** — extend catalog + render badges from it |
| 6 | Demo form live-validates type × module combo, informative not blocking | Form collects type and modules independently; no compatibility feedback | **GAP** — same helper, info banner, submission still allowed |

### Technical approach (deltas)

**Single new canonical helper** — compatibility is one concept used by three
surfaces, so it lives next to the other two canonical utilities and is asserted
single-definition by the same composed check:

```text
src/utils/centerType.ts   # extends the existing canonical file, no new file
+  moduleCenterTypes: Record<string, CenterType[]>   # which types each catalog module serves
+  isModuleCompatible(moduleKey, centerType): boolean # undefined/'' type → true (legacy passthrough)
+  incompatibleModules(keys, centerType): string[]    # used by renewal + demo form
+  SUPPORTED_TYPES_LABELS                             # fr/ar labels for badges and the remark text
```

Rules encoded (from the remarks matrix): the 4 study modules + the remaining
non-core catalog addons are garderie/formation only; `cantine`, `transport`,
`events`, `staff`, `activites`, `competences` serve all four types. Unknown or
empty center type stays legacy-visible everywhere (existing passthrough rule,
unbroken). Compatibility is **presentation + offer filtering only** — it never
blocks submission (remark 6) and never mutates stored enabledModules (FR-010
data-safety carries over unchanged).

**Remark 1 (registration section)**: wrap the SECTION 5 block and the print
«Academic History» block in `showSchoolLevel`; in `handleSubmit`, store
`academicHistory` only when `showSchoolLevel` (mirroring the existing grade
stripping at lines 434–435). Existing academicHistory data is untouched in the
DB — hiding is rendering-level, reversible, FR-010-safe.

**Remark 3 (pointage tab)**: in lite mode the pointage sub-tab button becomes
`disabled` with the locked style + lock glyph; `activeSubTab` never enters
`'pointage'`. Composed test flips from «tab label absent» to «tab present but
disabled», keeping the 4× LOCKED_MESSAGE + upgrade-button assertions.

**Remark 4 (renewal filter)**: `RenewalModule` receives `centerType` (App.tsx
passes `currentCenter?.centerType` alongside `center`); its addon grid renders
`ADDON_MODULES.filter(m => isModuleCompatible(m.key, centerType))`. Incompatible
modules are **never offered** (remark is explicit); edge case: an existing
enabledModules entry that is incompatible with the current type still shows as
currently-enabled in the summary (displayed, not offered) so the center never
loses sight of what it pays for — hiding that would contradict FR-010's
no-data-disappearance rule.

**Remark 5 (landing badges)**: every addon row on the landing simulator renders a
small «Disponible : …» line from `moduleCenterTypes` (via the helper), styled as
an inline badge list consistent with the existing card design; base modules
(all-types) stay badge-free to keep the base card clean.

**Remark 6 (demo form live validation)**: when a center type is selected and the
selection contains incompatible modules, an informational banner (ℹ️ style,
matching the existing form message styling) reads, in French:
«ℹ️ Ce module n'est pas disponible pour les centres Crèche / Jardin d'enfants.
Retirez-le ou choisissez Garderie / Formation pour le conserver.» — computed
live from `incompatibleModules`. Non-blocking: the submit button stays enabled;
nothing is stripped from the payload (the remark keeps the choice informative).

**Tests** (own files, per-feature adjacency; composed re-check in 006's suites):
1. `src/utils/centerType` — extend `centerType.test.ts`: matrix per remark table,
   legacy passthrough, `incompatibleModules` ordering.
2. `src/components/StudentRegistrationModule.test.tsx` — add crèche/jardin cases:
   section 5 absent (form + print), formation case intact (regression), submit
   strips academicHistory under crèche.
3. `src/components/StaffManagementModule.test.tsx` — lite mode: pointage tab
   rendered disabled, click does not open pointage panel; full mode unchanged.
4. `src/components/RenewalModule.test.tsx` — crèche/formation filter cases;
   incompatible-already-enabled shows as enabled; legacy/unknown type shows all.
5. `src/components/LandingPage.smoke.test.tsx` — badges render per module;
   remark-6 banner appears for crèche + study module and disappears when the
   module is removed or the type flips; submission payload unchanged.
6. `src/program.composed.test.tsx` — extend C1 walkthrough: pointage tab disabled
   (not absent); add a composed crèche renewal render asserting no study modules
   are offered.

**Constitution Check (revision B)**: re-verified — no new routes (IV), no new
endpoints/security surface (III), tenant context untouched (II), no migrations
created here (I), every delta lands with its test (V). No violations.

**Out of scope**: pricing/value changes, new modules, backend changes, blocking
validation on the demo form. The remarks matrix's «Personnel / Staff» for all
types is entitlement-gated as shipped (003) — type compatibility does not override
entitlements.

---

## Revision C — Remarks alignment (`remarques-modules-centre.md`)

**Date**: 2026-09-25 | **Input**: the client's remarks file listing **7 numbered
remarks** on the original implementation (a superset/duplicate of revision B's
6-remark source: revision B's remarks 1–3 correspond to remarks 1–3 here, with
remark 1 now pointing at the *attendance register* screen; revision B's remarks
4–6 are not repeated in this file).

An implementation audit against this file found **three gaps** (remarks 1, 3, 7)
and **two UI adjustments** (remarks 4, 5); remarks 2 and 6 are already satisfied
verbatim by the shipped program and are re-verified, not re-implemented. This
revision adjusts the technical approach accordingly; it does not re-open the
verified 001–005 scope and keeps revision B's shipped deltas untouched.

### Audit result per remark

| # | Remark | Current state (verified in code) | Verdict |
|---|--------|----------------------------------|---------|
| 1 | Hide the « كل المستويات » grade filter on « نظام تسجيل حضور التلاميذ » for crèche/jardin | The attendance register (`src/components/StudentAttendanceModule.tsx`, rendered by `StudentTimeSheetModule` when `centerType` is crèche/jardin) renders the grade `<select>` unconditionally; it receives **no `centerType` prop** | **GAP** — pass `centerType` through and gate the filter with `hasSchoolLevel` |
| 2 | Persist Activités & Compétences (migrations + CRUD endpoints) | `functions/api/activities.ts` + `functions/api/skills.ts` (GET/PUT, formations pattern), `readActivities/writeActivities` + `readSkills/writeSkills` in `_lib.ts`, route inventory entries, admin-repo migration coordination (001/004/005 T025, 006 T015) | SATISFIED — composed/handler tests already cover it |
| 3 | Planner grid starts at 08h00 (not 06h00) | `src/utils/planner.ts` builds `TIME_BANDS` from `DAY_START_MIN = 6 * 60` (28 bands, 06:00–20:00); `planner.test.ts` pins 06:00 edges | **GAP** — move the day start to 08:00 (24 bands, 08:00–20:00) and re-pin the tests |
| 4 | Icon before the title text, outside the green badge — « الأنشطة والبرنامج الأسبوعي » | `ActivitiesModule` banner: the green badge (`bg-brand-600/[0.06] … border-brand-600/20`) contains only the text label; no icon precedes the `text-2xl` title | **ADJUST** — render the module icon (Puzzle) before the title, outside the badge |
| 5 | Same for « المهارات والكفايات » | `CompetencesModule` banner: same structure | **ADJUST** — same change (Brain icon) |
| 6 | Dynamic skills management (skills table, migration, CRUD API, front consumes API) | Full CRUD shipped: catalog CRUD + evaluations in `CompetencesModule` via `onUpdateDoc` → `saveSkills` → `GET/PUT /api/skills` → `skills`/`skill_evaluations` tables; **no hardcoded catalog** exists in `src/` (the 4-skill fixtures live only in tests); empty catalog shows an explicit empty state with add affordances | SATISFIED — re-verified by 005's suites + composed C8/C9 |
| 7 | Renewal plan detection: selecting all modules for crèche/jardin must yield **Pro**, not Growth | `derivePlanFromModules(selected)` compares against the **global** `ALL_MODULES` list (`pricing.ts`), but the crèche simulator only *offers* type-compatible addons (revision B filter) — a crèche center can therefore never satisfy `all.every(k => selected.includes(k))` and is capped at Growth. Same flaw latent on the landing simulator | **GAP** — make plan derivation type-aware |

### Technical approach (deltas)

**Remark 1 — attendance-register grade filter.** The register component gains an
optional `centerType?: string` prop; `StudentTimeSheetModule` forwards its
existing prop when rendering the crèche/jardin branch. The grade `<select>`
(and its `gradeOptions` derivation feeding it) renders only when
`hasSchoolLevel(centerType)` — unknown/empty types keep the filter (legacy
passthrough, FR-004). The filter is presentation-only: filtering defaults to
«all», so hiding it changes no stored value and no other surface. The search
field stays for both types.

**Remark 3 — planner day start at 08h00.** Single-definition change in
`src/utils/planner.ts`: `DAY_START_MIN = 8 * 60`, band count 28 → 24
(08:00–20:00, half-hour bands, day end unchanged). The remark's point de
vigilance is answered by construction: the band grid is the **only** consumer of
the day range — exports/rapports (print report, heatmap, per-class/per-location
grouping) never reference 06:00; stored activities keep their exact
`timeStart`/`timeEnd` (chips before 08:00 clamp to the first band, per the
existing clamp rule, so no data is dropped or rewritten — FR-010). Tests
re-pinned: 24 bands, 08:00 first band, 19:30 last, `bandIndexFor('10:00') = 4`,
clamping below 08:00 → band 0. The form default `timeStart: '09:00'` already
sits inside the new range.

**Remarks 4+5 — icon before the title, outside the green badge.** Both banners
follow the same adjustment: the module icon (Puzzle / Brain, already imported in
each file's neighborhood) renders inside the `text-2xl` title row (flex + gap,
matching the existing icon-before-title pattern used by `StudentTimeSheetModule`
and `StudentAttendanceModule`), visually **before** the title text in the RTL
layout and outside the green badge span. The badge itself keeps its text label.
No test currently asserts either banner's icon; the new component tests pin the
expected order so it cannot silently regress.

**Remark 7 — type-aware plan derivation (the core fix).** Plan derivation must
compare the selection against the modules **applicable to the center type**, not
the global catalog. One canonical helper, extending the existing files:

```text
src/utils/pricing.ts
+  applicableModuleKeys(centerType?: string | null): string[]
+  derivePlanFromModules(selected, centerType?)          # centerType optional
+  PLAN_PRESET_MODULES filtered through isModuleCompatible when a type is given
   (modulesForPlan(plan, centerType?))
```

Semantics (research R11):
- `applicableModuleKeys(type)`: `ALL_MODULES` keys filtered through
  `isModuleCompatible` — for crèche/jardin this excludes the four study
  addons; unknown/empty type returns the full catalog (legacy passthrough).
- `derivePlanFromModules(selected, centerType?)`: Pro when **every applicable
  key** is selected; Growth when any non-base key is selected; Basic for base
  only. No type given → today's global behavior (all existing callers and tests
  unchanged).
- `RenewalModule` passes its `centerType` prop through: a crèche center ticking
  every offered addon now derives **Pro** (remark 7's exact scenario).
- `chooseTier` presets already filter through compatibility (revision B);
  `modulesForPlan(plan, centerType)` formalizes that filter as a helper so the
  Pro preset *is* the applicable set for the type, and ticking it satisfies the
  Pro predicate.
- The landing simulator keeps the global derivation: its demo form allows any
  type×module combination by design (revision B remark 6: informative, not
  blocking), so there is no single applicable set to compare against. The
  coherence test asserts the no-type behavior is byte-identical to today.

Data-safety: derivation is a pure computation over the selection; it never
mutates `enabledModules` (FR-010 carries over).

**Tests** (own files, per-feature adjacency; composed re-check in 006's suites):
1. `src/utils/planner.test.ts` — re-pin TIME_BANDS (24 bands, 08:00–20:00),
   bandIndexFor edges incl. sub-08:00 clamping; snap/grouping truth tables
   updated for the shifted indices.
2. `src/components/ActivitiesModule.test.tsx` + `src/components/CompetencesModule.test.tsx`
   — banner assertions: icon precedes the title text in DOM order and sits
   outside the green badge; week grid renders no 06:00/06:30/07:00/07:30 rows
   and starts at 08:00 (remark 3 rendered assertion).
3. `src/components/StudentAttendanceModule.test.tsx` (new) + `StudentTimeSheetModule.test.tsx`
   extension — crèche/jardin renders without the « كل المستويات » filter
   (search still present); formation/undefined type renders it (US2 regression);
   filtering behavior with the filter absent is the unfiltered list.
4. `src/utils/pricing.test.ts` + `src/utils/centerType.test.ts` —
   `applicableModuleKeys` per type (crèche = 9 keys: 3 base + 6 core addons;
   formation = all 13; unknown = all 13); `derivePlanFromModules` type-aware
   truth table: crèche selecting all applicable → **pro** (remark 7 regression
   test), crèche base+one addon → growth, base only → starter; no-type calls
   unchanged.
5. `src/components/RenewalModule.test.tsx` — crèche center: tick every offered
   addon → tier shows Pro and the submitted `requestedPlan` is `pro` (remark 7,
   end-to-end through the simulator); formation center: unchanged Pro behavior;
   the Pro preset button for a crèche loads exactly the applicable set.
6. `src/program.composed.test.tsx` — extend the C1 crèche renewal render:
   selecting all offered addons derives Pro (composed remark-7 assertion);
   attendance register renders without the grade filter under C1.

**Constitution Check (revision C)**: re-verified — no new routes (IV), no new
endpoints/security surface (III), tenant context untouched (II), no migrations
created here (I), every delta lands with its test (V). No violations.

**Out of scope**: pricing/value changes, new modules, backend changes, any
change to the four study modules' visibility, removing or hiding already-paid
modules. Remarks 2 and 6 need no code: their verifying suites (001/004/005
handler + component suites, composed C8/C9, coherence C10) already run in the
gate.

---

## Revision D — Meals & Goûter remarks alignment (`remarques-module-repas-gouter.md`)

**Date**: 2026-09-25 | **Input**: the client's remarks file on the Restoration
module (Repas & Goûter), organised in three groups: **Module Repas (Cantine)** —
4 remarks — plus **Paramètres** (1 remark) and **Module Finance ▸ Gestion des
repas** (2 remarks). The client's 4 headline issues therefore map onto 7
discrete asks; this revision plans all 7.

An implementation audit against the file found **four gaps** (M1, M2, M3, S1),
**one structural gap shared by two screens** (F2), **one mode-conditional
rendering adjustment** (F1) and **one removal** (M4). Every row needs a code
change, but none requires a schema migration, a new route, or a backend change.

### Audit result per remark

| # | Remark | Current state (verified in code) | Verdict |
|---|--------|----------------------------------|---------|
| M1 | «برنامج وجبة اليوم»: add «السبت» as a selectable day | `WEEKDAYS` (`src/components/MealsModule.tsx` L40) and the `MealPlanDay['day']` union (`src/types.ts` L915) both stop at `'Vendredi'`; `ARABIC_WEEKDAYS` lacks السبت; `DAY_BY_INDEX` maps `getDay()` 1–5 only, so a Saturday visit falls back to Lundi; `src/api.ts` stores meal plans verbatim under the day name | **GAP** — add `'Samedi'` to the union, the list, the label map and the index map (Sunday keeps the existing Lundi fallback) |
| M2 | «المشتركون لشهر … — مسددون + غير مسددين» mixes lunch-only and Goûter-only subscribers | The consumption table is fed by `subscribedStudents` (L142: `enrolledServices.meals === true && mealSubscription.active !== false`), which ignores `enrolledServices.gouter*`; Goûter-only subscribers appear as generic rows with no Goûter columns | **GAP** — new dedicated Goûter consumption table beside the lunch one; the existing table becomes lunch-only |
| M3 | «إضافة تلميذ بالوحدة…»: show the 3 services disabled first, enable per subscription after selecting the student | The unit-meal modal (L2566) lists candidates with one add button wired to `handleAddOneTimeMealStudent` → a single `service: 'lunch'` unit attendance; no per-service choice exists | **GAP** — two-step modal: 3 service toggles (Déjeuner / Goûter matin / Goûter après-midi) rendered disabled until a student is selected, enabled only for services his subscription covers |
| M4 | Remove the delete action from the Goûter subscribers table | The Goûter table's إجراءات column (L1376) renders the «إلغاء الاشتراك في اللمجة» button (`handleUnenrollGouter`) next to the edit-type button — that button IS the delete affordance | **ADJUST (removal)** — remove it from that table; the edit-type modal remains the unenrollment path; daily-pointage remove button untouched |
| S1 | Goûter pricing must accept decimals (ex: 2,5 dt) | The five Goûter fee inputs (fraisGouterMatinMensuel/Unitaire, fraisGouterSoirMensuel/Unitaire, fraisDeuxGoutersMensuel — `SettingsModule` L538–612) are `type="number"` with integer-leaning onChange parsing and no `step`; storage is JSON numbers, already decimal-safe | **GAP** — decimal-safe input handling for those five fields (decimal-tolerant parse, `step="0.5"`); no rounding anywhere |
| F1 | In «مطبخ داخلي» mode hide حصة الـ Traiteur / ربح السنتر للوجبة / حصة السنتر in Finance ▸ Gestion des repas | The pricing-info strip (`FinanceModule` L2453) always renders حصة الـ Traiteur and ربح السنتر للوجبة; the consumption table headers (L2528) always render حصة السنتر / حصة الـ Traiteur; `isInHouseKitchen` (L404) already exists and zeroes the cost in calculations, but the UI blocks render unconditionally | **ADJUST** — gate the three indicator surfaces on `!isInHouseKitchen`; in-house mode shows an explicit «مطبخ داخلي» hint instead; totals unchanged |
| F2 | «تفاصيل استهلاك التلاميذ»: add a separate Goûter consumption component | The Finance Gestion-des-repas tab renders one detail table (`restoStudents`, L2231) aggregating lunch + goûter attendances; only the summary badges separate the counts | **GAP** — split the detail into the existing lunch table plus a new Goûter detail table with Goûter-specific columns |

### Technical approach (deltas)

**M1 — Saturday in the weekly meal program.** Four single-definition edits:
(a) extend the `MealPlanDay['day']` union in `src/types.ts` with `'Samedi'`;
(b) append `'Samedi'` to `WEEKDAYS`; (c) add `'السبت'` to `ARABIC_WEEKDAYS`;
(d) map `6: 'Samedi'` in `DAY_BY_INDEX` so a Saturday visit opens the Saturday
plan (the existing Lundi fallback covers Sunday). No backend change: meal plans
persist under the day name verbatim, so existing plans load unchanged and a new
Saturday plan is stored like any other. New union member is additive and
back-compatible.

**M2 + F2 — one reusable Goûter consumption table, two hosts.** New component
`GouterConsumptionTable` (own file, `src/components/GouterConsumptionTable.tsx`)
used in both screens. In `MealsModule` it renders beside the existing
consumption table, fed from `gouterStudents` with the same month-selector
semantics; the existing table keeps its title and filters but is fed an
**explicit lunch predicate** (`mealSubscription.active === true`) instead of
the `meals` flag — the audit traced the mixing to legacy data (the goûter
track never sets `meals`; registration's lockedMeals path can leave stale
`meals: true` on goûter-only students) — so Goûter-only students no longer
appear in it under either data shape. In `FinanceModule`'s Gestion-des-repas tab the same
component renders under the existing lunch detail table, fed from the filtered
students' goûter attendances. Columns: student, service type
(matin/soir/both), payment status per academic month (reusing
`getGouterStatus` semantics), consumed count per service (from
`mealAttendances` filtered on `gouter_matin` / `gouter_apres_midi`), and unpaid
unit actions reusing the daily grid's pay-unit pattern. Everything derives from
existing `enrolledServices`, `mealAttendances`, `payments` — no stored-shape
change (FR-010).

**M3 — unit-meal modal: services first, gated by subscription.** The add-unit
modal becomes two-step: the three service toggles render **disabled** from the
start (remark's exact wording: «à l'état désactivé»); selecting a candidate
enables exactly the toggles his `enrolledServices` cover (lunch subscription →
Déjeuner; `gouterMatin` → Goûter matin; `gouterSoir`/`gouterBoth` → Goûter
après-midi); confirm requires at least one enabled+selected service. True
non-subscribed (or refunded-month) students enable all three at unit price.
Submission generalises `handleAddOneTimeMealStudent` to write **one unit
attendance per ticked service**, reusing the traiteur-price snapshotting and
the existing `service` discriminator — no schema change.

**M4 — remove the Goûter table's delete action.** Delete the unenroll button
from the Goûter subscribers table's إجراءات column; the edit-type button stays
and its modal remains the unenrollment path. The daily pointage grid's
remove-attendance button and the lunch table's actions are untouched — the
remark scopes the removal to the Goûter subscribers table only.

**S1 — decimal Goûter pricing.** Give the five Goûter fee fields a shared
decimal-money parse helper (comma-tolerant: «2,5» → 2.5; keeps the existing
leading-zero cleanup) and `step="0.5"`; `updateFee` stores the parsed number
unchanged. `getGouterStatus`, unit-payment buttons and all consumers already
handle non-integers (JSON numbers) — no rounding introduced anywhere, FR-006
immutability holds. Other fee fields keep today's behavior.

**F1 — traiteur indicators only in external-traiteur mode.** In
`FinanceModule`, gate three surfaces on `!isInHouseKitchen`: the pricing
strip's «حصة الـ Traiteur» and «ربح السنتر للوجبة» cells, and the consumption
table's «حصة السنتر» / «حصة الـ Traiteur» column header + cells (other columns
stay in-house). In in-house mode a small «مطبخ داخلي — بدون وسيط» hint replaces
the strip (mirroring SettingsModule's existing «نظام المطبخ الداخلي مفعّل»
note). Calculations already branch on `isInHouseKitchen`; this delta is
presentational and changes no totals.

**Tests** (adjacent per-feature files; composed re-checks in 006 suites):
1. `src/meals.test.ts` extension — pure-logic pins: day-union/`DAY_BY_INDEX`
   Saturday coverage via the module's exported constants, decimal parsing
   truth table («2,5» → 2.5, «0,75» → 0.75, «2» → 2), the modal's
   service-eligibility helper (subscription gates the toggles), and
   GouterConsumptionTable derivation (status per month from attendances +
   payments).
2. `src/components/MealsModule.test.tsx` (new) — Saturday tab renders and is
   selectable; unit modal: toggles disabled before selection, enabled per
   subscription after, multi-service submit writes one attendance per service;
   Goûter table appears beside the lunch table and lunch rows exclude
   Goûter-only students; Goûter subscribers table no longer renders the
   unenroll button (edit stays).
3. `src/components/SettingsModule.test.tsx` (new) — the five Goûter fee inputs
   accept «2,5» and hold 2.5 in form state; other fee fields unchanged.
4. `src/components/FinanceModule.test.tsx` (new) — external-traiteur mode:
   traiteur strip + center/traiteur columns render; in-house mode: hidden,
   hint shown, totals identical between modes for the same data; Goûter detail
   table renders under the lunch one and counts only gouter_* attendances.
5. `src/program.composed.test.tsx` — C1 crèche walkthrough adds: Saturday tab
   present; unit modal gates by subscription; no unenroll button in the Goûter
   table (composed remark assertions).

**Constitution Check (revision D)**: re-verified — no new routes (IV), no new
endpoints and no security surface change (III), tenant context untouched (II),
no migrations (I: everything stays in the existing settings/students JSON
surfaces), every delta lands with its test (V). No violations.

**Out of scope**: pricing/value changes, new modules or routes, backend/API
changes, attendance-schema changes (the `service` discriminator already
exists), changes to the lunch table's own behaviors beyond its feed list, and
any change to module visibility (revision B/C territory stays frozen).

