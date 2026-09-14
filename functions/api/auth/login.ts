/**
 * POST /api/auth/login — platform console login.
 *
 * Hard rule of the split: ONLY `platform_super_admin` accounts may obtain a
 * session here. Center roles (`admin`, `super_admin`, `restricted_admin`) are
 * rejected exactly like a wrong password (same 401 message, no session row
 * created, no cookie set), so this endpoint also cannot be used to enumerate
 * which platform accounts exist. Session state lives in `platform_sessions`
 * and the `tc_platform_session` cookie; the center application's `sessions`
 * table / `tc_session` cookie are never consulted or minted from this app.
 */
import {
  Env, json, readBody, verifyPassword,
  createPlatformSession, makeSessionCookie, purgeExpiredSessions,
  consumeAuthRateLimit, resetAuthRateLimit, PLATFORM_ROLE
} from '../_lib';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const rateCheck = await consumeAuthRateLimit(env.DB, request);
    if (!rateCheck.allowed) {
      const retryAfterSec = (rateCheck as { retryAfterSec: number }).retryAfterSec;
      return new Response(
        JSON.stringify({ error: `تجاوزت عدد المحاولات المسموح بها. يرجى الانتظار ${retryAfterSec} ثانية.` }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Retry-After': String(retryAfterSec)
          }
        }
      );
    }

    const { email, password } = await readBody(request);
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      return json({ error: 'أدخل البريد الإلكتروني وكلمة السر.' }, 400);
    }

    const user = await env.DB
      .prepare('SELECT email, name, role, description, password_hash FROM users WHERE email = ?')
      .bind(cleanEmail)
      .first<any>();

    if (!user) {
      // Return the same error as wrong password to prevent user enumeration.
      return json({ error: 'كلمة السر غير صحيحة' }, 401);
    }

    const isPasswordValid = await verifyPassword(cleanPassword, user.password_hash);
    if (!isPasswordValid) {
      return json({ error: 'كلمة السر غير صحيحة' }, 401);
    }

    // Correct password but not a platform account → indistinguishable from a
    // wrong password for the caller; absolutely no session is created.
    if (user.role !== PLATFORM_ROLE) {
      return json({ error: 'كلمة السر غير صحيحة' }, 401);
    }

    // Reset rate limits for this client IP on successful login.
    resetAuthRateLimit(env.DB, request).catch(() => {});

    // Create a server-side platform session and return it as an HttpOnly cookie.
    const token = await createPlatformSession(env.DB, cleanEmail);

    // Opportunistically clean up expired sessions (fire-and-forget).
    purgeExpiredSessions(env.DB).catch(() => {});

    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Set-Cookie', makeSessionCookie(token, request));

    return new Response(
      JSON.stringify({
        token,
        user: {
          email: user.email,
          name: user.name,
          role: user.role,
          description: user.description
        }
      }),
      {
        status: 200,
        headers
      }
    );
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في تسجيل الدخول.' }, 500);
  }
};
