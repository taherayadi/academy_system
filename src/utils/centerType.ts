/**
 * Center-type predicates — single source of truth for type-aware UI gating.
 *
 * ⚠️ Tout est lu à l'EXÉCUTION depuis /api/catalog (tables `center_types` +
 * `center_type_modules`) via catalogStore ; le fichier généré
 * Aucune clé de type ni matrice codée en dur ici.
 *
 * Unknown/empty input returns TRUE (legacy visibility): centers created before
 * center types existed must keep seeing everything, so gating is always
 * removal-only and never changes behavior for legacy or unknown values.
 */

import { getCatalogSnapshot, type CatalogCenterType } from './catalogStore';

/** Clé de type de centre — string libre miroir de `center_types.key`. */
export type CenterType = string;

/** Types de centre, ordre de la table `center_types`. */
export function centerTypes(): readonly CatalogCenterType[] {
  return getCatalogSnapshot().centerTypes;
}

/**
 * Clés des types de centre « gatables » — ceux qui portent des lignes dans
 * `center_type_modules` (ordre de la table). Un type sans ligne (ex. « other »)
 * n'est jamais gated : hors liste, comme les types inconnus.
 */
export function centerTypeKeys(): CenterType[] {
  return centerTypes().map(t => t.key as CenterType).filter(isKnownType);
}

/**
 * Un type est « connu » (donc peut gated) s'il apparaît dans
 * `center_type_modules` — la table de compatibilité DÉFINIT le gating. Un type
 * sans ligne (ex. « other ») reste en passthrough hérité : visibilité
 * complète, jamais bloqué — même règle que pour les centres sans type.
 */
/** Exporté : les formulaires n'affichent que les types réellement « gatables ». */
export function isKnownType(type?: string | null): boolean {
  return !!type && getCatalogSnapshot().centerTypeModuleKeys.some(p => p.centerType === String(type));
}

/**
 * True when the center shows school-level artifacts (grade / établissement
 * fields, school-year labels, grade filters). Invariant métier porté par la
 * base : les types scolaires sont exactement ceux servis par les modules
 * d'étude (`center_type_modules` × etude) — garderie et formation aujourd'hui.
 * Unknown/empty → true.
 */
export function hasSchoolLevel(type?: string | null): boolean {
  if (!isKnownType(type)) return true;
  return isModuleCompatible('etude', type);
}

/**
 * True when the center shows the school study modules (Cours Particuliers,
 * Étude, Révision, Formations) — même invariant que hasSchoolLevel.
 * Unknown/empty → true.
 */
export function hasStudyModules(type?: string | null): boolean {
  if (!isKnownType(type)) return true;
  return isModuleCompatible('etude', type);
}

/**
 * Center types each module serves, keyed by module key — reconstruit à chaque
 * appel depuis les lignes de `center_type_modules`. Une clé sans ligne (ex.
 * bibliotheque, isHidden) est servie à aucun type connu.
 */
export function moduleCenterTypes(): Record<string, readonly CenterType[]> {
  const map: Record<string, CenterType[]> = {};
  for (const { centerType, moduleKey } of getCatalogSnapshot().centerTypeModuleKeys) {
    const list = map[moduleKey] || (map[moduleKey] = []);
    list.push(centerType as CenterType);
  }
  return map;
}

/**
 * True when the module may be offered to / used by a center of this type.
 * Unknown or empty type → true (legacy passthrough). A module key with no
 * `center_type_modules` row is served to no known type.
 */
export function isModuleCompatible(moduleKey: string, centerType?: string | null): boolean {
  if (!isKnownType(centerType)) return true;
  const served = getCatalogSnapshot().centerTypeModuleKeys
    .filter(p => p.moduleKey === String(moduleKey))
    .map(p => p.centerType);
  return served.includes(String(centerType));
}

/**
 * The keys of `keys` that are incompatible with the center type, preserving
 * selection order. Unknown/empty type → always empty (legacy passthrough).
 * Used by the renewal simulator filter and the demo-form live guidance.
 */
export function incompatibleModules(keys: readonly string[], centerType?: string | null): string[] {
  return keys.filter(key => !isModuleCompatible(key, centerType));
}

/** Libellé d'un type de centre (fr par défaut, ar possible) ; repli : la clé brute. */
export function centerTypeLabel(key: string, lang: 'fr' | 'ar' = 'fr'): string {
  const entry = centerTypes().find(t => t.key === key);
  if (!entry) return String(key);
  return lang === 'ar' ? (entry.labelAr || entry.label) : (entry.label || String(key));
}

/** Hint d'un type de centre (fr/ar) ; repli : ''. */
export function centerTypeHint(key: string, lang: 'fr' | 'ar' = 'fr'): string {
  const entry = centerTypes().find(t => t.key === key);
  if (!entry) return '';
  return lang === 'ar' ? (entry.hintAr || '') : (entry.hint || '');
}
