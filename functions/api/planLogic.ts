// Pure helpers that decide what happens when a center's plan / modules /
// billing cycle change — used by functions/api/centers.ts so the behavior is
// testable without a database.
//
// Vocabulary used across the billing code:
//   - period      = one full billed window (30 days monthly, 365 days annual)
//   - periodAmount = the amount billed for ONE full period, stored in
//                    centers.monthly_price (for auto-priced plans this is the
//                    module total; for 'annual' it is already the discounted
//                    yearly total; for 'custom' it is the manual tariff).
//   - Basic is stored in the DB as plan 'starter' (CHECK constraint).

export const DAY_MS = 86400000;
export const MONTH_PERIOD_DAYS = 30;
export const YEAR_PERIOD_DAYS = 365;
export const PRICE_EPSILON = 0.005;

export type BillingCycle = 'monthly' | 'annual';

export function periodDays(cycle: BillingCycle): number {
  return cycle === 'annual' ? YEAR_PERIOD_DAYS : MONTH_PERIOD_DAYS;
}

/** Round to 2 decimals (TND amounts). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function planLabel(plan: string): string {
  switch (plan) {
    case 'starter': return 'Basic';
    case 'growth': return 'Growth';
    case 'pro': return 'Pro';
    case 'custom': return 'Custom';
    default: return plan;
  }
}

/** Read-only shape of a center row needed to evaluate a plan change. */
export interface CenterBillingSnapshot {
  status: string; // 'trial' | 'active' | 'suspended' | 'expired'
  plan?: string; // storage value: 'starter' (Basic) | 'growth' | 'pro' | 'custom'
  billingCycle?: BillingCycle | null;
  monthlyPrice?: number | null; // amount billed for one full period
  trialEndsAt?: number | null;
  subscriptionEndsAt?: number | null;
}

/** What the center would become after the change. */
export interface PlanTarget {
  plan: string; // storage value
  billingCycle: BillingCycle;
  periodAmount: number; // amount for one full period at the target (same cycle basis)
  modulesChanged: boolean; // the live module list also changed
}

export type PlanChangeMode =
  | 'no_change' // nothing price/plan relevant changed
  | 'trial_preconfig' // center is still in trial → just remember the choice, nothing billed/extended
  | 'renewal' // no active paid window (expired/overdue/cycle conversion) → full new period at target
  | 'mid_period_increase' // inside the current paid window and the price goes UP
  | 'mid_period_decrease' // inside the current paid window and the price goes DOWN
  | 'mid_period_same_price'; // inside the current paid window, price unchanged (label/modules mix)

export interface PlanChangeEvaluation {
  mode: PlanChangeMode;
  now: number;
  // Mid-period window info (mode = mid_period_*):
  periodStart: number | null; // inferred start of the current paid window
  periodEnd: number | null; // subscription_ends_at of the current paid window
  periodDaysCount: number; // 30 or 365
  remainingDays: number; // whole days left in the window (ceil, ≥ 1, capped)
  oldPlan: string;
  newPlan: string;
  oldPeriodAmount: number;
  newPeriodAmount: number;
}

/** True when the center currently sits inside a paid (non-trial) window. */
export function isInsidePaidPeriod(center: CenterBillingSnapshot, now = Date.now()): boolean {
  return center.status === 'active'
    && !!center.subscriptionEndsAt
    && Number(center.subscriptionEndsAt) > now;
}

export function evaluatePlanChange(
  center: CenterBillingSnapshot,
  target: PlanTarget,
  now = Date.now()
): PlanChangeEvaluation {
  const oldPlan = center.plan || 'starter';
  const oldCycle = (center.billingCycle as BillingCycle) || 'monthly';
  const oldAmount = Number(center.monthlyPrice) || 0;
  const newAmount = Number(target.periodAmount) || 0;
  const cycleChanged = target.billingCycle !== oldCycle;
  const priceChanged = Math.abs(newAmount - oldAmount) > PRICE_EPSILON;

  const base: PlanChangeEvaluation = {
    mode: 'no_change',
    now,
    periodStart: null,
    periodEnd: null,
    periodDaysCount: periodDays(oldCycle),
    remainingDays: 0,
    oldPlan,
    newPlan: target.plan,
    oldPeriodAmount: oldAmount,
    newPeriodAmount: newAmount,
  };

  // Nothing meaningful changed.
  if (target.plan === oldPlan && !cycleChanged && !target.modulesChanged && !priceChanged) {
    return base;
  }

  // Trial: the paid subscription has not started yet, just preconfigure the plan.
  if (center.status === 'trial') {
    return { ...base, mode: 'trial_preconfig' };
  }

  // Changing the billing cycle is treated as a conversion / renewal: the new
  // cycle needs a full period from the current subscription boundary.
  if (cycleChanged) {
    return { ...base, mode: 'renewal' };
  }

  const periodEnd = Number(center.subscriptionEndsAt) || 0;

  // Outside an active paid window (overdue, expired, no end date) → a plan
  // change here is really "renew with this plan": start a fresh period.
  if (!(center.status === 'active') || periodEnd <= now || !periodEnd) {
    return { ...base, mode: 'renewal' };
  }

  // Inside the current paid window.
  const days = periodDays(oldCycle);
  const start = periodEnd - days * DAY_MS;
  const remainingMs = periodEnd - now;
  const remainingDays = Math.min(days, Math.max(1, Math.ceil(remainingMs / DAY_MS)));

  const mid: PlanChangeEvaluation = {
    ...base,
    mode: 'no_change',
    periodStart: start,
    periodEnd,
    periodDaysCount: days,
    remainingDays,
  };

  if (priceChanged) {
    mid.mode = newAmount > oldAmount ? 'mid_period_increase' : 'mid_period_decrease';
  } else {
    mid.mode = 'mid_period_same_price';
  }
  return mid;
}

/**
 * Prorated settlement for a mid-period price increase.
 *
 * paid = true  → the current window was already invoiced & paid at the old
 *                price: bill only the difference over the remaining days.
 * paid = false → the window is not paid yet: cancel the pending old invoices
 *                and bill the whole remaining window at the new price.
 */
export function upgradeSettlement(
  evaluation: PlanChangeEvaluation,
  paid: boolean,
  now = Date.now()
): { amount: number; remainingDays: number; paid: boolean } | null {
  if (evaluation.mode !== 'mid_period_increase') return null;
  const { remainingDays } = evaluation;
  const frac = remainingDays / evaluation.periodDaysCount;
  const amount = round2(paid
    ? (evaluation.newPeriodAmount - evaluation.oldPeriodAmount) * frac
    : evaluation.newPeriodAmount * frac);
  return { amount: Math.max(0, amount), remainingDays, paid };
}

/** Days the current subscription window spans (30 or 365) plus inferred start. */
export function subscriptionWindow(
  center: CenterBillingSnapshot
): { start: number; end: number; days: number } | null {
  const end = Number(center.subscriptionEndsAt);
  if (!end) return null;
  const days = periodDays((center.billingCycle as BillingCycle) || 'monthly');
  return { start: end - days * DAY_MS, end, days };
}
