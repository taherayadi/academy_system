import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPatch } from './demo-requests';

vi.mock('./_lib', () => ({
  validateSession: vi.fn(async () => ({ role: 'platform_super_admin' })),
  readBody: vi.fn(async (request: Request) => request.json()),
  json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
}));

function makeDb(demoStatus: string | null) {
  const updates: string[] = [];
  return {
    updates,
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              return sql.includes('SELECT status') && demoStatus ? { status: demoStatus } : null;
            },
            async run() {
              updates.push(sql);
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

async function patch(body: Record<string, unknown>, demoStatus: string | null) {
  const db = makeDb(demoStatus);
  const request = new Request('https://example.test/api/demo-requests', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await onRequestPatch({ env: { DB: db }, request } as any);
  return { res, db };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('demo-requests PATCH — converted is a one-way status', () => {
  it('rejects moving an already-converted request to another status', async () => {
    const { res, db } = await patch({ id: 'r1', status: 'new' }, 'converted');
    expect(res.status).toBe(409);
    expect(db.updates).toHaveLength(0); // nothing was written
  });

  it('allows updating notes on a converted request', async () => {
    const { res, db } = await patch({ id: 'r1', notes: 'contact téléphonique' }, 'converted');
    expect(res.status).toBe(200);
    expect(db.updates.some(u => u.includes('SET notes'))).toBe(true);
  });

  it('allows archiving an already-converted request (the only permitted move)', async () => {
    const { res, db } = await patch({ id: 'r1', status: 'archived' }, 'converted');
    expect(res.status).toBe(200);
    expect(db.updates.some(u => u.includes('SET status'))).toBe(true);
  });

  it('allows normal status changes before conversion', async () => {
    const { res, db } = await patch({ id: 'r1', status: 'contacted' }, 'new');
    expect(res.status).toBe(200);
    expect(db.updates.some(u => u.includes('SET status'))).toBe(true);
  });
});
