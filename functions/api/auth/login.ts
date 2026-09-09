import { Env, json, readBody, sha256Hex, createSession, makeSessionCookie, purgeExpiredSessions, consumeAuthRateLimit, resetAuthRateLimit, DEFAULT_CENTER_ID, mapCenterRow, getCenterAccessState } from '../_lib';

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
      .prepare('SELECT email, name, role, description, password_hash, center_id FROM users WHERE email = ?')
      .bind(cleanEmail)
      .first<any>();

    if (!user) {
      // Return the same error as wrong password to prevent user enumeration.
      return json({ error: 'كلمة السر غير صحيحة' }, 401);
    }

    const hash = await sha256Hex(cleanPassword);
    if (hash !== user.password_hash) {
      return json({ error: 'كلمة السر غير صحيحة' }, 401);
    }

    // Reset rate limits for this client IP on successful login.
    resetAuthRateLimit(env.DB, request).catch(() => {});

    const centerId = user.center_id || DEFAULT_CENTER_ID;
    const centerRow = await env.DB
      .prepare('SELECT * FROM centers WHERE id = ?')
      .bind(centerId)
      .first<any>();

    // A platform account is tenant-independent. Center accounts, however,
    // must not receive a session after their trial or paid subscription ends.
    if (user.role !== 'platform_super_admin' && centerRow) {
      const accessState = getCenterAccessState(centerRow);
      if (accessState) {
        // Keep the platform card/status truthful after the first blocked login.
        if (accessState === 'trial_expired' || accessState === 'subscription_expired') {
          await env.DB.prepare('UPDATE centers SET status = ? WHERE id = ? AND status NOT IN (?, ?)')
            .bind('expired', centerId, 'suspended', 'expired')
            .run();
        }
        const messages: Record<string, string> = {
          trial_expired: 'انتهت فترة التجربة لهذا المركز. يرجى التواصل مع إدارة المنصة.',
          subscription_expired: 'انتهت صلاحية اشتراك هذا المركز. يرجى التواصل مع إدارة المنصة.',
          suspended: 'تم تعليق هذا المركز. يرجى التواصل مع إدارة المنصة.',
          expired: 'انتهت صلاحية هذا المركز. يرجى التواصل مع إدارة المنصة.'
        };
        return json({ error: messages[accessState] }, 403);
      }
    }

    // Create a server-side session and return it as an HttpOnly cookie.
    const token = await createSession(env.DB, cleanEmail, centerId);

    // Opportunistically clean up expired sessions (fire-and-forget).
    purgeExpiredSessions(env.DB).catch(() => {});

    // Map the raw DB row (snake_case) to the camelCase CenterTenant shape —
    // the client reads `enabledModules` to decide which modules a center
    // admin can see in the menu.
    const center = centerRow ? mapCenterRow(centerRow) : null;

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
          description: user.description,
          centerId
        },
        center
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
