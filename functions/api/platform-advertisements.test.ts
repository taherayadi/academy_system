import { describe, it, expect, vi } from 'vitest';
import { onRequestPost, onRequestPatch } from './platform-advertisements';
import { onRequestGet as onActiveGet } from './advertisements/active';

vi.mock('./_lib', () => ({
  validateSession: vi.fn(async () => ({ role: 'platform_super_admin', email: 'root@test.tn' })),
  readBody: vi.fn(async (request: Request) => request.json()),
  json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
}));

function makeDb(existing: any = null, opts: { noPositionsColumn?: boolean } = {}) {
  const calls: Array<{ sql: string; args: any[] }> = [];
  const record = (sql: string, args: any[]) => calls.push({ sql, args });
  const probe = (sql: string) => {
    if (opts.noPositionsColumn && sql.includes('SELECT positions FROM')) {
      return (async () => { throw new Error('D1_ERROR: no such column: positions'); })();
    }
    return Promise.resolve(existing);
  };
  const stmt = (sql: string, args: any[]) => ({
    async run() { record(sql, args); return { meta: { changes: 1 } }; },
    async first() { return probe(sql); },
    async all() { return { results: [] }; },
  });
  return {
    calls,
    prepare(sql: string) {
      return {
        bind(...args: any[]) { return stmt(sql, args); },
        async first() { return probe(sql); },
      };
    },
    async batch(statements: any[]) {
      for (const st of statements) await st.run();
    },
  };
}

function req(method: string, body?: Record<string, unknown>, url = 'https://x.test/api/platform-advertisements') {
  return new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}

const base = {
  title: 'Promo', imageUrls: ['https://cdn/a.jpg'],
  dateStart: Date.now(), dateEnd: Date.now() + 5 * 86400000,
};

describe('platform-advertisements POST — center rules by location', () => {
  it('landing_page needs no center (and ignores any sent)', async () => {
    const db = makeDb();
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', { ...base, location: 'landing_page', centerIds: ['c1'] }) } as any);
    expect(res.status).toBe(201);
    expect(db.calls.some(c => c.sql.includes('INSERT INTO advertisement_centers'))).toBe(false);
  });

  it('center_admin requires at least one center', async () => {
    const db = makeDb();
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', { ...base, location: 'center_admin', centerIds: [] }) } as any);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain('centre');
  });

  it('“both” requires centers and stores the assignments', async () => {
    const db = makeDb();
    const missing = await onRequestPost({ env: { DB: db }, request: req('POST', { ...base, location: 'both' }) } as any);
    expect(missing.status).toBe(400);
    const ok = await onRequestPost({ env: { DB: makeDb() }, request: req('POST', { ...base, location: 'both', centerIds: ['c1', 'c2'] }) } as any);
    expect(ok.status).toBe(201);
  });

  it('custom location works with or without centers', async () => {
    const db = makeDb();
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', { ...base, location: 'cantine', centerIds: ['c1'] }) } as any);
    expect(res.status).toBe(201);
  });
});

describe('platform-advertisements PATCH — center rules by location', () => {
  it('sending empty centers on a landing_page ad clears assignments (no 400)', async () => {
    const db = makeDb({ id: 'ADV_1', location: 'landing_page' });
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'ADV_1', centerIds: [] }) } as any);
    expect(res.status).toBe(200);
  });

  it('empty centers rejected while the ad is center-scoped', async () => {
    const db = makeDb({ id: 'ADV_2', location: 'center_admin' });
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'ADV_2', centerIds: [] }) } as any);
    expect(res.status).toBe(400);
  });

  it('moving an ad to landing_page clears its centers even without centerIds', async () => {
    const db = makeDb({ id: 'ADV_3', location: 'both' });
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', { id: 'ADV_3', location: 'landing_page' }) } as any);
    expect(res.status).toBe(200);
    expect(db.calls.some(c => c.sql.includes('DELETE FROM advertisement_centers'))).toBe(true);
  });
});

describe('platform-advertisements — positions', () => {
  it('POST stores only known position ids, deduplicated, as JSON', async () => {
    const db = makeDb();
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', {
      ...base, location: 'landing_page',
      positions: ['rectangle', 'rectangle', 'fake_size_9999', 'interstitial'],
    }) } as any);
    expect(res.status).toBe(201);
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO platform_advertisements'));
    expect(insert.args).toContain(JSON.stringify(['rectangle', 'interstitial']));
  });

  it('POST migrates legacy IAB ids onto the responsive formats', async () => {
    const db = makeDb();
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', {
      ...base, location: 'landing_page',
      positions: ['leaderboard_728x90', 'medium_rectangle_300x250', 'mobile_leaderboard_320x50', 'skyscraper_160x600'],
    }) } as any);
    expect(res.status).toBe(201);
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO platform_advertisements'));
    // Les trois bandeaux fusionnent en un seul « rectangle », le gratte-ciel
    // devient l'interstitiel, et les doublons sont supprimés.
    expect(insert.args).toContain(JSON.stringify(['rectangle', 'interstitial']));
  });

  it('POST without positions stores an empty array (carousel default)', async () => {
    const db = makeDb();
    await onRequestPost({ env: { DB: db }, request: req('POST', { ...base, location: 'landing_page' }) } as any);
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO platform_advertisements'));
    expect(insert.args).toContain('[]');
  });

  it('POST still works when migration 0031 is missing (legacy INSERT)', async () => {
    const db = makeDb(null, { noPositionsColumn: true });
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', {
      ...base, location: 'landing_page', positions: ['rectangle'],
    }) } as any);
    expect(res.status).toBe(201);
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO platform_advertisements'));
    expect(insert.sql).not.toContain('positions');
  });

  it('PATCH ignores positions when the column is missing', async () => {
    const db = makeDb({ id: 'ADV_1', location: 'center_admin' }, { noPositionsColumn: true });
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', {
      id: 'ADV_1', positions: ['rectangle'],
    }) } as any);
    expect(res.status).toBe(200);
    expect(db.calls.some(c => c.sql.includes('positions = ?'))).toBe(false);
  });

  it('PATCH replaces positions when provided', async () => {
    const db = makeDb({ id: 'ADV_1', location: 'center_admin' });
    const res = await onRequestPatch({ env: { DB: db }, request: req('PATCH', {
      id: 'ADV_1', positions: ['rectangle', 'nope', 'skyscraper_160x600'],
    }) } as any);
    expect(res.status).toBe(200);
    const upd = db.calls.find(c => c.sql.includes('UPDATE platform_advertisements'));
    expect(upd.sql).toContain('positions = ?');
    expect(upd.args).toContain(JSON.stringify(['rectangle', 'interstitial']));
  });
});

describe('advertisements/active — « both » visibility', () => {
  it('landing page query expands to both; center query joins centers; custom does not expand', async () => {
    const seen: string[] = [];
    const spy: any = {
      prepare(sql: string) {
        if (!sql.includes('SELECT positions FROM')) seen.push(sql);
        return {
          bind() { return { all: async () => ({ results: [] }) }; },
          first: async () => null,
        };
      },
    };
    await onActiveGet({ env: { DB: spy }, request: new Request('https://x.test/api/advertisements/active?location=landing_page') } as any);
    expect(seen[0]).toContain("OR a.location = 'both'");
    await onActiveGet({ env: { DB: spy }, request: new Request('https://x.test/api/advertisements/active?location=center_admin&centerId=c1') } as any);
    expect(seen[1]).toContain('INNER JOIN advertisement_centers');
    expect(seen[1]).toContain("OR a.location = 'both'");
    await onActiveGet({ env: { DB: spy }, request: new Request('https://x.test/api/advertisements/active?location=cantine') } as any);
    expect(seen[2]).not.toContain("'both'");
  });

  it('center_admin without a center context returns nothing (no leak across centers)', async () => {
    const spy: any = { prepare() { throw new Error('should not query'); } };
    // (la sonde de colonnes est appelée après le retour anticipé → ne doit jamais être atteinte ici)
    const res = await onActiveGet({ env: { DB: spy }, request: new Request('https://x.test/api/advertisements/active?location=center_admin') } as any);
    const data = await res.json() as any;
    expect(data.advertisements).toEqual([]);
  });
});
