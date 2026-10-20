import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestDelete, onRequestGet, onRequestPost, onRequestPut } from './student-service-enrollments';

const CENTER = 'c1';
const OTHER = 'c2';
const STUDENT = 'st_1';
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

function ctx(method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown, query = '') {
  return {
    env: { DB: db },
    request: new Request(`https://app.example/api/student-service-enrollments${query}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId: CENTER, role: 'admin' } },
  } as any;
}

const rows = () => sqlite.prepare('SELECT * FROM student_service_enrollments ORDER BY service_key').all() as any[];

describe('/api/student-service-enrollments', () => {
  it('POST crée une inscription avec ses prix et valid_to', async () => {
    const res = await onRequestPost(ctx('POST', {
      studentId: STUDENT, serviceKey: 'gouter_matin', schoolYear: YEAR,
      billingMode: 'subscription', monthlyPrice: 45, unitPrice: 3,
      validFrom: '2026-09-01', validTo: '2027-06-30'
    }));
    expect(res.status).toBe(200);
    const r = rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      center_id: CENTER, student_id: STUDENT, service_key: 'gouter_matin',
      school_year: YEAR, billing_mode: 'subscription',
      monthly_price: 45, unit_price: 3,
      valid_from: '2026-09-01', valid_to: '2027-06-30'
    });
  });

  it('POST accepte les clés snake_case et génère un id', async () => {
    const res = await onRequestPost(ctx('POST', {
      student_id: STUDENT, service_key: 'gouter_apres_midi', school_year: YEAR,
      billing_mode: 'unit', unit_price: 2, valid_from: '2026-09-01'
    }));
    expect(res.status).toBe(200);
    expect((await res.json() as any).id).toMatch(/[0-9a-f-]{36}/);
  });

  it('POST refuse un élève d’un autre centre (404)', async () => {
    const res = await onRequestPost(ctx('POST', {
      studentId: OTHER_STUDENT, serviceKey: 'lunch', schoolYear: YEAR, validFrom: '2026-09-01'
    }));
    expect(res.status).toBe(404);
    expect(rows()).toHaveLength(0);
  });

  it('POST refuse une date ou une année invalide (400)', async () => {
    expect((await onRequestPost(ctx('POST', { studentId: STUDENT, serviceKey: 'lunch', schoolYear: YEAR, validFrom: '01/09/2026' }))).status).toBe(400);
    expect((await onRequestPost(ctx('POST', { studentId: STUDENT, serviceKey: 'lunch', schoolYear: '2026', validFrom: '2026-09-01' }))).status).toBe(400);
  });

  it('POST refuse un doublon (409)', async () => {
    const body = { studentId: STUDENT, serviceKey: 'lunch', schoolYear: YEAR, validFrom: '2026-09-01' };
    expect((await onRequestPost(ctx('POST', body))).status).toBe(200);
    expect((await onRequestPost(ctx('POST', body))).status).toBe(409);
  });

  it('PUT met à jour seulement les champs fournis', async () => {
    const created = await (await onRequestPost(ctx('POST', {
      studentId: STUDENT, serviceKey: 'gouter_matin', schoolYear: YEAR,
      monthlyPrice: 45, unitPrice: 3, validFrom: '2026-09-01'
    }))).json() as any;
    const res = await onRequestPut(ctx('PUT', { id: created.id, monthlyPrice: 50, validTo: '2027-06-30' }));
    expect(res.status).toBe(200);
    expect(rows()[0]).toMatchObject({ monthly_price: 50, unit_price: 3, valid_to: '2027-06-30' });
  });

  it('PUT efface un prix avec null', async () => {
    const created = await (await onRequestPost(ctx('POST', {
      studentId: STUDENT, serviceKey: 'lunch', schoolYear: YEAR,
      monthlyPrice: 150, unitPrice: 8, validFrom: '2026-09-01'
    }))).json() as any;
    expect((await onRequestPut(ctx('PUT', { id: created.id, unitPrice: null }))).status).toBe(200);
    expect(rows()[0].unit_price).toBeNull();
  });

  it('PUT renvoie 404 pour un id inconnu', async () => {
    expect((await onRequestPut(ctx('PUT', { id: 'missing', monthlyPrice: 1 }))).status).toBe(404);
  });

  it('DELETE supprime l’inscription du centre', async () => {
    const created = await (await onRequestPost(ctx('POST', {
      studentId: STUDENT, serviceKey: 'lunch', schoolYear: YEAR, validFrom: '2026-09-01'
    }))).json() as any;
    expect((await onRequestDelete(ctx('DELETE', undefined, `?id=${created.id}`))).status).toBe(200);
    expect(rows()).toHaveLength(0);
  });

  it('GET filtre par élève, service et année', async () => {
    await onRequestPost(ctx('POST', { studentId: STUDENT, serviceKey: 'lunch', schoolYear: YEAR, validFrom: '2026-09-01' }));
    await onRequestPost(ctx('POST', { studentId: STUDENT, serviceKey: 'gouter_matin', schoolYear: YEAR, validFrom: '2026-09-01' }));
    const res = await onRequestGet(ctx('GET', undefined, `?studentId=${STUDENT}&serviceKey=gouter_matin&schoolYear=${YEAR}`));
    expect(res.status).toBe(200);
    const list = await res.json() as any[];
    expect(list).toHaveLength(1);
    expect(list[0].service_key).toBe('gouter_matin');
  });
});
