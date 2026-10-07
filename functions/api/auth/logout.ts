import { Env, json, getSessionToken, deleteSession, validateSession, clearSessionCookie, getClientIp } from '../_lib';
import { logAudit } from '../_audit';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    // Delete the session row if one exists.
    // We handle the case where the session is already expired gracefully.
    const token = getSessionToken(request);
    const ip = getClientIp(request);

    if (token) {
      // Resolve the user for the audit log before deleting (auth_sessions
      // stores user_id, not email — resolve via validateSession).
      const session = await validateSession(env.DB, request);
      if (session?.email) {
        logAudit(env, request, { email: session.email, action: 'logout', ip }).catch(() => {});
      }
      await deleteSession(env.DB, token);
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Set-Cookie', clearSessionCookie(request));

    // Always return 200 and clear the cookie, even if there was no session.
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'خطأ في تسجيل الخروج.' }, 500);
  }
};
