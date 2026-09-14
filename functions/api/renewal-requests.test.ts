import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as renewalRoutes from './renewal-requests';
import { onRequestGet, onRequestPatch } from './renewal-requests';

const DAY = 86400000;
/** Fixed clock so computed due dates are predictable. */
const NOW = Date.UTC(2026, 2, 1, 9, 0, 0);

const loggedHistory: any[] = [];

/** Realtime signals published (./_pubnub mocked — never real network). */
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

/**
 * Post-split session contract: the handlers authenticate through
 * validateSession (platform_sessions + role check). The mock exposes the
 * credential under test via `X-Test-Role`: only 'platform_super_admin'
 * resolves to a session; center roles resolve to NOTHING — on this
 * application's backend a center credential (role 'admin', 'super_admin',
 * 'restricted_admin' or 'center') is exactly as invalid as an anonymous
 * request.
 */
const sessionMock = vi.hoisted(() => ({ role: 'platform_super_admin' }));

vi.mock('./_lib', () => ({
  readBody: vi.fn(async (request: Request) => request.json()),
  json: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
  PLATFORM_ROLE: 'platform_super_admin',
  validateSession: vi.fn(async (db: any, request: Request) => {
    const raw = request.headers.get('X-Test-Role');
    const role = raw === null ? sessionMock.role : raw; // '' = anonymous
    if (role !== 'platform_super_admin') return null;
    return { email: 'root@test.tn', token: 'tok-platform', role };
  }),
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

function req(method: string, body?: Record<string, unknown>, url = 'https://x.test/api/renewal-requests', role?: string) {
  return new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(role !== undefined ? { 'X-Test-Role': role } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const TABLE_OK = { 'SELECT id FROM renewal_requests LIMIT 1': { id: 'x' } };

beforeEach(() => {
  loggedHistory.length = 0;
  publishMock.calls.length = 0;
  sessionMock.role = 'platform_super_admin';
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── The submission endpoint must be GONE from this application ────────────
describe('renewal-requests — center submission removed', () => {
  it('exports no POST handler (centers submit through the center app)', () => {
    expect((renewalRoutes as any).onRequestPost).toBeUndefined();
    expect((renewalRoutes as any).onRequestGet).toBeTypeOf('function');
    expect((renewalRoutes as any).onRequestPatch).toBeTypeOf('function');
  });
});

// ─── Negative access: center roles never reach the review flow ─────────────
describe('renewal-requests — access control', () => {
  it.each(['admin', 'super_admin', 'restricted_admin'])('rejects center role "%s" on GET (401)', async (role) => {
    const res = await onRequestGet({ env: { DB: makeDb() }, request: req('GET', undefined, undefined, role) } as any);
    expect(res.status).toBe(401);
  });

  it.each(['admin', 'super_admin', 'restricted_admin'])('rejects center role "%s" on PATCH (401) — no decision is written', async (role) => {
    const db = makeDb(TABLE_OK);
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'approved' }, undefined, role) } as any);
    expect(res.status).toBe(401);
    expect(db.calls).toHaveLength(0); // absolutely no writes
    expect(publishMock.calls).toHaveLength(0);
  });

  it('rejects anonymous requests (no session row resolves)', async () => {
    const res = await onRequestGet({ env: { DB: makeDb() }, request: req('GET', undefined, undefined, '') } as any);
    expect(res.status).toBe(401);
  });
});

// ─── GET — platform-wide listing ────────────────────────────────────────────
describe('renewal-requests GET — platform listing', () => {
  const mappedRow = {
    id: 'r1', center_id: 'c1', kind: 'renewal', current_plan: 'starter', current_modules: '[]',
    requested_plan: 'starter', requested_modules: '["scolaire"]', billing_cycle: 'monthly',
    amount: 120, status: 'pending', effective_at: NOW, note: '', decision_note: '',
    decided_by: '', decided_at: null, created_at: NOW, updated_at: NOW, center_name: 'Alpha',
  };

  it('lists ALL requests when no centerId filter is given', async () => {
    const db = makeDb(TABLE_OK, {
      'ORDER BY (r.status = \'pending\') DESC': [mappedRow],
    });
    const res = await onRequestGet({ env: { DB: db }, request: req('GET') } as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.requests).toHaveLength(1);
    expect(data.requests[0]).toMatchObject({ id: 'r1', centerName: 'Alpha' });
    // The platform query has no center scoping.
    const list = db.calls.find(c => c.sql.includes('FROM renewal_requests r'))!;
    expect(list.sql).not.toContain('WHERE r.center_id = ?');
  });

  it('filters by centerId when provided and returns the plan history', async () => {
    const db = makeDb(TABLE_OK, {
      'WHERE r.center_id = ?': [mappedRow],
      'FROM center_plan_history WHERE center_id = ?': [
        { id: 'h1', action: 'plan_activated', details: 'x', amount: 30, invoice_number: 'INV-1', created_at: NOW },
      ],
    });
    const res = await onRequestGet({
      env: { DB: db },
      request: req('GET', undefined, 'https://x.test/api/renewal-requests?centerId=c1'),
    } as any);
    const data = await res.json() as any;
    expect(data.requests).toHaveLength(1);
    expect(data.history).toEqual([{
      id: 'h1', action: 'plan_activated', details: 'x', amount: 30, invoiceNumber: 'INV-1', createdAt: NOW,
    }]);
  });

  it('degrades gracefully when the table (migration 0033) is absent', async () => {
    const db = makeDb(); // no TABLE_OK entry → tableExists() false
    const res = await onRequestGet({ env: { DB: db }, request: req('GET') } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requests: [], history: [] });
  });
});

// ─── PATCH — the platform decides ───────────────────────────────────────────
describe('renewal-requests PATCH — the platform decides', () => {
  const requestRow = {
    id: 'r1', center_id: 'c1', kind: 'upgrade', requested_plan: 'growth',
    requested_modules: JSON.stringify(['scolaire', 'finance', 'etude']),
    billing_cycle: 'monthly', amount: 240, status: 'pending',
  };

  const rowsFor = (overrides: Record<string, any> = {}) => ({
    ...TABLE_OK,
    'SELECT * FROM renewal_requests WHERE id = ?': { ...requestRow, ...overrides },
    'FROM centers WHERE id = ?': {
      id: 'c1', status: 'active', plan: 'starter', billing_cycle: 'monthly',
      subscription_ends_at: NOW + 5 * DAY, trial_ends_at: null, enabled_modules: '[]',
    },
  });

  it('approving applies the plan and logs the history', async () => {
    const db = makeDb(rowsFor());
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'approved' }) } as any);
    expect(res.status).toBe(200);

    const update = db.calls.find(c => c.sql.includes('UPDATE centers'));
    expect(update).toBeTruthy();
    expect(update!.sql).toContain("status = 'active'");
    expect(update!.args).toContain('growth');
    expect(update!.args).toContain(JSON.stringify(['scolaire', 'finance', 'etude']));
    // Upgrade → new 30-day period starting now.
    expect(update!.args).toContain(NOW + 30 * DAY);

    expect(loggedHistory).toHaveLength(1);
    expect(loggedHistory[0].action).toBe('renewal_upgrade');
    expect(loggedHistory[0].centerId).toBe('c1');
    expect(loggedHistory[0].amount).toBe(240);
  });

  it('a renewal extends from the current end date, not from today', async () => {
    const db = makeDb(rowsFor({ kind: 'renewal', requested_plan: 'starter' }));
    await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'approved' }) } as any);
    const update = db.calls.find(c => c.sql.includes('UPDATE centers'))!;
    expect(update.args).toContain(NOW + 5 * DAY + 30 * DAY);
    expect(loggedHistory[0].action).toBe('renewal_approved');
  });

  it('skipApply records an approval without re-applying the plan', async () => {
    const db = makeDb(rowsFor());
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'approved', skipApply: true }) } as any);
    expect(res.status).toBe(200);
    expect(db.calls.some(c => c.sql.includes('UPDATE centers'))).toBe(false);
    expect(loggedHistory).toHaveLength(0);
    const upd = db.calls.find(c => c.sql.includes('UPDATE renewal_requests'))!;
    expect(upd.args).toContain('approved');
  });

  it('rejecting records the decision without touching the center', async () => {
    const db = makeDb(rowsFor());
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'rejected', decisionNote: 'Dossier incomplet' }) } as any);
    expect(res.status).toBe(200);
    expect(db.calls.some(c => c.sql.includes('UPDATE centers'))).toBe(false);
    expect(loggedHistory).toHaveLength(0);
    const upd = db.calls.find(c => c.sql.includes('UPDATE renewal_requests'))!;
    expect(upd.args).toContain('rejected');
    expect(upd.args).toContain('Dossier incomplet');
    expect(upd.args).toContain('root@test.tn'); // decided_by = session email
  });

  it('cannot decide a request twice', async () => {
    const db = makeDb(rowsFor({ status: 'approved' }));
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'rejected' }) } as any);
    expect(res.status).toBe(409);
  });

  it('rejects malformed bodies', async () => {
    const db = makeDb(rowsFor());
    expect((await onRequestPatch({ env: { DB: db }, request: req('PATCH', { status: 'approved' }) } as any)).status).toBe(400);
    expect((await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'maybe' }) } as any)).status).toBe(400);
  });
});

// ─── Realtime wiring (PubNub helper mocked — verifying the calls only) ──────
describe('renewal-requests — PubNub signals', () => {
  const patchRows = (overrides: Record<string, any> = {}) => ({
    ...TABLE_OK,
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

  it('PATCH publishes on center.{id} AND platform — approved AND rejected', async () => {
    const approved = makeDb(patchRows());
    await onRequestPatch({ env: { DB: approved }, request: req('PATCH', { id: 'r1', status: 'approved' }) } as any);
    expect(publishMock.calls).toHaveLength(1);
    expect(publishMock.calls[0].channels).toEqual(['center.c1', 'platform']);
    expect(publishMock.calls[0].payload).toMatchObject({ topic: 'renewal_request_decided', centerId: 'c1' });

    publishMock.calls.length = 0;

    const rejected = makeDb(patchRows());
    const res = await onRequestPatch({ env: { DB: rejected }, request: req('PATCH', { id: 'r1', status: 'rejected', skipApply: true }) } as any);
    expect(res.status).toBe(200);
    expect(publishMock.calls).toHaveLength(1);
    expect(publishMock.calls[0].channels).toEqual(['center.c1', 'platform']);
  });

  it('no publication when the decision fails (409 already handled)', async () => {
    const db = makeDb(patchRows({ status: 'approved' }));
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'r1', status: 'rejected' }) } as any);
    expect(res.status).toBe(409);
    expect(publishMock.calls).toHaveLength(0);
  });
});
