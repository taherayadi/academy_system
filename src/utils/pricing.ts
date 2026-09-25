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
  Palette,
  Target,
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
  { key: 'scolaire', label: 'التعليم والدرجات', icon: GraduationCap, description: 'بطاقات التلاميذ، الدرجات، المتوسطات وبيانات الفصل.' },
  { key: 'finance', label: 'المالية والمدفوعات', icon: DollarSign, description: 'إيصالات، تحصيلات، شيكات وإحصائيات الإيرادات.' },
  { key: 'studentTimeSheets', label: 'سجل الدوام', icon: Clock, description: 'تسجيل يومي لدخول/خروج التلاميذ — مضمون في الباقة الأساسية.', bundled: true },
  { key: 'etude', label: 'مراجعة مشرفة', icon: BookOpen, description: 'جداول أسبوعية، حضور، مواعيد.' },
  { key: 'coursParticuliers', label: 'دروس خاصة', icon: Users, description: 'دروس فردية، تسعير، معلمون.' },
  { key: 'revision', label: 'مراجعة الامتحانات', icon: Award, description: 'جلسات مراجعة، مجموعات، حضور.' },
  { key: 'formations', label: 'دورات', icon: Sparkles, description: 'ورش، معاهد صيفية، جداول.' },
  { key: 'cantine', label: 'مقصف & وجبات', icon: Utensils, description: 'قوائم أسبوعية، اشتراكات، حضور.' },
  { key: 'transport', label: 'نقل مدرسي', icon: Bus, description: 'مسارات، مسارات رحلة، سائقون.' },
  { key: 'events', label: 'مناسبات ونشاطات', icon: Calendar, description: 'تسجيل، رحلات مدرسية.' },
  { key: 'staff', label: 'الموظفون والرواتب', icon: ShieldCheck, description: 'الطاقم، رواتب، دوام، إجازات.' },
  { key: 'activites', label: 'أنشطة وبرنامج', icon: Palette, description: 'أنشطة يومية، برنامج أسبوعي، مشاركة مع الأولياء.' },
  { key: 'competences', label: 'مهارات ومستويات', icon: Target, description: 'متابعة المهارات والمستويات مع تقارير التقدم.' },
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
  { key: 'starter', label: 'Basic', labelAr: 'الأساسية', order: 1, hint: 'الأساسيات للانطلاق: تعليم، دوام ومالية.' },
  { key: 'growth', label: 'Growth', labelAr: 'النمو', order: 2, hint: 'للمراكز التي تنمو: مراجعة مشرفة، دروس خاصة ومراجعة امتحانات.' },
  { key: 'pro', label: 'Pro', labelAr: 'الاحترافية', order: 3, hint: 'كل الوحدات، المقصف والنقل والطاقم مضمونة.' },
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

/** Remise appliquée au règlement annuel (2 mois offerts ≈ −20 %). */
export const ANNUAL_DISCOUNT = 0.2;

/**
 * L'offre se déduit des modules cochés dans le simulateur :
 *   • la base seule                → Basic
 *   • au moins un module en plus   → Growth
 *   • tous les modules             → Pro
 * Ainsi cocher un module fait évoluer l'offre affichée et envoyée.
 */
export function derivePlanFromModules(selected: readonly string[]): SaaSPlan {
  const all = ALL_MODULES.map(m => m.key);
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
