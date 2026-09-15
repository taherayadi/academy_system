import { Env, json, validateSession, deleteSession, clearSessionCookie } from '../_lib';
import { logError } from '../_logger';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    // Delete the session row if one exists.
    // We handle the case where the session is already expired gracefully.
    const session = await validateSession(env.DB, request);
    if (session) {
      await deleteSession(env.DB, session.token);
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
    logError('logout', err);
    return json({ error: 'خطأ في تسجيل الخروج.' }, 500);
  }
};
