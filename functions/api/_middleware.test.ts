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
  addCorsHeaders: (response: Response, request: Request) => {
    const origin = request.headers.get('Origin');
    if (!origin) return response;
    const url = new URL(request.url);
    const isSameOrigin = origin === `${url.protocol}//${url.host}`;
    if (isSameOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    return response;
  },
  addSecurityHeaders: (response: Response, request: Request) => {
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const url = new URL(request.url);
    if (url.protocol === 'https:') {
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return response;
  },
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

describe('functions/api/_middleware — CORS', () => {
  it('handles OPTIONS preflight with 204 and CORS headers for same-origin', async () => {
    const { context } = ctx('/api/centers');
    context.request = new Request('https://x.test/api/centers', {
      method: 'OPTIONS',
      headers: { Origin: 'https://x.test' },
    });
    const res = await onRequest(context as any);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://x.test');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
  });

  it('adds CORS headers to same-origin authenticated responses', async () => {
    const { context, next } = ctx('/api/centers', {
      Cookie: 'tc_platform_session=valid-platform',
      Origin: 'https://x.test',
    });
    const res = await onRequest(context as any);
    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalled();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://x.test');
  });

  it('adds CORS headers to same-origin auth-rejection responses (401)', async () => {
    const { context } = ctx('/api/centers', { Origin: 'https://x.test' });
    const res = await onRequest(context as any);
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://x.test');
  });

  it('does NOT set CORS headers for cross-origin requests', async () => {
    const { context } = ctx('/api/centers', { Origin: 'https://evil.com' });
    const res = await onRequest(context as any);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('does NOT set CORS headers when Origin header is absent', async () => {
    const { context } = ctx('/api/centers');
    const res = await onRequest(context as any);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('functions/api/_middleware — security headers', () => {
  it('adds security headers to all API responses', async () => {
    const { context } = ctx('/api/centers');
    const res = await onRequest(context as any);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('adds HSTS header for HTTPS requests', async () => {
    const { context } = ctx('/api/centers');
    context.request = new Request('https://x.test/api/centers', { headers: { Cookie: 'tc_platform_session=valid-platform' } });
    const res = await onRequest(context as any);
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('does not add HSTS header for HTTP requests', async () => {
    const { context } = ctx('/api/centers');
    context.request = new Request('http://x.test/api/centers', { headers: { Cookie: 'tc_platform_session=valid-platform' } });
    const res = await onRequest(context as any);
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('security headers present on OPTIONS preflight', async () => {
    const { context } = ctx('/api/centers');
    context.request = new Request('https://x.test/api/centers', { method: 'OPTIONS', headers: { Origin: 'https://x.test' } });
    const res = await onRequest(context as any);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('security headers present on 401 rejection responses', async () => {
    const { context } = ctx('/api/centers');
    const res = await onRequest(context as any);
    expect(res.status).toBe(401);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
