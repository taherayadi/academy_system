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
  Env, json, readBody, verifyPassword, hashPassword,
  AUTH_TIMING_DUMMY_HASH,
  isLegacySha256Hash, verifyLegacySha256,
  createPlatformSession, makeSessionCookie, purgeExpiredSessions,
  consumeAuthRateLimit, resetAuthRateLimit, PLATFORM_ROLE
} from '../_lib';
import { logError } from '../_logger';

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
      // Same 401 as a wrong password to prevent user enumeration — and, on top
      // of the identical message, burn the ~one bcrypt a real account would,
      // so the RESPONSE TIMING does not distinguish "no account" from "account".
      await verifyPassword(cleanPassword, AUTH_TIMING_DUMMY_HASH);
      return json({ error: 'كلمة السر غير صحيحة' }, 401);
    }

    // Password check. Accounts whose row still holds the pre-salt-fix
    // unsalted SHA-256 digest are accepted through the legacy path BELOW —
    // exactly once, and only for a platform account, after which the row is
    // rewritten with a fresh bcrypt hash (see _lib rules).
    let upgradedFromLegacy = false;
    const isPasswordValid = isLegacySha256Hash(user.password_hash)
      ? await verifyLegacySha256(cleanPassword, user.password_hash)
      : await verifyPassword(cleanPassword, user.password_hash);

    // The unsalted SHA-256 comparison completes in microseconds. Burn the
    // ~one bcrypt a modern account takes (for BOTH the correct and the wrong
    // password) so the response cannot be timed to spot legacy-hashed rows.
    if (isLegacySha256Hash(user.password_hash)) {
      await verifyPassword(cleanPassword, AUTH_TIMING_DUMMY_HASH);
    }

    if (!isPasswordValid) {
      return json({ error: 'كلمة السر غير صحيحة' }, 401);
    }

    // Correct password but not a platform account → indistinguishable from a
    // wrong password for the caller; absolutely no session is created. This
    // gate also runs BEFORE any legacy rewrite, so a center-role row is never
    // touched from this application.
    if (user.role !== PLATFORM_ROLE) {
      return json({ error: 'كلمة السر غير صحيحة' }, 401);
    }

    // Retire the legacy digest now: this branch can only ever run once per
    // account. A rewrite failure must not lock the operator out — the
    // password-change UI still upgrades the hash on next save.
    if (isLegacySha256Hash(user.password_hash)) {
      upgradedFromLegacy = true;
      try {
        const freshHash = await hashPassword(cleanPassword);
        await env.DB
          .prepare('UPDATE users SET password_hash = ? WHERE email = ?')
          .bind(freshHash, user.email)
          .run();
      } catch {
        /* keep the login working; see README rotation note */
      }
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
        // Set once, when this login retired a legacy unsalted-SHA-256 row.
        // The UI uses it to demand an immediate password rotation.
        ...(upgradedFromLegacy ? { passwordUpgraded: true } : {}),
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
    logError('login', err);
    return json({ error: 'خطأ في تسجيل الدخول.' }, 500);
  }
};
