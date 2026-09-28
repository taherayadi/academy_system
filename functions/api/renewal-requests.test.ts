import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet, onRequestPost } from './renewal-requests';

const DAY = 86400000;
/** Horloge figée : les échéances calculées par l'API deviennent prédictibles. */
const NOW = Date.UTC(2026, 2, 1, 9, 0, 0);

const loggedHistory: any[] = [];

/** Signaux temps réel publiés (mock de ./_pubnub — jamais de vrai réseau). */
const publishMock = vi.hoisted(() => ({
  calls: [] as Array<{ channels: string[]; payload: Record<string, unknown> }>,
}));

vi.mock('./_pubnub', () => ({
  publishOnResponse: vi.fn(
    (_context: unknown, _env: unknown, channels: string[], payload: Record<string, unknown>) => {
      publishMock.calls.push({ channels, payload });
    }
  ),
}));

vi.mock('./_lib', () => ({
  readBody: vi.fn(async (request: Request) => request.json()),
  json: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
  validateSession: vi.fn(async (db: any) => {
    const row = await db.prepare('FROM sessions s LEFT JOIN users u').first();
    return row ? { email: row.email, centerId: row.center_id, role: row.role } : null;
  }),
  getSessionToken: vi.fn(() => 'token-123'),
  DEFAULT_CENTER_ID: 'default-center',
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
  publishMock.calls.length = 0;
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

// ─── Signaux temps réel (PubNub) — le helper est mocké, on vérifie le câblage ───
describe('renewal-requests — signaux PubNub publiés', () => {
  // Mêmes lignes que le bloc PATCH (session plateforme + demande en attente).
  const patchRows = (overrides: Record<string, any> = {}) => ({
    'FROM sessions s LEFT JOIN users u': { email: 'root@test.tn', center_id: 'c1', role: 'platform_super_admin' },
    'SELECT * FROM renewal_requests WHERE id = ?': {
      id: 'r1', center_id: 'c1', kind: 'upgrade', requested_plan: 'growth',
      requested_modules: JSON.stringify(['scolaire', 'finance', 'etude']),
      billing_cycle: 'monthly', amount: 240, status: 'pending',
      ...overrides,
    },
    'FROM centers WHERE id = ?': {
      id: 'c1', status: 'active', plan: 'starter', billing_cycle: 'monthly',
      subscription_ends_at: NOW + 5 * DAY, trial_ends_at: null, enabled_modules: '[]',
    },
  });

  it('POST publie un signal sur le canal `platform` seule', async () => {
    const db = makeDb(sessionRows());
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', {
      kind: 'renewal',
      requestedPlan: 'growth',
      requestedModules: ['scolaire', 'finance', 'etude'],
      billingCycle: 'monthly',
      amount: 120,
    }) } as any);
    expect(res.status).toBe(201);

    expect(publishMock.calls).toHaveLength(1);
    expect(publishMock.calls[0].channels).toEqual(['platform']);
    expect(publishMock.calls[0].payload).toMatchObject({ topic: 'renewal_request_created', centerId: 'c1' });
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
