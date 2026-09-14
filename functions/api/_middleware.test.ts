import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest, ROUTES } from './_middleware';
import { APPLICATION } from './_deployment';
import { validateSession } from './_lib';

vi.mock('./_lib', () => ({
  validateSession: vi.fn(async () => null),
  json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
}));
const platform = String(APPLICATION) === 'platform';
const allowedRole = platform ? 'platform_super_admin' : 'admin';
const foreignRoles = platform ? ['admin', 'super_admin', 'restricted_admin'] : ['platform_super_admin'];
const protectedPath = platform ? '/api/platform-billing' : '/api/state';
function context(path: string, method = 'GET', origin?: string) {
  return { request: new Request('https://app.example' + path, { method, headers: origin ? { Origin: origin } : {} }), env: { DB: {} }, data: {}, next: vi.fn(async () => new Response('ok')) };
}
beforeEach(() => vi.mocked(validateSession).mockReset());
describe('deployment boundary', () => {
  it('permits login POST but not login GET', async () => {
    expect((await onRequest(context('/api/auth/login', 'POST') as any)).status).toBe(200);
    expect((await onRequest(context('/api/auth/login') as any)).status).toBe(405);
  });
  it('requires authentication for every protected route and method', async () => {
    const publicKeys = new Set(['POST /api/auth/login', 'POST /api/auth/logout', ...(platform ? [] : ['POST /api/demo-requests', 'GET /api/public-pricing', 'GET /api/advertisements/active'])]);
    for (const [route, methods] of Object.entries(ROUTES)) for (const method of methods) {
      if (publicKeys.has(`${method} ${route}`)) continue;
      const ctx = context(route, method);
      expect((await onRequest(ctx as any)).status, `${method} ${route}`).toBe(401);
      expect(ctx.next).not.toHaveBeenCalled();
    }
  });
  it.each(foreignRoles)('rejects the other application role %s', async role => {
    vi.mocked(validateSession).mockResolvedValue({ email: 'test@example.invalid', token: 'test', centerId: 'c1', role });
    const ctx = context(protectedPath);
    expect((await onRequest(ctx as any)).status).toBe(403);
    expect(ctx.next).not.toHaveBeenCalled();
  });
  it('passes authenticated context and disables API caching', async () => {
    vi.mocked(validateSession).mockResolvedValue({ email: 'test@example.invalid', token: 'test', centerId: 'c1', role: allowedRole });
    const ctx = context(protectedPath);
    const response = await onRequest(ctx as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((ctx.data as any).session.role).toBe(allowedRole);
  });
  it('rejects unknown/other-application routes before next', async () => {
    const ctx = context(platform ? '/api/students' : '/api/platform-billing');
    expect((await onRequest(ctx as any)).status).toBe(404);
    expect(ctx.next).not.toHaveBeenCalled();
  });
  it('has only its own mutation methods', async () => {
    const cases = platform ? [['/api/demo-requests', 'POST'], ['/api/renewal-requests', 'POST']] : [['/api/centers', 'PATCH'], ['/api/centers', 'DELETE'], ['/api/centers', 'POST'], ['/api/demo-requests', 'GET'], ['/api/renewal-requests', 'PATCH']];
    for (const [route, method] of cases) expect((await onRequest(context(route, method) as any)).status).toBe(405);
  });
  it('rejects cross-origin login and mutation requests', async () => {
    const ctx = context('/api/auth/login', 'POST', 'https://other.example');
    expect((await onRequest(ctx as any)).status).toBe(403);
    expect(ctx.next).not.toHaveBeenCalled();
  });
  it('accepts same-origin login requests', async () => {
    expect((await onRequest(context('/api/auth/login', 'POST', 'https://app.example') as any)).status).toBe(200);
  });
  it('landing submissions and pricing exist only on the center backend', async () => {
    expect((await onRequest(context('/api/public-pricing') as any)).status).toBe(platform ? 404 : 200);
    expect((await onRequest(context('/api/demo-requests', 'POST') as any)).status).toBe(platform ? 405 : 200);
  });
});
