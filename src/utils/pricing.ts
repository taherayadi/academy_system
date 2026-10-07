import {
  GraduationCap,
  DollarSign,
  Clock,
  BookOpen,
  Users,
  Award,
  Sparkles,
  Utensils,
  Bus,
  Calendar,
  ShieldCheck,
  Shapes,
  Brain,
} from 'lucide-react';
import type { SubscriptionPlan } from '../types';
import { isModuleCompatible } from './centerType';
import { getCatalogSnapshot } from './catalogStore';

/**
 * Catalogue des modules facturables + offres, partagé par le simulateur de la
 * page d'accueil et le module « Renouvellement » du centre.
 *
 * ⚠️ Tout est lu à l'EXÉCUTION depuis /api/catalog via catalogStore — table
 * `modules` (clés/labels/icônes/drapeaux isBasic/isUnbilled/isHidden) et table
 * `center_type_modules` (compatibilité, via centerType.ts). Aucune liste
 * codée en dur, aucun fichier généré : la base est la seule source.
 * Les prix vivent dans `module_prices` et sont chargés à l'EXÉCUTION via
 * /api/public-pricing.
 */

/** Nom d'icône lucide (colonne `modules.icon`) → composant. Fallback : Shapes. */
const MODULE_ICONS: Record<string, any> = {
  GraduationCap,
  DollarSign,
  Clock,
  BookOpen,
  Users,
  Award,
  Sparkles,
  Utensils,
  Bus,
  Calendar,
  ShieldCheck,
  Shapes,
  Brain,
};
const iconForModule = (name: string): any => MODULE_ICONS[name] || Shapes;

export interface PricedModule {
  key: string;
  label: string;
  icon: any;
  description: string;
  bundled?: boolean;
}

/** Catalogue vendable = modules non masqués (`modules.isHidden = 0`), ordre de la table. */
export function allModules(): readonly PricedModule[] {
  return getCatalogSnapshot().modules
    .filter(m => !m.isHidden)
    .map(m => ({
      key: m.key,
      label: m.label,
      icon: iconForModule(m.icon),
      description: m.description,
      bundled: m.isUnbilled || undefined,
    }));
}

/** Base non retirable = lignes `modules.isBasic = 1`. */
export function baseKeys(): readonly string[] {
  return getCatalogSnapshot().modules.filter(m => m.isBasic).map(m => m.key);
}

export function addonModules(): readonly PricedModule[] {
  const base = new Set<string>(baseKeys());
  return allModules().filter(m => !base.has(m.key));
}

export function baseModules(): readonly PricedModule[] {
  const base = new Set<string>(baseKeys());
  return allModules().filter(m => base.has(m.key));
}

/** Somme des prix des modules demandés (un module inconnu vaut 0). */
export const modulesPrice = (keys: readonly string[], prices: Record<string, number>): number =>
  keys.reduce((sum, key) => sum + (prices[key] || 0), 0);

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
 * Modules inclus par offre. Une offre agit comme un préréglage du simulateur :
 * le centre peut ensuite affiner en cochant / décochant des modules, exactement
 * comme sur la page d'accueil.
 *
 * Dérivés du catalogue live à chaque appel : starter = modules isBasic=1,
 * pro = tout le catalogue vendable.
 * ⚠️ Pas encore de table pour les préréglages d'offre : le preset « growth »
 * reste une sélection métier (base + modules scolaires et activités) en
 * attendant une table dédiée (ex. plan_presets).
 */
export function planPresetModules(): Record<string, string[]> {
  return {
    starter: [...baseKeys()],
    growth: [...baseKeys(), 'etude', 'coursParticuliers', 'revision', 'activites', 'competences'],
    pro: allModules().map(m => m.key),
  };
}

export function modulesForPlan(plan?: string | null, centerType?: string | null): string[] {
  const presets = planPresetModules();
  const preset = presets[String(plan || '')] || presets.starter;
  // Revision C (remark 7): a type-aware preset only proposes type-compatible
  // modules — the Pro preset for a crèche IS its applicable set. No type →
  // today's preset verbatim (legacy passthrough, FR-006 baseline frozen).
  if (centerType == null || centerType === '') return preset;
  return preset.filter(key => isModuleCompatible(key, centerType));
}

/**
 * Revision C (remark 7): the modules a center of this type can actually select
 * — the live catalog filtered through the compatibility rows (table
 * `center_type_modules`). Unknown or empty type returns the full catalog
 * (legacy passthrough): derivation then compares against the global set
 * exactly as before this revision.
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
 * Dérivation pure : ne mute jamais la sélection (FR-010).
 */
export function derivePlanFromModules(selected: readonly string[], centerType?: string | null): SubscriptionPlan {
  const all = applicableModuleKeys(centerType);
  if (all.length > 0 && all.every(k => selected.includes(k))) return 'pro';
  const base = baseKeys();
  const hasExtra = selected.some(k => !base.includes(k));
  return hasExtra ? 'growth' : 'starter';
}

/** Total dû pour la période choisie (annuel = 12 mois remisés). */
export function totalForCycle(monthly: number, cycle?: string | null): number {
  if (String(cycle) === 'annual') {
    return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
  }
  return monthly;
}
