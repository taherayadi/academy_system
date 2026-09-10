import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet, onRequestPatch } from './platform-billing';

vi.mock('./_lib', () => ({
  validateSession: vi.fn(async () => ({ role: 'platform_super_admin' })),
  readBody: vi.fn(async (request: Request) => request.json()),
  json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
}));

interface InvoiceRow {
  id: string;
  status: string;
  payment_method: string | null;
  payment_date: number | null;
  cheque_number: string | null;
  cheque_date: number | null;
  notes: string | null;
}

let rows: InvoiceRow[] = [];

function makeDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          const bound = { sql, args };
          return {
            async first(): Promise<any> {
              if (bound.sql.includes('SELECT status')) {
                const id = bound.args[0] as string;
                const row = rows.find(r => r.id === id);
                return row ? { status: row.status, payment_date: row.payment_date } : null;
              }
              return null;
            },
            async run(): Promise<{ meta: { changes: number } }> {
              if (bound.sql.includes('UPDATE center_invoices')) {
                const setPart = bound.sql.split(' SET ')[1].split(' WHERE ')[0];
                const cols = Array.from(setPart.matchAll(/([a-z_]+)\s*=\s*\?/g), m => m[1]);
                const values = bound.args.slice(0, bound.args.length - 1);
                const id = bound.args[bound.args.length - 1] as string;
                const row = rows.find(r => r.id === id);
                if (!row) return { meta: { changes: 0 } };
                cols.forEach((col, i) => { (row as any)[col] = values[i] ?? null; });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
            async all(): Promise<{ results: any[] }> {
              return { results: rows.map(r => ({ ...r })) };
            },
          };
        },
      };
    },
  };
}

function patch(body: Record<string, unknown>) {
  const request = new Request('https://example.test/api/platform-billing', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return onRequestPatch({ env: { DB: makeDb() }, request } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
});

const INV = 'invoice-1';
const paidAt = 1_700_000_000_000;

function seed(partial: Partial<InvoiceRow> = {}): void {
  rows.push({
    id: INV,
    status: 'pending',
    payment_method: null,
    payment_date: null,
    cheque_number: null,
    cheque_date: null,
    notes: '',
    ...partial,
  });
}

describe('platform-billing PATCH — revenue & cheque rules', () => {
  it('marks a pending invoice paid and stamps payment_date (becomes revenue)', async () => {
    seed({ status: 'pending', payment_method: 'cash' });
    const res = await patch({ id: INV, status: 'paid', paymentMethod: 'cash' });
    expect(res.status).toBe(200);
    expect(rows[0].status).toBe('paid');
    expect(rows[0].payment_date).toBeTypeOf('number');
  });

  it('does not move payment_date when an already-paid invoice is merely edited', async () => {
    seed({ status: 'paid', payment_method: 'cash', payment_date: paidAt });
    const res = await patch({ id: INV, status: 'paid', paymentMethod: 'cash', notes: 'rien' });
    expect(res.status).toBe(200);
    expect(rows[0].payment_date).toBe(paidAt); // unchanged → monthly revenue not shifted
  });

  it('clears payment_date when an invoice stops being paid', async () => {
    seed({ status: 'paid', payment_method: 'cash', payment_date: paidAt });
    const res = await patch({ id: INV, status: 'cancelled', paymentMethod: 'cash' });
    expect(res.status).toBe(200);
    expect(rows[0].status).toBe('cancelled');
    expect(rows[0].payment_date).toBeNull(); // removed from collected revenue
  });

  it('records a pending cheque (number/date) — invoice stays pending so it is NOT revenue', async () => {
    seed({ status: 'pending' });
    const res = await patch({ id: INV, status: 'pending', paymentMethod: 'cheque', chequeNumber: 'CHQ-1245', chequeDate: 1_710_000_000_000 });
    expect(res.status).toBe(200);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].payment_method).toBe('cheque');
    expect(rows[0].cheque_number).toBe('CHQ-1245');
    expect(rows[0].payment_date).toBeNull(); // pending cheque → no revenue
  });

  it('encashing a cheque = status paid → revenue, cheque details preserved', async () => {
    seed({ status: 'pending', payment_method: 'cheque', cheque_number: 'CHQ-1245', cheque_date: 1_710_000_000_000 });
    const res = await patch({ id: INV, status: 'paid' });
    expect(res.status).toBe(200);
    expect(rows[0].status).toBe('paid');
    expect(rows[0].payment_date).toBeTypeOf('number');
    expect(rows[0].payment_method).toBe('cheque');
  });

  it('normalises the payment method to cash/cheque and rejects unknown values', async () => {
    seed({});
    await patch({ id: INV, status: 'pending', paymentMethod: 'virement' });
    expect(rows[0].payment_method).toBeNull();
    await patch({ id: INV, status: 'pending', paymentMethod: 'cash' });
    expect(rows[0].payment_method).toBe('cash');
  });

  it('returns 404 for an unknown invoice', async () => {
    const res = await patch({ id: 'nope', status: 'paid' });
    expect(res.status).toBe(404);
  });
});

// ── GET /api/platform-billing (summary): MRR from paid invoices only ────────
describe('platform-billing GET summary — MRR only from paid invoices', () => {
  const DAY = 86400000;

  // Rows are pre-sorted like the real query (center_id, period_end DESC).
  function makeSummaryDb(opts: { centers: any[]; paidRows: any[] }) {
    const stmt = (sql: string) => ({
      bind() { return this; },
      async all() {
        if (sql.includes('FROM centers')) return { results: opts.centers };
        if (sql.includes("WHERE status = 'paid'") && sql.includes('ORDER BY center_id')) return { results: opts.paidRows };
        if (sql.includes('GROUP BY status')) {
          return { results: [{ status: 'pending', total: 100 }, { status: 'paid', total: 300 }] };
        }
        if (sql.includes('payment_date')) return { results: [{ total: 90 }] };
        return { results: [] };
      },
    });
    return { prepare: (sql: string) => stmt(sql) };
  }

  async function getSummary(opts: { centers: any[]; paidRows: any[] }) {
    const request = new Request('https://example.test/api/platform-billing');
    const res = await onRequestGet({ env: { DB: makeSummaryDb(opts) }, request } as any);
    const data = await res.json() as any;
    return data.summary as { mrr: number; pendingInvoices: number };
  }

  it('builds MRR from each center\'s latest paid invoice (monthly + annual normalised)', async () => {
    const now = Date.now();
    const { mrr } = await getSummary({
      // Centers carry prices — but MRR must not read them.
      centers: [
        { id: 'a', name: 'A', status: 'active', monthly_price: 999, billing_cycle: 'monthly', subscription_ends_at: now + 20 * DAY },
        { id: 'b', name: 'B', status: 'active', monthly_price: 1200, billing_cycle: 'annual', subscription_ends_at: now + 300 * DAY },
      ],
      paidRows: [
        // A: latest paid monthly (90), superseded older one (60) ignored.
        { center_id: 'a', amount: 90, period_start: now - 5 * DAY, period_end: now + 25 * DAY },
        { center_id: 'a', amount: 60, period_start: now - 35 * DAY, period_end: now - 5 * DAY },
        // B: latest paid annual (30 days × 12) → 1200 / 12 = 100.
        { center_id: 'b', amount: 1200, period_start: now - 10 * DAY, period_end: now + 355 * DAY },
      ],
    });
    expect(mrr).toBeCloseTo(190, 2);
  });

  it('a center with no paid invoice at all contributes nothing to MRR', async () => {
    const now = Date.now();
    const { mrr } = await getSummary({
      centers: [
        { id: 'a', name: 'A', status: 'active', monthly_price: 90, billing_cycle: 'monthly', subscription_ends_at: now + 20 * DAY },
      ],
      // Its 90 TND invoice is only pending → excluded by status = 'paid'.
      paidRows: [],
    });
    expect(mrr).toBe(0);
  });

  it('counts a paid invoice whose period lies in the past (activation after an expired trial)', async () => {
    // Regression: MRR showed 0 although a paid invoice existed, because the
    // invoice window was the old trial window ending before today.
    const now = Date.now();
    const { mrr } = await getSummary({
      centers: [
        { id: 'c', name: 'C', status: 'active', monthly_price: 90, billing_cycle: 'monthly', subscription_ends_at: now - 5 * DAY },
      ],
      paidRows: [
        { center_id: 'c', amount: 90, period_start: now - 35 * DAY, period_end: now - 5 * DAY },
      ],
    });
    expect(mrr).toBeCloseTo(90, 2);
  });
});
