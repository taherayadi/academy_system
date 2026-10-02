/**
 * Center-type predicates — type-aware UI gating, derived from the D1 catalog
 * (`center_types` + `center_type_modules` tables, served by /api/public-pricing
 * through src/utils/catalog.ts).
 *
 * Unknown/empty input returns TRUE (legacy visibility): centers created before
 * center types existed must keep seeing everything, so gating is always
 * removal-only and never changes behavior for legacy or unknown values.
 */

import { getCatalog, servedTypes } from './catalog';

/** Center type keys live in the `center_types` table. */
export type CenterType = string;

/**
 * Center types each module serves — read live from the catalog
 * (center_type_modules). Kept as an exported name for existing consumers;
 * every access derives from the current catalog.
 */
export const moduleCenterTypes: Readonly<Record<string, readonly string[]>> = new Proxy(
  {},
  {
    get: (_t, prop: string | symbol) => servedTypes(String(prop)),
    has: (_t, prop: string | symbol) => !!servedTypes(String(prop)).length,
    ownKeys: () => Reflect.ownKeys(getCatalog().moduleCenterTypes),
  }
);

/** True when `type` is a center type key declared in the DB. */
export function isKnownType(type?: string | null): boolean {
  return !!type && getCatalog().centerTypes.some(t => t.key === String(type));
}

/**
 * True when the center shows school-level artifacts (grade / établissement
 * fields, school-year labels, grade filters). A type is school-bearing when
 * the compatibility matrix serves it more than the base modules alone — i.e.
 * at least one add-on module (non-isBasic) is compatible with it. This
 * derives entirely from center_type_modules; no key is hardcoded here.
 * Unknown/empty → true.
 */
export function hasSchoolLevel(type?: string | null): boolean {
  if (!isKnownType(type)) return true;
  const key = String(type);
  return servedTypesFor(key) > baseServedCountFor(key);
}

/**
 * True when the center shows the study modules (Étude, Cours Particuliers,
 * Révision, Formations). Same derivation: the type must serve at least one
 * offered add-on module beyond the base. Unknown/empty → true.
 */
export function hasStudyModules(type?: string | null): boolean {
  if (!isKnownType(type)) return true;
  const key = String(type);
  return getCatalog().modules.some(
    m => !m.isHidden && !m.isBasic && servedTypes(m.key).includes(key)
  );
}

/** Base modules (isBasic = 1) served to this type, per center_type_modules. */
function baseServedCountFor(typeKey: string): number {
  return getCatalog().modules.filter(m => m.isBasic && servedTypes(m.key).includes(typeKey)).length;
}

/** All modules served to this type, per center_type_modules. */
function servedTypesFor(typeKey: string): number {
  return getCatalog().modules.filter(m => servedTypes(m.key).includes(typeKey)).length;
}

/**
 * True when the module may be offered to / used by a center of this type.
 * Unknown or empty type → true (legacy passthrough, same rule as above).
 * A module with no compatibility row is served to no known type.
 */
export function isModuleCompatible(moduleKey: string, centerType?: string | null): boolean {
  if (!isKnownType(centerType)) return true;
  return servedTypes(String(moduleKey)).includes(String(centerType));
}

/**
 * The keys of `keys` that are incompatible with the center type, preserving
 * selection order. Unknown/empty type → always empty (legacy passthrough).
 * Used by the renewal simulator filter and the demo-form live guidance.
 */
export function incompatibleModules(keys: readonly string[], centerType?: string | null): string[] {
  return keys.filter(key => !isModuleCompatible(key, centerType));
}

/** Display labels for the center types (badges, banners, remarks). */
export function centerTypeLabels(): Record<string, { fr: string; ar: string }> {
  return Object.fromEntries(
    getCatalog().centerTypes.map(t => [t.key, { fr: t.label, ar: t.labelAr || t.label }])
  );
}
