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
} from 'lucide-react';
import type { SaaSPlan } from '../types';

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
];

export const ADDON_MODULES = ALL_MODULES.filter(m => !(BASE_KEYS as readonly string[]).includes(m.key));
export const BASE_MODULES = ALL_MODULES.filter(m => (BASE_KEYS as readonly string[]).includes(m.key));

/** Somme des prix des modules demandés (un module inconnu vaut 0). */
export const modulesPrice = (keys: readonly string[], prices: Record<string, number>): number =>
  keys.reduce((sum, key) => sum + (prices[key] || 0), 0);

// ─── Offres ────────────────────────────────────────────────────────────────

export interface PlanTier {
  key: SaaSPlan;
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
  growth: ['scolaire', 'studentTimeSheets', 'finance', 'etude', 'coursParticuliers', 'revision'],
  pro: ALL_MODULES.map(m => m.key),
};

export function modulesForPlan(plan?: string | null): string[] {
  return PLAN_PRESET_MODULES[String(plan || '')] || PLAN_PRESET_MODULES.starter;
}
