/**
 * Positions d'affichage des annonces (migrations 0031 → 0032).
 *
 * La migration 0032 remplace les formats IAB figés (leaderboard 728×90,
 * medium rectangle 300×250, bandeau mobile 320×50, gratte-ciel 160×600) par
 * deux formats responsives : `rectangle` (bloc fluide, plus grand que
 * l'ancien 300×250) et `interstitial` (overlay plein écran fermable).
 *
 * Ce module est partagé entre l'API d'administration (écriture) et
 * l'endpoint public (lecture) : le nom `_adPositions` l'exclut du routage
 * Cloudflare Pages Functions.
 */

export const AD_POSITION_IDS: readonly string[] = ['rectangle', 'interstitial'];

/**
 * Anciens identifiants (migration 0031) → format équivalent.
 * La migration 0032 réécrit les lignes existantes ; cette table garde le
 * service cohérent même si elle n'a pas encore été appliquée (ou si un
 * client envoie encore un ancien id).
 */
const LEGACY_AD_POSITION_ALIASES: Record<string, string> = {
  leaderboard_728x90: 'rectangle',
  mobile_leaderboard_320x50: 'rectangle',
  medium_rectangle_300x250: 'rectangle',
  skyscraper_160x600: 'interstitial',
};

const KNOWN_POSITION_IDS = new Set<string>(AD_POSITION_IDS);

/**
 * Normalise une liste de positions : alias migrés vers le nouveau format,
 * identifiants inconnus ignorés, doublons fusionnés (l'ordre est préservé).
 */
export function normalizeAdPositions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(p => String(p)) : [];
  const out: string[] = [];
  for (const entry of list) {
    const id = KNOWN_POSITION_IDS.has(entry) ? entry : LEGACY_AD_POSITION_ALIASES[entry];
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
