import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  evaluatePlanChange,
  isInsidePaidPeriod,
  planLabel,
  periodDays,
  round2,
  subscriptionWindow,
  upgradeSettlement,
} from './planLogic';

// ---------------------------------------------------------------------------
// planLabel / periodDays / round2
// ---------------------------------------------------------------------------
describe('plan helpers', () => {
  it('maps storage plan values to labels', () => {
    expect(planLabel('starter')).toBe('Basic');
    expect(planLabel('growth')).toBe('Growth');
    expect(planLabel('pro')).toBe('Pro');
    expect(planLabel('custom')).toBe('Custom');
  });

  it('computes period days from billing cycle', () => {
    expect(periodDays('monthly')).toBe(30);
    expect(periodDays('annual')).toBe(365);
  });

  it('rounds to two decimals', () => {
    expect(round2(11.49999)).toBe(11.5);
    expect(round2(34.5)).toBe(34.5);
    expect(round2(1.005)).toBe(1.01);
  });
});

// ---------------------------------------------------------------------------
// isInsidePaidPeriod
// ---------------------------------------------------------------------------
describe('isInsidePaidPeriod', () => {
  const now = 1_700_000_000_000;
  it('true for an active center whose subscription ends in the future', () => {
    expect(isInsidePaidPeriod({ status: 'active', subscriptionEndsAt: now + DAY_MS }, now)).toBe(true);
  });
  it('false for trial / expired / overdue / no end date', () => {
    expect(isInsidePaidPeriod({ status: 'trial', subscriptionEndsAt: now + DAY_MS }, now)).toBe(false);
    expect(isInsidePaidPeriod({ status: 'expired', subscriptionEndsAt: now + DAY_MS }, now)).toBe(false);
    expect(isInsidePaidPeriod({ status: 'active', subscriptionEndsAt: now - 1 }, now)).toBe(false);
    expect(isInsidePaidPeriod({ status: 'active', subscriptionEndsAt: null }, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluatePlanChange — the user's scenario:
//   14-day trial, then paid Basic 30 TND (14 Sep → 14 Oct, 30-day window).
//   On 21 Sep (7 days used, 23 left) he moves to Growth 45 TND.
// ---------------------------------------------------------------------------
describe('evaluatePlanChange', () => {
  const start = Date.UTC(2026, 8, 14); // 14 Sep 2026
  const end = start + 30 * DAY_MS; // 14 Oct 2026
  const at = Date.UTC(2026, 8, 21); // 21 Sep 2026

  const basicCenter = {
    status: 'active',
    plan: 'starter',
    billingCycle: 'monthly' as const,
    monthlyPrice: 30,
    subscriptionEndsAt: end,
  };

  it('recognizes a mid-period upgrade and keeps the window intact', () => {
    const evalResult = evaluatePlanChange(basicCenter, { plan: 'growth', billingCycle: 'monthly', periodAmount: 45, modulesChanged: true }, at);
    expect(evalResult.mode).toBe('mid_period_increase');
    expect(evalResult.periodEnd).toBe(end);
    expect(evalResult.periodStart).toBe(start);
    expect(evalResult.remainingDays).toBe(23);
    expect(evalResult.periodDaysCount).toBe(30);
    expect(evalResult.oldPeriodAmount).toBe(30);
    expect(evalResult.newPeriodAmount).toBe(45);
  });

  it('suggests no plan change when nothing changed', () => {
    const evalResult = evaluatePlanChange(basicCenter, { plan: 'starter', billingCycle: 'monthly', periodAmount: 30, modulesChanged: false }, at);
    expect(evalResult.mode).toBe('no_change');
  });

  it('handles a mid-period downgrade', () => {
    const growthCenter = { ...basicCenter, plan: 'growth', monthlyPrice: 45 };
    const evalResult = evaluatePlanChange(growthCenter, { plan: 'starter', billingCycle: 'monthly', periodAmount: 30, modulesChanged: true }, at);
    expect(evalResult.mode).toBe('mid_period_decrease');
    expect(evalResult.remainingDays).toBe(23);
  });

  it('treats equal-price changes (label only) as same price', () => {
    const evalResult = evaluatePlanChange(basicCenter, { plan: 'growth', billingCycle: 'monthly', periodAmount: 30, modulesChanged: false }, at);
    expect(evalResult.mode).toBe('mid_period_same_price');
  });

  it('a plan change while still in trial is a preconfiguration', () => {
    const trialCenter = { ...basicCenter, status: 'trial', trialEndsAt: end, subscriptionEndsAt: null };
    const evalResult = evaluatePlanChange(trialCenter, { plan: 'growth', billingCycle: 'monthly', periodAmount: 45, modulesChanged: true }, at);
    expect(evalResult.mode).toBe('trial_preconfig');
  });

  it('a plan change after the period ended is a renewal', () => {
    const overdueCenter = { ...basicCenter, subscriptionEndsAt: start - 1 };
    const evalResult = evaluatePlanChange(overdueCenter, { plan: 'growth', billingCycle: 'monthly', periodAmount: 45, modulesChanged: true }, at);
    expect(evalResult.mode).toBe('renewal');
  });

  it('a billing-cycle change is a renewal/conversion', () => {
    const evalResult = evaluatePlanChange(basicCenter, { plan: 'starter', billingCycle: 'annual', periodAmount: 288, modulesChanged: false }, at);
    expect(evalResult.mode).toBe('renewal');
  });
});

// ---------------------------------------------------------------------------
// upgradeSettlement — paid vs unpaid
// ---------------------------------------------------------------------------
describe('upgradeSettlement', () => {
  const start = Date.UTC(2026, 8, 14);
  const end = start + 30 * DAY_MS;
  const at = Date.UTC(2026, 8, 21);

  const evaluation = evaluatePlanChange(
    { status: 'active', plan: 'starter', billingCycle: 'monthly', monthlyPrice: 30, subscriptionEndsAt: end },
    { plan: 'growth', billingCycle: 'monthly', periodAmount: 45, modulesChanged: true },
    at
  );

  it('paid → only the difference on the remaining days', () => {
    const s = upgradeSettlement(evaluation, true, at);
    expect(s).not.toBeNull();
    expect(s!.amount).toBeCloseTo((45 - 30) * 23 / 30, 2); // 11.50
    expect(s!.remainingDays).toBe(23);
    expect(s!.paid).toBe(true);
  });

  it('unpaid → the whole remaining window at the new price', () => {
    const s = upgradeSettlement(evaluation, false, at);
    expect(s).not.toBeNull();
    expect(s!.amount).toBeCloseTo(45 * 23 / 30, 2); // 34.50
    expect(s!.paid).toBe(false);
  });

  it('returns null when the mode is not an increase', () => {
    const nonUpgrade = { ...evaluation, mode: 'mid_period_decrease' as const };
    expect(upgradeSettlement(nonUpgrade, true, at)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// subscriptionWindow
// ---------------------------------------------------------------------------
describe('subscriptionWindow', () => {
  it('infers start from end minus period', () => {
    const end = Date.UTC(2026, 8, 14);
    const win = subscriptionWindow({ status: 'active', billingCycle: 'monthly', subscriptionEndsAt: end });
    expect(win).toEqual({ start: end - 30 * DAY_MS, end, days: 30 });
  });

  it('returns null when no end date', () => {
    expect(subscriptionWindow({ status: 'active', subscriptionEndsAt: null })).toBeNull();
  });
});
