import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  analyzePlanChange,
  displayPlan,
  periodAmount,
  round2,
  storagePlan,
} from './planChange';
import { ANNUAL_DISCOUNT, derivePlanFromModules, totalForCycle, modulesPrice } from './pricing';

const start = Date.UTC(2026, 8, 14); // 14 Sep 2026
const end = start + 30 * DAY_MS; // 14 Oct 2026
const at = Date.UTC(2026, 8, 21); // 21 Sep 2026

// Module prices used by the tariff computation
const modulePrices: Record<string, number> = {
  scolaire: 20,
  finance: 20,
  etude: 15,
  revision: 15,
  studentTimeSheets: 0,
};

const basicCenter = {
  plan: 'starter',
  billingCycle: 'monthly' as const,
  monthlyPrice: 40, // scolaire + finance
  enabledModules: ['scolaire', 'finance', 'studentTimeSheets'],
  status: 'active',
  subscriptionEndsAt: end,
};

describe('planChange utils (frontend mirror)', () => {
  it('maps storage plan values to display values', () => {
    expect(displayPlan('starter')).toBe('basic');
    expect(displayPlan('growth')).toBe('growth');
    expect(displayPlan(undefined)).toBe('basic');
    expect(storagePlan('basic')).toBe('starter');
    expect(storagePlan('growth')).toBe('growth');
  });

  it('computes per-period amounts with the annual discount', () => {
    expect(periodAmount('basic', 'monthly', ['scolaire', 'finance', 'studentTimeSheets'], modulePrices)).toBe(40);
    expect(periodAmount('growth', 'monthly', ['scolaire', 'finance', 'etude', 'studentTimeSheets'], modulePrices)).toBe(55);
    expect(periodAmount('growth', 'annual', ['scolaire', 'finance', 'etude', 'studentTimeSheets'], modulePrices)).toBeCloseTo(55 * 12 * 0.8, 2);
    expect(periodAmount('custom', 'monthly', [], modulePrices, 99)).toBe(99);
  });

  it('detects the user scenario: mid-period upgrade from paid Basic', () => {
    const decision = analyzePlanChange(basicCenter, {
      plan: 'growth',
      billingCycle: 'monthly',
      enabledModules: ['scolaire', 'finance', 'etude', 'studentTimeSheets'],
    }, modulePrices, at);

    expect(decision.kind).toBe('mid_period_increase');
    if (decision.kind === 'mid_period_increase') {
      expect(decision.remainingDays).toBe(23);
      expect(decision.paidAmount).toBeCloseTo((55 - 40) * 23 / 30, 2); // 11.50
      expect(decision.unpaidAmount).toBeCloseTo(55 * 23 / 30, 2); // 34.50
      expect(decision.periodEnd).toBe(end);
    }
  });

  it('flags a mid-period decrease', () => {
    const decision = analyzePlanChange({
      ...basicCenter,
      plan: 'growth',
      monthlyPrice: 55,
      enabledModules: ['scolaire', 'finance', 'etude', 'studentTimeSheets'],
    }, {
      plan: 'basic',
      billingCycle: 'monthly',
      enabledModules: ['scolaire', 'finance', 'studentTimeSheets'],
    }, modulePrices, at);
    expect(decision.kind).toBe('mid_period_decrease');
  });

  it('returns no_change when nothing changed', () => {
    const decision = analyzePlanChange(basicCenter, {
      plan: 'basic',
      billingCycle: 'monthly',
      enabledModules: ['scolaire', 'finance', 'studentTimeSheets'],
    }, modulePrices, at);
    expect(decision.kind).toBe('no_change');
  });

  it('treats equal-price plan label changes as same-price (no invoice)', () => {
    const decision = analyzePlanChange(basicCenter, {
      plan: 'growth',
      billingCycle: 'monthly',
      enabledModules: ['scolaire', 'finance', 'studentTimeSheets'],
    }, modulePrices, at);
    expect(decision.kind).toBe('mid_period_same_price');
  });

  it('returns renewal when the window is over or cycle changes', () => {
    const overdue = analyzePlanChange({ ...basicCenter, subscriptionEndsAt: start - 1 }, {
      plan: 'growth', billingCycle: 'monthly', enabledModules: ['scolaire', 'finance', 'etude', 'studentTimeSheets'],
    }, modulePrices, at);
    expect(overdue.kind).toBe('renewal');

    const cycleChange = analyzePlanChange(basicCenter, {
      plan: 'basic', billingCycle: 'annual', enabledModules: ['scolaire', 'finance', 'studentTimeSheets'],
    }, modulePrices, at);
    expect(cycleChange.kind).toBe('renewal');
  });

  it('rounds to two decimals', () => {
    expect(round2(11.505)).toBe(11.51);
  });
});

describe('periodAmount — cohérence avec le simulateur et la console', () => {
  const prices: Record<string, number> = { scolaire: 50, finance: 40, etude: 30 };

  it('applies the same 20 % annual discount as the renewal simulator', () => {
    const monthly = periodAmount('basic', 'monthly', ['scolaire', 'finance'], prices);
    expect(monthly).toBe(90);
    // 90 × 12 = 1080, remisé de 20 % → 864. Le montant réellement facturé
    // doit être exactement celui que le simulateur a annoncé au centre.
    expect(periodAmount('basic', 'annual', ['scolaire', 'finance'], prices)).toBe(864);
    expect(totalForCycle(monthly, 'annual')).toBe(864);
    expect(ANNUAL_DISCOUNT).toBe(0.2);
  });

  it('prices the offer the simulator derives from the ticked modules', () => {
    // Base seule → Basic ; un module de plus → Growth ; tous → Pro.
    expect(derivePlanFromModules(['scolaire', 'finance'])).toBe('starter');
    expect(derivePlanFromModules(['scolaire', 'finance', 'etude'])).toBe('growth');
    expect(periodAmount('growth', 'monthly', ['scolaire', 'finance', 'etude'], prices))
      .toBe(modulesPrice(['scolaire', 'finance', 'etude'], prices));
  });

  it('never discounts a monthly period', () => {
    expect(periodAmount('basic', 'monthly', ['scolaire', 'finance'], prices))
      .toBe(totalForCycle(90, 'monthly'));
  });
});
