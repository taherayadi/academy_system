/**
 * Shared server-side source of truth for center types, module catalog and
 * per-center-type module eligibility.
 *
 * Both catalogs are fully DB-driven:
 *   • center_types table → CenterTypeCatalog (loadCenterTypeCatalog)
 *   • modules + center_type_modules tables → ModuleCatalog (loadModuleCatalog)
 */

// ─── Center types ───────────────────────────────────────────────────────────
// String alias — the DB is the source of truth for valid values.
// Adding a new type only requires a row in center_types; no code change needed.
export type CenterType = string;

/**
 * DB-backed validation: the key must exist in the center_types table (the
 * 'other' sentinel is not actionable). Falls back to the static list when
 * the DB is unreachable — never harder than the bootstrap behavior.
 */
export async function isValidCenterTypeInDb(db: D1Database, raw: unknown): Promise<boolean> {
  const key = String(raw || '').trim();
  if (!key) return false;
  const catalog = await loadCenterTypeCatalog(db);
  return catalog.keys.includes(key as CenterType);
}

// Sync guard: non-empty string only. For authoritative validation use
// isValidCenterTypeInDb() which checks against the center_types table.
export function isValidCenterType(raw: unknown): raw is CenterType {
  return typeof raw === 'string' && raw.trim().length > 0;
}

// ---------------------------------------------------------------------------
// DB-driven center-type catalog (center_types table). The union type above
// stays the compile-time contract; the runtime key list and labels come from
// the DB. The 'other' row is the "untyped" sentinel — never an actionable
// type (normalizeCenterType maps it to '').
// ---------------------------------------------------------------------------

export interface CenterTypeCatalog {
  /** Actionable center-type keys ('other' excluded). */
  keys: CenterType[];
  /** key → DB label (e.g. « Crèche »); empty when serving the fallback. */
  labels: Map<string, string>;
  /** key → Arabic label from the DB (dashboard UI); empty when serving the fallback. */
  labelsAr: Map<string, string>;
  /** key → UI hint (e.g. « الرضّع · ما قبل الروضة »); empty when serving the fallback. */
  hints: Map<string, string>;
}

let centerTypeCatalogCache: { catalog: CenterTypeCatalog; expiresAt: number } | null = null;
/** Center types only change through migrations/seeding (no console toggle),
 *  unlike the module flags — a short TTL is safe here. */
const CENTER_TYPE_TTL_MS = 60_000;

/** Clears the in-process center-type cache (tests / after seeding). */
export function resetCenterTypeCatalogCache(): void {
  centerTypeCatalogCache = null;
}

/**
 * Loads the center types from the DB with a short TTL cache. The 'other'
 * sentinel row is excluded from the actionable keys. Throws when the table
 * is missing or empty — ensure center_types is seeded before deploying.
 */
export async function loadCenterTypeCatalog(db: D1Database): Promise<CenterTypeCatalog> {
  if (centerTypeCatalogCache && centerTypeCatalogCache.expiresAt > Date.now()) return centerTypeCatalogCache.catalog;
  try {
    const { results } = await db.prepare('SELECT key, label, label_ar, hint FROM center_types').all<{ key: string; label: string; label_ar: string; hint: string }>();
    const rows = results || [];
    if (rows.length === 0) throw new Error('empty center_types table');
    const labels = new Map<string, string>();
    const labelsAr = new Map<string, string>();
    const hints = new Map<string, string>();
    const keys: CenterType[] = [];
    for (const row of rows) {
      const key = String(row.key);
      labels.set(key, String(row.label));
      labelsAr.set(key, String(row.label_ar || row.label));
      hints.set(key, String(row.hint || ''));
      if (key !== 'other') keys.push(key);
    }
    if (keys.length === 0) throw new Error('no actionable center types');
    const catalog: CenterTypeCatalog = { keys, labels, labelsAr, hints };
    centerTypeCatalogCache = { catalog, expiresAt: Date.now() + CENTER_TYPE_TTL_MS };
    return catalog;
  } catch (err) {
    throw new Error(`Center-type catalog unavailable — ensure the center_types table is seeded. Original: ${err}`);
  }
}

/**
 * Normalizes a center_type value to a canonical key. Known legacy DB variants
 * (accented labels, partial words) are mapped to their canonical key.
 * Any other non-empty value passes through as-is so new types added to the
 * center_types table work without a code change.
 * Returns '' for empty/null/'other'. Use isValidCenterTypeInDb() to check
 * whether the result is actually in the DB.
 */
export function normalizeCenterType(raw?: unknown): CenterType | '' {
  const v = String(raw || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!v || v === 'other') return '';
  if (v.includes('creche')) return 'creche';
  if (v.includes('garderie')) return 'garderie';
  if (v.includes('jardin')) return 'jardin';
  if (v.includes('formation') || v.includes('centre de formation')) return 'formation';
  return v;
}

// ---------------------------------------------------------------------------
// DB-driven catalog (modules + center_type_modules tables)
// ---------------------------------------------------------------------------

export interface ModuleCatalog {
  /** Every module key in the DB catalog (hidden ones included). */
  keys: string[];
  /** Modules flagged isBasic = 1 (always included in every centre). The
   *  platform admin edits this set from the Tarifs page. */
  basicKeys: Set<string>;
  /** Modules flagged isUnbilled = 1 (never priced — bundled/legacy). */
  unbilledKeys: Set<string>;
  /** Modules flagged isHidden = 1 (removed from the selectable catalog). */
  hiddenKeys: Set<string>;
  /** key → DB label. */
  labels: Map<string, string>;
  /** key → Arabic label from the DB (dashboard UI); empty when serving the fallback. */
  labelsAr: Map<string, string>;
  /** Center types allowed per module key (empty set ⇒ universal). */
  allowedTypes: Map<string, Set<CenterType>>;
}

// The catalog is read straight from the DB on every call. It used to sit
// behind a 60s in-process TTL, which broke the Tarifs page: toggling
// isBasic / isUnbilled / isHidden writes the row, but the very next
// GET /api/modules still answered with the PREVIOUS flags (in this isolate and
// in every other one), so the console looked unchanged for up to a minute
// after a successful toggle. Two tiny queries (modules ≈ 14 rows +
// center_type_modules) are far cheaper than that bug.

/** Kept for tests and seed scripts — the catalog is no longer cached. */
export function resetModuleCatalogCache(): void {
  /* no-op */
}

/**
 * Loads the module catalog from the DB (always fresh). Throws when the tables
 * are missing or empty so callers surface a seeding error instead of silently
 * serving a stale or empty catalog.
 */
export async function loadModuleCatalog(db: D1Database): Promise<ModuleCatalog> {
  try {
    const [modulesRes, eligibilityRes] = await Promise.all([
      db.prepare('SELECT key, label, label_ar, isBasic, isUnbilled, isHidden FROM modules').all<{ key: string; label: string; label_ar: string; isBasic: number; isUnbilled: number; isHidden: number }>(),
      db.prepare('SELECT center_type, module_key FROM center_type_modules').all<{ center_type: string; module_key: string }>(),
    ]);
    const moduleRows = modulesRes.results || [];
    const eligibilityRows = eligibilityRes.results || [];
    if (moduleRows.length === 0) throw new Error('empty modules table');

    const catalog: ModuleCatalog = {
      keys: moduleRows.map(m => String(m.key)),
      basicKeys: new Set(moduleRows.filter(m => m.isBasic === 1).map(m => String(m.key))),
      unbilledKeys: new Set(moduleRows.filter(m => m.isUnbilled === 1).map(m => String(m.key))),
      hiddenKeys: new Set(moduleRows.filter(m => m.isHidden === 1).map(m => String(m.key))),
      labels: new Map(moduleRows.map(m => [String(m.key), String(m.label || m.key)])),
      labelsAr: new Map(moduleRows.map(m => [String(m.key), String(m.label_ar || m.label || m.key)])),
      allowedTypes: buildAllowedTypes(eligibilityRows),
    };
    return catalog;
  } catch (err) {
    throw new Error(`Module catalog unavailable — ensure the modules and center_type_modules tables are seeded. Original: ${err}`);
  }
}

function buildAllowedTypes(rows: Array<{ center_type: string; module_key: string }>): Map<string, Set<CenterType>> {
  const allowedTypes = new Map<string, Set<CenterType>>();
  for (const row of rows) {
    const type = normalizeCenterType(row.center_type);
    if (!type) continue;
    const set = allowedTypes.get(String(row.module_key)) || new Set<CenterType>();
    set.add(type);
    allowedTypes.set(String(row.module_key), set);
  }
  return allowedTypes;
}

/** Is this module ever billed? (catalog-driven; the legacy static twin). */
export function isModuleUnbilledInCatalog(catalog: ModuleCatalog, key: string): boolean {
  return catalog.unbilledKeys.has(key);
}

/** Was this module removed from the selectable catalog? */
export function isModuleHiddenInCatalog(catalog: ModuleCatalog, key: string): boolean {
  return catalog.hiddenKeys.has(key);
}

/** Base-module check against a loaded catalog (isBasic = 1 in the DB). */
export function isBaseModuleInCatalog(catalog: ModuleCatalog, key: string): boolean {
  return catalog.basicKeys.has(key);
}

/** Eligibility check against a loaded catalog. Base modules always pass. */
export function isModuleAllowedInCatalog(catalog: ModuleCatalog, key: string, centerType: CenterType | ''): boolean {
  if (isBaseModuleInCatalog(catalog, key)) return true;
  if (key === 'bibliotheque') return false; // removed from catalog
  if (!centerType) return true; // legacy/untyped centers stay permissive
  const allowed = catalog.allowedTypes.get(key);
  return !allowed || allowed.size === 0 || allowed.has(centerType);
}

const ANNUAL_DISCOUNT = 0.2;
export const AUTO_PRICED_PLANS = new Set(['starter', 'growth', 'pro']);

function presetModulesInCatalog(catalog: ModuleCatalog, plan: string, centerType: CenterType | ''): string[] | null {
  if (plan === 'pro') {
    return catalog.keys.filter(k => !isBaseModuleInCatalog(catalog, k) && isModuleAllowedInCatalog(catalog, k, centerType));
  }
  // Trial is a STATUS, not a module preset: the new-center form lets the admin
  // pick modules freely while the row is stored as plan='starter'. Returning
  // the starter preset here would silently discard that selection.
  if (plan === 'trial') return null;
  if (plan === 'starter' || plan === 'basic') return [];
  return null; // growth / custom → caller-provided list
}

/**
 * Enforce plan presets + base invariants + center-type eligibility on an
 * incoming module list, from the DB catalog. Legacy centers (no type) keep
 * the permissive behavior.
 */
export function normalizeEnabledModulesInCatalog(
  catalog: ModuleCatalog,
  value: unknown,
  plan?: string,
  centerType?: CenterType | ''
): string[] {
  const requested = Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : [];
  const preset = plan ? presetModulesInCatalog(catalog, plan, centerType || '') : null;
  const baseKeys = [...catalog.basicKeys];
  const modules = preset !== null
    ? preset
    : requested.filter(k => isModuleAllowedInCatalog(catalog, k, centerType || ''));
  return Array.from(new Set([...baseKeys, ...modules]));
}

/**
 * Modules in `requested` that the center's type does not allow (DB catalog).
 * Non-empty ⇒ the caller must reject the payload (400) instead of silently
 * pruning — the plan requires explicit server-side validation.
 */
export function ineligibleModulesInCatalog(
  catalog: ModuleCatalog,
  requested: unknown,
  centerType: CenterType | ''
): string[] {
  if (!centerType) return [];
  const list = Array.isArray(requested) ? requested.map(String) : [];
  return Array.from(new Set(list.filter(k => k && !isBaseModuleInCatalog(catalog, k) && !isModuleAllowedInCatalog(catalog, k, centerType))));
}

/**
 * Replaces the `center_type_modules` rows of ONE module with the given set.
 *
 *   • empty set  → no rows at all, which the reader treats as « allowed
 *     everywhere » (isModuleAllowedInCatalog: `!allowed || allowed.size === 0`),
 *   • otherwise  → exactly one row per allowed center type.
 *
 * Callers answer with a fresh `loadModuleCatalog()` so the console repaints
 * from the very rows that were just written (no TTL in between).
 */
export async function writeModuleEligibility(db: D1Database, moduleKey: string, allowed: CenterType[]): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM center_type_modules WHERE module_key = ?').bind(moduleKey),
  ];
  for (const type of allowed) {
    stmts.push(
      db.prepare('INSERT INTO center_type_modules (center_type, module_key) VALUES (?, ?)')
        .bind(type, moduleKey)
    );
  }
  await db.batch(stmts);
}

export { ANNUAL_DISCOUNT };
