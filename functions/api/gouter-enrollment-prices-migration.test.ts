import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// Vérifie que la migration 0006 complète les prix Goûter NULL des inscriptions
// existantes depuis center_service_prices, sans écraser un prix déjà saisi.

const MIGRATION = readFileSync(
  new URL('../../migrations/0006_backfill_gouter_enrollment_prices.sql', import.meta.url),
  'utf8'
);

function database(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE student_service_enrollments (
      id TEXT PRIMARY KEY NOT NULL,
      center_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      service_key TEXT NOT NULL,
      school_year TEXT NOT NULL,
      billing_mode TEXT NOT NULL,
      monthly_price REAL,
      annual_price REAL,
      unit_price REAL,
      valid_from TEXT NOT NULL,
      valid_to TEXT
    ) STRICT;
    CREATE TABLE center_service_prices (
      center_id TEXT NOT NULL,
      school_year TEXT NOT NULL,
      service_key TEXT NOT NULL,
      billing_period TEXT NOT NULL,
      valid_from TEXT NOT NULL,
      price REAL NOT NULL,
      traiteur_share REAL
    ) STRICT;
  `);

  const price = sqlite.prepare(`
    INSERT INTO center_service_prices (center_id, school_year, service_key, billing_period, valid_from, price)
    VALUES ('c1', ?, ?, ?, '2026-09-01', ?)
  `);
  price.run('2026/2027', 'gouter_matin', 'month', 45);
  price.run('2026/2027', 'gouter_matin', 'unit', 3);
  price.run('DEFAULT', 'gouter_apres_midi', 'month', 40);
  price.run('DEFAULT', 'gouter_apres_midi', 'unit', 2.5);
  price.run('2026/2027', 'gouter_both', 'month', 80);
  price.run('2026/2027', 'lunch', 'month', 150);

  const enrollment = sqlite.prepare(`
    INSERT INTO student_service_enrollments
      (id, center_id, student_id, service_key, school_year, billing_mode, monthly_price, annual_price, unit_price, valid_from)
    VALUES (?, 'c1', 'st_1', ?, '2026/2027', 'subscription', ?, NULL, ?, '2026-09-01')
  `);
  // Prix NULL à compléter.
  enrollment.run('e_matin', 'gouter_matin', null, null);
  enrollment.run('e_soir', 'gouter_apres_midi', null, null);
  enrollment.run('e_both', 'gouter_both', null, null);
  // Prix déjà saisi : ne doit jamais être écrasé.
  enrollment.run('e_keep', 'gouter_matin', 99, 7);
  // Hors périmètre Goûter : inchangé.
  enrollment.run('e_lunch', 'lunch', null, null);

  return sqlite;
}

describe('migration 0006 — prix des inscriptions Goûter', () => {
  it('complète monthly_price et unit_price depuis les tarifs du centre', () => {
    const sqlite = database();
    sqlite.exec(MIGRATION);

    const rows = sqlite.prepare('SELECT id, monthly_price, unit_price FROM student_service_enrollments').all() as any[];
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(byId.e_matin).toMatchObject({ monthly_price: 45, unit_price: 3 });
    expect(byId.e_soir).toMatchObject({ monthly_price: 40, unit_price: 2.5 });
    expect(byId.e_both).toMatchObject({ monthly_price: 80, unit_price: null });
  });

  it('ne remplace jamais un prix déjà présent ni les autres services', () => {
    const sqlite = database();
    sqlite.exec(MIGRATION);

    const rows = sqlite.prepare('SELECT id, monthly_price, unit_price FROM student_service_enrollments').all() as any[];
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(byId.e_keep).toMatchObject({ monthly_price: 99, unit_price: 7 });
    expect(byId.e_lunch).toMatchObject({ monthly_price: null, unit_price: null });
  });

  it('est idempotente', () => {
    const sqlite = database();
    sqlite.exec(MIGRATION);
    const before = sqlite.prepare('SELECT * FROM student_service_enrollments ORDER BY id').all();
    sqlite.exec(MIGRATION);
    const after = sqlite.prepare('SELECT * FROM student_service_enrollments ORDER BY id').all();
    expect(after).toEqual(before);
  });
});
