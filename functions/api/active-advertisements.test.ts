import { describe, it, expect, vi } from 'vitest';
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
