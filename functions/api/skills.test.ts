import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, onRequestPut } from './skills';
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

function putRequest(body: unknown) {
  return new Request('https://app.example/api/skills', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE skills (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, domain TEXT NOT NULL,
      label TEXT NOT NULL, age_from INTEGER, age_to INTEGER, created_at TEXT
    );
    CREATE TABLE skill_evaluations (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, student_id TEXT NOT NULL,
      skill_id TEXT NOT NULL, level TEXT NOT NULL,
      evaluated_by_staff_id TEXT, evaluated_by_name TEXT, evaluated_at TEXT NOT NULL
    );
    CREATE TABLE students (id TEXT PRIMARY KEY, center_id TEXT);
    INSERT INTO students VALUES ('stu_1', 'c1'), ('stu_b', 'c2');
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

const validSkill = { id: 'skl_1', domain: 'langage', label: 'Reconnaître les lettres' };
const validEval = {
  id: 'evl_1',
  studentId: 'stu_1',
  skillId: 'skl_1',
  level: 'en_cours',
  evaluatedByStaffId: 'stf_3',
  evaluatedAt: '2026-09-20'
};

function docWith(catalog: any[], evaluations: any[]) {
  return { catalog, evaluations };
}

describe('GET /api/skills', () => {
  it('returns the caller center document only', async () => {
    let ctx: any = { env: { DB: db }, request: putRequest(docWith([validSkill], [validEval])), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);

    ctx = { env: { DB: db }, request: putRequest(docWith([{ ...validSkill, id: 'skl_b' }], [])), data: {} };
    applySession(ctx, CENTER_B);
    await onRequestPut(ctx);

    const getA: any = { env: { DB: db }, request: new Request('https://app.example/api/skills'), data: {} };
    applySession(getA, CENTER_A);
    const docA: any = await (await onRequestGet(getA)).json();
    expect(docA.catalog.map((s: any) => s.id)).toEqual(['skl_1']);
    expect(docA.evaluations).toHaveLength(1);
    expect(docA.evaluations[0].centerId).toBe(CENTER_A);

    const getB: any = { env: { DB: db }, request: new Request('https://app.example/api/skills'), data: {} };
    applySession(getB, CENTER_B);
    const docB: any = await (await onRequestGet(getB)).json();
    expect(docB.catalog.map((s: any) => s.id)).toEqual(['skl_b']);
    expect(docB.evaluations).toHaveLength(0);
  });
});

describe('PUT /api/skills validation', () => {
  it('rejects a non-document payload with 400', async () => {
    for (const bad of ['nope', [1, 2], { catalog: [] }, { evaluations: [] }, null]) {
      const ctx: any = { env: { DB: db }, request: putRequest(bad), data: {} };
      applySession(ctx, CENTER_A);
      expect((await onRequestPut(ctx)).status).toBe(400);
    }
  });

  it('ignores payload centerId and stamps the session center', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest(docWith([{ ...validSkill, centerId: CENTER_B }], [])), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    const row = sqlite.prepare('SELECT center_id FROM skills WHERE id = ?').get('skl_1') as any;
    expect(row.center_id).toBe(CENTER_A);
  });

  it('drops evaluations whose skillId is absent from the same write (cascade)', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest(docWith([validSkill], [validEval, { ...validEval, id: 'evl_orphan', skillId: 'skl_gone' }])), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    const rows = sqlite.prepare('SELECT id FROM skill_evaluations').all() as any[];
    expect(rows.map(r => r.id)).toEqual(['evl_1']);
  });

  it('drops evaluations referencing a foreign-center student', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest(docWith([validSkill], [validEval, { ...validEval, id: 'evl_foreign', studentId: 'stu_b' }])), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    const rows = sqlite.prepare('SELECT id FROM skill_evaluations').all() as any[];
    expect(rows.map(r => r.id)).toEqual(['evl_1']);
  });

  it('enforces the evaluator discriminator (staff XOR name)', async () => {
    const ctx: any = {
      env: { DB: db },
      request: putRequest(docWith([validSkill], [
        { ...validEval, id: 'evl_both', evaluatedByName: 'Nom Libre' },
        { ...validEval, id: 'evl_neither', evaluatedByStaffId: '', evaluatedByName: undefined },
        { ...validEval, id: 'evl_name', evaluatedByStaffId: undefined, evaluatedByName: 'Nom Libre' }
      ])),
      data: {}
    };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    const rows = sqlite.prepare('SELECT id FROM skill_evaluations ORDER BY id').all() as any[];
    expect(rows.map(r => r.id)).toEqual(['evl_name']);
  });

  it('rejects invalid catalog rows and bad age ranges', async () => {
    const ctx: any = {
      env: { DB: db },
      request: putRequest(docWith([
        validSkill,
        { ...validSkill, id: 'bad_domain', domain: 'science' },
        { ...validSkill, id: 'no_label', label: '' },
        { ...validSkill, id: 'bad_age', ageFrom: 48, ageTo: 36 }
      ], [])),
      data: {}
    };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    const rows = sqlite.prepare('SELECT id FROM skills').all() as any[];
    expect(rows.map(r => r.id)).toEqual(['skl_1']);
  });

  it('keeps only the last evaluation per (studentId, skillId) pair', async () => {
    const ctx: any = {
      env: { DB: db },
      request: putRequest(docWith([validSkill], [
        { ...validEval, id: 'evl_first', level: 'non_evalue' },
        { ...validEval, id: 'evl_last', level: 'acquis' }
      ])),
      data: {}
    };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    const rows = sqlite.prepare('SELECT id, level FROM skill_evaluations').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe('acquis');
  });

  it('removing a skill from the catalog deletes its evaluations', async () => {
    // write with the skill
    let ctx: any = { env: { DB: db }, request: putRequest(docWith([validSkill], [validEval])), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    // write again without the skill: evaluation cascades away
    ctx = { env: { DB: db }, request: putRequest(docWith([], [])), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
    expect((sqlite.prepare('SELECT COUNT(*) n FROM skills').get() as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) n FROM skill_evaluations').get() as any).n).toBe(0);
  });
});

describe('middleware boundary', () => {
  it('registers /api/skills with GET and PUT only', () => {
    expect(ROUTES['/api/skills']).toEqual(['GET', 'PUT']);
  });

  it('returns 401 for unauthenticated access and 405 for wrong method', async () => {
    expect((await onRequest({ request: new Request('https://app.example/api/skills'), env: { DB: db }, data: {}, next: vi.fn() } as any)).status).toBe(401);
    const del = await onRequest({ request: new Request('https://app.example/api/skills', { method: 'POST' }), env: { DB: db }, data: {}, next: vi.fn() } as any);
    expect(del.status).toBe(405);
  });
});
