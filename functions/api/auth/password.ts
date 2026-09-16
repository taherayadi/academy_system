/**
 * POST /api/auth/password — platform admin changes THEIR OWN password.
 *
 * The former combined app took the target `email` from the request body and
 * only required knowledge of the current password. In the split, the handler:
 *   • requires a valid platform session (enforced again here even though the
 *     middleware already gates /api/* — sensitive handler, defense in depth);
 *   • ignores any `email` sent by the client and uses the session identity,
 *     so a compromised platform account cannot pivot to another user's
 *     password;
 *   • revokes all other platform sessions of the account after the change,
 *     so a stolen cookie cannot outlive a deliberate password rotation.
 */
import { Env, json, readBody, validateSession, hashPassword, verifyPassword, consumeAuthRateLimit, resetAuthRateLimit, PLATFORM_ROLE } from '../_lib';
import { logError } from '../_logger';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || session.role !== PLATFORM_ROLE) {
      return json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);
    }

    const rateCheck = await consumeAuthRateLimit(env.DB, request, 'platform-auth-pw');
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

    const { currentPassword, newPassword } = await readBody(request);
    const cleanCurrent = String(currentPassword || '').trim();
    const cleanNew = String(newPassword || '').trim();

    if (!cleanCurrent || !cleanNew) {
      return json({ error: 'أدخل كلمة السر الحالية والجديدة.' }, 400);
    }
    if (cleanNew.length < 8) {
      return json({ error: 'كلمة السر الجديدة يجب أن تكون 8 أحرف على الأقل.' }, 400);
    }
    if (cleanNew === cleanCurrent) {
      return json({ error: 'كلمة السر الجديدة مطابقة للحالية.' }, 400);
    }

    const user = await env.DB.prepare('SELECT email, password_hash, role FROM users WHERE email = ?')
      .bind(session.email).first<any>();

    if (!user || user.role !== PLATFORM_ROLE) {
      return json({ error: 'الحساب غير موجود.' }, 404);
    }

    const isCurrentValid = await verifyPassword(cleanCurrent, user.password_hash);
    if (!isCurrentValid) {
      return json({ error: 'كلمة السر الحالية غير صحيحة.' }, 401);
    }

    const newHash = await hashPassword(cleanNew);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      .bind(newHash, user.email).run();

    // Reset rate limit for this IP on successful password change
    resetAuthRateLimit(env.DB, request, 'platform-auth-pw').catch(() => {});

    // Rotate sessions: drop every platform session for this account and let
    // the caller re-login with the new password (the current tab too — safe
    // default against a session that the owner no longer controls).
    await env.DB.prepare('DELETE FROM platform_sessions WHERE email = ?').bind(user.email).run();

    return json({ ok: true, sessionsRevoked: true });
  } catch (err) {
    logError('change password', err);
    return json({ error: 'خطأ في تغيير كلمة السر.' }, 500);
  }
};
