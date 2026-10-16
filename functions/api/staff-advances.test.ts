import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost, onRequestPut } from './staff-advances';
import { onRequest, ROUTES } from './_middleware';

vi.mock('./_lib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib')>();
  return { ...actual, validateSession: vi.fn(async () => null) };
});

const CENTER_A = 'c1';
const CENTER_B = 'c2';

let sqlite: DatabaseSync;
let db: any;

function applySession(context: any, centerId: string) {
  context.data = { session: { email: 'x@example.invalid', token: 't', centerId, role: 'admin' } };
}

function postRequest(body: unknown) {
  return new Request('https://app.example/api/staff-advances', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function putRequest(body: unknown) {
  return new Request('https://app.example/api/staff-advances', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  // Fixture alignée sur la migration admin (STRICT) : staff_advances a une FK
  // vers staff(id) et un CHECK (amount > 0).
  sqlite.exec(`
    CREATE TABLE staff (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, first_name TEXT NOT NULL,
      last_name TEXT NOT NULL, cin TEXT NOT NULL, cnss_number TEXT,
      phone TEXT NOT NULL, email TEXT, address TEXT, role TEXT NOT NULL,
      contract_type TEXT, contract_start_date TEXT NOT NULL,
      base_salary REAL NOT NULL CHECK (base_salary >= 0),
      cnss_amount REAL, hourly_rate REAL,
      status TEXT NOT NULL DEFAULT 'active',
      UNIQUE (center_id, cin)
    ) STRICT;
    CREATE TABLE staff_advances (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      amount REAL NOT NULL CHECK (amount > 0), date TEXT NOT NULL,
      reason TEXT NOT NULL, status TEXT NOT NULL
    ) STRICT;
    INSERT INTO staff VALUES ('stf_A', 'c1', 'Abir', 'Test', '55', '', '42', '', '', 'enseignant', NULL, '2026-10-16', 1000, 0, NULL, 'active');
    INSERT INTO staff VALUES ('stf_B', 'c2', 'Bob', 'Test', '56', '', '43', '', '', 'enseignant', NULL, '2026-10-16', 1000, 0, NULL, 'active');
  `);
  db = {
    prepare(sql: string) {
      let args: any[] = [];
      const stmt = {
        bind(...values: any[]) { args = values; return stmt; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { return sqlite.prepare(sql).run(...args); },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      for (const s of stmts) await s.run();
    },
  };
});

afterEach(() => sqlite.close());

const validAdvance = {
  id: 'adv_1',
  staffId: 'stf_A',
  amount: 100,
  date: '2026-10-16',
  reason: 'maladie',
  status: 'en_attente'
};

describe('POST /api/staff-advances', () => {
  it('creates ONE advance stamped with the caller center', async () => {
    const ctx: any = { env: { DB: db }, request: postRequest({ staffId: 'stf_A', advance: validAdvance }), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestPost(ctx)).status).toBe(200);
    const rows = sqlite.prepare('SELECT id, center_id, staff_id, amount, status FROM staff_advances').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'adv_1', center_id: CENTER_A, staff_id: 'stf_A', amount: 100, status: 'en_attente' });
  });

  it('is idempotent on re-post', async () => {
    for (let i = 0; i < 2; i++) {
      const ctx: any = { env: { DB: db }, request: postRequest({ staffId: 'stf_A', advance: validAdvance }), data: {} };
      applySession(ctx, CENTER_A);
      await onRequestPost(ctx);
    }
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM staff_advances').get() as any).n).toBe(1);
  });

  it('rejects a foreign-center staff with 400', async () => {
    const ctx: any = { env: { DB: db }, request: postRequest({ staffId: 'stf_B', advance: validAdvance }), data: {} };
    applySession(ctx, CENTER_A);
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM staff_advances').get() as any).n).toBe(0);
  });

  it('rejects an invalid body (array / amount <= 0 / bad status) with 400', async () => {
    const bads = [
      [],
      { staffId: 'stf_A', advance: { ...validAdvance, amount: 0 } },
      { staffId: 'stf_A', advance: { id: 'x' } },
      { staffId: 'stf_A', advance: { ...validAdvance, status: 'nope' } }
    ];
    for (const bad of bads) {
      const ctx: any = { env: { DB: db }, request: postRequest(bad), data: {} };
      applySession(ctx, CENTER_A);
      expect((await onRequestPost(ctx)).status).toBe(400);
    }
  });
});

describe('PUT /api/staff-advances', () => {
  beforeEach(async () => {
    const ctx: any = { env: { DB: db }, request: postRequest({ staffId: 'stf_A', advance: validAdvance }), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPost(ctx);
  });

  it('approves ONE advance (status only)', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest({ staffId: 'stf_A', advanceId: 'adv_1', status: 'approuve' }), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestPut(ctx)).status).toBe(200);
    expect((sqlite.prepare('SELECT status FROM staff_advances WHERE id = ?').get('adv_1') as any).status).toBe('approuve');
  });

  it('refuses an advance (status only)', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest({ staffId: 'stf_A', advanceId: 'adv_1', status: 'refuse' }), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    expect((sqlite.prepare('SELECT status FROM staff_advances WHERE id = ?').get('adv_1') as any).status).toBe('refuse');
  });

  it('rejects an invalid status / unknown advance with 400', async () => {
    for (const body of [
      { staffId: 'stf_A', advanceId: 'adv_1', status: 'peut_etre' },
      { staffId: 'stf_A', advanceId: 'adv_gone', status: 'approuve' }
    ]) {
      const ctx: any = { env: { DB: db }, request: putRequest(body), data: {} };
      applySession(ctx, CENTER_A);
      expect((await onRequestPut(ctx)).status).toBe(400);
    }
  });
});

describe('middleware boundary', () => {
  it('registers /api/staff-advances with POST/PUT', () => {
    expect(ROUTES['/api/staff-advances']).toEqual(['POST', 'PUT']);
  });

  it('returns 401 for unauthenticated access and 405 for wrong method', async () => {
    expect((await onRequest({ request: postRequest({}), env: { DB: db }, data: {}, next: vi.fn() } as any)).status).toBe(401);
    const patch = await onRequest({ request: new Request('https://app.example/api/staff-advances', { method: 'PATCH' }), env: { DB: db }, data: {}, next: vi.fn() } as any);
    expect(patch.status).toBe(405);
  });
});
