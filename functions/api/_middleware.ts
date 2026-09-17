import { Env, validateSession, json } from './_lib';
import { isDeploymentRole } from './_deployment';

// Deny unknown routes before the SPA fallback; never proxy to the other backend.
export const ROUTES: Record<string, readonly string[]> = {"/api/advertisements/active": ["GET"], "/api/auth/login": ["POST"], "/api/auth/logout": ["POST"], "/api/auth/me": ["GET"], "/api/auth/password": ["POST"], "/api/center-logo": ["POST"], "/api/centers": ["GET"], "/api/courses": ["GET", "PUT"], "/api/demo-requests": ["POST"], "/api/expenses": ["GET", "POST", "PUT", "DELETE"], "/api/external-students": ["GET", "PUT"], "/api/formations": ["GET", "PUT"], "/api/meal-forfait-closures": ["GET", "POST", "PUT"], "/api/meals": ["GET", "PUT"], "/api/public-pricing": ["GET"], "/api/pubnub-grant": ["GET"], "/api/renewal-requests": ["GET", "POST"], "/api/revision-seances": ["GET", "PUT"], "/api/sessions": ["GET", "PUT"], "/api/settings": ["GET", "PUT"], "/api/slots": ["GET", "PUT"], "/api/staff": ["GET", "POST", "PUT", "DELETE"], "/api/state": ["GET", "PUT"], "/api/student-attendance": ["GET", "PUT"], "/api/student-time-sheets": ["GET", "PUT"], "/api/student-timesheets": ["GET", "PUT"], "/api/students": ["GET", "POST", "PUT", "DELETE"], "/api/timesheets": ["GET", "PUT"], "/api/upload-logo": ["POST"]};
const PUBLIC = new Set(["POST /api/auth/login", "POST /api/auth/logout", "POST /api/demo-requests", "GET /api/public-pricing", "GET /api/advertisements/active"]);

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
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
  if (!PUBLIC.has(`${request.method} ${url.pathname}`)) {
    const session = await validateSession(env.DB, request);
    if (!session) return json({ error: 'Unauthorized' }, 401);
    if (!isDeploymentRole(session.role)) return json({ error: 'Forbidden' }, 403);
    context.data.session = session;
  }
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy - allow only trusted sources
  headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://*.pndsn.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://ik.imagekit.io",
    "font-src 'self'",
    "connect-src 'self' https://*.pndsn.com wss://*.pndsn.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
