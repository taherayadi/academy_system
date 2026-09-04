/**
 * Cloudflare Pages Functions middleware for /api/* routes.
 *
 * Every request to /api/* is intercepted here BEFORE reaching the handler.
 * The only path exempt from authentication is POST /api/auth/login.
 * Everything else — including /api/state (GET + PUT) and
 * /api/auth/password — requires a valid HttpOnly session cookie.
 */
import { Env, validateSession, json } from './_lib';

/** Paths that do NOT require an authenticated session. */
const PUBLIC_PATHS: string[] = ['/api/auth/login', '/api/auth/logout', '/api/demo-requests'];

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Allow the login endpoint through without a session check.
  if (PUBLIC_PATHS.includes(url.pathname)) {
    return next();
  }

  // All other /api/* routes require a valid, non-expired session cookie.
  const session = await validateSession(env.DB, request);
  if (!session) {
    return json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);
  }

  // Session is valid — attach to context.data and proceed to the actual handler.
  (context.data as any).session = session;
  return next();
};
