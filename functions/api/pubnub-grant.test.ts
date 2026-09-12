import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet } from './pubnub-grant';

const grantMock = vi.hoisted(() => ({
  /** Imitate _pubnub.grantToken: un token seulement si les trois clés existent. */
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

vi.mock('./_lib', () => ({
  json: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
  DEFAULT_CENTER_ID: 'default-center',
  validateSession: vi.fn(async (db: any, request: Request) => {
    const auth = request.headers.get('Authorization') || '';
    if (auth === 'Bearer center') return { email: 'boss@centre.tn', token: 'center', centerId: 'c1', role: 'admin' };
    if (auth === 'Bearer platform') return { email: 'sa@platform.tn', token: 'platform', centerId: 'default-center', role: 'platform_super_admin' };
    if (auth === 'Bearer restricted') return { email: 'r@centre.tn', token: 'restricted', centerId: 'c7', role: 'restricted_admin' };
    return null;
  }),
}));

function req(auth: string | null) {
  const headers: Record<string, string> = {};
  if (auth) headers['Authorization'] = `Bearer ${auth}`;
  return new Request('https://x.test/api/pubnub-grant', { headers });
}

beforeEach(() => {
  grantMock.calls.length = 0;
  grantMock.impl = null;
});

describe('GET /api/pubnub-grant — scoping par rôle', () => {
  it('un centre ne reçoit qu’une lecture sur center.{son id}', async () => {
    const res = await onRequestGet({ env: { DB: {}, PUBNUB_PUBLISH_KEY: 'k', PUBNUB_SUBSCRIBE_KEY: 'k', PUBNUB_SECRET_KEY: 'k' }, request: req('center') } as any);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.enabled).toBe(true);
    expect(data.channels).toEqual(['center.c1']);
    expect(data.token).toBe('granted-token');
    expect(data.ttl).toBe(600);
    expect(typeof data.uuid).toBe('string');
    // Le token demandé ne porte QUE ce canal, en lecture seule.
    expect(Object.keys(grantMock.calls[0].channels)).toEqual(['center.c1']);
    expect(grantMock.calls[0].channels['center.c1']).toEqual({ read: true });
    expect(grantMock.calls[0].uuid).toBe(data.uuid);
  });

  it('un admin plateforme reçoit une lecture sur `platform` seulement', async () => {
    const res = await onRequestGet({ env: { DB: {}, PUBNUB_PUBLISH_KEY: 'k', PUBNUB_SUBSCRIBE_KEY: 'k', PUBNUB_SECRET_KEY: 'k' }, request: req('platform') } as any);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.channels).toEqual(['platform']);
    expect(Object.keys(grantMock.calls[0].channels)).toEqual(['platform']);
    expect(grantMock.calls[0].channels['platform']).toEqual({ read: true });
  });

  it('un compte restreint est scoppé sur le canal de son centre', async () => {
    const res = await onRequestGet({ env: { DB: {}, PUBNUB_PUBLISH_KEY: 'k', PUBNUB_SUBSCRIBE_KEY: 'k', PUBNUB_SECRET_KEY: 'k' }, request: req('restricted') } as any);
    const data: any = await res.json();
    expect(data.channels).toEqual(['center.c7']);
  });

  it('401 sans session (même comportement que les endpoints voisins)', async () => {
    const res = await onRequestGet({ env: { DB: {} }, request: req(null) } as any);
    expect(res.status).toBe(401);
    expect(grantMock.calls.length).toBe(0);
  });

  it('clés absentes côté serveur → { enabled: false } (200), pas de token', async () => {
    const res = await onRequestGet({ env: { DB: {} }, request: req('center') } as any);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data).toEqual({ enabled: false });
  });

  it('grant en échec → { enabled: false }, le client repasse en polling', async () => {
    grantMock.impl = async () => null;
    const res = await onRequestGet({ env: { DB: {}, PUBNUB_PUBLISH_KEY: 'k', PUBNUB_SUBSCRIBE_KEY: 'k', PUBNUB_SECRET_KEY: 'k' }, request: req('platform') } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
  });
});
