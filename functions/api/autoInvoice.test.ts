import { describe, it, expect } from 'vitest';
import { ensurePeriodInvoice } from './centers';

// ---------------------------------------------------------------------------
// In-memory D1 double covering the exact statements used by
// ensurePeriodInvoice (see functions/api/centers.ts).
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  center_id: string;
  invoice_number: string;
  period_start: number;
  period_end: number;
  amount: number;
  status: string;
  notes: string;
  created_at: number;
}

function makeDb(seed: Row[] = []) {
  const rows: Row[] = seed.map(row => ({ ...row }));
  let changes = 0;

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          const bound = { sql, args };
          return {
            async first(): Promise<any> {
              // SQL: ... WHERE center_id = ? AND status = 'paid'
              //          AND period_start < ? AND period_end > ? LIMIT 1
              // bound as (centerId, periodEnd, periodStart)
              if (bound.sql.includes("status = 'paid'")) {
                const [centerId, periodEnd, periodStart] = bound.args as [string, number, number];
                return rows.find(r =>
                  r.center_id === centerId && r.status === 'paid'
                  && r.period_start < periodEnd && r.period_end > periodStart
                ) || null;
              }
              return null;
            },
            async run(): Promise<{ meta: { changes: number } }> {
              // SQL: ... WHERE center_id = ? AND status = 'pending'
              //          AND period_start < ? AND period_end > ?
              // bound as (centerId, periodEnd, periodStart)
              if (bound.sql.includes("status = 'cancelled'")) {
                const [centerId, periodEnd, periodStart] = bound.args as [string, number, number];
                let cancelled = 0;
                for (const row of rows) {
                  if (row.center_id === centerId && row.status === 'pending'
                    && row.period_start < periodEnd && row.period_end > periodStart) {
                    row.status = 'cancelled';
                    cancelled += 1;
                  }
                }
                changes += cancelled;
              } else if (bound.sql.includes('INSERT INTO center_invoices')) {
                const [id, centerId, invoiceNumber, periodStart, periodEnd, amount, notes, createdAt] = bound.args;
                rows.push({
                  id, center_id: centerId, invoice_number: invoiceNumber,
                  period_start: periodStart, period_end: periodEnd,
                  amount: Number(amount), status: 'pending', notes, created_at: createdAt,
                });
                changes += 1;
              }
              return { meta: { changes } };
            },
            async all(): Promise<{ results: any[] }> {
              return { results: rows };
            },
          };
        },
      };
    },
    inspect: () => rows.map(row => ({ ...row })),
  };
  return db;
}

const CENTER = 'center-1';
const N = 1_700_000_000_000; // fixed "now" for deterministic timestamps

function row(partial: Partial<Row>): Row {
  return {
    id: 'seed',
    center_id: CENTER,
    invoice_number: 'INV-SEED',
    period_start: N,
    period_end: N + 30 * 86_400_000,
    amount: 30,
    status: 'pending',
    notes: '',
    created_at: N,
    ...partial,
  };
}

describe('ensurePeriodInvoice (automatic subscription invoices)', () => {
  it('creates a pending invoice when none exists for the window', async () => {
    const db = makeDb();
    const result = await ensurePeriodInvoice(db as any, {
      centerId: CENTER,
      periodStart: N,
      periodEnd: N + 30 * 86_400_000,
      amount: 30,
      notes: 'Abonnement mensuel',
    });
    const rows = db.inspect();
    expect(result).not.toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].amount).toBe(30);
    expect(rows[0].invoice_number).toMatch(/^INV-/);
    expect(result!.invoiceNumber).toBe(rows[0].invoice_number);
  });

  it('does not create anything when a PAID invoice already covers the window', async () => {
    const db = makeDb([
      row({ id: 'paid-1', invoice_number: 'INV-PAID', status: 'paid', amount: 30 }),
    ]);
    const result = await ensurePeriodInvoice(db as any, {
      centerId: CENTER,
      periodStart: N,
      periodEnd: N + 30 * 86_400_000,
      amount: 30,
      notes: 'Abonnement mensuel',
    });
    expect(result).toBeNull();
    expect(db.inspect()).toHaveLength(1);
    expect(db.inspect()[0].status).toBe('paid');
  });

  it('cancels a covering PENDING invoice then inserts exactly one fresh pending invoice (no duplicates)', async () => {
    const db = makeDb([
      row({ id: 'old-pending', invoice_number: 'INV-OLD', amount: 30 }),
    ]);
    const result = await ensurePeriodInvoice(db as any, {
      centerId: CENTER,
      periodStart: N,
      periodEnd: N + 30 * 86_400_000,
      amount: 45,
      notes: 'Reconduction',
    });
    const rows = db.inspect();
    expect(result).not.toBeNull();
    // one cancelled + one fresh pending = exactly one PENDING invoice remains
    expect(rows.filter(r => r.status === 'pending')).toHaveLength(1);
    expect(rows.filter(r => r.status === 'cancelled')).toHaveLength(1);
    expect(rows.find(r => r.status === 'pending')!.amount).toBe(45);
  });

  it('leaves pending invoices that do NOT cover the window untouched', async () => {
    const db = makeDb([
      row({ id: 'other-pending', period_start: N + 40 * 86_400_000, period_end: N + 70 * 86_400_000 }),
    ]);
    const result = await ensurePeriodInvoice(db as any, {
      centerId: CENTER,
      periodStart: N,
      periodEnd: N + 30 * 86_400_000,
      amount: 30,
      notes: 'Reconduction',
    });
    expect(result).not.toBeNull();
    const rows = db.inspect();
    expect(rows.filter(r => r.status === 'pending')).toHaveLength(2);
  });

  it('returns null and inserts nothing for a zero or negative amount', async () => {
    const db = makeDb();
    const result = await ensurePeriodInvoice(db as any, {
      centerId: CENTER,
      periodStart: N,
      periodEnd: N + 30 * 86_400_000,
      amount: 0,
      notes: 'Rien à facturer',
    });
    expect(result).toBeNull();
    expect(db.inspect()).toHaveLength(0);
  });

  it('returns null for an inverted window', async () => {
    const db = makeDb();
    const result = await ensurePeriodInvoice(db as any, {
      centerId: CENTER,
      periodStart: N + 30 * 86_400_000,
      periodEnd: N,
      amount: 30,
      notes: 'Inversé',
    });
    expect(result).toBeNull();
    expect(db.inspect()).toHaveLength(0);
  });
});
