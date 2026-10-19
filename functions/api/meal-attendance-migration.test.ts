import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// Vérifie que la migration 0005 peut être appliquée sur une base qui
// contient déjà des pointages et des paiements, sans perte de données.

const MIGRATION = readFileSync(
  new URL('../../migrations/0005_meal_attendance_covered_payment.sql', import.meta.url),
  'utf8'
);

function oldDatabase(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
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
      UNIQUE (center_id, receipt_number)
    ) STRICT;
    CREATE TABLE meal_attendances (
      center_id             TEXT NOT NULL,
      student_id            TEXT NOT NULL,
      date                  TEXT NOT NULL,
      service_key           TEXT NOT NULL,
      billing_mode          TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'unpaid',
      paid_payment_id       TEXT,
      covered_by_payment_id TEXT,
      mode_snapshot         TEXT,
      unit_price            REAL,
      traiteur_share        REAL,
      center_share          REAL,
      created_at            INTEGER NOT NULL,
      PRIMARY KEY (student_id, date, service_key)
    ) STRICT;
    CREATE INDEX idx_meal_att_center_date ON meal_attendances(center_id, date, service_key);
    CREATE INDEX idx_meal_att_status ON meal_attendances(center_id, status) WHERE status = 'unpaid';
    CREATE VIEW v_meal_center_income AS
    SELECT center_id, substr(date, 1, 7) AS month, service_key, mode_snapshot,
           COUNT(*)                  AS meals,
           SUM(unit_price)           AS gross,
           SUM(traiteur_share)       AS traiteur,
           SUM(center_share)         AS center
    FROM meal_attendances
    WHERE status IN ('paid','covered_by_subscription')
    GROUP BY center_id, substr(date, 1, 7), service_key, mode_snapshot;
  `);
  sqlite.prepare("INSERT INTO students (id, center_id) VALUES ('st_1', 'c1')").run();
  const payment = sqlite.prepare(`
    INSERT INTO payments (
      id, center_id, student_id, date, service_key, billing_period, period_month,
      school_year, payment_type, method, amount, total_required, receipt_number,
      is_refund, created_at
    ) VALUES (?, 'c1', 'st_1', ?, 'lunch', 'unit', ?, '2026/2027', 'full', 'cash', 150, 150, ?, 0, ?)
  `);
  payment.run('pay_oct', '2026-10-01', '2026-10', 'REC-OCT', 1);
  payment.run('pay_jan', '2027-01-05', '2026-01', 'REC-JAN', 2);
  payment.run('pay_unit', '2026-10-24', null, 'REC-UNIT', 3);

  const attendance = sqlite.prepare(`
    INSERT INTO meal_attendances (
      center_id, student_id, date, service_key, billing_mode, status,
      paid_payment_id, covered_by_payment_id, mode_snapshot,
      unit_price, traiteur_share, center_share, created_at
    ) VALUES ('c1', 'st_1', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
  `);
  // Deux abonnements couverts sans paiement lié (octobre + janvier).
  attendance.run('2026-10-22', 'lunch', 'subscription', 'covered_by_subscription', null, 'in_house_kitchen', 8, 0, 8, 10);
  attendance.run('2027-01-15', 'lunch', 'subscription', 'covered_by_subscription', null, 'in_house_kitchen', 8, 0, 8, 11);
  // Un pointage couvert sans paiement Goûter identifiable → doit passer unpaid.
  attendance.run('2026-10-23', 'gouter_matin', 'subscription', 'covered_by_subscription', null, null, null, null, null, 12);
  // Un pointage unitaire payé : toutes les colonnes doivent être conservées.
  attendance.run('2026-10-24', 'lunch', 'unit', 'paid', null, 'in_house_kitchen', 8, 0, 8, 13);
  return sqlite;
}

describe('migration 0005 — meal_attendances', () => {
  it('conserve les pointages et applique la contrainte sans perte', () => {
    const sqlite = oldDatabase();
    sqlite.exec(MIGRATION);

    const rows = sqlite.prepare('SELECT * FROM meal_attendances ORDER BY date').all() as any[];
    expect(rows).toHaveLength(4);

    const oct = rows.find(r => r.date === '2026-10-22');
    expect(oct).toMatchObject({
      status: 'covered_by_subscription',
      covered_by_payment_id: 'pay_oct',
      unit_price: 8,
      traiteur_share: 0,
      center_share: 8,
      mode_snapshot: 'in_house_kitchen'
    });

    const jan = rows.find(r => r.date === '2027-01-15');
    expect(jan).toMatchObject({
      status: 'covered_by_subscription',
      covered_by_payment_id: 'pay_jan'
    });

    const orphan = rows.find(r => r.date === '2026-10-23');
    expect(orphan).toMatchObject({ status: 'unpaid', covered_by_payment_id: null });

    const unit = rows.find(r => r.date === '2026-10-24');
    expect(unit).toMatchObject({
      status: 'paid', paid_payment_id: 'pay_unit', billing_mode: 'unit',
      unit_price: 8, traiteur_share: 0, center_share: 8
    });

    // Les deux contraintes sont bien actives après la reconstruction.
    expect(() => sqlite.prepare(`
      INSERT INTO meal_attendances (
        center_id, student_id, date, service_key, billing_mode, status, created_at
      ) VALUES ('c1', 'st_1', '2026-10-25', 'lunch', 'subscription', 'covered_by_subscription', 14)
    `).run()).toThrow(/CHECK/);
    expect(() => sqlite.prepare(`
      INSERT INTO meal_attendances (
        center_id, student_id, date, service_key, billing_mode, status, created_at
      ) VALUES ('c1', 'st_1', '2026-10-26', 'lunch', 'unit', 'paid', 15)
    `).run()).toThrow(/CHECK/);

    // La vue de production a été recréée et fonctionne.
    const income = sqlite.prepare('SELECT * FROM v_meal_center_income').all() as any[];
    expect(income.length).toBeGreaterThan(0);
    expect(income[0]).toHaveProperty('gross');

    // Les index de production ont été recréés.
    const indexes = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name IN ('idx_meal_att_center_date', 'idx_meal_att_status')
      ORDER BY name
    `).all() as any[];
    expect(indexes.map(i => i.name)).toEqual(['idx_meal_att_center_date', 'idx_meal_att_status']);

    sqlite.close();
  });

  it('corrige billing_period et la clé de mois des abonnements repas', () => {
    const sqlite = oldDatabase();
    sqlite.exec(MIGRATION);

    const payments = sqlite.prepare('SELECT id, billing_period, period_month FROM payments ORDER BY id').all() as any[];
    expect(payments).toEqual([
      { id: 'pay_jan', billing_period: 'month', period_month: '2027-01' },
      { id: 'pay_oct', billing_period: 'month', period_month: '2026-10' },
      { id: 'pay_unit', billing_period: 'unit', period_month: null }
    ]);

    sqlite.close();
  });
});
