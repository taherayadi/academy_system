# Tasks — New Center Types, Pricing, Module Eligibility & Rebranding

**Plan:** [plan.md](./plan.md) · **Branch:** `academy_system/saas_admin`
**Conventions:** each phase ends green (`npm run lint` + `npm test`); mark checkboxes `[x]` when done.
**Parallelizable:** `[P]` markers — can run concurrently within their phase.

---

## Phase 1 — Foundations (blocks everything)

- [x] **1.1** `src/components/dashboard/constants.ts` — introduce `export type CenterType = 'creche' | 'jardin' | 'garderie' | 'formation'` and `CenterTypeFilter`. Extend `CENTER_TYPES` to the 4 entries with Arabic labels/hints; derive `CENTER_TYPE_LABEL` and a new `CENTER_TYPE_BADGE: Record<CenterType, StatusTone>` from it. Rework `normalizeCenterType(raw?): CenterType | ''` to be accent-insensitive and to recognize `crèche`/`creche` and `garderie` variants. Remove the inlined `'jardin' | 'formation'` unions from consumers as they are migrated (Phase 3). Export the new symbols.
- [x] **1.2** `src/types.ts` — extend `ModuleKey` with `'activites' | 'competences'`; retype `CenterTenant.centerType` and `DemoRequest.centerType` as `CenterType | ''` (import from constants or move the type here and re-export — pick the import direction that avoids a cycle).
- [x] **1.3** **[P]** New `functions/api/_modules.ts` — single server-side source of truth: `CENTER_TYPES` whitelist, `normalizeCenterType()` (accent-insensitive, mirrors client), `REQUIRED_MODULE_KEYS`, `ALL_MODULE_KEYS` (+`activites`, `competences`), `UNBILLED_MODULE_KEYS`, `MODULE_CENTER_TYPES` eligibility map, `isModuleAllowedForCenterType()`, and `normalizeEnabledModules(value, plan, centerType)` with the plan+type preset rules (Pro ⇒ eligible set for the type, starter/basic ⇒ base only). JSDoc: must stay in sync with client `constants.ts`.
- [x] **1.4** **[P]** New `src/brand.ts` — `BRAND_NAME = 'EduSphère'`, `BRAND_FOOTER = 'EduSphère SaaS © 2026'` (UTF-8, accented è).
- [x] **1.5** Server consumers switch to `_modules.ts`: `functions/api/centers.ts` and `functions/api/center-plans.ts` delete their local `ALL_MODULE_KEYS`/`UNBILLED_MODULE_KEYS`/`normalizeEnabledModules` copies and import from `_modules.ts`; behavior unchanged at this step (pure extraction). `functions/api/demo-requests.ts` imports `normalizeCenterType` instead of its inline copy.

## Phase 2 — Server-side enforcement

- [x] **2.1** `functions/api/centers.ts` — POST: validate `body.centerType` against the whitelist (400 + Arabic message naming allowed types); normalize before insert. PATCH (both the direct-update branch and `scheduleChange` target assembly): when plan/module fields are present, run `normalizeEnabledModules(modules, plan, centerType)` **scoped to the center's (new) type** — an explicitly-requested ineligible module ⇒ 400 naming the module; when `center_type` changes, prune now-ineligible `enabled_modules` in the same transaction and write a `center_plan_history` row (action `center_type_change`) listing removed modules. Legacy safety: centers with `center_type === ''` keep permissive behavior (base + existing modules, no pruning).
- [x] **2.2** `functions/api/center-plans.ts` — `set-plan` (immediate and `mode: 'scheduled'`): same eligibility validation ⇒ 400 naming the module before any invoice/schedule writes.
- [x] **2.3** `functions/api/platform-billing.ts` — PUT prices: reject `bibliotheque` entries in `body.prices` (400), keeping historical rows readable/invoice history intact.
- [x] **2.4** `functions/api/_lib.ts` or `centers.ts` — POST create (incl. convert-from-request flow): derive `enabledModules` filtered by the requested type's eligibility; preselection from `requested_modules` is filtered, never rejected outright (a convert request with stale module list still succeeds).

## Phase 3 — UI surfaces

- [x] **3.1** **[P]** `NewCenterModal.tsx` — center-type buttons render from `CENTER_TYPES` (4 types); validation message updated to name all four; module chips + Pro/basic presets respect `isModuleAllowedForCenterType(form.centerType, …)`; effect re-filters `enabledModules` when the chosen type changes (convert flow included).
- [x] **3.2** **[P]** `EditCenterModal.tsx` — type `<select>` options from `CENTER_TYPES` (keep "غير معرّف" empty option); retypes; **on save, type-change diff** → if any currently-enabled module becomes ineligible under the new type, open `ConfirmDialog` listing exactly those modules («سيتم تعطيل…»); confirm ⇒ save, cancel ⇒ no write.
- [x] **3.3** **[P]** `PlanManagerModal.tsx` — module chips disabled (not hidden) when ineligible for the center's type, with short explanation «غير متاحة لنوع «{type}»»; `toggleDraftModule`/`handleDraftPlanChange` guard + scope Pro preset to the eligible set; tariff preview unchanged otherwise.
- [x] **3.4** **[P]** `CentersSection.tsx` + `RequestsSection.tsx` + `OverviewSection.tsx` — center-type Segmented filters derive options from `CENTER_TYPES` (`all` + 4); type badges use `CENTER_TYPE_BADGE` + `toneClasses()` instead of `=== 'jardin'` ternaries; `OverviewSection` label lookups handle the new types.
- [x] **3.5** `usePlatformDashboard.tsx` — retype filter state to `CenterTypeFilter`; `PAGE_META` titles; keep filter semantics (`normalizeCenterType` on rows).
- [x] **3.6** **[P]** `PricingSection.tsx` — filter `isModuleHidden` out of the price editor so Library disappears; the two new modules appear with inputs; base/bundled cards unchanged; totals (`calculateModuleTotal`) unaffected (Library stays unbilled).
- [x] **3.7** **[P]** Branding — `index.html` (title «إدارة المنصة — EduSphère SaaS», meta description), `src/App.tsx` (logo alt + sidebar footer via `BRAND_FOOTER`), `LoginScreen.tsx` (alt + footer), `PlatformAdminDashboard.tsx` + `usePlatformDashboard.tsx` (set `document.title = `${title} — EduSphère SaaS`` per page), `src/utils/invoicePrint.ts` (header «EduSphère — منصة إدارة المراكز» + `EduSphère SaaS © 2026` footer). Docs sweep: `README.md`, `CLAUDE.md`, `DESIGN.md`. **Do NOT touch** `wrangler.toml`, deploy scripts, `package.json` name (Cloudflare project identifiers stay `system-academy-admin`), or migration seeds.

## Phase 4 — Tests & verification

- [x] **4.1** **[P]** New `src/components/dashboard/constants.test.ts` — `normalizeCenterType`: 4 canonical values, accented `Crèche`/`crèche` variants, `garderie` variants, unknown → `''`; eligibility matrix `isModuleAllowedForCenterType` spot-checks (etude ❌ for creche/jardin ✅ for garderie/formation; cantine ✅ everywhere; bibliotheque excluded); type-scoped presets.
- [x] **4.2** **[P]** New `functions/api/_modules.test.ts` — `normalizeEnabledModules` scoping (pro preset per type, requested ineligible module pruning vs. 400 decision lives in routes — test the helper's contract), `bibliotheque` never billed, base always present.
- [x] **4.3** Update `functions/api/centers.test.ts`-style suites (center-plans / demo-requests) — 400 on ineligible module for create/patch/schedule/set-plan; center-type whitelist 400; type-change prune logs `center_type_change` history; legacy `''` type permissive.
- [x] **4.4** Update `functions/api/platform-billing.test.ts` — bibliotheque price rejected 400.
- [x] **4.5** Update `src/components/PlatformAdminDashboard.smoke.test.tsx` — filters/badges render 4 types; convert modal preselects only eligible modules; footer/title show EduSphère.
- [x] **4.6** Run `npm run lint` (tsc --noEmit) and `npm test` (both vitest configs) — all green.

---

## Acceptance criteria (from the remarks)

1. All 4 center types appear in: add-center selector, centers list badge + filter, trial-requests badge + filter, update-center selector (preselected), convert modal — from **one shared source of truth**.
2. Tarifs page: no Library price entry; `activites` + `competences` present; historical Library prices/invoices untouched.
3. Edit-plan offers only eligible modules (disabled-with-explanation for the rest); **server rejects** ineligible payloads; base modules never togglable; type narrowed ⇒ explicit confirmation listing deactivated modules.
4. "System Academy" → "EduSphère" in all user-facing surfaces incl. invoice print + tab titles + footer «EduSphère SaaS © 2026»; UTF-8 è intact; deploy identifiers intentionally unchanged.
