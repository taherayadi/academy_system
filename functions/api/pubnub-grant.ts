/**
 * GET /api/pubnub-grant — hands the calling platform session a short-TTL
 * PubNub PAM token scoped to EXACTLY one channel: read-only `platform`.
 *
 * The split removed the center branch: center subscriptions to
 * `center.{id}` are granted by the center application (which owns its own
 * session store). A request that reaches this endpoint without a valid
 * platform session (including any center credential — the /api/* middleware
 * rejects it first) never receives a token.
 *
 * When the deployment has no PubNub keys the endpoint answers
 * `{ enabled: false }` (200): the client hook falls back to polling and the
 * app behaves exactly as before, with zero console errors.
 */
import { Env, json, validateSession, PLATFORM_ROLE } from './_lib';
import { grantToken, PUBNUB_GRANT_TTL_SECONDS } from './_pubnub';

export const PLATFORM_CHANNEL = 'platform';

/** This application listens to one channel, always, read-only. */
export function channelForSession(session: { role: string } | null): string {
  return PLATFORM_CHANNEL;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  // 401 behavior matches the sibling endpoints (the /api/* middleware already
  // blocks anonymous + center-session calls; this is the same check for
  // defense in depth).
  const session = await validateSession(env.DB, request);
  if (!session || session.role !== PLATFORM_ROLE) {
    return json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);
  }

  const channel = channelForSession(session);
  const uuid = crypto.randomUUID();
  const token = await grantToken(env, uuid, { channels: { [channel]: { read: true } } });
  if (!token) return json({ enabled: false });

  return json({
    enabled: true,
    token,
    uuid,
    channels: [channel],
    // `ttl` is SECONDS: the client schedules its refresh from it.
    // (_pubnub converts to the provider's minutes-based TTL on the wire.)
    ttl: PUBNUB_GRANT_TTL_SECONDS,
  });
};
