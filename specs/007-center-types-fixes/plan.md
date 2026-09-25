# Technical Plan — New Center Types, Pricing, Module Eligibility & Rebranding

**Feature branch:** `academy_system/saas_admin` · **Spec:** remarks in `admin-saas-center-types-remarks.md`
**Goal:** adjust the technical approach of the original implementation to resolve the 4 issues raised in review.

---

## 0. Technical context

- **Stack:** React 19 + Vite + TS (admin SPA in `src/`), Cloudflare Pages Functions + D1 (`functions/api/`), Vitest (dom + node configs). No i18n framework — UI strings are hardcoded Arabic.
- **Current center types:** `jardin` | `formation` (normalized everywhere via `normalizeCenterType` in `src/components/dashboard/constants.ts`; duplicated in `functions/api/demo-requests.ts`). DB column `centers.center_type TEXT NOT NULL DEFAULT ''` (migration 0025) — **no migration needed** for new values.
- **Known duplication hot-spots the plan removes:** module lists exist in 4 places (`src/components/dashboard/constants.ts`, `src/utils/pricing.ts`, `functions/api/centers.ts`, `functions/api/center-plans.ts`); center-type normalization in 2 places.

**New types introduced:** `creche` and `garderie` (the two missing members of `creche · jardin · garderie · formation`).

---

## 1. Shared source of truth for center types (Remark 1)

**Problem:** type lists are hardcoded per screen (Segmented filters in `CentersSection`/`RequestsSection`, `<select>` in `EditCenterModal`, `CENTER_TYPES` only used by `NewCenterModal`), the union type `'jardin' | 'formation'` is inlined in 6+ files, and the badge color ternaries (`=== 'jardin' ? … : …`) silently degrade for any third type.

**Approach — one module, derived everything:**

In `src/components/dashboard/constants.ts`:

```ts
export type CenterType = 'creche' | 'jardin' | 'garderie' | 'formation';
export type CenterTypeFilter = 'all' | CenterType;

const CENTER_TYPES: { key: CenterType; label: string; hint: string }[] = [
  { key: 'creche',   label: 'حضانة',       hint: '…' },
  { key: 'jardin',   label: 'روضة أطفال',  hint: 'ما قبل المدرسي · الروضات' },
  { key: 'garderie', label: 'دار الحضانة', hint: '…' },   // wording finalized in implementation
  { key: 'formation',label: 'مركز تدريب',  hint: 'دعم · دروس · دورات' },
];
const CENTER_TYPE_LABEL: Record<CenterType, string>;   // from CENTER_TYPES
const CENTER_TYPE_BADGE: Record<CenterType, StatusTone>; // replaces color ternaries
function normalizeCenterType(raw?: string): CenterType | ''
// accent-insensitive: 'Crèche', 'crèche', 'crèche enfant' → 'creche'; 'Garderie…' → 'garderie'
```

- `CenterTenant.centerType` / `DemoRequest.centerType` in `src/types.ts` become `CenterType | ''`.
- **All screens consume the constant** — Add center (`NewCenterModal` buttons already do), Edit center (replace the two hardcoded `<option>`s with a `CENTER_TYPES.map` + existing "غير معرّف" empty option), both Segmented filters (`options` derived: `{ key:'all' } ∪ CENTER_TYPES`), convert-to-center modal (it **is** `NewCenterModal` with `convertRequestId` — auto-covered; also filter its preselected `requestedModules` by eligibility, see §3).
- Replace the two badge-color ternaries in `CentersSection.tsx` and `RequestsSection.tsx` with `CENTER_TYPE_BADGE` + `toneClasses()`.
- `usePlatformDashboard.tsx`: `centerTypeFilter` state typed `CenterTypeFilter`.
- **Server:** add `VALID_CENTER_TYPES` + `normalizeCenterType()` to the new `functions/api/_modules.ts` (§3); `centers.ts` POST/PATCH validates `body.centerType` against it (currently any string is accepted); `demo-requests.ts` drops its inline copy and imports it.

---

## 2. Prices list (Remark 2)

**Problem:** the pricing editor renders `ALL_MODULES` verbatim, so Library (`bibliotheque`) still shows a price entry, while the two new modules don't exist anywhere.

**Approach:**

- **Remove Library from the catalog UI:** `PricingSection.tsx` filters out `isModuleHidden(m.key)` entries (Library stays hidden from all selection UIs as today).
- **Keep history intact — no destructive change:** `module_prices` rows (and invoice history) for `bibliotheque` are untouched; `UNBILLED_MODULE_KEYS` and the `calculateModuleTotal` zero-guard stay so a legacy Library price can never re-enter a total. Add a **server-side guard** in `platform-billing.ts` PUT: reject `bibliotheque` entries in `body.prices` with 400 so it can't reappear via API.
- **Add the two modules** (`activites` Activités & Planning, `competences` Compétences & Skills) in **one pass through every module list**:
  - `src/types.ts` `ModuleKey` union;
  - `src/components/dashboard/constants.ts` `ALL_MODULES` (Arabic labels);
  - `src/utils/pricing.ts` `ALL_MODULES` (landing pricing simulator; `pro` preset derives from it — auto);
  - the new shared `functions/api/_modules.ts` `ALL_MODULE_KEYS` (replaces the copies in `centers.ts` / `center-plans.ts` — both files then import from it);
  - prices default to the existing convention (blank until the operator sets a tarif; fallback 15 in tariff calculators is generic).
- No DB migration: prices are operator-entered per school year via the Tarifs page.

---

## 3. Module eligibility per center type — `moduleCenterTypes` (Remark 3)

**Problem:** eligibility doesn't exist as a concept; Pro preset = "all modules" regardless of type; nothing validates plan payloads server-side.

**Single constant map** (in `src/components/dashboard/constants.ts` for UI, mirrored in `functions/api/_modules.ts` for the API — the two files are the only owners; document that they must stay in sync, or later extract to a shared package):

| Module | creche | jardin | garderie | formation |
|---|---|---|---|---|
| `etude`, `coursParticuliers`, `revision`, `formations` | ❌ | ❌ | ✅ | ✅ |
| `cantine`, `transport`, `events`, `staff`, `activites`, `competences` | ✅ | ✅ | ✅ | ✅ |
| base: `scolaire`, `studentTimeSheets`, `finance` | ✅ always (never togglable) | | | |
| `bibliotheque` | — removed from catalog (§2) | | | |

```ts
const MODULE_CENTER_TYPES: Record<Exclude<ModuleKey, 'bibliotheque'>, readonly CenterType[]>;
export const isModuleAllowedForCenterType = (key: string, type: CenterType | '') => boolean;
```

**UI behavior (`PlanManagerModal.tsx` + `NewCenterModal.tsx` module chips):**
- Ineligible modules render **disabled with a short explanation** (tooltip/subtext: «غير متاحة لهذا النوع من المراكز» + type name) — not hidden. `toggleDraftModule`/`toggle` early-return for them.
- Type-scoped presets: `pro` ⇒ all **eligible** modules for the center's type (not `ALL_MODULE_KEYS`); `basic` ⇒ base only (unchanged). In `NewCenterModal`, an effect re-filters `enabledModules` whenever `centerType` changes in the form (convert flow preselects `requestedModules` → filtered by the chosen type).
- Base modules are never togglable (existing `isBaseModule` guard stays).

**Server-side enforcement (required by the remark):**
- Extract `REQUIRED_MODULE_KEYS`, `ALL_MODULE_KEYS`, `UNBILLED_MODULE_KEYS`, `normalizeEnabledModules`, eligibility map into **`functions/api/_modules.ts`**; `centers.ts` and `center-plans.ts` import from it (kills the current copy-paste drift).
- `normalizeEnabledModules(value, plan, centerType)` gains the center-type dimension: requested modules ∩ eligible(centerType) ∪ base; `pro` preset = eligible set.
- Enforce in **all four write paths**: centers POST (create), centers PATCH (direct plan update *and* `scheduleChange` targets), center-plans `set-plan` (immediate + `mode:'scheduled'`). Ineligible module in payload ⇒ **400** with an explicit Arabic message naming the module — not silent pruning.
- **Legacy safety:** a center with `centerType === ''` keeps today's permissive behavior (base + whatever it has) — no data loss for pre-migration rows.

**Type-change edge case (narrower module set):**
- `EditCenterModal` (the only place type is edited): on save, diff current center's `enabledModules` against eligibility of the **new** type. If any enabled module becomes ineligible → `ConfirmDialog` listing exactly those modules: «سيتم تعطيل الوحدات التالية عند تغيير النوع…». Confirm ⇒ save proceeds; cancel ⇒ no write.
- Server: when a PATCH changes `center_type`, the API prunes now-ineligible `enabled_modules` in the same transaction and writes a `center_plan_history` entry (`plan_set` note or a dedicated `center_type_change` action) so the audit trail explains the deactivation.

---

## 4. Rebranding: System Academy → EduSphère (Remark 4)

**Approach — single brand source + sweep of user-facing surfaces:**

- New `src/brand.ts`: `export const BRAND_NAME = 'EduSphère';` and `BRAND_FOOTER = 'EduSphère SaaS © 2026'`.
- Replace occurrences in: `index.html` (title «إدارة المنصة — System Academy SaaS» → «… — EduSphère SaaS», plus meta description), `src/App.tsx` (logo `alt`, sidebar footer — use `BRAND_FOOTER`), `src/components/LoginScreen.tsx` (alt + footer).
- **Invoice print document** (`src/utils/invoicePrint.ts`): the invoice header currently says only «منصة SaaS — إدارة المراكز» — put the brand on it: header line «EduSphère — منصة إدارة المراكز» and a `EduSphère SaaS © 2026` `<footer>` (matches the remark's PDF header/footer item).
- **Browser tab titles:** `PlatformAdminDashboard` sets `document.title = `${PAGE_META[page].title} — EduSphère SaaS`` via effect (PAGE_META already exists; nothing does this today).
- **Explicitly out of scope (documented decision):** deployment identifiers stay `system-academy-admin` (`wrangler.toml` name, `pages:deploy --project-name`, `package.json` name) — renaming breaks the Cloudflare Pages deploy target and offers no user-visible value. Same for historical migrations (0001/0020/0036 seed strings) and the `platform@systemacademy.tn` login — that's data, not brand surface. Docs (`README.md`, `CLAUDE.md`, `DESIGN.md`) get the rename.
- **No translation files / email templates exist in this repo** (Arabic strings are inline; email/notification templates live in the center-side application) — recorded so the remark isn't misread as missed work. All edited files are already UTF-8; `è` verified by grep after edit (`EduSphère`, not `EduSphere`).

---

## 5. Implementation order & touched files

1. **Foundations** — `src/types.ts`, `src/components/dashboard/constants.ts`, `functions/api/_modules.ts` (new), `src/brand.ts` (new).
2. **Server enforcement** — `functions/api/centers.ts`, `functions/api/center-plans.ts`, `functions/api/platform-billing.ts`, `functions/api/demo-requests.ts`.
3. **UI surfaces** — `NewCenterModal`, `EditCenterModal`, `PlanManagerModal`, `CentersSection`, `RequestsSection`, `OverviewSection`, `usePlatformDashboard`, `PricingSection`, `App.tsx`, `LoginScreen`, `invoicePrint.ts`, `index.html`.
4. **Tests & verification.**

## 6. Test plan (Vitest, existing two-config setup)

- **New** `src/components/dashboard/constants.test.ts`: `normalizeCenterType` (4 types + accented 'Crèche' variants), eligibility matrix (`isModuleAllowedForCenterType`), type-scoped presets.
- **New** `functions/api/_modules.test.ts`: eligibility pruning, Pro preset scoping, `bibliotheque` never billed.
- **Update** `functions/api/centers.test.ts`-style suites: 400 on ineligible module for create/patch/schedule; center-type whitelist; prune-on-type-change logs history.
- **Update** `platform-billing.test.ts`: bibliotheque price rejected.
- **Update** `PlatformAdminDashboard.smoke.test.tsx`: badges/filters render 4 types; convert modal preselects only eligible modules.
- Run `npm run lint` (tsc --noEmit) + `npm test`.

## 7. Risks / decisions to be aware of

- **No DB migration needed** — `center_type` is free TEXT; new values are pure data. Whitelisting happens at the API boundary.
- **Pro preset semantics change** ("all modules" → "all *eligible* modules for the type"): intended per the remarks; covered by tests.
- **Deploy identifiers keep the old name** — deliberate (see §4).
- Legacy `center_type: ''` centers are permissive, never pruned automatically.
