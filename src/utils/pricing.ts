/**
 * Offres & dérivation — les données (modules, drapeaux base/offert, prix,
 * compatibilité par type) viennent du catalogue D1 servi par
 * /api/public-pricing et installé via `setCatalog` (src/utils/catalog.ts).
 * Ce fichier ne contient plus aucune donnée codée en dur : uniquement les
 * règles de calcul (préréglages, dérivation d'offre, totaux).
 */

import type { SubscriptionPlan } from '../types';
import { isModuleCompatible } from './centerType';
import { getCatalog, baseKeys, offeredModules, modulePrice, MODULE_ICONS } from './catalog';

export interface PricedModule {
  key: string;
  label: string;
  labelAr: string;
  icon: any;                  // composant lucide résolu (MODULE_ICONS)
  iconName: string;           // nom stocké en base
  description: string;
  features: string[];         // puces des cartes « La base » (modules.features)
  mock: string;               // variante de l'aperçu miniature (modules.mock)
  price: number;
  bundled?: boolean;          // isUnbilled en base — jamais facturé seul
}

// ─── Accèsurs catalogue ────────────────────────────────────────────────────

/** Clés de base (isBasic = 1 en base), dans l'ordre du catalogue. */
export const BASE_KEYS: readonly string[] = new Proxy([] as string[], {
  get: (_t, prop) => Reflect.get(baseKeys(), prop),
  has: (_t, prop) => Reflect.has(baseKeys(), prop),
  ownKeys: () => Reflect.ownKeys(baseKeys()),
  getOwnPropertyDescriptor: (_t, prop) => Reflect.getOwnPropertyDescriptor(baseKeys(), prop),
});

/** Catalogue complet offert, enrichi du prix courant et de l'icône résolue. */
export function allModules(): PricedModule[] {
  return offeredModules().map(m => ({
    key: m.key,
    label: m.label,
    labelAr: m.labelAr,
    icon: MODULE_ICONS[m.icon] ?? m.icon,
    iconName: m.icon,
    description: m.description,
    features: m.features ?? [],
    mock: m.mock ?? '',
    price: modulePrice(m.key),
    bundled: m.isUnbilled || undefined,
  }));
}

/** Modules additionnels = modules non-base (isBasic = 0). */
export function addonModules(): PricedModule[] {
  return allModules().filter(m => !isBase(m.key));
}

/** Modules de base (isBasic = 1). */
export function baseModules(): PricedModule[] {
  return allModules().filter(m => isBase(m.key));
}

function isBase(key: string): boolean {
  return baseKeys().includes(key);
}

/** Somme des prix des modules demandés (un module inconnu vaut 0). */
export const modulesPrice = (keys: readonly string[], prices: Record<string, number>): number =>
  keys.reduce((sum, key) => sum + (prices[key] || modulePrice(key)), 0);

// ─── Offres ────────────────────────────────────────────────────────────────

export interface PlanTier {
  key: SubscriptionPlan;
  label: string;
  labelAr: string;
  order: number;
  hint: string;
}

export const PLAN_TIERS: PlanTier[] = [
  { key: 'starter', label: 'Basic', labelAr: 'الأساسية', order: 1, hint: 'L’essentiel pour démarrer : scolarité, horaires et finance.' },
  { key: 'growth', label: 'Growth', labelAr: 'النمو', order: 2, hint: 'Pour les centres qui grandissent : étude, cours et révision.' },
  { key: 'pro', label: 'Pro', labelAr: 'الاحترافية', order: 3, hint: 'Tous les modules, cantine, transport et personnel inclus.' },
];

/** Rang d'une offre (0 pour un essai) — sert à détecter un passage supérieur. */
export function planRank(plan?: string | null): number {
  switch (plan) {
    case 'starter': return 1;
    case 'growth': return 2;
    case 'pro': return 3;
    case 'custom': return 4;
    default: return 0; // trial / inconnu
  }
}

export function planLabel(plan?: string | null): string {
  return PLAN_TIERS.find(t => t.key === plan)?.label || (plan ? String(plan) : '—');
}

/** true quand « to » est une offre supérieure à « from ». */
export function isPlanUpgrade(from?: string | null, to?: string | null): boolean {
  return planRank(to) > planRank(from);
}

/** Durée d'une période de facturation, en jours. */
export const cycleDays = (cycle?: string | null): number => (String(cycle) === 'annual' ? 365 : 30);

/**
 * Modules inclus par offre — déduits des drapeaux du catalogue et de la
 * matrice center_type_modules, aucune clé codée en dur :
 *   • starter = les modules de base (modules.isBasic = 1)
 *   • growth  = la base + UN module additionnel (le premier offert compatible
 *               avec tous les types connus, pour que le préréglage survive au
 *               filtrage par type de centre)
 *   • pro     = tout le catalogue offert — l'applicabilité réelle par type de
 *               centre est appliquée ensuite par modulesForPlan
 * Une offre agit comme un préréglage du simulateur : le centre peut ensuite
 * affiner en cochant / décochant des modules, exactement comme sur la page
 * d'accueil (un module en plus → growth, tous → pro — cf. derivePlanFromModules).
 */
export function planPresetModules(plan?: string | null): string[] {
  const catalog = getCatalog();
  const offered = catalog.modules.filter(m => !m.isHidden);
  const addons = offered.filter(m => !m.isBasic);
  switch (String(plan || '')) {
    case 'pro':
      return offered.map(m => m.key);
    case 'growth': {
      const knownTypes = catalog.centerTypes.map(t => String(t.key));
      const universal = addons.find(a => {
        const served = catalog.moduleCenterTypes[a.key] || [];
        return knownTypes.every(t => served.includes(t));
      });
      const extra = universal ?? addons[0];
      return extra ? [...baseKeys(), extra.key] : baseKeys();
    }
    default:
      return baseKeys();
  }
}

export function modulesForPlan(plan?: string | null, centerType?: string | null): string[] {
  const preset = planPresetModules(plan);
  // Revision C (remark 7): a type-aware preset only proposes type-compatible
  // modules — the Pro preset for a crèche IS its applicable set. No type →
  // today's preset verbatim (legacy passthrough, FR-006 baseline frozen).
  if (centerType == null || centerType === '') return preset;
  return preset.filter(key => isModuleCompatible(key, centerType));
}

/**
 * Revision C (remark 7): the modules a center of this type can actually select
 * — the catalog filtered through the DB compatibility map. Unknown or empty
 * type returns the full catalog (legacy passthrough): derivation then compares
 * against the global set exactly as before this revision.
 */
export function applicableModuleKeys(centerType?: string | null): string[] {
  return allModules().map(m => m.key).filter(key => isModuleCompatible(key, centerType));
}

/** Remise appliquée au règlement annuel (2 mois offerts ≈ −20 %). */
export const ANNUAL_DISCOUNT = 0.2;

/**
 * L'offre se déduit des modules cochés dans le simulateur :
 *   • la base seule                → Basic
 *   • au moins un module en plus   → Growth
 *   • tous les modules applicables → Pro
 * Ainsi cocher un module fait évoluer l'offre affichée et envoyée.
 *
 * Revision C (remark 7) : « tous » = tous les modules APPLICABLES au type de
 * centre (center_type_modules), pas le catalogue global — un centre crèche qui
 * coche tous les modules proposés atteint bien Pro. Sans type connu, la
 * comparaison reste globale (comportement antérieur inchangé, FR-006).
 *
 * Dérivation pure : ne mute jamais la sélection (FR-010).
 */
export function derivePlanFromModules(selected: readonly string[], centerType?: string | null): SubscriptionPlan {
  const all = applicableModuleKeys(centerType);
  if (all.length > 0 && all.every(k => selected.includes(k))) return 'pro';
  const hasExtra = selected.some(k => !isBase(k));
  return hasExtra ? 'growth' : 'starter';
}

/** Total dû pour la période choisie (annuel = 12 mois remisés). */
export function totalForCycle(monthly: number, cycle?: string | null): number {
  if (String(cycle) === 'annual') {
    return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
  }
  return monthly;
}
