import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest, ROUTES } from './_middleware';

vi.mock('./_lib', () => ({
  json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
}));

function context(path: string, method = 'GET', origin?: string) {
  return { request: new Request('https://app.example' + path, { method, headers: origin ? { Origin: origin } : {} }), env: { DB: {} }, data: {}, next: vi.fn(async () => new Response('ok')) };
}
beforeEach(() => vi.clearAllMocks());
describe('landing deployment boundary', () => {
  it('exposes exactly the three public landing routes', () => {
    expect(Object.keys(ROUTES).sort()).toEqual(['/api/advertisements/active', '/api/demo-requests', '/api/public-pricing']);
  });
  it('permits demo-request POST but not GET', async () => {
    expect((await onRequest(context('/api/demo-requests', 'POST') as any)).status).toBe(200);
    expect((await onRequest(context('/api/demo-requests') as any)).status).toBe(405);
  });
  it('permits the two public GET routes but rejects mutations', async () => {
    expect((await onRequest(context('/api/public-pricing') as any)).status).toBe(200);
    expect((await onRequest(context('/api/advertisements/active') as any)).status).toBe(200);
    expect((await onRequest(context('/api/public-pricing', 'POST') as any)).status).toBe(405);
    expect((await onRequest(context('/api/advertisements/active', 'DELETE') as any)).status).toBe(405);
  });
  it('rejects unknown and other-application routes before next', async () => {
    for (const path of ['/api/students', '/api/state', '/api/centers', '/api/auth/login', '/api/platform-billing']) {
      const ctx = context(path);
      expect((await onRequest(ctx as any)).status).toBe(404);
      expect(ctx.next).not.toHaveBeenCalled();
    }
  });
  it('rejects cross-origin mutations', async () => {
    const ctx = context('/api/demo-requests', 'POST', 'https://other.example');
    expect((await onRequest(ctx as any)).status).toBe(403);
    expect(ctx.next).not.toHaveBeenCalled();
  });
  it('accepts same-origin demo submissions', async () => {
    expect((await onRequest(context('/api/demo-requests', 'POST', 'https://app.example') as any)).status).toBe(200);
  });
  it('sets no-store and hardening headers on every response', async () => {
    const response = await onRequest(context('/api/public-pricing') as any);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).not.toContain('pndsn.com');
  });
});
