import { describe, it, expect, vi } from 'vitest';
import { onRequestPost, onRequestPatch } from './platform-advertisements';

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

describe('platform-advertisements — input length limits', () => {
  it('POST rejects a title over 200 chars', async () => {
    const res = await onRequestPost({ env: { DB: makeDb() }, request: req('POST', {
      ...base, location: 'landing_page', title: 't'.repeat(201),
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('POST rejects a linkUrl over 500 chars', async () => {
    const res = await onRequestPost({ env: { DB: makeDb() }, request: req('POST', {
      ...base, location: 'landing_page', linkUrl: 'https://x.test/' + 'a'.repeat(500),
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('POST rejects imageUrls containing a non-string element', async () => {
    const res = await onRequestPost({ env: { DB: makeDb() }, request: req('POST', {
      ...base, location: 'landing_page', imageUrls: ['https://cdn/a.jpg', 42],
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('POST rejects imageUrls with an over-length element (500)', async () => {
    const res = await onRequestPost({ env: { DB: makeDb() }, request: req('POST', {
      ...base, location: 'landing_page', imageUrls: ['https://cdn/' + 'a'.repeat(500)],
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('POST rejects more than 20 imageUrls', async () => {
    const res = await onRequestPost({ env: { DB: makeDb() }, request: req('POST', {
      ...base, location: 'landing_page', imageUrls: Array.from({ length: 21 }, (_, i) => `https://cdn/${i}.jpg`),
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('POST rejects centerIds containing a non-string element', async () => {
    const res = await onRequestPost({ env: { DB: makeDb() }, request: req('POST', {
      ...base, location: 'center_admin', centerIds: ['c1', 42],
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('POST trims and stores imageUrls elements', async () => {
    const db = makeDb();
    const res = await onRequestPost({ env: { DB: db }, request: req('POST', {
      ...base, location: 'landing_page', imageUrls: ['  https://cdn/a.jpg  '],
    }) } as any);
    expect(res.status).toBe(201);
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO platform_advertisements'));
    expect(insert.args).toContain(JSON.stringify(['https://cdn/a.jpg']));
  });

  it('PATCH rejects a title over 200 chars', async () => {
    const res = await onRequestPatch({ env: { DB: makeDb({ id: 'ADV_1', location: 'landing_page' }) }, request: req('PATCH', {
      id: 'ADV_1', title: 't'.repeat(201),
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('PATCH rejects a linkUrl over 500 chars', async () => {
    const res = await onRequestPatch({ env: { DB: makeDb({ id: 'ADV_1', location: 'landing_page' }) }, request: req('PATCH', {
      id: 'ADV_1', linkUrl: 'https://x.test/' + 'a'.repeat(500),
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('PATCH rejects imageUrls with an over-length element', async () => {
    const res = await onRequestPatch({ env: { DB: makeDb({ id: 'ADV_1', location: 'landing_page' }) }, request: req('PATCH', {
      id: 'ADV_1', imageUrls: ['https://cdn/' + 'a'.repeat(500)],
    }) } as any);
    expect(res.status).toBe(400);
  });

  it('PATCH rejects more than 50 centerIds', async () => {
    const res = await onRequestPatch({ env: { DB: makeDb({ id: 'ADV_1', location: 'center_admin' }) }, request: req('PATCH', {
      id: 'ADV_1', centerIds: Array.from({ length: 51 }, (_, i) => `c${i}`),
    }) } as any);
    expect(res.status).toBe(400);
  });
});

// The public GET /api/advertisements/active feed (landing page + center
// dashboard rendering) now lives in the center application; its "both"
// visibility tests moved there with the endpoint. This file covers the
// platform's own management surface: create / update / assign / delete.
