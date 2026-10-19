import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPost } from './meal-reset';

// Régression : « مسح كل بيانات المطعم » ne doit plus envoyer PUT /api/students
// avec toute la liste des élèves. Une opération serveur ciblée suffit.

const CENTER = 'c1';
const OTHER = 'c2';

let sqlite: DatabaseSync;
let db: any;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE meal_attendances (
      center_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      service_key TEXT NOT NULL,
      billing_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      paid_payment_id TEXT,
      covered_by_payment_id TEXT,
      mode_snapshot TEXT,
      unit_price REAL,
      traiteur_share REAL,
      center_share REAL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (student_id, date, service_key)
    ) STRICT;
    CREATE TABLE payments (
      id TEXT PRIMARY KEY NOT NULL,
      center_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      service_key TEXT NOT NULL
    ) STRICT;
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
  `);
  sqlite.prepare("INSERT INTO meal_attendances (center_id, student_id, date, service_key, billing_mode, status, created_at) VALUES (?, 'st_1', '2026-10-19', 'lunch', 'unit', 'unpaid', 0)").run(CENTER);
  sqlite.prepare("INSERT INTO meal_attendances (center_id, student_id, date, service_key, billing_mode, status, created_at) VALUES (?, 'st_2', '2026-10-19', 'gouter_matin', 'subscription', 'paid', 0)").run(OTHER);
  sqlite.prepare("INSERT INTO payments (id, center_id, student_id, service_key) VALUES ('p1', ?, 'st_1', 'lunch')").run(CENTER);
  sqlite.prepare("INSERT INTO payments (id, center_id, student_id, service_key) VALUES ('p2', ?, 'st_1', 'gouter_matin')").run(CENTER);
  sqlite.prepare("INSERT INTO payments (id, center_id, student_id, service_key) VALUES ('p3', ?, 'st_2', 'lunch')").run(OTHER);
  sqlite.prepare("INSERT INTO student_service_enrollments (id, center_id, student_id, service_key, school_year, billing_mode, valid_from) VALUES ('e1', ?, 'st_1', 'lunch', '2026/2027', 'subscription', '2026-09-01')").run(CENTER);
  sqlite.prepare("INSERT INTO student_service_enrollments (id, center_id, student_id, service_key, school_year, billing_mode, valid_from) VALUES ('e2', ?, 'st_1', 'gouter_matin', '2026/2027', 'subscription', '2026-09-01')").run(CENTER);
  sqlite.prepare("INSERT INTO student_service_enrollments (id, center_id, student_id, service_key, school_year, billing_mode, valid_from) VALUES ('e3', ?, 'st_2', 'lunch', '2026/2027', 'subscription', '2026-09-01')").run(OTHER);
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

function ctx() {
  return {
    env: { DB: db },
    request: new Request('https://app.example/api/meal-reset', { method: 'POST' }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId: CENTER, role: 'admin' } },
  } as any;
}

describe('POST /api/meal-reset', () => {
  it('efface pointages + inscriptions lunch + paiements Repas DU CENTRE', async () => {
    const res = await onRequestPost(ctx());
    expect(res.status).toBe(200);

    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM meal_attendances WHERE center_id = ?').get(CENTER) as any).n).toBe(0);
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE center_id = ? AND service_key = 'lunch'").get(CENTER) as any).n).toBe(0);
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM student_service_enrollments WHERE center_id = ? AND service_key = 'lunch'").get(CENTER) as any).n).toBe(0);
  });

  it('conserve les Goûters et les données des autres centres', async () => {
    await onRequestPost(ctx());
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE center_id = ? AND service_key = 'gouter_matin'").get(CENTER) as any).n).toBe(1);
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM student_service_enrollments WHERE center_id = ? AND service_key = 'gouter_matin'").get(CENTER) as any).n).toBe(1);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM meal_attendances WHERE center_id = ?').get(OTHER) as any).n).toBe(1);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM payments WHERE center_id = ?').get(OTHER) as any).n).toBe(1);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM student_service_enrollments WHERE center_id = ?').get(OTHER) as any).n).toBe(1);
  });
});
