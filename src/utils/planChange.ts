// Client-side mirror of the backend plan-change rules (functions/api/planLogic.ts).
// Kept in src because the frontend cannot import from functions/. The backend
// stays the source of truth — this only drives what the platform admin sees
// and which request shape (settle now vs schedule) the UI sends.

export const PLAN_CHANGE_EPSILON = 0.005;
export const DAY_MS = 86400000;
export const MONTH_PERIOD_DAYS = 30;
export const YEAR_PERIOD_DAYS = 365;
export const BUNDLED_MODULE_KEY = 'studentTimeSheets';

export type BillingCycle = 'monthly' | 'annual';
export type PlanValue = 'basic' | 'growth' | 'pro' | 'custom';

export function displayPlan(storagePlan?: string | null): PlanValue {
  return storagePlan === 'starter' || storagePlan === 'basic' ? 'basic' : (storagePlan as PlanValue) || 'basic';
}

export function storagePlan(display: string): string {
  return display === 'basic' ? 'starter' : display;
}

export function periodDays(cycle: BillingCycle): number {
  return cycle === 'annual' ? YEAR_PERIOD_DAYS : MONTH_PERIOD_DAYS;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ClientCenterLike {
  plan?: string | null;
  billingCycle?: BillingCycle | null;
  monthlyPrice?: number | null;
  enabledModules?: string[] | null;
  status?: string | null;
  subscriptionEndsAt?: number | null;
}

export interface ClientPlanTarget {
  plan: PlanValue; // display value ('basic' | 'growth' | 'pro' | 'custom')
  billingCycle: BillingCycle;
  enabledModules: string[];
  manualPrice?: number; // used for 'custom'
}

export type ClientPlanDecision =
  | { kind: 'no_change' }
  | { kind: 'trial_preconfig' }
  | { kind: 'renewal' } // period over / overdue / cycle conversion → full new period
  | {
    kind: 'mid_period_increase' | 'mid_period_same_price' | 'mid_period_decrease';
    periodEnd: number;
    periodStart: number;
    periodDaysCount: number;
    remainingDays: number;
    oldAmount: number;
    newAmount: number;
    paidAmount: number; // settlement if already paid (increase only, else 0)
    unpaidAmount: number; // settlement if not paid yet (increase only, else 0)
  };

function normalizeModules(modules: string[] | null | undefined): string[] {
  return Array.from(new Set((modules || []).filter(Boolean)));
}

/** Total of the selected modules, ignoring the bundled (free) time-sheet module. */
export function moduleTotal(enabledModules: string[], modulePrices: Record<string, number>): number {
  return enabledModules.reduce(
    (total, key) => total + (key === BUNDLED_MODULE_KEY ? 0 : (Number(modulePrices[key]) || 0)),
    0
  );
}

/** Amount billed for one full period at the given plan/cycle. */
export function periodAmount(
  plan: PlanValue,
  cycle: BillingCycle,
  enabledModules: string[],
  modulePrices: Record<string, number>,
  manualPrice = 0
): number {
  if (plan === 'custom') return Math.max(0, Number(manualPrice) || 0);
  const monthly = moduleTotal(enabledModules, modulePrices);
  return cycle === 'annual' ? monthly * 12 * (1 - 0.2) : monthly; // 20 % annual discount
}

export function analyzePlanChange(
  center: ClientCenterLike,
  target: ClientPlanTarget,
  modulePrices: Record<string, number>,
  now = Date.now()
): ClientPlanDecision {
  const curCycle = (center.billingCycle as BillingCycle) || 'monthly';
  const curDisplay = displayPlan(center.plan || 'starter');

  if (target.billingCycle !== curCycle) return { kind: 'renewal' };

  const storedPrice = Number(center.monthlyPrice) || 0;
  const oldAmount = storedPrice > 0
    ? storedPrice
    : periodAmount(curDisplay, curCycle, normalizeModules(center.enabledModules), modulePrices, Number(center.monthlyPrice) || 0);
  const newAmount = periodAmount(target.plan, target.billingCycle, target.enabledModules, modulePrices, target.manualPrice || 0);
  const sameContent = target.plan === curDisplay
    && JSON.stringify(normalizeModules(target.enabledModules)) === JSON.stringify(normalizeModules(center.enabledModules));

  if (sameContent && Math.abs(newAmount - oldAmount) <= PLAN_CHANGE_EPSILON) {
    return { kind: 'no_change' };
  }
  if (center.status === 'trial') return { kind: 'trial_preconfig' };

  const periodEnd = Number(center.subscriptionEndsAt) || 0;
  const insideWindow = center.status === 'active' && periodEnd > now;
  if (!insideWindow) return { kind: 'renewal' };

  const days = periodDays(curCycle);
  const periodStart = periodEnd - days * DAY_MS;
  const remainingDays = Math.min(days, Math.max(1, Math.ceil((periodEnd - now) / DAY_MS)));

  if (Math.abs(newAmount - oldAmount) <= PLAN_CHANGE_EPSILON) {
    return {
      kind: 'mid_period_same_price',
      periodEnd, periodStart, periodDaysCount: days, remainingDays, oldAmount, newAmount,
      paidAmount: 0, unpaidAmount: 0,
    };
  }

  const increase = newAmount > oldAmount;
  const frac = remainingDays / days;
  return {
    kind: increase ? 'mid_period_increase' : 'mid_period_decrease',
    periodEnd, periodStart, periodDaysCount: days, remainingDays, oldAmount, newAmount,
    paidAmount: increase ? round2((newAmount - oldAmount) * frac) : 0,
    unpaidAmount: increase ? round2(newAmount * frac) : 0,
  };
}
