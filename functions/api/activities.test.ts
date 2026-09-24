import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPut } from './activities';
import { onRequest, ROUTES } from './_middleware';
import { vi } from 'vitest';

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

function putRequest(body: unknown) {
  return new Request('https://app.example/api/activities', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE activities (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, title TEXT NOT NULL,
      category TEXT NOT NULL, weekday INTEGER, date TEXT,
      time_start TEXT NOT NULL, time_end TEXT NOT NULL,
      location TEXT, level_class TEXT, staff_id TEXT, created_at TEXT
    );
    CREATE TABLE students (id TEXT PRIMARY KEY, center_id TEXT);
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

const validActivity = {
  id: 'act_1',
  title: 'Atelier peinture',
  category: 'art',
  weekday: 2,
  timeStart: '10:00',
  timeEnd: '11:00'
};

describe('GET /api/activities', () => {
  it('returns the caller center activities only', async () => {
    let ctx: any = { env: { DB: db }, request: putRequest([validActivity]), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    // second center writes its own activity
    ctx = { env: { DB: db }, request: putRequest([{ ...validActivity, id: 'act_b', title: 'B center' }]), data: {} };
    applySession(ctx, CENTER_B);
    await onRequestPut(ctx);

    const getA: any = { env: { DB: db }, request: new Request('https://app.example/api/activities'), data: {} };
    applySession(getA, CENTER_A);
    const res = await onRequestGet(getA);
    expect(res.status).toBe(200);
    const rows: any[] = await res.json();
    expect(rows.length).toBe(1);
    expect(rows[0].centerId).toBe(CENTER_A);
  });

  it('rejects a missing center context with the 500 error envelope', async () => {
    const ctx: any = { env: { DB: db }, request: new Request('https://app.example/api/activities'), data: {} };
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(500);
    const body: any = await res.json();
    expect(typeof body.error).toBe('string');
  });
});

describe('PUT /api/activities', () => {
  it('rejects a non-array payload with 400', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest({ foo: 1 }), data: {} };
    applySession(ctx, CENTER_A);
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(400);
  });

  it('ignores payload centerId and stamps the session center on write', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest([{ ...validActivity, centerId: CENTER_B }]), data: {} };
    applySession(ctx, CENTER_A);
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT center_id FROM activities WHERE id = ?').get('act_1') as any;
    expect(row.center_id).toBe(CENTER_A);
  });

  it('requires weekday 0-6 when no date is given', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest([{ ...validActivity, id: 'bad_wd_only', weekday: 9 }]), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    const rows = sqlite.prepare('SELECT id FROM activities').all() as any[];
    expect(rows.map(r => r.id)).toEqual([]);
  });

  it('isolation both directions: centers never see each other rows', async () => {
    // center A writes act_a, center B writes act_b
    let ctx: any = { env: { DB: db }, request: putRequest([{ ...validActivity, id: 'act_a' }]), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);

    ctx = { env: { DB: db }, request: putRequest([{ ...validActivity, id: 'act_b', title: 'De B' }]), data: {} };
    applySession(ctx, CENTER_B);
    await onRequestPut(ctx);

    const getA: any = { env: { DB: db }, request: new Request('https://app.example/api/activities'), data: {} };
    applySession(getA, CENTER_A);
    const rowsA: any[] = await (await onRequestGet(getA)).json();

    const getB: any = { env: { DB: db }, request: new Request('https://app.example/api/activities'), data: {} };
    applySession(getB, CENTER_B);
    const rowsB: any[] = await (await onRequestGet(getB)).json();

    expect(rowsA.map((r: any) => r.id)).toEqual(['act_a']);
    expect(rowsB.map((r: any) => r.id)).toEqual(['act_b']);
  });

  it('drops invalid rows: empty title, bad category, timeStart >= timeEnd, weekday out of range', async () => {
    const payload = [
      { ...validActivity, id: 'ok1' },
      { ...validActivity, id: 'no_title', title: '   ' },
      { ...validActivity, id: 'bad_cat', category: 'sport' },
      { ...validActivity, id: 'bad_time', timeStart: '12:00', timeEnd: '11:00' },
      { ...validActivity, id: 'bad_wd', weekday: 9, date: undefined }
    ];
    const ctx: any = { env: { DB: db }, request: putRequest(payload), data: {} };
    applySession(ctx, CENTER_A);
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(200);
    const rows = sqlite.prepare('SELECT id FROM activities ORDER BY id').all() as any[];
    expect(rows.map(r => r.id)).toEqual(['ok1']);
  });

  it('allows a date to override the weekday', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest([{ ...validActivity, id: 'dated', date: '2026-10-05' }]), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    const row = sqlite.prepare('SELECT date, weekday FROM activities WHERE id = ?').get('dated') as any;
    expect(row.date).toBe('2026-10-05');
    expect(row.weekday).toBeNull();
  });

  it('replaces the whole domain: removed activities are deleted', async () => {
    let ctx: any = { env: { DB: db }, request: putRequest([{ ...validActivity, id: 'a1' }, { ...validActivity, id: 'a2' }]), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);

    ctx = { env: { DB: db }, request: putRequest([{ ...validActivity, id: 'a1' }]), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);

    const rows = sqlite.prepare('SELECT id FROM activities').all() as any[];
    expect(rows.map(r => r.id)).toEqual(['a1']);
  });
});

describe('middleware boundary', () => {
  it('registers /api/activities with GET and PUT only', () => {
    expect(ROUTES['/api/activities']).toEqual(['GET', 'PUT']);
  });

  it('returns 401 for unauthenticated access and 405 for wrong method', async () => {
    expect((await onRequest({ request: new Request('https://app.example/api/activities'), env: { DB: db }, data: {}, next: vi.fn() } as any)).status).toBe(401);
    const del = await onRequest({ request: new Request('https://app.example/api/activities', { method: 'DELETE' }), env: { DB: db }, data: {}, next: vi.fn() } as any);
    expect(del.status).toBe(405);
  });
});
