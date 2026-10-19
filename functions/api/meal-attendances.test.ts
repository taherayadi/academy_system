import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPost, onRequestPut, onRequestDelete } from './meal-attendances';

// Régression : un pointage repas ne doit JAMAIS réécrire l'élève complet
// (PUT /api/students). POST crée UNE ligne, PUT met à jour status +
// paid_payment_id SANS supprimer la ligne, DELETE l'annule.

const CENTER = 'c1';
const OTHER = 'c2';
const STUDENT = 'st_1';
const OTHER_STUDENT = 'st_other';

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
    CREATE TABLE payments (
      id TEXT PRIMARY KEY NOT NULL,
      center_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      UNIQUE (center_id, id)
    ) STRICT;
    CREATE TABLE meal_attendances (
      center_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      service_key TEXT NOT NULL CHECK (service_key IN ('lunch','gouter_matin','gouter_apres_midi')),
      billing_mode TEXT NOT NULL CHECK (billing_mode IN ('subscription','unit')),
      status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','covered_by_subscription','void')),
      paid_payment_id TEXT,
      covered_by_payment_id TEXT,
      mode_snapshot TEXT,
      unit_price REAL CHECK (unit_price IS NULL OR unit_price >= 0),
      traiteur_share REAL,
      center_share REAL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (student_id, date, service_key),
      FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE CASCADE,
      FOREIGN KEY (center_id, paid_payment_id) REFERENCES payments(center_id, id) ON DELETE RESTRICT
    ) STRICT;
  `);
  sqlite.prepare('INSERT INTO students (id, center_id) VALUES (?, ?)').run(STUDENT, CENTER);
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

function ctx(method: string, body?: unknown, query = '') {
  return {
    env: { DB: db },
    request: new Request(`https://app.example/api/meal-attendances${query}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId: CENTER, role: 'admin' } },
  } as any;
}

const base = {
  studentId: STUDENT,
  date: '2026-10-19',
  service: 'lunch',
  type: 'unit',
  paid: false,
  traiteurPrice: 6
};

describe('/api/meal-attendances — POST crée UNE ligne', () => {
  it('crée le pointage sans renvoyer l’élève', async () => {
    const res = await onRequestPost(ctx('POST', base));
    expect(res.status).toBe(200);
    const rows = sqlite.prepare('SELECT * FROM meal_attendances').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      center_id: CENTER, student_id: STUDENT, date: '2026-10-19',
      service_key: 'lunch', billing_mode: 'unit', status: 'unpaid'
    });
    expect(rows[0].unit_price).toBe(6);
  });

  it('refuse un doublon (409) au lieu d’écraser silencieusement', async () => {
    expect((await onRequestPost(ctx('POST', base))).status).toBe(200);
    expect((await onRequestPost(ctx('POST', { ...base, paid: true }))).status).toBe(409);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM meal_attendances').get() as any).n).toBe(1);
  });

  it('refuse un élève d’un autre centre (404)', async () => {
    const res = await onRequestPost(ctx('POST', { ...base, studentId: OTHER_STUDENT }));
    expect(res.status).toBe(404);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM meal_attendances').get() as any).n).toBe(0);
  });

  it('marque un abonnement comme covered_by_subscription', async () => {
    const res = await onRequestPost(ctx('POST', { ...base, type: 'subscription', paid: true }));
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT status FROM meal_attendances').get() as any;
    expect(row.status).toBe('covered_by_subscription');
  });
});

describe('/api/meal-attendances — PUT met à jour SANS supprimer', () => {
  beforeEach(async () => {
    await onRequestPost(ctx('POST', base));
  });

  it('passe status à paid et enregistre paid_payment_id sans supprimer la ligne', async () => {
    sqlite.prepare("INSERT INTO payments (id, center_id, student_id) VALUES ('pay_1', ?, ?)").run(CENTER, STUDENT);
    const res = await onRequestPut(ctx('PUT', {
      studentId: STUDENT, date: '2026-10-19', service: 'lunch', type: 'unit', paid: true, paymentId: 'pay_1'
    }));
    expect(res.status).toBe(200);
    const rows = sqlite.prepare('SELECT * FROM meal_attendances').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('paid');
    expect(rows[0].paid_payment_id).toBe('pay_1');
    expect(rows[0].billing_mode).toBe('unit');
  });

  it('conserve le paiement existant quand le champ paymentId est absent', async () => {
    sqlite.prepare("INSERT INTO payments (id, center_id, student_id) VALUES ('pay_1', ?, ?)").run(CENTER, STUDENT);
    await onRequestPut(ctx('PUT', { studentId: STUDENT, date: '2026-10-19', service: 'lunch', type: 'unit', paid: true, paymentId: 'pay_1' }));
    const res = await onRequestPut(ctx('PUT', { studentId: STUDENT, date: '2026-10-19', service: 'lunch', paid: true }));
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT * FROM meal_attendances').get() as any;
    expect(row.status).toBe('paid');
    expect(row.paid_payment_id).toBe('pay_1');
  });

  it('renvoie 404 pour un pointage inexistant', async () => {
    const res = await onRequestPut(ctx('PUT', { ...base, date: '2026-10-20', paid: true }));
    expect(res.status).toBe(404);
  });

  it('refuse un paiement d’un autre centre (404)', async () => {
    sqlite.prepare("INSERT INTO payments (id, center_id, student_id) VALUES ('pay_other', ?, ?)").run(OTHER, OTHER_STUDENT);
    const res = await onRequestPut(ctx('PUT', {
      studentId: STUDENT, date: '2026-10-19', service: 'lunch', type: 'unit', paid: true, paymentId: 'pay_other'
    }));
    expect(res.status).toBe(404);
    const row = sqlite.prepare('SELECT status FROM meal_attendances').get() as any;
    expect(row.status).toBe('unpaid');
  });
});

describe('/api/meal-attendances — DELETE annule UN pointage', () => {
  beforeEach(async () => {
    await onRequestPost(ctx('POST', base));
  });

  it('supprime la ligne et renvoie 200', async () => {
    const res = await onRequestDelete(ctx('DELETE', undefined, `?studentId=${STUDENT}&date=2026-10-19&service=lunch`));
    expect(res.status).toBe(200);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM meal_attendances').get() as any).n).toBe(0);
  });

  it('renvoie 404 au second DELETE', async () => {
    expect((await onRequestDelete(ctx('DELETE', undefined, `?studentId=${STUDENT}&date=2026-10-19&service=lunch`))).status).toBe(200);
    expect((await onRequestDelete(ctx('DELETE', undefined, `?studentId=${STUDENT}&date=2026-10-19&service=lunch`))).status).toBe(404);
  });

  it('ne supprime pas le pointage d’un autre centre', async () => {
    // Le pointage appartient à CENTER ; un client de CENTER ne peut pas cibler
    // un élève d'un autre centre. Le filtre center_id le garantit.
    const res = await onRequestDelete(ctx('DELETE', undefined, `?studentId=${OTHER_STUDENT}&date=2026-10-19&service=lunch`));
    expect(res.status).toBe(404);
  });
});
