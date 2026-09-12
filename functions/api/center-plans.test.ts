import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet, onRequestPost } from './center-plans';

vi.mock('./_lib', () => ({
  validateSession: vi.fn(async () => ({ role: 'platform_super_admin' })),
  readBody: vi.fn(async (request: Request) => request.json()),
  json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
}));

const DAY = 86400000;

interface CenterRow {
  id: string;
  status: string;
  plan: string;
  billing_cycle: string;
  monthly_price: number;
  subscription_ends_at: number | null;
  trial_ends_at: number | null;
  enabled_modules: string;
}

function makeDb(center: CenterRow | null, opts: { windowPaid?: boolean; noSchedules?: boolean; noHistory?: boolean; modulePrices?: Array<{ module_key: string; price: number }> } = {}) {
  const calls: Array<{ sql: string; args: any[] }> = [];
  return {
    calls,
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            async first(): Promise<any> {
              if (sql.includes('FROM centers WHERE id = ?')) return center;
              if (sql.includes('center_invoices') && sql.includes("status = 'paid'")) {
                return opts.windowPaid ? { id: 'paid-1' } : null;
              }
              return null;
            },
            async all(): Promise<{ results: any[] }> {
              if (opts.noSchedules && sql.includes('center_plan_schedules')) {
                throw new Error('D1_ERROR: no such table: center_plan_schedules');
              }
              if (opts.noHistory && sql.includes('center_plan_history')) {
                throw new Error('D1_ERROR: no such table: center_plan_history');
              }
              if (sql.includes('module_prices')) {
                return { results: opts.modulePrices || [{ module_key: 'scolaire', price: 45 }, { module_key: 'finance', price: 30 }] };
              }
              if (sql.includes('FROM center_invoices')) {
                return {
                  results: [{
                    id: 'inv-1', invoice_number: 'INV-OLD', period_start: Date.now() - 10 * DAY,
                    period_end: Date.now() + 20 * DAY, amount: 60, status: 'pending',
                    payment_method: null, payment_date: null, cheque_number: null, created_at: Date.now(),
                  }],
                };
              }
              if (sql.includes('FROM center_plan_schedules')) {
                return {
                  results: [{
                    id: 'sch-1', to_plan: 'pro', to_billing_cycle: 'monthly', to_monthly_price: 120,
                    apply_at: Date.now() + 20 * DAY, notes: 'x', created_at: Date.now(),
                  }],
                };
              }
              return { results: [] };
            },
            async run() {
              if (opts.noSchedules && sql.includes('center_plan_schedules')) {
                throw new Error('D1_ERROR: no such table: center_plan_schedules');
              }
              if (opts.noHistory && sql.includes('center_plan_history')) {
                throw new Error('D1_ERROR: no such table: center_plan_history');
              }
              calls.push({ sql, args });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

function post(body: Record<string, unknown>, db: any) {
  const request = new Request('https://example.test/api/center-plans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return onRequestPost({ env: { DB: db }, request } as any);
}

const ACTIVE_UNPAID: CenterRow = {
  id: 'c1', status: 'active', plan: 'starter', billing_cycle: 'monthly', monthly_price: 60,
  subscription_ends_at: Date.now() + 20 * DAY, trial_ends_at: null,
  enabled_modules: '["scolaire","finance","studentTimeSheets"]',
};
const ACTIVE_PAID: CenterRow = { ...ACTIVE_UNPAID, monthly_price: 75 };
const STARTS_TODAY: CenterRow = {
  ...ACTIVE_UNPAID,
  subscription_ends_at: Date.now() + 30 * DAY, // window start = today
};
const EXPIRED: CenterRow = {
  id: 'c4', status: 'expired', plan: 'starter', billing_cycle: 'monthly', monthly_price: 60,
  subscription_ends_at: Date.now() - 5 * DAY, trial_ends_at: null,
  enabled_modules: '["scolaire","finance","studentTimeSheets"]',
};
const TRIAL: CenterRow = {
  id: 'c2', status: 'trial', plan: 'starter', billing_cycle: 'monthly', monthly_price: 0,
  subscription_ends_at: null, trial_ends_at: Date.now() + 5 * DAY,
  enabled_modules: '["scolaire","finance","studentTimeSheets"]',
};

beforeEach(() => { vi.clearAllMocks(); });

describe('center-plans POST — set-plan', () => {
  it('unpaid window: replaces the pending invoice and restarts the period (no new plan on top)', async () => {
    const db = makeDb(ACTIVE_UNPAID, { windowPaid: false });
    const res = await post({ action: 'set-plan', centerId: 'c1', plan: 'basic', billingCycle: 'monthly' }, db);
    const data = await res.json() as any;

    expect(data.mode).toBe('replaced');
    const cancel = db.calls.find((c: any) => c.sql.includes("UPDATE center_invoices SET status = 'cancelled'"));
    expect(cancel).toBeTruthy();
    const insert = db.calls.find((c: any) => c.sql.includes('INSERT INTO center_invoices'));
    expect(insert).toBeTruthy();
    expect(insert.args[5]).toBeCloseTo(75, 2); // new period amount (45+30), old 60 TND invoice replaced
    expect(data.invoice.amount).toBeCloseTo(75, 2);
    const centersUpdate = db.calls.find((c: any) => c.sql.includes('UPDATE centers'));
    expect(centersUpdate.args[0]).toBe('starter');
    // Exactly ONE invoice row written (replace, not accumulate).
    expect(db.calls.filter((c: any) => c.sql.includes('INSERT INTO center_invoices'))).toHaveLength(1);
  });

  it('paid window: never touches the paid invoice — schedules for the period end instead', async () => {
    const db = makeDb(ACTIVE_PAID, { windowPaid: true });
    const res = await post({ action: 'set-plan', centerId: 'c1', plan: 'growth', billingCycle: 'annual' }, db);
    const data = await res.json() as any;

    expect(data.mode).toBe('scheduled');
    expect(data.applyAt).toBe(ACTIVE_PAID.subscription_ends_at);
    expect(db.calls.some((c: any) => c.sql.includes('UPDATE center_invoices'))).toBe(false);
    expect(db.calls.some((c: any) => c.sql.includes('INSERT INTO center_invoices'))).toBe(false);
    expect(db.calls.some((c: any) => c.sql.includes('INSERT INTO center_plan_schedules'))).toBe(true);
  });

  it('mode=scheduled always defers, even with an unpaid window', async () => {
    const db = makeDb(ACTIVE_UNPAID, { windowPaid: false });
    const res = await post({ action: 'set-plan', mode: 'scheduled', centerId: 'c1', plan: 'pro', billingCycle: 'monthly' }, db);
    const data = await res.json() as any;
    expect(data.mode).toBe('scheduled');
    expect(db.calls.some((c: any) => c.sql.includes('INSERT INTO center_invoices'))).toBe(false);
  });

  it('trial center: activating starts the paid window at the trial end and creates one pending invoice', async () => {
    const db = makeDb(TRIAL, { windowPaid: false });
    const res = await post({ action: 'set-plan', centerId: 'c2', plan: 'basic', billingCycle: 'monthly' }, db);
    const data = await res.json() as any;

    expect(data.mode).toBe('activated');
    expect(data.invoice).toBeTruthy();
    const centersUpdate = db.calls.find((c: any) => c.sql.includes('UPDATE centers'));
    expect(centersUpdate.sql).toContain("status = 'active'");
    // period starts at the trial end (no days of trial wasted) and lasts 30 days
    const insert = db.calls.find((c: any) => c.sql.includes('INSERT INTO center_invoices'))!;
    expect(insert.args[4] - insert.args[3]).toBe(30 * DAY);
  });

  it('custom plan honors the manual price', async () => {
    const db = makeDb(ACTIVE_UNPAID, { windowPaid: false });
    const res = await post({ action: 'set-plan', centerId: 'c1', plan: 'custom', billingCycle: 'monthly', monthlyPrice: 42.5 }, db);
    const data = await res.json() as any;
    expect(data.amount).toBeCloseTo(42.5, 2);
  });

  it('rejects unknown plans', async () => {
    const db = makeDb(ACTIVE_UNPAID);
    const res = await post({ action: 'set-plan', centerId: 'c1', plan: 'diamond' }, db);
    expect(res.status).toBe(400);
  });

  it('pro preset excludes the dormant Bibliothèque module from grant and billing', async () => {
    const db = makeDb(TRIAL, {
      windowPaid: false,
      modulePrices: [
        { module_key: 'scolaire', price: 45 },
        { module_key: 'finance', price: 30 },
        { module_key: 'etude', price: 30 },
        { module_key: 'bibliotheque', price: 12 },
      ],
    });
    const res = await post({ action: 'set-plan', centerId: 'c2', plan: 'pro', billingCycle: 'monthly' }, db);
    const data = await res.json() as any;
    expect(data.mode).toBe('activated');

    const centersUpdate = db.calls.find((c: any) => c.sql.includes('UPDATE centers'))!;
    const modulesJson = centersUpdate.args.find((a: any) => typeof a === 'string' && a.includes('scolaire'));
    const storedModules = JSON.parse(modulesJson);
    expect(storedModules).not.toContain('bibliotheque');
    expect(storedModules).toContain('etude');

    // 45 + 30 + 30 : les 12 TND de Bibliothèque ne sont pas facturés.
    const insert = db.calls.find((c: any) => c.sql.includes('INSERT INTO center_invoices'))!;
    expect(insert.args[5]).toBeCloseTo(105, 2);
    expect(data.invoice.amount).toBeCloseTo(105, 2);
  });
});

describe('center-plans POST — removals', () => {
  it('remove-plan voids unpaid invoices, cancels schedules and expires the center', async () => {
    const db = makeDb(ACTIVE_UNPAID);
    const res = await post({ action: 'remove-plan', centerId: 'c1' }, db);
    const data = await res.json() as any;
    expect(data.mode).toBe('plan_removed');
    expect(db.calls.some((c: any) => c.sql.includes("UPDATE center_invoices SET status = 'cancelled' WHERE center_id = ? AND status IN ('pending','overdue')"))).toBe(true);
    expect(db.calls.some((c: any) => c.sql.includes("UPDATE center_plan_schedules SET status = 'cancelled' WHERE center_id = ? AND status = 'pending'"))).toBe(true);
    expect(db.calls.some((c: any) => c.sql.includes("UPDATE centers SET status = 'expired'"))).toBe(true);
    // Paid history untouched: no invoice INSERT/UPDATE targeting paid rows.
    expect(db.calls.some((c: any) => c.sql.includes('INSERT INTO center_invoices'))).toBe(false);
  });

  it('remove-schedule cancels only the selected schedule', async () => {
    const db = makeDb(ACTIVE_UNPAID);
    const res = await post({ action: 'remove-schedule', centerId: 'c1', scheduleId: 'sch-1' }, db);
    expect(((await res.json()) as any).success).toBe(true);
    const cancel = db.calls.find((c: any) => c.sql.includes('UPDATE center_plan_schedules SET status = \'cancelled\''))!;
    expect(cancel.args).toEqual(['sch-1', 'c1']);
  });
});

describe('center-plans GET', () => {
  it('returns center, invoices and pending schedules for the manager', async () => {
    const db = makeDb(ACTIVE_UNPAID);
    const request = new Request('https://example.test/api/center-plans?centerId=c1');
    const res = await onRequestGet({ env: { DB: db }, request } as any);
    const data = await res.json() as any;
    expect(data.center.id).toBe('c1');
    expect(data.invoices[0].invoiceNumber).toBe('INV-OLD');
    expect(data.schedules[0].plan).toBe('pro');
  });

  it('404 on unknown center', async () => {
    const db = makeDb(null);
    const request = new Request('https://example.test/api/center-plans?centerId=nope');
    const res = await onRequestGet({ env: { DB: db }, request } as any);
    expect(res.status).toBe(404);
  });
});

describe('center-plans POST — add-trial (free days)', () => {
  it('mid-period: days are appended at the END and the unpaid invoice is stretched', async () => {
    const db = makeDb(ACTIVE_UNPAID);
    const res = await post({ action: 'add-trial', centerId: 'c1', days: 7 }, db);
    const data = await res.json() as any;
    expect(data.mode).toBe('trial_added');
    expect(data.placement).toBe('end');

    const centersUpd = db.calls.find((c: any) => c.sql.includes('UPDATE centers'));
    expect(centersUpd.args[0]).toBe(ACTIVE_UNPAID.subscription_ends_at! + 7 * DAY);
    // The pending invoice covering the window end gets the extra days, same amount.
    const inv = db.calls.find((c: any) => c.sql.includes('UPDATE center_invoices SET period_end = period_end + ?'));
    expect(inv).toBeTruthy();
    expect(inv.args[0]).toBe(7 * DAY);
    expect(inv.args[2]).toBe(ACTIVE_UNPAID.subscription_ends_at);
    // No new invoice, nothing cancelled — the period is just stretched.
    expect(db.calls.some((c: any) => c.sql.includes('INSERT INTO center_invoices'))).toBe(false);
    expect(db.calls.some((c: any) => c.sql.includes("SET status = 'cancelled'"))).toBe(false);
    // A plan scheduled for the old period end follows the window to its new end.
    const sched = db.calls.find((c: any) => c.sql.includes('UPDATE center_plan_schedules SET apply_at = apply_at + ?'));
    expect(sched.args[0]).toBe(7 * DAY);
    expect(sched.args[2]).toBe(ACTIVE_UNPAID.subscription_ends_at);
  });

  it('add-trial prepending also pushes a scheduled plan past the new end', async () => {
    const db = makeDb(STARTS_TODAY);
    await post({ action: 'add-trial', centerId: 'c1', days: 4 }, db);
    const sched = db.calls.find((c: any) => c.sql.includes('UPDATE center_plan_schedules SET apply_at = apply_at + ?'));
    expect(sched.args[0]).toBe(4 * DAY);
    expect(sched.args[2]).toBe(STARTS_TODAY.subscription_ends_at);
  });

  it('plan starting today: days are added at the START — pending invoice pushed back', async () => {
    const db = makeDb(STARTS_TODAY);
    const res = await post({ action: 'add-trial', centerId: 'c1', days: 5 }, db);
    const data = await res.json() as any;
    expect(data.placement).toBe('start');

    const inv = db.calls.find((c: any) => c.sql.includes('UPDATE center_invoices SET period_start = period_start + ?'));
    expect(inv).toBeTruthy();
    expect(inv.args[0]).toBe(5 * DAY);
    expect(inv.args[1]).toBe(5 * DAY);
    const centersUpd = db.calls.find((c: any) => c.sql.includes('UPDATE centers'));
    expect(centersUpd.args[0]).toBe(STARTS_TODAY.subscription_ends_at! + 5 * DAY);
    expect(data.message).toContain('au début');
  });

  it('trial center: the ongoing trial is extended, billing shifts later', async () => {
    const db = makeDb(TRIAL);
    const res = await post({ action: 'add-trial', centerId: 'c2', days: 10 }, db);
    const data = await res.json() as any;
    expect(data.placement).toBe('start');
    expect(data.message).toContain('Essai prolongé');
    const centersUpd = db.calls.find((c: any) => c.sql.includes('UPDATE centers'));
    expect(centersUpd.args[1]).toBe(TRIAL.trial_ends_at! + 10 * DAY);
  });

  it('without a live subscription or trial → 400 (must activate a plan first)', async () => {
    const db = makeDb(EXPIRED);
    const res = await post({ action: 'add-trial', centerId: 'c4', days: 5 }, db);
    expect(res.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects invalid day counts', async () => {
    const db = makeDb(ACTIVE_UNPAID);
    expect((await post({ action: 'add-trial', centerId: 'c1', days: 0 }, db)).status).toBe(400);
    expect((await post({ action: 'add-trial', centerId: 'c1', days: 4000 }, db)).status).toBe(400);
  });
});

describe('center-plans — expired center back to active', () => {
  it('set-plan on an expired center re-activates it with a fresh window + one pending invoice', async () => {
    const db = makeDb(EXPIRED, { windowPaid: false });
    const res = await post({ action: 'set-plan', centerId: 'c4', plan: 'basic', billingCycle: 'monthly' }, db);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    const centersUpd = db.calls.find((c: any) => c.sql.includes('UPDATE centers'));
    expect(centersUpd.sql).toContain("status = 'active'");
    expect(centersUpd.args[4]).toBeGreaterThan(Date.now()); // subscription ends in the future
    const insert = db.calls.find((c: any) => c.sql.includes('INSERT INTO center_invoices'));
    expect(insert).toBeTruthy();
    expect(data.invoice).toBeTruthy();
  });
});

describe('center-plans — resilience when migration 0027 is not applied', () => {
  it('GET still answers (schedules list degrades to empty)', async () => {
    const db = makeDb(ACTIVE_UNPAID, { noSchedules: true });
    const request = new Request('https://example.test/api/center-plans?centerId=c1');
    const res = await onRequestGet({ env: { DB: db }, request } as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.schedules).toEqual([]);
    expect(data.invoices.length).toBeGreaterThan(0);
  });

  it('remove-plan expires the center even though schedules cannot be cancelled', async () => {
    const db = makeDb(ACTIVE_UNPAID, { noSchedules: true });
    const res = await post({ action: 'remove-plan', centerId: 'c1' }, db);
    expect(res.status).toBe(200);
    expect(db.calls.some((c: any) => c.sql.includes("UPDATE centers SET status = 'expired'"))).toBe(true);
  });

  it('scheduling a paid-window change FAILS loudly instead of applying it and losing paid days', async () => {
    const db = makeDb(ACTIVE_PAID, { windowPaid: true, noSchedules: true });
    const res = await post({ action: 'set-plan', centerId: 'c1', plan: 'growth', billingCycle: 'annual' }, db);
    expect(res.status).toBe(503);
    const data = await res.json() as any;
    expect(data.error).toContain('0027');
    // No center write, no invoice write.
    expect(db.calls.filter((c: any) => c.sql.includes('UPDATE centers'))).toHaveLength(0);
    expect(db.calls.filter((c: any) => c.sql.includes('center_invoices'))).toHaveLength(0);
  });
});

const historyCalls = (db: any, action: string) => db.calls.filter(
  (c: any) => c.sql.includes('INSERT INTO center_plan_history') && c.args.includes(action)
);

describe('center-plans — plan history audit trail', () => {
  it('set-plan (immediate) logs plan_set with the invoice number', async () => {
    const db = makeDb(ACTIVE_UNPAID, { windowPaid: false });
    const res = await post({ action: 'set-plan', centerId: 'c1', plan: 'basic', billingCycle: 'monthly' }, db);
    const data = await res.json() as any;
    const hist = historyCalls(db, 'plan_set');
    expect(hist).toHaveLength(1);
    expect(hist[0].args.join(' ')).toContain(data.invoice.invoiceNumber);
    expect(hist[0].args.join(' ')).toContain('75.00 TND');
  });

  it('trial activation logs plan_activated; scheduling logs plan_scheduled', async () => {
    const db = makeDb(TRIAL, { windowPaid: false });
    await post({ action: 'set-plan', centerId: 'c2', plan: 'growth', billingCycle: 'monthly' }, db);
    expect(historyCalls(db, 'plan_activated')).toHaveLength(1);

    const db2 = makeDb(ACTIVE_PAID, { windowPaid: true });
    await post({ action: 'set-plan', centerId: 'c1', plan: 'pro', billingCycle: 'monthly' }, db2);
    expect(historyCalls(db2, 'plan_scheduled')).toHaveLength(1);
  });

  it('remove-plan logs plan_removed…', async () => {
    const db = makeDb(ACTIVE_UNPAID);
    await post({ action: 'remove-plan', centerId: 'c1' }, db);
    expect(historyCalls(db, 'plan_removed')).toHaveLength(1);
  });

  it('…but refuses to remove an already-expired center (stale UI protection)', async () => {
    const db = makeDb(EXPIRED);
    const res = await post({ action: 'remove-plan', centerId: 'c4' }, db);
    expect(res.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('add-trial logs trial_added with the placement', async () => {
    const db = makeDb(ACTIVE_UNPAID);
    await post({ action: 'add-trial', centerId: 'c1', days: 7 }, db);
    const hist = historyCalls(db, 'trial_added');
    expect(hist).toHaveLength(1);
    expect(hist[0].args.join(' ')).toContain('en fin de période');
  });

  it('a missing history table never breaks the mutation, and GET degrades to []', async () => {
    const db = makeDb(ACTIVE_UNPAID, { windowPaid: false, noHistory: true });
    const res = await post({ action: 'set-plan', centerId: 'c1', plan: 'basic', billingCycle: 'monthly' }, db);
    expect(res.status).toBe(200);

    const request = new Request('https://example.test/api/center-plans?centerId=c1');
    const get = await onRequestGet({ env: { DB: makeDb(ACTIVE_UNPAID, { noHistory: true }) }, request } as any);
    expect(get.status).toBe(200);
    expect((await get.json() as any).history).toEqual([]);
  });
});
