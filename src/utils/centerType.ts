/**
 * Center-type predicates — single source of truth for type-aware UI gating.
 *
 * Four accepted center types: 'jardin' | 'creche' | 'garderie' | 'formation'.
 * Unknown/empty input returns TRUE (legacy visibility): centers created before
 * center types existed must keep seeing everything, so gating is always
 * removal-only and never changes behavior for legacy or unknown values.
 */

export type CenterType = 'jardin' | 'creche' | 'garderie' | 'formation';

/** The four accepted center types, in landing-form display order. */
export const CENTER_TYPES: readonly CenterType[] = ['jardin', 'creche', 'garderie', 'formation'];

const SCHOOL_LEVEL_TYPES = new Set<string>(['garderie', 'formation']);

const STUDY_MODULE_TYPES = new Set<string>(['garderie', 'formation']);

const KNOWN_TYPES = new Set<string>(['jardin', 'creche', 'garderie', 'formation']);

/**
 * Legacy/unknown passthrough: only the four known types ever gate anything.
 * Any other value (pre-types centers, typos, server-side values added later)
 * keeps full legacy visibility.
 */
function isKnownType(type?: string | null): boolean {
  return !!type && KNOWN_TYPES.has(String(type));
}

/**
 * True when the center shows school-level artifacts (grade / établissement
 * fields, school-year labels, grade filters). 'garderie' and 'formation' are
 * school-bearing; 'creche' and 'jardin' are not. Unknown/empty → true.
 */
export function hasSchoolLevel(type?: string | null): boolean {
  if (!isKnownType(type)) return true;
  return SCHOOL_LEVEL_TYPES.has(String(type));
}

/**
 * True when the center shows the four school study modules (Cours
 * Particuliers, Étude, Révision, Formations). Unknown/empty → true.
 */
export function hasStudyModules(type?: string | null): boolean {
  if (!isKnownType(type)) return true;
  return STUDY_MODULE_TYPES.has(String(type));
}

// ─── Module × center-type compatibility (remarks alignment, revision B) ────
//
// Which center types each catalog module serves. Transcribed from the client
// remarks matrix (center-type-module-rules.md): study modules (and the other
// school-bearing addons) are garderie/formation only; the core addons serve
// all four types. This map is THE single definition — renewal, the landing
// badges and the demo form all derive from it, and the coherence test asserts
// every catalog key has an entry, so the matrix can never drift from the
// catalog.

/**
 * Center types each module serves, keyed by catalog module key. Every
 * `ALL_MODULES` key MUST appear here (asserted by the coherence test).
 * Unknown keys are treated as garderie/formation-only by isModuleCompatible.
 */
export const moduleCenterTypes: Record<string, readonly CenterType[]> = {
  // Base (all-types by construction; listed for the coverage invariant).
  scolaire: ['jardin', 'creche', 'garderie', 'formation'],
  studentTimeSheets: ['jardin', 'creche', 'garderie', 'formation'],
  finance: ['jardin', 'creche', 'garderie', 'formation'],
  // School-bearing addons — garderie/formation only (remarks matrix).
  etude: ['garderie', 'formation'],
  coursParticuliers: ['garderie', 'formation'],
  revision: ['garderie', 'formation'],
  formations: ['garderie', 'formation'],
  // Core addons — every center type.
  cantine: ['jardin', 'creche', 'garderie', 'formation'],
  transport: ['jardin', 'creche', 'garderie', 'formation'],
  events: ['jardin', 'creche', 'garderie', 'formation'],
  staff: ['jardin', 'creche', 'garderie', 'formation'],
  activites: ['jardin', 'creche', 'garderie', 'formation'],
  competences: ['jardin', 'creche', 'garderie', 'formation'],
};

/**
 * True when the module may be offered to / used by a center of this type.
 * Unknown or empty type → true (legacy passthrough, same rule as above).
 * A key missing from `moduleCenterTypes` is served to no known type.
 */
export function isModuleCompatible(moduleKey: string, centerType?: string | null): boolean {
  if (!isKnownType(centerType)) return true;
  const served = moduleCenterTypes[String(moduleKey)];
  return !!served && served.includes(String(centerType) as CenterType);
}

/**
 * The keys of `keys` that are incompatible with the center type, preserving
 * selection order. Unknown/empty type → always empty (legacy passthrough).
 * Used by the renewal simulator filter and the demo-form live guidance.
 */
export function incompatibleModules(keys: readonly string[], centerType?: string | null): string[] {
  return keys.filter(key => !isModuleCompatible(key, centerType));
}

/** Display labels for the four center types (badges, banners, remarks). */
export const CENTER_TYPE_LABELS: Record<CenterType, { fr: string; ar: string }> = {
  creche: { fr: 'Crèche', ar: 'الحضانة' },
  jardin: { fr: "Jardin d'enfants", ar: 'روض الأطفال' },
  garderie: { fr: 'Garderie', ar: 'الحضيرة المدرسية' },
  formation: { fr: 'Formation', ar: 'مركز تكوين' },
};
