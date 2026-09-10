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

function makeDb(center: CenterRow | null, opts: { windowPaid?: boolean } = {}) {
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
              if (sql.includes('module_prices')) {
                return { results: [{ module_key: 'scolaire', price: 45 }, { module_key: 'finance', price: 30 }] };
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
