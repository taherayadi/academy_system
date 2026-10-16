import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, onRequestPut, onRequestPost, onRequestDelete } from './skills';
import { onRequestPost as onEvalPost } from './skill-evaluations';
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

function postRequest(body: unknown, path = '/api/skills') {
  return new Request(`https://app.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function deleteRequest(id: string, path = '/api/skills') {
  return new Request(`https://app.example${path}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  // Fixture alignée sur la migration admin (STRICT) : created_at et
  // evaluated_at INTEGER — le client envoie des ISO strings, le writer doit
  // les normaliser en epoch-ms sinon le batch est rejeté en silence.
  sqlite.exec(`
    CREATE TABLE skills (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, domain TEXT NOT NULL,
      label TEXT NOT NULL, age_from INTEGER, age_to INTEGER, created_at INTEGER,
      CHECK (age_from IS NULL OR age_to IS NULL OR age_to >= age_from)
    ) STRICT;
    CREATE TABLE skill_evaluations (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, student_id TEXT NOT NULL,
      skill_id TEXT NOT NULL, level TEXT NOT NULL,
      evaluated_by_staff_id TEXT, evaluated_by_name TEXT, evaluated_at INTEGER NOT NULL
    ) STRICT;
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

  it('stores STRICT INTEGER created_at/evaluated_at from ISO strings (prod schema regression)', async () => {
    const ctx: any = {
      env: { DB: db },
      request: putRequest(docWith(
        [{ ...validSkill, createdAt: '2026-10-01T08:00:00.000Z' }],
        [{ ...validEval, evaluatedAt: '2026-09-20' }]
      )),
      data: {}
    };
    applySession(ctx, CENTER_A);
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(200);

    const skillRow = sqlite.prepare('SELECT created_at FROM skills WHERE id = ?').get('skl_1') as any;
    expect(typeof skillRow.created_at).toBe('number');
    expect(skillRow.created_at).toBe(Date.parse('2026-10-01T08:00:00.000Z'));

    const evalRow = sqlite.prepare('SELECT evaluated_at FROM skill_evaluations WHERE id = ?').get('evl_1') as any;
    expect(typeof evalRow.evaluated_at).toBe('number');
    expect(evalRow.evaluated_at).toBe(Date.parse('2026-09-20'));

    // GET reconstruit les formats domaine : ISO date pour evaluatedAt.
    const getCtx: any = { env: { DB: db }, request: new Request('https://app.example/api/skills'), data: {} };
    applySession(getCtx, CENTER_A);
    const doc: any = await (await onRequestGet(getCtx)).json();
    expect(doc.evaluations[0].evaluatedAt).toBe('2026-09-20');
    expect(doc.catalog[0].createdAt).toBe('2026-10-01T08:00:00.000Z');
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

describe('POST /api/skills', () => {
  it('creates ONE skill and leaves other skills intact', async () => {
    let ctx: any = { env: { DB: db }, request: putRequest(docWith([validSkill], [])), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);

    ctx = { env: { DB: db }, request: postRequest({ ...validSkill, id: 'skl_2', label: 'Compter' }), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestPost(ctx)).status).toBe(200);

    const rows = sqlite.prepare('SELECT id FROM skills ORDER BY id').all() as any[];
    expect(rows.map(r => r.id)).toEqual(['skl_1', 'skl_2']);
  });

  it('is idempotent (re-POST of the same id rewrites only that row)', async () => {
    const first: any = { env: { DB: db }, request: postRequest({ ...validSkill, id: 'skl_1', label: 'A' }), data: {} };
    applySession(first, CENTER_A);
    await onRequestPost(first);
    const second: any = { env: { DB: db }, request: postRequest({ ...validSkill, id: 'skl_1', label: 'B' }), data: {} };
    applySession(second, CENTER_A);
    await onRequestPost(second);
    const rows = sqlite.prepare('SELECT id, label FROM skills').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('B');
  });

  it('rejects an invalid skill with 400 and an array body with 400', async () => {
    let ctx: any = { env: { DB: db }, request: postRequest({ ...validSkill, domain: 'science' }), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestPost(ctx)).status).toBe(400);
    ctx = { env: { DB: db }, request: postRequest([validSkill]), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestPost(ctx)).status).toBe(400);
  });

  it('rejects an id already owned by another center', async () => {
    let ctx: any = { env: { DB: db }, request: postRequest(validSkill), data: {} };
    applySession(ctx, CENTER_B);
    await onRequestPost(ctx);
    const hijack: any = { env: { DB: db }, request: postRequest({ ...validSkill, label: 'Hijacked' }), data: {} };
    applySession(hijack, CENTER_A);
    expect((await onRequestPost(hijack)).status).toBe(400);
  });

  it('a single skill object sent via PUT takes the targeted path (parity with POST)', async () => {
    const ctx: any = { env: { DB: db }, request: putRequest({ ...validSkill, id: 'skl_put', label: 'x' }), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestPut(ctx)).status).toBe(200);
    expect((sqlite.prepare('SELECT id FROM skills').all() as any[]).map(r => r.id)).toEqual(['skl_put']);
  });

  it('stores INTEGER created_at from an ISO string', async () => {
    const ctx: any = { env: { DB: db }, request: postRequest({ ...validSkill, createdAt: '2026-10-02T09:00:00.000Z' }), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPost(ctx);
    const row = sqlite.prepare('SELECT created_at FROM skills WHERE id = ?').get('skl_1') as any;
    expect(row.created_at).toBe(Date.parse('2026-10-02T09:00:00.000Z'));
  });
});

describe('DELETE /api/skills', () => {
  it('deletes ONE skill and its evaluations, leaving others intact', async () => {
    let ctx: any = { env: { DB: db }, request: putRequest(docWith([validSkill, { ...validSkill, id: 'skl_keep' }], [validEval])), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);

    ctx = { env: { DB: db }, request: deleteRequest('skl_1'), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestDelete(ctx)).status).toBe(200);

    expect((sqlite.prepare('SELECT id FROM skills').all() as any[]).map(r => r.id)).toEqual(['skl_keep']);
    expect((sqlite.prepare('SELECT COUNT(*) n FROM skill_evaluations').get() as any).n).toBe(0);
  });

  it('returns 400 on a missing id and 400 on an unknown id', async () => {
    let ctx: any = { env: { DB: db }, request: new Request('https://app.example/api/skills', { method: 'DELETE' }), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestDelete(ctx)).status).toBe(400);
    ctx = { env: { DB: db }, request: deleteRequest('skl_gone'), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestDelete(ctx)).status).toBe(400);
  });

  it('rejects a cross-center delete', async () => {
    let ctx: any = { env: { DB: db }, request: postRequest(validSkill), data: {} };
    applySession(ctx, CENTER_B);
    await onRequestPost(ctx);
    const foreign: any = { env: { DB: db }, request: deleteRequest('skl_1'), data: {} };
    applySession(foreign, CENTER_A);
    expect((await onRequestDelete(foreign)).status).toBe(400);
  });
});

describe('POST /api/skill-evaluations', () => {
  beforeEach(async () => {
    const ctx: any = { env: { DB: db }, request: putRequest(docWith([validSkill], [])), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPut(ctx);
  });

  it('adds ONE evaluation', async () => {
    const ctx: any = { env: { DB: db }, request: postRequest(validEval, '/api/skill-evaluations'), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onEvalPost(ctx)).status).toBe(200);
    const rows = sqlite.prepare('SELECT id, evaluated_at FROM skill_evaluations').all() as any[];
    expect(rows.map(r => r.id)).toEqual(['evl_1']);
    expect(rows[0].evaluated_at).toBe(Date.parse('2026-09-20'));
  });

  it('replaces the previous evaluation for the same (student, skill) pair', async () => {
    let ctx: any = { env: { DB: db }, request: postRequest(validEval, '/api/skill-evaluations'), data: {} };
    applySession(ctx, CENTER_A);
    await onEvalPost(ctx);
    ctx = { env: { DB: db }, request: postRequest({ ...validEval, id: 'evl_2', level: 'acquis' }, '/api/skill-evaluations'), data: {} };
    applySession(ctx, CENTER_A);
    await onEvalPost(ctx);
    const rows = sqlite.prepare('SELECT id, level FROM skill_evaluations').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe('acquis');
    expect(rows[0].id).toBe('evl_2');
  });

  it('stores the __me__ self sentinel in evaluated_by_staff_id', async () => {
    const ctx: any = { env: { DB: db }, request: postRequest({ ...validEval, evaluatedByStaffId: '__me__' }, '/api/skill-evaluations'), data: {} };
    applySession(ctx, CENTER_A);
    await onEvalPost(ctx);
    const row = sqlite.prepare('SELECT evaluated_by_staff_id FROM skill_evaluations').get() as any;
    expect(row.evaluated_by_staff_id).toBe('__me__');
  });

  it('rejects an invalid body / foreign skill / foreign student with 400', async () => {
    let ctx: any = { env: { DB: db }, request: postRequest([validEval], '/api/skill-evaluations'), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onEvalPost(ctx)).status).toBe(400);

    ctx = { env: { DB: db }, request: postRequest({ ...validEval, skillId: 'skl_gone' }, '/api/skill-evaluations'), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onEvalPost(ctx)).status).toBe(400);

    ctx = { env: { DB: db }, request: postRequest({ ...validEval, studentId: 'stu_b' }, '/api/skill-evaluations'), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onEvalPost(ctx)).status).toBe(400);
  });
});

describe('middleware boundary', () => {
  it('registers /api/skills with GET/POST/PUT/DELETE and /api/skill-evaluations with POST', () => {
    expect(ROUTES['/api/skills']).toEqual(['GET', 'POST', 'PUT', 'DELETE']);
    expect(ROUTES['/api/skill-evaluations']).toEqual(['POST']);
  });

  it('returns 401 for unauthenticated access and 405 for wrong method', async () => {
    expect((await onRequest({ request: new Request('https://app.example/api/skills'), env: { DB: db }, data: {}, next: vi.fn() } as any)).status).toBe(401);
    const patch = await onRequest({ request: new Request('https://app.example/api/skills', { method: 'PATCH' }), env: { DB: db }, data: {}, next: vi.fn() } as any);
    expect(patch.status).toBe(405);
  });
});
