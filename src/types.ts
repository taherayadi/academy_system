/**
 * Shared types for the SaaS platform administration application.
 *
 * Only the platform's domain model lives here (center tenants, subscriptions,
 * invoices, demo/renewal requests, advertisements, platform accounts). All
 * center-operational types (students, staff, meals, attendance, schedules,
 * fees…) belong to the center application (repository academy_system) and
 * were removed together with its modules.
 */

import type { CenterType } from './components/dashboard/constants';

export type SaaSPlan = 'trial' | 'starter' | 'growth' | 'pro' | 'custom';
export type CenterStatus = 'trial' | 'active' | 'suspended' | 'expired';

/** A plan change recorded to take effect at the end of the current period. */
export interface ScheduledPlanChange {
  id: string;
  plan: string; // storage value: 'starter' (Basic) | 'growth' | 'pro' | 'custom'
  billingCycle: 'monthly' | 'annual';
  enabledModules: string[];
  monthlyPrice: number | null;
  applyAt: number | null; // eligible once subscription_ends_at passes
  createdAt: number;
}

export type ModuleKey = 
  | 'scolaire' 
  | 'finance' 
  | 'etude' 
  | 'coursParticuliers' 
  | 'revision' 
  | 'formations' 
  | 'cantine' 
  | 'transport' 
  | 'events' 
  | 'bibliotheque' 
  | 'studentTimeSheets' 
  | 'staff'
  | 'activites'
  | 'competences';

export interface CenterTenant {
  id: string;
  name: string;
  slug?: string;
  phoneNumber?: string;
  locationCity?: string;
  plan: SaaSPlan;
  enabledModules: ModuleKey[] | string[];
  mealOperatingMode?: 'external_traiteur' | 'in_house_kitchen';
  status: CenterStatus;
  trialEndsAt?: number | null;
  subscriptionEndsAt?: number | null;
  billingCycle?: 'monthly' | 'annual';
  monthlyPrice?: number;
  /** Canonical center type — '' for legacy rows created before typing existed. */
  centerType?: CenterType | '';
  logoUrl?: string; // ImageKit CDN URL — empty = default brand logo
  createdAt: number;
  studentCount?: number;
  adminEmail?: string;
  scheduledPlan?: ScheduledPlanChange | null;
}

export interface DemoRequest {
  id: string;
  requestType: 'trial' | 'demo' | 'info';
  fullName: string;
  academyName: string;
  email: string;
  phone: string;
  estimatedSize?: string;
  requestedModules?: string[] | string;
  /** Canonical center type — '' for legacy rows created before typing existed. */
  centerType?: CenterType | '';
  message?: string;
  status: 'new' | 'contacted' | 'converted' | 'archived';
  notes?: string;
  createdAt: number;
}

export type AdvertisementLocation =
  | 'landing_page'
  | 'center_admin'
  | 'both' // visible on the landing page AND in the selected centers' dashboards
  | string; // Allow custom locations

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

export interface AdPositionSpec {
  id: AdPositionId;
  label: string;
  size: string;
  hint: string;
}

export const AD_POSITION_SPECS: AdPositionSpec[] = [
  { id: 'rectangle', label: 'Rectangle', size: '1100×420 max', hint: 'Rectangle responsive — occupe toute la largeur disponible (jusqu’à 1100 px) avec une hauteur fluide de 220 à 420 px : compact sur mobile, large sur desktop.' },
  { id: 'interstitial', label: 'Interstitiel', size: 'Plein écran', hint: 'Interstitiel — overlay responsive plein écran, fermable en un clic, avec compte à rebours.' },
];

export const AD_POSITION_IDS: string[] = AD_POSITION_SPECS.map(s => s.id);

// L'interstitiel se rend en overlay plein écran (vitrine + tableaux de bord)
// au lieu du carrousel standard.
export const INTERSTITIAL_POSITION_ID = 'interstitial';

export function hasInterstitialPosition(positions?: string[]): boolean {
  return (positions || []).includes(INTERSTITIAL_POSITION_ID);
}

export function adPositionLabel(id: string): string {
  const spec = AD_POSITION_SPECS.find(s => s.id === id);
  return spec ? `${spec.label} (${spec.size})` : id;
}

export interface PlatformAdvertisement {
  id: string;
  title: string;
  dateStart: number;
  dateEnd: number;
  location: AdvertisementLocation;
  imageUrls: string[]; // Array of ImageKit CDN URLs for carousel
  linkUrl?: string;
  priority: number;
  isActive: boolean;
  isPublished: boolean;
  centerIds: string[]; // Selected center IDs
  positions?: string[]; // AdPositionId list (empty = emplacements par défaut du carrousel)
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserAccount {
  email: string;
  name: string;
  role: 'super_admin' | 'restricted_admin' | 'platform_super_admin' | 'admin';
  description: string;
  centerId?: string;
  isPlatformAdmin?: boolean;
}
// ─── Demandes de renouvellement (migration 0033) ──────────────────────────
// Un centre demande soit le renouvellement de son offre actuelle (appliqué à
// la fin de la période en cours), soit un passage à une offre supérieure
// (Basic → Growth → Pro), appliqué dès l'acceptation par la plateforme.

export type RenewalRequestKind = 'renewal' | 'upgrade';
export type RenewalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface RenewalRequest {
  id: string;
  centerId: string;
  centerName?: string;
  kind: RenewalRequestKind;
  currentPlan: string;
  /** Statut du centre au moment de la demande ('trial' | 'active' | …). */
  currentStatus: string;
  currentModules: string[];
  requestedPlan: string;
  requestedModules: string[];
  billingCycle: 'monthly' | 'annual';
  amount: number | null;
  status: RenewalRequestStatus;
  /** Date à laquelle la demande devrait prendre effet. */
  effectiveAt: number | null;
  note: string;
  decisionNote: string;
  decidedBy: string;
  decidedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Ligne de l'historique des plans d'un centre (table center_plan_history). */
export interface PlanHistoryEntry {
  id: string;
  action: string;
  details: string;
  amount: number | null;
  invoiceNumber: string | null;
  createdAt: number;
}

