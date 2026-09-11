/**
 * PubNub server-side helper for Cloudflare Pages Functions.
 *
 * The SDK is deliberately NOT used on the server: everything goes through the
 * PubNub REST API with plain `fetch` (available in the Workers runtime), and
 * request signatures are computed with Web Crypto HMAC-SHA256.
 *
 * Wire format mirrors what the official JavaScript SDK (v13) emits:
 *   • every signed request carries `timestamp` + `signature=v2.<base64url>`
 *     query parameters, signature input being
 *       `${METHOD}\n${publishKey}\n${path}\n${sortedQuery}\n${body?}`
 *   • token grants target `POST /v3/pam/{subscribeKey}/grant` with
 *     `{ ttl, permissions: { uuid, resources: { channels: { ch: bitmask } } } }`
 *     (read = bit 1).
 *
 * Hard rules:
 *   • Keys come ONLY from the `env` bindings (Cloudflare Pages → Settings →
 *     Environment variables). Missing keys → silent no-op (console.warn,
 *     never throw) so the app falls back to polling exactly as before.
 *   • `publish()` is fire-and-forget: it never rejects and must never break
 *     the request that triggered it.
 */
import type { Env } from './_lib';

/** PubNub REST origin (the `ps.pndsn.com` cluster handles publish + PAM). */
const PUBNUB_ORIGIN = 'https://ps.pndsn.com';

/** UUID used as the publisher identity for server-side publishes. */
const SERVER_UUID = 'academy-platform-server';

/** Lifetime of granted tokens (seconds) — short on purpose. */
export const PUBNUB_GRANT_TTL_SECONDS = 600;

interface PubNubKeySet {
  publishKey: string;
  subscribeKey: string;
  secretKey: string;
}

/**
 * Reads the key set from the env bindings only (never wrangler.toml [vars]).
 * Returns null when any key is missing → callers must treat PubNub as absent.
 */
export function readPubNubKeySet(env: Env): PubNubKeySet | null {
  const publishKey = String(env?.PUBNUB_PUBLISH_KEY || '').trim();
  const subscribeKey = String(env?.PUBNUB_SUBSCRIBE_KEY || '').trim();
  const secretKey = String(env?.PUBNUB_SECRET_KEY || '').trim();
  if (!publishKey || !subscribeKey || !secretKey) return null;
  return { publishKey, subscribeKey, secretKey };
}

/**
 * Percent-encoding identical to the PubNub SDK's `encodeString`
 * (encodeURIComponent plus the extra literals the service requires).
 */
function encodeString(input: string | number): string {
  return encodeURIComponent(input).replace(/[!~*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** base64url formatting applied by the SDK to the raw HMAC digest. */
function formatV2Signature(base64Sig: string): string {
  return 'v2.' + base64Sig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** HMAC-SHA256 (secret key) → base64, via Web Crypto — available in Workers. */
async function hmacSha256Base64(secretKey: string, input: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
  let binary = '';
  const bytes = new Uint8Array(digest);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Builds the full URL for a signed PubNub REST call.
 * `query` must NOT contain `timestamp`/`signature`; they are added here
 * (sorted, exactly as the SDK signs them — every param except `signature`).
 */
async function buildSignedUrl(
  keys: PubNubKeySet,
  method: 'GET' | 'POST',
  path: string,
  query: Record<string, string> = {},
  body?: string
): Promise<string> {
  const withTimestamp: Record<string, string> = {
    ...query,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const canonicalQuery = Object.keys(withTimestamp)
    .sort()
    .map((k) => `${k}=${encodeString(withTimestamp[k])}`)
    .join('&');
  const signatureInput = `${method}\n${keys.publishKey}\n${path}\n${canonicalQuery}\n${body ?? ''}`;
  const signature = formatV2Signature(await hmacSha256Base64(keys.secretKey, signatureInput));
  return `${PUBNUB_ORIGIN}${path}?${canonicalQuery}&signature=${encodeString(signature)}`;
}

/**
 * Publishes a JSON payload to one or more channels (multi-channel publish in
 * a single REST call). Fire-and-forget: resolves `true` when the message was
 * accepted, `false` on any failure — and NEVER throws, so callers can hand
 * the promise to `context.waitUntil()` or `void` it safely.
 */
export async function publish(env: Env, channels: string[], payload: unknown): Promise<boolean> {
  const keys = readPubNubKeySet(env);
  if (!keys || !channels.length) return false; // silent no-op — polling fallback stays in charge
  try {
    const channelList = channels.map(encodeString).join(',');
    const message = JSON.stringify(payload ?? {});
    const path = `/publish/${keys.publishKey}/${keys.subscribeKey}/0/${channelList}/0/${encodeString(message)}`;
    const url = await buildSignedUrl(keys, 'GET', path, { uuid: SERVER_UUID });
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      console.warn(`[pubnub] publish rejected (${res.status}) — clients fall back to polling.`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[pubnub] publish failed — clients fall back to polling.', err);
    return false;
  }
}

/**
 * Hands `publish()` to the Pages Function `waitUntil` so the response is never
 * delayed or failed by PubNub, while the Workers runtime still lets the fetch
 * complete after the response is returned.
 */
export function publishOnResponse(
  context: { waitUntil?: (promise: Promise<unknown>) => void },
  env: Env,
  channels: string[],
  payload: unknown
): void {
  try {
    const promise = publish(env, channels, payload);
    if (typeof context?.waitUntil === 'function') context.waitUntil(promise);
    else void promise;
  } catch (err) {
    console.warn('[pubnub] publish scheduling failed.', err);
  }
}

/** Per-channel permissions requested for a granted token. */
export interface ChannelPermissions {
  read?: boolean;
  write?: boolean;
  manage?: boolean;
  delete?: boolean;
  get?: boolean;
  update?: boolean;
  join?: boolean;
}

export interface GrantPermissions {
  /** `channel name → permissions` (only exact channel grants are used here). */
  channels?: Record<string, ChannelPermissions>;
}

/** SDK permission bits: read=1, write=2, manage=4, delete=8, get=32, update=64, join=128. */
function permissionsBitmask(perms: ChannelPermissions): number {
  let mask = 0;
  if (perms.read) mask |= 1;
  if (perms.write) mask |= 2;
  if (perms.manage) mask |= 4;
  if (perms.delete) mask |= 8;
  if (perms.get) mask |= 32;
  if (perms.update) mask |= 64;
  if (perms.join) mask |= 128;
  return mask;
}

/**
 * Requests a short-TTL PAM v3 token scoped to `uuid` and the given
 * permissions. Returns the raw token string, or null when keys are missing or
 * the grant failed (console.warn, never throws).
 */
export async function grantToken(
  env: Env,
  uuid: string,
  permissions: GrantPermissions
): Promise<string | null> {
  const keys = readPubNubKeySet(env);
  if (!keys) return null; // silent no-op — the grant endpoint answers { enabled: false }
  const channels: Record<string, number> = {};
  for (const [channel, perms] of Object.entries(permissions?.channels || {})) {
    channels[channel] = permissionsBitmask(perms);
  }
  if (Object.keys(channels).length === 0) return null;
  try {
    const path = `/v3/pam/${keys.subscribeKey}/grant`;
    const body = JSON.stringify({
      ttl: PUBNUB_GRANT_TTL_SECONDS,
      permissions: {
        uuid: String(uuid || SERVER_UUID),
        resources: { channels },
        patterns: {},
        meta: {},
      },
    });
    const url = await buildSignedUrl(keys, 'POST', path, {}, body);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      console.warn(`[pubnub] grant rejected (${res.status}) — clients fall back to polling.`);
      return null;
    }
    const data: { data?: { token?: string } } = await res.json().catch(() => ({}));
    const token = data?.data?.token;
    if (!token) {
      console.warn('[pubnub] grant returned no token — clients fall back to polling.');
      return null;
    }
    return token;
  } catch (err) {
    console.warn('[pubnub] grant failed — clients fall back to polling.', err);
    return null;
  }
}
