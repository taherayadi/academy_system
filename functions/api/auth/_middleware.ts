/**
 * Rate-limit every POST under /api/auth/* to 10 requests per 60 seconds per IP.
 * The limit beyond that is rejected with 429 + Retry-After.
 *
 * The counter keys live in the shared `rate_limits` table but use the
 * `platform-auth:` prefix, so brute-force attempts against this app cannot be
 * used to lock the center application's login (and vice versa).
 */
import { Env, consumeAuthRateLimit } from '../_lib';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;

  if (request.method !== 'POST') {
    return next();
  }

  try {
    const result = await consumeAuthRateLimit(env.DB, request);
    if (!result.allowed) {
      const retryAfterSec = (result as { retryAfterSec: number }).retryAfterSec;
      return new Response(
        JSON.stringify({
          error: `تم تجاوز عدد المحاولات. حاول مرة أخرى بعد ${retryAfterSec} ثانية.`
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Retry-After': String(retryAfterSec)
          }
        }
      );
    }
  } catch {
    // If the limiter itself fails, do not lock out login — D1 is still
    // required by the handler, so a real DB outage will surface there.
  }

  return next();
};
