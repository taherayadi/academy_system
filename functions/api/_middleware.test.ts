import { describe, it, expect, vi } from 'vitest';
import { onRequest } from './_middleware';

/**
 * The split removed EVERY public /api path: the platform console authenticates
 * only through platform_super_admin sessions. The mock reproduces the real
 * validateSession contract: ONLY tokens that this app minted (platform_sessions)
 * resolve; a center credential resolves to null.
 */
const validateSessionMock = vi.hoisted(() => vi.fn(async (_db: unknown, request: Request) => {
  const cookie = request.headers.get('Cookie') || '';
  const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const token = cookie.includes('tc_platform_session=valid-platform') || bearer === 'valid-platform'
    ? { email: 'sa@platform.tn', token: 'valid-platform', role: 'platform_super_admin' }
    : null; // everything else — including tc_session=center-… — has no platform session
  return token;
}));

vi.mock('./_lib', () => ({
  validateSession: validateSessionMock,
  json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
}));

function ctx(pathname: string, headers: Record<string, string> = {}) {
  const next = vi.fn(async () => new Response('handler-reached'));
  return {
    context: { request: new Request(`https://x.test${pathname}`, { headers }), env: { DB: {} }, next, data: {} },
    next,
  };
}

describe('functions/api/_middleware — platform-only gate', () => {
  it('the ONLY public paths are login and logout', async () => {
    for (const path of ['/api/auth/login', '/api/auth/logout']) {
      const { context, next } = ctx(path);
      const res = await onRequest(context as any);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('handler-reached');
      expect(next).toHaveBeenCalled();
    }
  });

  it('there are NO public data paths anymore (removed landing/pricing/ads feeds)', async () => {
    validateSessionMock.mockResolvedValueOnce(null);
    for (const path of ['/api/public-pricing', '/api/advertisements/active', '/api/demo-requests']) {
      const { context } = ctx(path);
      const res = await onRequest(context as any);
      expect(res.status).toBe(401);
    }
  });

  it('blocks every other /api route without a session', async () => {
    const { context, next } = ctx('/api/centers');
    const res = await onRequest(context as any);
    expect(res.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a CENTER application cookie (tc_session) — never accepted here', async () => {
    const { context, next } = ctx('/api/centers', { Cookie: 'tc_session=center-credential' });
    const res = await onRequest(context as any);
    expect(res.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a center bearer credential', async () => {
    const { context } = ctx('/api/centers', { Authorization: 'Bearer center-credential' });
    const res = await onRequest(context as any);
    expect(res.status).toBe(401);
  });

  it('passes a valid platform session through to the handler and attaches it', async () => {
    const { context, next } = ctx('/api/centers', { Cookie: 'tc_platform_session=valid-platform' });
    const res = await onRequest(context as any);
    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalled();
    expect((context.data as any).session).toMatchObject({ role: 'platform_super_admin' });
  });
});
