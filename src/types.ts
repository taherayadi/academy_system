// Shared types for the public landing page.
// The center workspace types live in the center application; only the
// advertisement surface types used by the landing page are kept here.

export type SubscriptionPlan = 'trial' | 'starter' | 'growth' | 'pro' | 'custom';


export type AdvertisementLocation =
  | 'landing_page'
  | 'center_admin'
  | 'both' // visible on the landing page AND in the selected centers' dashboards
  | string;
 // Allow custom locations


/**
 * Positions d'affichage — une annonce peut en cumuler plusieurs.
 *
 * Depuis la migration 0032, les formats IAB figés (728×90, 300×250, 320×50,
 * 160×600) sont remplacés par deux formats responsives :
 *   • rectangle    — bloc fluide, nettement plus grand que l'ancien 300×250
 *   • interstitial — overlay plein écran (mobile compris), fermable
 */
export type AdPositionId =
  | 'rectangle'
  | 'interstitial';


// L'interstitiel se rend en overlay plein écran (vitrine + tableaux de bord)
// au lieu du carrousel standard.
export const INTERSTITIAL_POSITION_ID = 'interstitial';


export function hasInterstitialPosition(positions?: string[]): boolean {
  return (positions || []).includes(INTERSTITIAL_POSITION_ID);
}
