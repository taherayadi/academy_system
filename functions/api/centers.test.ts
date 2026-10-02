import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost, onRequestPatch } from './centers';

vi.mock('./_lib', async (importOriginal) => {
  const lib = await importOriginal<typeof import('./_lib')>();
  return {
    ...lib,
    readBody: vi.fn(async (request: Request) => request.json()),
    json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
    // bcrypt is pure overhead here — the shape of the stored hash is not under test.
    hashPassword: vi.fn(async () => '$2b$10$hashedpasswordhashhashhashhashhashhashhashhashhashhashha'),
    // The session carries BOTH identities: the fix must write the users.id.
    validateSession: vi.fn(async () => ({ role: 'platform_super_admin', email: 'platform@test.tn', userId: 'platform-super-admin-001' })),
  };
});

vi.mock('./_pubnub', () => ({ publishOnResponse: vi.fn() }));

// ── Schema-faithful fake D1 ─────────────────────────────────────────────────
// The rules that broke center creation in production are encoded here: the
// `centers` and `center_settings` tables declare `updated_at INTEGER NOT NULL`
// with NO default (see scripts/remote-schema.sql), so an INSERT that forgets
// the column aborts the whole D1 batch and the center is never created.
interface State {
  executed: Array<{ sql: string; args: any[] }>;
}

const MODULE_ROWS = [
  { key: 'scolaire', label: 'Scolaire', label_ar: 'مدرسي', isBasic: 1, isUnbilled: 0, isHidden: 0 },
  { key: 'finance', label: 'Finance', label_ar: 'مالية', isBasic: 1, isUnbilled: 0, isHidden: 0 },
  { key: 'studentTimeSheets', label: 'Emplois du temps', label_ar: 'جداول الأوقات', isBasic: 1, isUnbilled: 1, isHidden: 0 },
  { key: 'cantine', label: 'Cantine', label_ar: 'المطعم', isBasic: 0, isUnbilled: 0, isHidden: 0 },
  { key: 'etude', label: 'Étude', label_ar: 'الدراسة', isBasic: 0, isUnbilled: 0, isHidden: 0 },
];
const TYPE_ROWS = [
  { key: 'creche', label: 'Crèche', label_ar: 'حضانة', hint: '' },
  { key: 'jardin', label: 'Jardin', label_ar: 'روضة', hint: '' },
  { key: 'garderie', label: 'Garderie', label_ar: 'دار الرعاية', hint: '' },
  { key: 'formation', label: 'Formation', label_ar: 'تكوين', hint: '' },
  { key: 'other', label: 'Other', label_ar: 'أخرى', hint: '' },
];
const ELIG_ROWS = [
  { center_type: 'garderie', module_key: 'etude' },
  { center_type: 'garderie', module_key: 'cantine' },
  { center_type: 'creche', module_key: 'cantine' },
];

function columnList(sql: string): string[] {
  const open = sql.indexOf('(');
  const close = sql.indexOf(')', open);
  return sql.slice(open + 1, close).split(',').map(s => s.trim());
}

function enforceDdl(sql: string): void {
  if (/INSERT INTO centers\s*\(/i.test(sql) && !columnList(sql).includes('updated_at')) {
    throw new Error('NOT NULL constraint failed: centers.updated_at');
  }
  if (/INSERT INTO center_settings\s*\(/i.test(sql) && !columnList(sql).includes('updated_at')) {
    throw new Error('NOT NULL constraint failed: center_settings.updated_at');
  }
}

/** users.id of the session — the only value `created_by` may hold (it is a
 *  real FK: `center_meal_mode_history.created_by → users(id)`). Passing the
 *  session email here is what made center creation roll back with
 *  `FOREIGN KEY constraint failed`. */
const USER_IDS = new Set(['platform-super-admin-001']);

// ── Existing centers for the PATCH tests ────────────────────────────────────
// The trial row is stored as plan='starter' (CHECK constraint) while holding
// MORE than the base modules — the exact shape that used to lose them: the
// starter preset rewrote center_modules to base on every update.
const TRIAL_CENTER_ID = 'ctr-trial-001';
const STARTER_CENTER_ID = 'ctr-starter-001';
const SEEDED_MODULES = ['scolaire', 'finance', 'studentTimeSheets', 'cantine'];

function centerRow(id: string) {
  const trial = id === TRIAL_CENTER_ID;
  return {
    id,
    plan: 'starter',
    status: trial ? 'trial' : 'active',
    billing_cycle: 'monthly',
    monthly_price: 0,
    subscription_ends_at: trial ? 0 : Date.now() + 30 * 86400000,
    trial_ends_at: trial ? Date.now() + 14 * 86400000 : null,
    center_type: 'garderie',
  };
}

function makeDb(state: State) {
  const rowsFor = (sql: string, args: any[] = []): any[] => {
    if (sql.includes('FROM modules')) return MODULE_ROWS;
    if (sql.includes('FROM center_type_modules')) return ELIG_ROWS;
    if (sql.includes('FROM center_types')) return TYPE_ROWS;
    // PATCH center lookup: `SELECT plan, status, … FROM centers WHERE id = ?`.
    if (sql.includes('SELECT plan, status')) {
      const id = String(args[0] || '');
      return id === TRIAL_CENTER_ID || id === STARTER_CENTER_ID ? [centerRow(id)] : [];
    }
    if (sql.includes('FROM center_modules WHERE center_id')) {
      const id = String(args[0] || '');
      return id === TRIAL_CENTER_ID || id === STARTER_CENTER_ID
        ? SEEDED_MODULES.map(key => ({ module_key: key }))
        : [];
    }
    return []; // users / slug / name / demo_requests lookups → no duplicates
  };
  const run = (sql: string, args: any[]) => {
    enforceDdl(sql);
    if (sql.includes('INSERT INTO center_meal_mode_history')) {
      const createdBy = args[3]; // (center_id, mode, effective_from, created_by, created_at)
      if (createdBy != null && !USER_IDS.has(String(createdBy))) {
        throw new Error(`FOREIGN KEY constraint failed: center_meal_mode_history.created_by → users(id) [got "${createdBy}"]`);
      }
    }
    state.executed.push({ sql, args });
  };
  const stmt = (sql: string) => ({
    bind(...args: any[]) {
      return {
        async first() { return rowsFor(sql, args)[0] ? { ...rowsFor(sql, args)[0] } : null; },
        async all() { return { results: rowsFor(sql, args).map(r => ({ ...r })) }; },
        async run() { run(sql, args); return { meta: { changes: 1 } }; },
      };
    },
    async first() { return rowsFor(sql)[0] ? { ...rowsFor(sql)[0] } : null; },
    async all() { return { results: rowsFor(sql).map(r => ({ ...r })) }; },
    async run() { run(sql, []); return { meta: { changes: 0 } }; },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    async batch(stmts: any[]) {
      for (const s of stmts) await s.run(); // D1 batches are atomic — a throw aborts all
      return { results: [] };
    },
  };
}

/** The payload that reproduced the 500 «خطأ في إنشاء المركز». */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test center',
    logoUrl: '',
    phoneNumber: '25252525',
    locationCity: 'sfax',
    plan: 'trial',
    billingCycle: 'monthly',
    monthlyPrice: '',
    trialDays: '14',
    offerDays: '0',
    centerType: 'garderie',
    directorName: 'test',
    directorEmail: 'test@gmail.com',
    directorPassword: 'taherayadi',
    enabledModules: ['scolaire', 'finance'],
    adminName: 'test',
    adminEmail: 'test@gmail.com',
    adminPassword: 'taherayadi',
    ...overrides,
  };
}

async function createCenter(state: State, body: Record<string, unknown> = payload()) {
  const request = new Request('https://example.test/api/centers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return onRequestPost({ env: { DB: makeDb(state) }, request } as any);
}

async function patchCenter(state: State, body: Record<string, unknown>) {
  const request = new Request('https://example.test/api/centers', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return onRequestPatch({ env: { DB: makeDb(state) }, request } as any);
}

const sqlOf = (state: State, fragment: string) =>
  state.executed.find(e => e.sql.includes(fragment));

/** module keys of an `INSERT INTO center_modules (center_id, module_key) …`. */
const moduleKeysOf = (mod: { args: any[] }) => mod.args.filter((_, i) => i % 2 === 1);

beforeEach(() => vi.clearAllMocks());

describe('POST /api/centers — create', () => {
  it('creates a trial center (the batch no longer dies on a missing updated_at)', async () => {
    const state: State = { executed: [] };
    const res = await createCenter(state);
    expect(res.status).toBe(201);
    expect((await res.json() as any).success).toBe(true);
  });

  it('writes updated_at on both NOT NULL tables', async () => {
    const state: State = { executed: [] };
    await createCenter(state);

    const centerSql = sqlOf(state, 'INSERT INTO centers')!.sql;
    expect(centerSql).toMatch(/\bupdated_at\b/);
    const settingsSql = sqlOf(state, 'INSERT INTO center_settings')!.sql;
    expect(settingsSql).toMatch(/\bupdated_at\b/);
    // Same timestamp as created_at — the row is new when it is written.
    const now = expect.any(Number);
    expect(sqlOf(state, 'INSERT INTO centers')!.args.slice(-2)).toEqual([now, now]);
  });

  it('normalizes plan «trial» to starter/status trial (CHECK constraint)', async () => {
    const state: State = { executed: [] };
    await createCenter(state);
    const args = sqlOf(state, 'INSERT INTO centers')!.args;
    expect(args[5]).toBe('starter'); // plan
    expect(args[6]).toBe('trial');   // status
    expect(args[11]).toBe('garderie');
  });

  it('stores the module list in center_modules, basic modules included', async () => {
    const state: State = { executed: [] };
    await createCenter(state);
    const mod = sqlOf(state, 'INSERT INTO center_modules')!;
    expect(mod.args).toEqual(expect.arrayContaining(['scolaire', 'finance', 'studentTimeSheets']));
    // Every pair is bound as (center_id, module_key) with the new center id.
    expect(mod.args[0]).toBe(mod.args[2]);
    expect(mod.args[1]).toBe('scolaire');
    expect(mod.args[3]).toBe('finance');
  });

  it('records the meal-mode author as users.id — created_by is a real FK', async () => {
    const state: State = { executed: [] };
    const res = await createCenter(state);
    expect(res.status).toBe(201);
    const meal = sqlOf(state, 'INSERT INTO center_meal_mode_history')!;
    expect(meal.args[3]).toBe('platform-super-admin-001'); // users.id …
    expect(meal.args[3]).not.toBe('platform@test.tn');      // … never the email
  });

  it('creates the admin account and skips the invoice for a trial center', async () => {
    const state: State = { executed: [] };
    await createCenter(state);
    const user = sqlOf(state, 'INSERT INTO users')!;
    expect(user.args[1]).toBe('test@gmail.com');
    expect(user.sql).toContain("'admin'");
    expect(sqlOf(state, 'INSERT INTO center_invoices')).toBeUndefined(); // trial is free
  });

  it('rejects an ineligible module for the center type (400, nothing written)', async () => {
    const state: State = { executed: [] };
    const res = await createCenter(state, payload({ centerType: 'creche', enabledModules: ['etude'] }));
    expect(res.status).toBe(400);
    expect(state.executed).toHaveLength(0);
  });

  // « trial » is stored as plan='starter' — the starter preset (base modules
  // only) used to wipe the selection made in the form.
  it('keeps every eligible module chosen for a TRIAL center', async () => {
    const state: State = { executed: [] };
    const res = await createCenter(state, payload({
      centerType: 'garderie',
      enabledModules: ['scolaire', 'finance', 'cantine'],
    }));
    expect(res.status).toBe(201);
    const mod = sqlOf(state, 'INSERT INTO center_modules')!;
    expect(moduleKeysOf(mod)).toEqual(['scolaire', 'finance', 'studentTimeSheets', 'cantine']);
  });

  it('still collapses an explicit basic plan to the base modules', async () => {
    const state: State = { executed: [] };
    const res = await createCenter(state, payload({
      plan: 'basic',
      centerType: 'garderie',
      enabledModules: ['scolaire', 'finance', 'cantine'],
    }));
    expect(res.status).toBe(201);
    const mod = sqlOf(state, 'INSERT INTO center_modules')!;
    expect(moduleKeysOf(mod)).toEqual(['scolaire', 'finance', 'studentTimeSheets']);
  });
});

describe('PATCH /api/centers — a trial row keeps its modules', () => {
  it('does not rewrite center_modules back to the base list on an unrelated update', async () => {
    const state: State = { executed: [] };
    const res = await patchCenter(state, { id: TRIAL_CENTER_ID, name: 'Trial renommé', centerType: 'garderie' });
    expect(res.status).toBe(200);
    expect(sqlOf(state, 'DELETE FROM center_modules')).toBeUndefined();
    expect(sqlOf(state, 'INSERT INTO center_modules')).toBeUndefined();
  });

  it('leaves modules alone when the row itself is not loaded (name-only edit)', async () => {
    const state: State = { executed: [] };
    const res = await patchCenter(state, { id: TRIAL_CENTER_ID, name: 'Nom seulement' });
    expect(res.status).toBe(200);
    expect(sqlOf(state, 'DELETE FROM center_modules')).toBeUndefined();
    expect(sqlOf(state, 'INSERT INTO center_modules')).toBeUndefined();
  });

  it('persists an explicit module change while the center is in trial', async () => {
    const state: State = { executed: [] };
    const res = await patchCenter(state, {
      id: TRIAL_CENTER_ID,
      enabledModules: ['scolaire', 'finance', 'studentTimeSheets'],
    });
    expect(res.status).toBe(200);
    expect(moduleKeysOf(sqlOf(state, 'INSERT INTO center_modules')!)).not.toContain('cantine');
  });

  it('leaves basic semantics untouched for a PAID starter center', async () => {
    const state: State = { executed: [] };
    const res = await patchCenter(state, { id: STARTER_CENTER_ID, enabledModules: SEEDED_MODULES });
    expect(res.status).toBe(200);
    expect(moduleKeysOf(sqlOf(state, 'INSERT INTO center_modules')!)).not.toContain('cantine');
  });
});
