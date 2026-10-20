import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSinglePayment } from './_lib';

// Régression : les paiements d'abonnement Repas/Goûter étaient écrits avec
// billing_period='unit' parce que le libellé du service ne distingue pas
// abonnement et unitaire. C'est le libellé du mois qui doit décider.

const CENTER = 'c1';
const STUDENT = 'st_1';

let sqlite: DatabaseSync;
let db: any;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE students (
      id TEXT PRIMARY KEY NOT NULL,
      center_id TEXT NOT NULL,
      UNIQUE (center_id, id)
    ) STRICT;
    CREATE TABLE payments (
      id TEXT PRIMARY KEY NOT NULL,
      center_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      service_key TEXT NOT NULL,
      billing_period TEXT NOT NULL CHECK (billing_period IN ('month','unit','year')),
      period_month TEXT,
      school_year TEXT NOT NULL,
      payment_type TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      total_required REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      receipt_number TEXT NOT NULL,
      notes TEXT,
      cheque_number TEXT,
      cheque_date TEXT,
      cheque_paid INTEGER NOT NULL DEFAULT 0,
      is_refund INTEGER NOT NULL DEFAULT 0,
      refund_of TEXT,
      ref_type TEXT,
      ref_id TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (center_id, id),
      UNIQUE (center_id, receipt_number),
      CHECK (billing_period <> 'month' OR period_month IS NOT NULL)
    ) STRICT;
  `);
  sqlite.prepare('INSERT INTO students (id, center_id) VALUES (?, ?)').run(STUDENT, CENTER);
  db = {
    prepare(sql: string) {
      let args: any[] = [];
      const stmt = {
        bind(...values: any[]) { args = values; return stmt; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          const r = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(r.changes), last_row_id: r.lastInsertRowid }, success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) { for (const s of stmts) await s.run(); },
  };
});

afterEach(() => sqlite.close());

let seq = 0;
async function addPayment(overrides: Record<string, unknown> = {}) {
  const payment = {
    id: `pay_${++seq}`,
    studentId: STUDENT,
    date: '2026-10-19',
    amountPaid: 150,
    totalRequired: 150,
    service: 'Repas',
    month: 'Octobre (2026/2027)',
    paymentType: 'full',
    method: 'Espèces',
    receiptNumber: `REC-${seq}`,
    ...overrides
  };
  await createSinglePayment(db, payment, CENTER);
  return sqlite.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id) as any;
}

describe('paymentServiceKey — abonnement vs unitaire', () => {
  it('enregistre un abonnement Repas mensuel en billing_period=month', async () => {
    const row = await addPayment();
    expect(row).toMatchObject({
      service_key: 'lunch',
      billing_period: 'month',
      period_month: '2026-10',
      school_year: '2026/2027'
    });
  });

  it('enregistre un paiement Repas unitaire en billing_period=unit sans mois', async () => {
    const row = await addPayment({ month: 'Repas unitaire (2026-10-19)', amountPaid: 8, totalRequired: 8 });
    expect(row).toMatchObject({
      service_key: 'lunch',
      billing_period: 'unit',
      period_month: null
    });
  });

  it('enregistre un abonnement Goûter mensuel en billing_period=month', async () => {
    const row = await addPayment({ service: 'Goûter', month: 'Octobre (2026/2027)', amountPaid: 60, totalRequired: 60 });
    expect(row).toMatchObject({
      service_key: 'gouter_matin',
      billing_period: 'month',
      period_month: '2026-10'
    });
  });

  it('enregistre un paiement Goûter unitaire en billing_period=unit sans mois', async () => {
    const row = await addPayment({
      service: 'Goûter',
      month: 'لمجة الصباح unitaire (2026-10-19)',
      amountPaid: 2,
      totalRequired: 2
    });
    expect(row).toMatchObject({
      service_key: 'gouter_matin',
      billing_period: 'unit',
      period_month: null
    });
  });

  it('utilise l’année de fin pour un mois d’abonnement Janvier', async () => {
    const row = await addPayment({ month: 'Janvier (2026/2027)' });
    expect(row.period_month).toBe('2027-01');
  });

  it('conserve un paiement annuel Repas en billing_period=year', async () => {
    const row = await addPayment({ month: 'Annuel (2026/2027)' });
    expect(row).toMatchObject({
      service_key: 'lunch',
      billing_period: 'year',
      period_month: null
    });
  });

  it('enregistre un abonnement Transport mensuel avec service_key=transport', async () => {
    const row = await addPayment({
      service: 'Transport',
      month: 'Octobre (2026/2027)',
      amountPaid: 45,
      totalRequired: 45
    });
    expect(row).toMatchObject({
      service_key: 'transport',
      billing_period: 'month',
      period_month: '2026-10',
      school_year: '2026/2027'
    });
  });
});
