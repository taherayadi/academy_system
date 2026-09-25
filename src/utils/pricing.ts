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

/**
 * Catalogue des modules facturables + offres, partagé par le simulateur de la
 * page d'accueil et le module « Renouvellement » du centre : une seule source
 * de vérité pour les clés, les libellés et le calcul du prix.
 */

export interface PricedModule {
  key: string;
  label: string;
  icon: any;
  description: string;
  bundled?: boolean;
}

export const BASE_KEYS = ['scolaire', 'studentTimeSheets', 'finance'] as const;

export const ALL_MODULES: readonly PricedModule[] = [
  { key: 'scolaire', label: 'Scolaire & Notes', icon: GraduationCap, description: 'Fiches élèves, notes, moyennes et bulletins par trimestre.' },
  { key: 'finance', label: 'Finance & Paiements', icon: DollarSign, description: 'Reçus, encaissements, chèques et statistiques de revenus.' },
  { key: 'studentTimeSheets', label: 'Jd. Horaires', icon: Clock, description: 'Pointage journalier des entrées/sorties des élèves — offert avec la base.', bundled: true },
  { key: 'etude', label: 'Étude Surveillée', icon: BookOpen, description: 'Planning hebdomadaire, présences, horaires.' },
  { key: 'coursParticuliers', label: 'Cours Particuliers', icon: Users, description: 'Cours 1-à-1, tarification, enseignants.' },
  { key: 'revision', label: 'Révision Examens', icon: Award, description: 'Séances de révision, groupes, présences.' },
  { key: 'formations', label: 'Formations', icon: Sparkles, description: 'Ateliers, stages vacances, plannings.' },
  { key: 'cantine', label: 'Cantine & Repas', icon: Utensils, description: 'Menus hebdomadaires, abonnements, pointage.' },
  { key: 'transport', label: 'Transport Scolaire', icon: Bus, description: 'Circuits, feuilles de route, chauffeurs.' },
  { key: 'events', label: 'Événements & Sorties', icon: Calendar, description: 'Inscriptions, sorties scolaires.' },
  { key: 'staff', label: 'Personnel & Salaires', icon: ShieldCheck, description: 'Équipe, paie, pointages, congés.' },
  { key: 'activites', label: 'Activités & Planning', icon: Shapes, description: 'Planning hebdomadaire des activités : motricité, art, musique, jeu.' },
  { key: 'competences', label: 'Compétences & Skills', icon: Brain, description: 'Catalogue de compétences et évaluations par enfant avec rapport imprimable.' },
];

export const ADDON_MODULES = ALL_MODULES.filter(m => !(BASE_KEYS as readonly string[]).includes(m.key));
export const BASE_MODULES = ALL_MODULES.filter(m => (BASE_KEYS as readonly string[]).includes(m.key));

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
 */
export const PLAN_PRESET_MODULES: Record<string, string[]> = {
  starter: ['scolaire', 'studentTimeSheets', 'finance'],
  growth: ['scolaire', 'studentTimeSheets', 'finance', 'etude', 'coursParticuliers', 'revision', 'activites', 'competences'],
  pro: ALL_MODULES.map(m => m.key),
};

export function modulesForPlan(plan?: string | null, centerType?: string | null): string[] {
  const preset = PLAN_PRESET_MODULES[String(plan || '')] || PLAN_PRESET_MODULES.starter;
  // Revision C (remark 7): a type-aware preset only proposes type-compatible
  // modules — the Pro preset for a crèche IS its applicable set. No type →
  // today's preset verbatim (legacy passthrough, FR-006 baseline frozen).
  if (centerType == null || centerType === '') return preset;
  return preset.filter(key => isModuleCompatible(key, centerType));
}

/**
 * Revision C (remark 7): the modules a center of this type can actually select
 * — ALL_MODULES filtered through the canonical compatibility map. Unknown or
 * empty type returns the full catalog (legacy passthrough): derivation then
 * compares against the global set exactly as before this revision.
 */
export function applicableModuleKeys(centerType?: string | null): string[] {
  return ALL_MODULES.map(m => m.key).filter(key => isModuleCompatible(key, centerType));
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
 * centre (moduleCenterTypes), pas le catalogue global — un centre crèche qui
 * coche tous les modules proposés atteint bien Pro. Sans type connu, la
 * comparaison reste globale (comportement antérieur inchangé, FR-006).
 * Dérivation pure : ne mute jamais la sélection (FR-010).
 */
export function derivePlanFromModules(selected: readonly string[], centerType?: string | null): SubscriptionPlan {
  const all = applicableModuleKeys(centerType);
  if (all.length > 0 && all.every(k => selected.includes(k))) return 'pro';
  const hasExtra = selected.some(k => !(BASE_KEYS as readonly string[]).includes(k));
  return hasExtra ? 'growth' : 'starter';
}

/** Total dû pour la période choisie (annuel = 12 mois remisés). */
export function totalForCycle(monthly: number, cycle?: string | null): number {
  if (String(cycle) === 'annual') {
    return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
  }
  return monthly;
}
