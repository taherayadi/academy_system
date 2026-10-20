import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPut } from './meal-enrollments';

// Régression : inscrire/désinscrire un élève au repas ou au goûter ne doit pas
// passer par PUT /api/students. L'endpoint ne touche que
// student_service_enrollments (dont readStudents dérive meals/active).

const CENTER = 'c1';
const OTHER = 'c2';
const STUDENT = 'st_1';
const STUDENT_2 = 'st_2';
const OTHER_STUDENT = 'st_other';
const YEAR = '2026/2027';

let sqlite: DatabaseSync;
let db: any;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE students (
      id TEXT PRIMARY KEY NOT NULL,
      center_id TEXT NOT NULL,
      student_type TEXT NOT NULL DEFAULT 'student',
      UNIQUE (center_id, id)
    ) STRICT;
    CREATE TABLE services (key TEXT PRIMARY KEY NOT NULL) STRICT;
    INSERT INTO services (key) VALUES ('lunch'), ('gouter_matin'), ('gouter_apres_midi'), ('suivi');
    CREATE TABLE student_service_enrollments (
      id TEXT PRIMARY KEY NOT NULL,
      center_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      service_key TEXT NOT NULL REFERENCES services(key),
      school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      billing_mode TEXT NOT NULL CHECK (billing_mode IN ('subscription','unit')),
      monthly_price REAL CHECK (monthly_price IS NULL OR monthly_price >= 0),
      annual_price REAL CHECK (annual_price IS NULL OR annual_price >= 0),
      unit_price REAL CHECK (unit_price IS NULL OR unit_price >= 0),
      valid_from TEXT NOT NULL CHECK (valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      valid_to TEXT CHECK (valid_to IS NULL OR valid_to >= valid_from),
      UNIQUE (student_id, service_key, school_year, valid_from),
      FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE CASCADE
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
    INSERT INTO center_service_prices (center_id, school_year, service_key, billing_period, valid_from, price)
      VALUES ('c1', '2026/2027', 'gouter_matin', 'month', '2026-09-01', 45),
             ('c1', '2026/2027', 'gouter_matin', 'unit', '2026-09-01', 3),
             ('c1', '2026/2027', 'gouter_apres_midi', 'month', '2026-09-01', 40),
             ('c1', '2026/2027', 'gouter_apres_midi', 'unit', '2026-09-01', 2.5);
  `);
  sqlite.prepare('INSERT INTO students (id, center_id) VALUES (?, ?)').run(STUDENT, CENTER);
  sqlite.prepare('INSERT INTO students (id, center_id) VALUES (?, ?)').run(STUDENT_2, CENTER);
  sqlite.prepare('INSERT INTO students (id, center_id) VALUES (?, ?)').run(OTHER_STUDENT, OTHER);
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

function ctx(body: unknown) {
  return {
    env: { DB: db },
    request: new Request('https://app.example/api/meal-enrollments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId: CENTER, role: 'admin' } },
  } as any;
}

const rows = () => sqlite.prepare('SELECT * FROM student_service_enrollments ORDER BY service_key').all() as any[];

describe('PUT /api/meal-enrollments', () => {
  it('inscrit au repas (lunch) avec le mode et les prix', async () => {
    const res = await onRequestPut(ctx({
      studentId: STUDENT, schoolYear: YEAR,
      lunch: { active: true, mode: 'subscription', monthlyPrice: 150, unitPrice: 8 }
    }));
    expect(res.status).toBe(200);
    const r = rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      student_id: STUDENT, center_id: CENTER, service_key: 'lunch',
      school_year: YEAR, billing_mode: 'subscription', monthly_price: 150, unit_price: 8
    });
    expect(r[0].valid_from).toBe('2026-09-01');
  });

  it('met à jour les prix au lieu de dupliquer (UPSERT)', async () => {
    await onRequestPut(ctx({ studentId: STUDENT, schoolYear: YEAR, lunch: { active: true, monthlyPrice: 150, unitPrice: 8 } }));
    await onRequestPut(ctx({ studentId: STUDENT, schoolYear: YEAR, lunch: { active: true, monthlyPrice: 180, unitPrice: 9 } }));
    const r = rows();
    expect(r).toHaveLength(1);
    expect(r[0].monthly_price).toBe(180);
    expect(r[0].unit_price).toBe(9);
  });

  it('désinscrit du repas (DELETE de l’inscription lunch)', async () => {
    await onRequestPut(ctx({ studentId: STUDENT, schoolYear: YEAR, lunch: { active: true, monthlyPrice: 150, unitPrice: 8 } }));
    const res = await onRequestPut(ctx({ studentId: STUDENT, schoolYear: YEAR, lunch: { active: false } }));
    expect(res.status).toBe(200);
    expect(rows()).toHaveLength(0);
  });

  it('inscrit et désinscrit les goûters séparément du repas', async () => {
    await onRequestPut(ctx({ studentId: STUDENT, schoolYear: YEAR, lunch: { active: true, monthlyPrice: 150, unitPrice: 8 } }));
    await onRequestPut(ctx({ studentId: STUDENT, schoolYear: YEAR, gouterMatin: true, gouterSoir: true }));
    expect(rows().map(r => r.service_key)).toEqual(['gouter_apres_midi', 'gouter_matin', 'lunch']);
    await onRequestPut(ctx({ studentId: STUDENT, schoolYear: YEAR, gouterMatin: false, gouterSoir: false }));
    expect(rows().map(r => r.service_key)).toEqual(['lunch']);
  });

  it('reprend les prix mensuel et unitaire du Goûter depuis les tarifs du centre', async () => {
    const res = await onRequestPut(ctx({ studentId: STUDENT, schoolYear: YEAR, gouterMatin: true, gouterSoir: true }));
    expect(res.status).toBe(200);
    const byService = Object.fromEntries(rows().map(r => [r.service_key, r]));
    expect(byService.gouter_matin).toMatchObject({ monthly_price: 45, unit_price: 3 });
    expect(byService.gouter_apres_midi).toMatchObject({ monthly_price: 40, unit_price: 2.5 });
  });

  it('accepte un tableau pour l’inscription en masse', async () => {
    const res = await onRequestPut(ctx([
      { studentId: STUDENT, schoolYear: YEAR, lunch: { active: true, monthlyPrice: 150, unitPrice: 8 } },
      { studentId: STUDENT_2, schoolYear: YEAR, gouterMatin: true }
    ]));
    expect(res.status).toBe(200);
    expect(rows()).toHaveLength(2);
    expect(rows().find(r => r.student_id === STUDENT_2)?.service_key).toBe('gouter_matin');
  });

  it('refuse un élève d’un autre centre (404)', async () => {
    const res = await onRequestPut(ctx({ studentId: OTHER_STUDENT, schoolYear: YEAR, lunch: { active: true } }));
    expect(res.status).toBe(404);
    expect(rows()).toHaveLength(0);
  });

  it('refuse un payload sans studentId (400)', async () => {
    const res = await onRequestPut(ctx({ schoolYear: YEAR, lunch: { active: true } }));
    expect(res.status).toBe(400);
    expect(rows()).toHaveLength(0);
  });
});
