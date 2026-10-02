import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet, onRequestPost } from './modules';
import { validateSession } from './_lib';

vi.mock('./_lib', async (importOriginal) => {
  const lib = await importOriginal<typeof import('./_lib')>();
  return {
    ...lib,
    validateSession: vi.fn(async () => ({ role: 'platform_super_admin', email: 'root@test.tn' })),
    json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
  };
});

// ── Fake D1 carrying modules + center_types + center_type_modules ───────────
interface DbState {
  modules: any[];
  centerTypes: any[];
  eligibility: Array<{ center_type: string; module_key: string }>;
}

function makeDb(state: DbState) {
  const readAll = (sql: string) => {
    if (sql.includes('FROM modules')) return state.modules;
    if (sql.includes('FROM center_types')) return state.centerTypes;
    if (sql.includes('FROM center_type_modules')) return state.eligibility;
    return [];
  };
  const exec = (sql: string, args: any[]) => {
    if (sql.includes('DELETE FROM center_type_modules')) {
      state.eligibility = state.eligibility.filter(r => r.module_key !== args[0]);
    } else if (sql.includes('INSERT INTO center_type_modules')) {
      const row = { center_type: args[0], module_key: args[1] };
      if (!state.eligibility.some(r => r.center_type === row.center_type && r.module_key === row.module_key)) {
        state.eligibility.push(row);
      }
    }
  };
  const stmt = (sql: string) => ({
    bind(...args: any[]) {
      return {
        async first() { return null; },
        async all() { return { results: readAll(sql).map(r => ({ ...r })) }; },
        async run() { exec(sql, args); return { meta: { changes: 1 } }; },
      };
    },
    async all() { return { results: readAll(sql).map(r => ({ ...r })) }; },
    async first() { return null; },
    async run() { exec(sql, []); return { meta: { changes: 0 } }; },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    async batch(stmts: any[]) {
      for (const s of stmts) await s.run();
      return { results: [] };
    },
  };
}

function seed(): DbState {
  return {
    modules: [
      { key: 'scolaire', label: 'Scolaire', label_ar: 'مدرسي', isBasic: 1, isUnbilled: 0, isHidden: 0 },
      { key: 'cantine', label: 'Cantine', label_ar: 'المطعم', isBasic: 0, isUnbilled: 0, isHidden: 0 },
      { key: 'etude', label: 'Étude', label_ar: 'الدراسة', isBasic: 0, isUnbilled: 0, isHidden: 0 },
      { key: 'bibliotheque', label: 'Bibliothèque', label_ar: 'المكتبة', isBasic: 0, isUnbilled: 1, isHidden: 1 },
    ],
    centerTypes: [
      { key: 'creche', label: 'Crèche', label_ar: 'حضانة', hint: '' },
      { key: 'jardin', label: 'Jardin', label_ar: 'روضة', hint: '' },
      { key: 'garderie', label: 'Garderie', label_ar: 'دار الرعاية', hint: '' },
      { key: 'formation', label: 'Formation', label_ar: 'تكوين', hint: '' },
      { key: 'other', label: 'Other', label_ar: 'أخرى', hint: '' }, // sentinel, never actionable
    ],
    eligibility: [
      // cantine → every type, etude → school-support types only
      { center_type: 'creche', module_key: 'cantine' },
      { center_type: 'jardin', module_key: 'cantine' },
      { center_type: 'garderie', module_key: 'cantine' },
      { center_type: 'formation', module_key: 'cantine' },
      { center_type: 'garderie', module_key: 'etude' },
      { center_type: 'formation', module_key: 'etude' },
    ],
  };
}

const rowsFor = (state: DbState, key: string) =>
  state.eligibility.filter(r => r.module_key === key).map(r => r.center_type).sort();

function post(db: ReturnType<typeof makeDb>, body: Record<string, unknown>, role = 'platform_super_admin') {
  (validateSession as any).mockResolvedValueOnce({ role });
  const request = new Request('https://example.test/api/modules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return onRequestPost({ env: { DB: db }, request } as any);
}

const get = (db: ReturnType<typeof makeDb>) =>
  onRequestGet({ env: { DB: db }, request: new Request('https://example.test/api/modules') } as any);

beforeEach(() => vi.clearAllMocks());

describe('GET /api/modules — catalog payload', () => {
  it('serves the eligibility matrix as allowedCenterTypes (empty ⇒ universal)', async () => {
    const state = seed();
    const res = await get(makeDb(state));
    expect(res.status).toBe(200);
    const payload = await res.json() as any;
    const find = (k: string) => payload.modules.find((m: any) => m.key === k);
    expect(find('cantine').allowedCenterTypes).toHaveLength(4);
    expect(find('etude').allowedCenterTypes.sort()).toEqual(['formation', 'garderie']);
    expect(find('scolaire').isBasic).toBe(true);
    expect(payload.centerTypes.map((ct: any) => ct.key)).toEqual(['creche', 'jardin', 'garderie', 'formation']); // no 'other'
  });
});

describe('POST /api/modules — update-module-eligibility', () => {
  it('replaces the rows of one module and answers with the fresh catalog', async () => {
    const state = seed();
    const res = await post(makeDb(state), { action: 'update-module-eligibility', key: 'etude', allowedCenterTypes: ['creche', 'garderie'] });
    expect(res.status).toBe(200);
    expect(rowsFor(state, 'etude')).toEqual(['creche', 'garderie']);
    expect(rowsFor(state, 'cantine')).toHaveLength(4); // other modules untouched

    const body = await res.json() as any;
    expect(body.success).toBe(true);
    const etude = body.catalog.modules.find((m: any) => m.key === 'etude');
    expect(etude.allowedCenterTypes.sort()).toEqual(['creche', 'garderie']);
  });

  it('[] clears every row — the module becomes allowed everywhere again', async () => {
    const state = seed();
    const res = await post(makeDb(state), { action: 'update-module-eligibility', key: 'etude', allowedCenterTypes: [] });
    expect(res.status).toBe(200);
    expect(rowsFor(state, 'etude')).toHaveLength(0);
    const body = await res.json() as any;
    expect(body.catalog.modules.find((m: any) => m.key === 'etude').allowedCenterTypes).toEqual([]);
  });

  it('writing every type keeps one row per type — which reads as universal', async () => {
    const state = seed();
    const res = await post(makeDb(state), { action: 'update-module-eligibility', key: 'etude', allowedCenterTypes: ['creche', 'jardin', 'garderie', 'formation'] });
    expect(res.status).toBe(200);
    // The server writes exactly what it is asked for (the seed data does the
    // same); a full set and no rows at all are read identically.
    expect(rowsFor(state, 'etude')).toEqual(['creche', 'formation', 'garderie', 'jardin']);
    const body = await res.json() as any;
    expect(body.catalog.modules.find((m: any) => m.key === 'etude').allowedCenterTypes).toHaveLength(4);
  });

  it('rejects an unknown center type without touching the rows (400)', async () => {
    const state = seed();
    const before = rowsFor(state, 'etude');
    const res = await post(makeDb(state), { action: 'update-module-eligibility', key: 'etude', allowedCenterTypes: ['garderie', 'atlantis'] });
    expect(res.status).toBe(400);
    expect(rowsFor(state, 'etude')).toEqual(before);
  });

  it('rejects the «other» sentinel — it is not an actionable center type (400)', async () => {
    const state = seed();
    const res = await post(makeDb(state), { action: 'update-module-eligibility', key: 'etude', allowedCenterTypes: ['other'] });
    expect(res.status).toBe(400);
    expect(rowsFor(state, 'etude')).toEqual(['formation', 'garderie']);
  });

  it('404 for an unknown module key', async () => {
    const state = seed();
    const res = await post(makeDb(state), { action: 'update-module-eligibility', key: 'nope', allowedCenterTypes: ['creche'] });
    expect(res.status).toBe(404);
  });

  it('400 when allowedCenterTypes is missing (the payload must be explicit)', async () => {
    const state = seed();
    const res = await post(makeDb(state), { action: 'update-module-eligibility', key: 'etude' });
    expect(res.status).toBe(400);
    expect(rowsFor(state, 'etude')).toEqual(['formation', 'garderie']);
  });

  it('403 for a session that is not the platform super admin', async () => {
    const state = seed();
    const res = await post(makeDb(state), { action: 'update-module-eligibility', key: 'etude', allowedCenterTypes: ['creche'] }, 'center_admin');
    expect(res.status).toBe(403);
    expect(rowsFor(state, 'etude')).toEqual(['formation', 'garderie']);
  });

  it('400 for an unknown action', async () => {
    const state = seed();
    const res = await post(makeDb(state), { action: 'drop-everything' });
    expect(res.status).toBe(400);
  });
});
