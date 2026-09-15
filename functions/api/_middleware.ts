/**
 * Cloudflare Pages Functions middleware for /api/* routes of the SaaS
 * platform administration application.
 *
 * Every request to /api/* is intercepted here BEFORE reaching the handler.
 * The only paths exempt from authentication are the platform login itself
 * and logout (which must be able to clear a broken/expired cookie).
 *
 * Unlike the former combined app there are NO public API paths: the landing
 * page, public pricing and anonymous advertisement feeds live in the center
 * application. Everything here requires a valid `platform_sessions` cookie
 * (or Bearer token) whose account still holds the platform_super_admin role —
 * center accounts can never obtain one.
 */
import { Env, validateSession, json, addCorsHeaders, addSecurityHeaders } from './_lib';

/** Paths that do NOT require an authenticated platform session. */
const PUBLIC_PATHS: string[] = [
  '/api/auth/login',
  '/api/auth/logout',
];

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Handle OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    const response = new Response(null, { status: 204 });
    return addSecurityHeaders(addCorsHeaders(response, request), request);
  }

  // Allow the login/logout endpoints through without a session check.
  if (PUBLIC_PATHS.includes(url.pathname)) {
    const response = await next();
    return addSecurityHeaders(addCorsHeaders(response, request), request);
  }

  // All other /api/* routes require a valid, non-expired platform session
  // (token issued by THIS app, account still exists, role still platform).
  const session = await validateSession(env.DB, request);
  if (!session) {
    const response = json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);
    return addSecurityHeaders(addCorsHeaders(response, request), request);
  }

  // Session is valid — attach to context.data and proceed to the actual handler.
  (context.data as any).session = session;
  const response = await next();
  return addSecurityHeaders(addCorsHeaders(response, request), request);
};
