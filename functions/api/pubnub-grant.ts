import { isDeploymentRole } from './_deployment';
/**
 * GET /api/pubnub-grant — hands the calling session a short-TTL PubNub PAM
 * token scoped to exactly what it may listen to:
 *   • a center session  → read on `center.{ownId}` only;
 *
 * The client subscribes only to the channels listed in the response and only
 * uses messages as "refetch" signals — pushed payloads are never trusted.
 *
 * When the deployment has no PubNub keys the endpoint answers
 * `{ enabled: false }` (200): the client hook falls back to polling and the
 * app behaves exactly as before, with zero console errors.
 */
import { Env, json, validateSession } from './_lib';
import { grantToken, PUBNUB_GRANT_TTL_SECONDS } from './_pubnub';

/** Center credentials can only subscribe to their own center. */
export function channelForRole(centerId: string, role?: string): string {
  if (!isDeploymentRole(role) || !centerId) throw new Error('Forbidden');
  return 'center.' + centerId;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  // 401 behavior matches the sibling endpoints (the /api/* middleware already
  // blocks anonymous calls; this is the same check for defense in depth).
  const session = await validateSession(env.DB, request);
  if (!session || !isDeploymentRole(session.role)) return json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);

  const channel = channelForRole(session.centerId, session.role);
  const uuid = crypto.randomUUID();
  const token = await grantToken(env, uuid, { channels: { [channel]: { read: true } } });
  if (!token) return json({ enabled: false });

  return json({
    enabled: true,
    token,
    uuid,
    channels: [channel],
    ttl: PUBNUB_GRANT_TTL_SECONDS,
  });
};
