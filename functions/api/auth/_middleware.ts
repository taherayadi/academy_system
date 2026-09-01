/**
 * Rate-limit every POST under /api/auth/* to 5 requests per 60 seconds per IP.
 * The 6th attempt in the window is rejected with 429 + Retry-After.
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
