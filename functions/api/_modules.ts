/**
 * Shared server-side source of truth for center types, module catalog and
 * per-center-type module eligibility.
 *
 * ⚠ Must stay in sync with the client twin in
 * `src/components/dashboard/constants.ts` (same lists, same eligibility).
 * Extracted here so `centers.ts` / `center-plans.ts` stop carrying
 * copy-pasted module lists that drift apart.
 */

// ─── Center types ───────────────────────────────────────────────────────────
export type CenterType = 'creche' | 'jardin' | 'garderie' | 'formation';

export const CENTER_TYPE_KEYS: readonly CenterType[] = ['creche', 'jardin', 'garderie', 'formation'];

export function isValidCenterType(raw: unknown): raw is CenterType {
  return CENTER_TYPE_KEYS.includes(String(raw).trim() as CenterType);
}

/** Accepts DB variants (« Crèche », « crèche enfants », « Garderie… ») → canonical key, '' when unknown. */
export function normalizeCenterType(raw?: unknown): CenterType | '' {
  const v = String(raw || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!v) return '';
  if (v.includes('creche')) return 'creche';
  if (v.includes('garderie')) return 'garderie';
  if (v.includes('jardin')) return 'jardin';
  if (v.includes('formation') || v.includes('centre')) return 'formation';
  return '';
}

// ─── Modules ────────────────────────────────────────────────────────────────
export const BUNDLED_MODULE_KEY = 'studentTimeSheets';
export const REQUIRED_MODULE_KEYS = ['scolaire', 'finance', BUNDLED_MODULE_KEY];

// « Bibliothèque » is removed from the selectable catalog: never preset, never
// billed (kept in UNBILLED_MODULE_KEYS so legacy rows can never re-enter a
// total). Do NOT reintroduce it into ALL_MODULE_KEYS without a product call.
export const ALL_MODULE_KEYS = [
  'scolaire', 'finance', 'etude', 'coursParticuliers', 'revision',
  'formations', 'cantine', 'transport', 'events',
  BUNDLED_MODULE_KEY, 'staff', 'activites', 'competences',
];

export const UNBILLED_MODULE_KEYS = new Set([BUNDLED_MODULE_KEY, 'bibliotheque']);

// ─── Module eligibility per center type ─────────────────────────────────────
// étude/cours/révision/formations are school-support modules: not offered to
// crèches (no school children) nor jardins. Everything else is universal.
const UNIVERSAL_MODULES = ['cantine', 'transport', 'events', 'staff', 'activites', 'competences'];
const SCHOOL_SUPPORT_MODULES = ['etude', 'coursParticuliers', 'revision', 'formations'];

export const MODULE_CENTER_TYPES: Record<string, readonly CenterType[]> = {
  ...Object.fromEntries(UNIVERSAL_MODULES.map(k => [k, CENTER_TYPE_KEYS])),
  ...Object.fromEntries(SCHOOL_SUPPORT_MODULES.map(k => [k, ['garderie', 'formation'] as const])),
};

/** Base modules are always included and never togglable. */
export function isBaseModule(key: string): boolean {
  return REQUIRED_MODULE_KEYS.includes(key);
}

/** A module may only be attached to a center whose type is listed in the map. */
export function isModuleAllowedForCenterType(key: string, centerType: CenterType | ''): boolean {
  if (isBaseModule(key)) return true;
  if (key === 'bibliotheque') return false; // removed from catalog
  if (!centerType) return true; // legacy/untyped centers stay permissive
  const allowed = MODULE_CENTER_TYPES[key];
  return !allowed || allowed.includes(centerType);
}

const ANNUAL_DISCOUNT = 0.2;
export const AUTO_PRICED_PLANS = new Set(['starter', 'growth', 'pro']);

function presetModules(plan: string, centerType: CenterType | ''): string[] | null {
  if (plan === 'pro') {
    return ALL_MODULE_KEYS.filter(k => !isBaseModule(k) && isModuleAllowedForCenterType(k, centerType));
  }
  if (plan === 'starter' || plan === 'basic') return [];
  return null; // growth / custom → caller-provided list
}

/**
 * Enforce plan presets + base invariants + center-type eligibility on an
 * incoming module list. Legacy centers (no type) keep the permissive behavior.
 */
export function normalizeEnabledModules(
  value: unknown,
  plan?: string,
  centerType?: CenterType | ''
): string[] {
  const requested = Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : [];
  const preset = plan ? presetModules(plan, centerType || '') : null;
  const modules = preset !== null
    ? preset
    : requested.filter(k => isModuleAllowedForCenterType(k, centerType || ''));
  return Array.from(new Set([...REQUIRED_MODULE_KEYS, ...modules]));
}

/**
 * Modules in `requested` that the center's type does not allow. Non-empty ⇒
 * the caller must reject the payload (400) instead of silently pruning —
 * the plan requires explicit server-side validation, not silent filtering.
 */
export function ineligibleModules(requested: unknown, centerType: CenterType | ''): string[] {
  if (!centerType) return [];
  const list = Array.isArray(requested) ? requested.map(String) : [];
  return Array.from(new Set(list.filter(k => k && !isBaseModule(k) && !isModuleAllowedForCenterType(k, centerType))));
}

export { ANNUAL_DISCOUNT };
