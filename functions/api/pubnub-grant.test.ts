import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet } from './pubnub-grant';

const grantMock = vi.hoisted(() => ({
  /** Mimic _pubnub.grantToken: a token only when all three keys exist. */
  calls: [] as Array<{ uuid: string; channels: Record<string, unknown> }>,
  impl: null as null | ((env: any, uuid: string, perms: any) => Promise<string | null>),
}));

vi.mock('./_pubnub', () => ({
  PUBNUB_GRANT_TTL_SECONDS: 600,
  grantToken: vi.fn(async (env: any, uuid: string, perms: any) => {
    if (grantMock.impl) return grantMock.impl(env, uuid, perms);
    grantMock.calls.push({ uuid, channels: perms?.channels || {} });
    return env?.PUBNUB_SECRET_KEY ? 'granted-token' : null;
  }),
}));

/**
 * Post-split contract: validateSession resolves ONLY platform sessions
 * (platform_sessions table). Center credentials never produce a session here
 * — the center app mints its own grants from its own deployment. The mock
 * below encodes that: `Bearer center` and `Bearer restricted` do NOT resolve.
 */
vi.mock('./_lib', () => ({
  json: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
  PLATFORM_ROLE: 'platform_super_admin',
  validateSession: vi.fn(async (db: any, request: Request) => {
    const auth = request.headers.get('Authorization') || '';
    if (auth === 'Bearer platform') {
      return { email: 'sa@platform.tn', token: 'platform', role: 'platform_super_admin' };
    }
    return null; // center bearer, center cookie, junk, expiry — all null
  }),
}));

function req(auth: string | null) {
  const headers: Record<string, string> = {};
  if (auth) headers['Authorization'] = `Bearer ${auth}`;
  return new Request('https://x.test/api/pubnub-grant', { headers });
}

const envKeys = { PUBNUB_PUBLISH_KEY: 'k', PUBNUB_SUBSCRIBE_KEY: 'k', PUBNUB_SECRET_KEY: 'k' };

beforeEach(() => {
  grantMock.calls.length = 0;
  grantMock.impl = null;
});

describe('GET /api/pubnub-grant — platform scope after the split', () => {
  it('a platform admin receives read on `platform` ONLY', async () => {
    const res = await onRequestGet({ env: envKeys, request: req('platform') } as any);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.enabled).toBe(true);
    expect(data.channels).toEqual(['platform']);
    expect(data.token).toBe('granted-token');
    // Client-facing TTL stays SECONDS (the provider-side conversion to
    // minutes is unit-tested in _pubnub.test.ts).
    expect(data.ttl).toBe(600);
    expect(typeof data.uuid).toBe('string');
    // The requested grant carries EXACTLY that channel, read-only — no write,
    // no manage, and no `center.*` pattern this app could hand out.
    expect(Object.keys(grantMock.calls[0].channels)).toEqual(['platform']);
    expect(grantMock.calls[0].channels['platform']).toEqual({ read: true });
    expect(grantMock.calls[0].uuid).toBe(data.uuid);
  });

  it.each(['center', 'restricted', 'none'])(
    'a non-platform credential (%s) can never obtain a grant',
    async (which) => {
      const res = await onRequestGet({ env: envKeys, request: req(which === 'none' ? null : which) } as any);
      expect(res.status).toBe(401);
      expect(grantMock.calls).toHaveLength(0);
    }
  );

  it('never grants a center channel, even if asked via query string', async () => {
    const res = await onRequestGet({
      env: envKeys,
      request: new Request('https://x.test/api/pubnub-grant?channel=center.secret&for=center.42', {
        headers: { Authorization: 'Bearer platform' },
      }),
    } as any);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.channels).toEqual(['platform']);
    expect(grantMock.calls[0].channels).not.toHaveProperty('center.secret');
  });

  it('falls back to { enabled: false } when keys are absent (polling mode)', async () => {
    const res = await onRequestGet({ env: {}, request: req('platform') } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
  });
});
