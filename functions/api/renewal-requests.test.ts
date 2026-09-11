import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet, onRequestPost, onRequestPatch } from './renewal-requests';

const DAY = 86400000;
/** Horloge figée : les échéances calculées par l'API deviennent prédictibles. */
const NOW = Date.UTC(2026, 2, 1, 9, 0, 0);

const loggedHistory: any[] = [];

vi.mock('./_lib', () => ({
  readBody: vi.fn(async (request: Request) => request.json()),
  json: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
  ensureSessionsTable: vi.fn(async () => {}),
  getSessionToken: vi.fn(() => 'token-123'),
  DEFAULT_CENTER_ID: 'default-center',
}));

vi.mock('./_planHistory', () => ({
  logPlanHistory: vi.fn(async (_db: any, entry: any) => { loggedHistory.push(entry); }),
}));

/**
 * Fake D1 routing the queries on distinctive SQL fragments.
 *  rows    → first() results by fragment
 *  results → all() results by fragment
 */
function makeDb(rows: Record<string, any> = {}, results: Record<string, any[]> = {}) {
  const calls: Array<{ sql: string; args: any[] }> = [];
  const findRow = (sql: string) => {
    for (const [needle, row] of Object.entries(rows)) if (sql.includes(needle)) return row;
    return null;
  };
  const findResults = (sql: string) => {
    for (const [needle, list] of Object.entries(results)) if (sql.includes(needle)) return list;
    return [];
  };
  const stmt = (sql: string, args: any[]) => ({
    async run() { calls.push({ sql, args }); return { meta: { changes: 1 } }; },
    async first() { calls.push({ sql, args }); return findRow(sql); },
    async all() { calls.push({ sql, args }); return { results: findResults(sql) }; },
  });
  return {
    calls,
    prepare(sql: string) {
      return {
        bind(...args: any[]) { return stmt(sql, args); },
        async first() { calls.push({ sql, args: [] }); return findRow(sql); },
        async all() { calls.push({ sql, args: [] }); return { results: findResults(sql) }; },
        async run() { calls.push({ sql, args: [] }); return { meta: { changes: 1 } }; },
      };
    },
  };
}

function req(method: string, body?: Record<string, unknown>, url = 'https://x.test/api/renewal-requests') {
  return new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}

const CENTER = {
  id: 'c1', name: 'Centre Alpha', plan: 'starter', billing_cycle: 'monthly',
  enabled_modules: JSON.stringify(['scolaire', 'finance']),
  subscription_ends_at: NOW + 10 * DAY, status: 'active',
};

const sessionRows = (role = 'admin') => ({
  'FROM sessions s LEFT JOIN users u': { email: 'boss@center.tn', center_id: 'c1', role },
  'FROM centers WHERE id = ?': CENTER,
  'SELECT id FROM renewal_requests LIMIT 1': { id: 'x' },
});

beforeEach(() => {
  loggedHistory.length = 0;
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('renewal-requests POST — the center asks for a renewal', () => {
  it('stores a pending request and targets the current end date', async () => {
    const db = makeDb(sessionRows());
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', {
      kind: 'renewal',
      requestedPlan: 'starter',
      requestedModules: ['scolaire', 'finance', 'etude'],
      billingCycle: 'monthly',
      amount: 120,
    }) } as any);

    expect(res.status).toBe(201);
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO renewal_requests'));
    expect(insert).toBeTruthy();
    // Le statut est figé côté SQL : une demande naît toujours « pending ».
    expect(insert!.sql).toContain("'pending'");
    expect(insert!.args).toContain('renewal');
    expect(insert!.args).toContain('starter');
    expect(insert!.args).toContain(NOW + 10 * DAY);              // effectiveAt = échéance en cours
    expect(insert!.args).toContain(JSON.stringify(['scolaire', 'finance', 'etude']));
    expect(insert!.args).toContain(CENTER.enabled_modules);      // photographie des modules actuels
    expect(insert!.args).toContain('active');                    // statut du centre au moment de la demande
  });

  it('an upgrade takes effect immediately', async () => {
    const db = makeDb(sessionRows());
    await onRequestPost({ env: { DB: db }, request: req('POST', {
      kind: 'upgrade', requestedPlan: 'growth', requestedModules: ['scolaire'], billingCycle: 'annual', amount: 900,
    }) } as any);
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO renewal_requests'))!;
    expect(insert.args).toContain('upgrade');
    expect(insert.args).toContain(NOW); // effectiveAt = tout de suite
  });

  it('an expired end date falls back to today', async () => {
    const db = makeDb({
      ...sessionRows(),
      'FROM centers WHERE id = ?': { ...CENTER, subscription_ends_at: NOW - 5 * DAY },
    });
    await onRequestPost({ env: { DB: db }, request: req('POST', {
      kind: 'renewal', requestedPlan: 'starter', requestedModules: [], billingCycle: 'monthly',
    }) } as any);
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO renewal_requests'))!;
    expect(insert.args).toContain(NOW);
  });

  it('records whether the center was on trial or active', async () => {
    const db = makeDb({
      ...sessionRows(),
      'FROM centers WHERE id = ?': { ...CENTER, status: 'trial' },
    });
    await onRequestPost({ env: { DB: db }, request: req('POST', {
      kind: 'renewal', requestedPlan: 'starter', requestedModules: [], billingCycle: 'monthly',
    }) } as any);
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO renewal_requests'))!;
    expect(insert.args).toContain('trial');
  });

  it('rejects an unknown plan or cycle', async () => {
    const db = makeDb(sessionRows());
    const bad = await onRequestPost({ env: { DB: db }, request: req('POST', { requestedPlan: 'ultra' }) } as any);
    expect(bad.status).toBe(400);
    const badCycle = await onRequestPost({ env: { DB: db }, request: req('POST', { requestedPlan: 'pro', billingCycle: 'weekly' }) } as any);
    expect(badCycle.status).toBe(400);
  });

  it('blocks an identical request already pending', async () => {
    const db = makeDb({
      ...sessionRows(),
      "AND status = 'pending' AND kind": { id: 'already' },
    });
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', {
      kind: 'renewal', requestedPlan: 'starter', requestedModules: [], billingCycle: 'monthly', amount: 0,
    }) } as any);
    expect(res.status).toBe(409);
  });
});

describe('renewal-requests PATCH — the platform decides', () => {
  const requestRow = {
    id: 'r1', center_id: 'c1', kind: 'upgrade', requested_plan: 'growth',
    requested_modules: JSON.stringify(['scolaire', 'finance', 'etude']),
    billing_cycle: 'monthly', amount: 240, status: 'pending',
  };

  const rowsFor = (role: string, overrides: Record<string, any> = {}) => ({
    'FROM sessions s LEFT JOIN users u': { email: 'root@test.tn', center_id: 'c1', role },
    'SELECT * FROM renewal_requests WHERE id = ?': { ...requestRow, ...overrides },
    'FROM centers WHERE id = ?': {
      id: 'c1', status: 'active', plan: 'starter', billing_cycle: 'monthly',
      subscription_ends_at: NOW + 5 * DAY, trial_ends_at: null, enabled_modules: '[]',
    },
  });

  it('refuses a non-platform account', async () => {
    const db = makeDb(rowsFor('admin'));
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'approved' }) } as any);
    expect(res.status).toBe(403);
  });

  it('approving applies the plan and logs the history', async () => {
    const db = makeDb(rowsFor('platform_super_admin'));
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'approved' }) } as any);
    expect(res.status).toBe(200);

    const update = db.calls.find(c => c.sql.includes('UPDATE centers'));
    expect(update).toBeTruthy();
    expect(update!.sql).toContain("status = 'active'");
    expect(update!.args).toContain('growth');
    expect(update!.args).toContain(JSON.stringify(['scolaire', 'finance', 'etude']));
    // Upgrade → nouvelle période de 30 jours à partir de maintenant.
    expect(update!.args).toContain(NOW + 30 * DAY);

    expect(loggedHistory).toHaveLength(1);
    expect(loggedHistory[0].action).toBe('renewal_upgrade');
    expect(loggedHistory[0].centerId).toBe('c1');
    expect(loggedHistory[0].amount).toBe(240);
  });

  it('a renewal extends from the current end date, not from today', async () => {
    const db = makeDb(rowsFor('platform_super_admin', { kind: 'renewal', requested_plan: 'starter' }));
    await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'approved' }) } as any);
    const update = db.calls.find(c => c.sql.includes('UPDATE centers'))!;
    expect(update.args).toContain(NOW + 5 * DAY + 30 * DAY);
    expect(loggedHistory[0].action).toBe('renewal_approved');
  });

  it('skipApply records an approval without re-applying the plan (already applied via Plans & factures)', async () => {
    const db = makeDb(rowsFor('platform_super_admin'));
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'approved', skipApply: true }) } as any);
    expect(res.status).toBe(200);
    expect(db.calls.some(c => c.sql.includes('UPDATE centers'))).toBe(false);
    expect(loggedHistory).toHaveLength(0);
    const upd = db.calls.find(c => c.sql.includes('UPDATE renewal_requests'))!;
    expect(upd.args).toContain('approved');
  });

  it('rejecting records the decision without touching the center', async () => {
    const db = makeDb(rowsFor('platform_super_admin'));
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'rejected', decisionNote: 'Dossier incomplet' }) } as any);
    expect(res.status).toBe(200);
    expect(db.calls.some(c => c.sql.includes('UPDATE centers'))).toBe(false);
    expect(loggedHistory).toHaveLength(0);
    const upd = db.calls.find(c => c.sql.includes('UPDATE renewal_requests'))!;
    expect(upd.args).toContain('rejected');
    expect(upd.args).toContain('Dossier incomplet');
  });

  it('cannot decide a request twice', async () => {
    const db = makeDb(rowsFor('platform_super_admin', { status: 'approved' }));
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'rejected' }) } as any);
    expect(res.status).toBe(409);
  });
});

describe('renewal-requests GET — scoped listing', () => {
  it('a center only ever sees its own requests', async () => {
    const db = makeDb(
      sessionRows(),
      { 'FROM renewal_requests r LEFT JOIN centers c': [
        { id: 'r1', center_id: 'c1', kind: 'renewal', current_plan: 'starter', current_modules: '[]',
          requested_plan: 'starter', requested_modules: '["scolaire"]', billing_cycle: 'monthly',
          amount: 120, status: 'pending', effective_at: NOW, note: '', decision_note: '',
          decided_by: '', decided_at: null, created_at: NOW, updated_at: NOW, center_name: 'Alpha' },
      ] }
    );
    const res = await onRequestGet({ env: { DB: db }, request: req('GET') } as any);
    const data = await res.json() as any;
    expect(data.requests).toHaveLength(1);
    expect(data.requests[0].requestedModules).toEqual(['scolaire']);
    expect(data.requests[0].centerName).toBe('Alpha');
    const scope = db.calls.find(c => c.sql.includes('WHERE r.center_id = ?'));
    expect(scope!.args).toContain('c1');
  });

  it('the platform can list every request', async () => {
    const db = makeDb(
      sessionRows('platform_super_admin'),
      { 'FROM renewal_requests r LEFT JOIN centers c': [] }
    );
    await onRequestGet({ env: { DB: db }, request: req('GET') } as any);
    expect(db.calls.some(c => c.sql.includes("ORDER BY (r.status = 'pending') DESC"))).toBe(true);
  });

  it('degrades gracefully when migration 0033 is not applied', async () => {
    const db = {
      prepare(sql: string) {
        const stmt = {
          async first() {
            if (sql.includes('renewal_requests')) throw new Error('no such table: renewal_requests');
            return { email: 'a@b.tn', center_id: 'c1', role: 'admin' };
          },
          async all() { return { results: [] }; },
          async run() { return { meta: { changes: 1 } }; },
        };
        return { bind: () => stmt, ...stmt };
      },
    };
    const res = await onRequestGet({ env: { DB: db }, request: req('GET') } as any);
    const data = await res.json() as any;
    expect(data).toEqual({ requests: [], history: [] });
  });
});
