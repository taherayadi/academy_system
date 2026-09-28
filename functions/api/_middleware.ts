import { Env, json } from './_lib';

// Deny unknown routes before the SPA fallback. This deployment is the public
// landing only: three public routes, nothing authenticated. The route/method
// inventory must stay in exact sync with the files in functions/api/.
export const ROUTES: Record<string, readonly string[]> = {"/api/advertisements/active": ["GET"], "/api/demo-requests": ["POST"], "/api/public-pricing": ["GET"]};
const PUBLIC = new Set(["GET /api/advertisements/active", "POST /api/demo-requests", "GET /api/public-pricing"]);

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const methods = ROUTES[url.pathname];
  if (!methods) return json({ error: 'Not found' }, 404);
  if (!methods.includes(request.method)) {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { Allow: methods.join(', '), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
  // Browser requests are same-origin; CLI clients may omit Origin. No CORS is enabled.
  const origin = request.headers.get('Origin');
  if (!['GET', 'HEAD'].includes(request.method) && origin && origin !== url.origin) {
    return json({ error: 'Untrusted origin' }, 403);
  }
  // Every route here is public by design — no session validation exists.
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy - allow only trusted sources
  headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://ik.imagekit.io",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
