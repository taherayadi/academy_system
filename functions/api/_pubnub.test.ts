import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { publish, grantToken, readPubNubKeySet, PUBNUB_GRANT_TTL_SECONDS } from './_pubnub';

/** Clés factices — JAMAIS de vraies clés dans le dépôt. */
const KEYS = { PUBNUB_PUBLISH_KEY: 'test-pub', PUBNUB_SUBSCRIBE_KEY: 'test-sub', PUBNUB_SECRET_KEY: 'test-secret' };
const envWithKeys = { DB: {} as any, ...KEYS };

/** Même encodage que le SDK PubNub (référence indépendante du helper testé). */
const encodeString = (input: string | number) =>
  encodeURIComponent(input).replace(/[!~*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** Recalcule la signature v2 attendue avec node:crypto (implémentation indépendante). */
function expectedSignature(
  method: 'GET' | 'POST',
  publishKey: string,
  path: string,
  query: Record<string, string>,
  body: string,
  secretKey: string
): string {
  const canonical = Object.keys(query)
    .sort()
    .map((k) => `${k}=${encodeString(query[k])}`)
    .join('&');
  const input = `${method}\n${publishKey}\n${path}\n${canonical}\n${body}`;
  const b64 = createHmac('sha256', secretKey).update(input).digest('base64');
  return 'v2.' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const fetchMock = vi.fn(async (_url?: string | URL | Request, _init?: RequestInit) =>
  new Response(JSON.stringify([1, 'Sent']), { status: 200 })
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('_pubnub — readPubNubKeySet', () => {
  it('requires all three keys from env bindings only', () => {
    expect(readPubNubKeySet(envWithKeys as any)).toEqual({ publishKey: 'test-pub', subscribeKey: 'test-sub', secretKey: 'test-secret' });
    expect(readPubNubKeySet({ DB: {} } as any)).toBeNull();
    expect(readPubNubKeySet({ DB: {}, PUBNUB_PUBLISH_KEY: 'a' } as any)).toBeNull();
    expect(readPubNubKeySet({ DB: {}, PUBNUB_PUBLISH_KEY: 'a', PUBNUB_SUBSCRIBE_KEY: 'b', PUBNUB_SECRET_KEY: '  ' } as any)).toBeNull();
  });
});

describe('_pubnub — publish (fire-and-forget REST publish)', () => {
  it('is a silent no-op without keys: no fetch, no throw', async () => {
    await expect(publish({ DB: {} } as any, ['platform'], { type: 'refetch' })).resolves.toBe(false);
    await expect(publish({ DB: {} } as any, [], { type: 'refetch' })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('publishes to every channel in one REST call and signs the request', async () => {
    const payload = { type: 'refetch', topic: 'renewal_request_decided', centerId: 'c1', at: 1 };
    await expect(publish(envWithKeys as any, ['platform', 'center.c1'], payload)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin).toBe('https://ps.pndsn.com');
    expect(decodeURIComponent(url.pathname)).toBe(
      `/publish/test-pub/test-sub/0/platform,center.c1/0/${JSON.stringify(payload)}`
    );
    const timestamp = url.searchParams.get('timestamp') || '';
    expect(Number(timestamp)).toBeGreaterThan(0);
    expect(url.searchParams.get('uuid')).toBe('academy-platform-server');
    expect(url.searchParams.get('signature')).toBe(
      expectedSignature('GET', 'test-pub', url.pathname, { uuid: 'academy-platform-server', timestamp }, '', 'test-secret')
    );
  });

  it('never throws — network failures and non-2xx only warn', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(publish(envWithKeys as any, ['platform'], {})).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce(new Response('err', { status: 400 }));
    await expect(publish(envWithKeys as any, ['platform'], {})).resolves.toBe(false);

    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('survives payloads with unicode / Arabic channel-safe content', async () => {
    await expect(
      publish(envWithKeys as any, ['center.centre-الرياض'], { topic: 'renouvellement ✓' })
    ).resolves.toBe(true);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toContain(encodeURIComponent('center.centre-الرياض'));
  });
});

describe('_pubnub — grantToken (PAM v3, HMAC-SHA256 signé)', () => {
  it('is a silent no-op without keys: null, no fetch, no throw', async () => {
    await expect(grantToken({ DB: {} } as any, 'u1', { channels: { platform: { read: true } } })).resolves.toBeNull();
    await expect(grantToken(envWithKeys as any, 'u1', {})).resolves.toBeNull(); // aucune permission → rien à signer
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a signed v3/pam grant bound to the uuid, read-only bitmask on channels', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { token: 'granted-token' } }), { status: 200 })
    );
    const token = await grantToken(envWithKeys as any, 'uuid-1', { channels: { 'center.c1': { read: true } } });
    expect(token).toBe('granted-token');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/v3/pam/test-sub/grant');

    const body = String(init.body);
    const parsedBody = JSON.parse(body);
    expect(parsedBody.ttl).toBe(PUBNUB_GRANT_TTL_SECONDS);
    expect(parsedBody.permissions.uuid).toBe('uuid-1');
    expect(parsedBody.permissions.resources.channels).toEqual({ 'center.c1': 1 }); // read = bit 1
    expect(parsedBody.permissions.patterns).toEqual({});
    expect(body).not.toContain('test-secret');

    const timestamp = parsed.searchParams.get('timestamp') || '';
    expect(parsed.searchParams.get('signature')).toBe(
      expectedSignature('POST', 'test-pub', parsed.pathname, { timestamp }, body, 'test-secret')
    );
  });

  it('never throws — REST failure, bad payload or missing token → null', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    await expect(grantToken(envWithKeys as any, 'u', { channels: { platform: { read: true } } })).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));
    await expect(grantToken(envWithKeys as any, 'u', { channels: { platform: { read: true } } })).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    await expect(grantToken(envWithKeys as any, 'u', { channels: { platform: { read: true } } })).resolves.toBeNull();

    expect(console.warn).toHaveBeenCalledTimes(3);
  });
});
