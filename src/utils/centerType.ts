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
