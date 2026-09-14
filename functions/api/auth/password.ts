import { Env, json, readBody, hashPassword, verifyPassword, consumeAuthRateLimit, validateSession } from '../_lib';

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

    const session = await validateSession(env.DB, request);
    if (!session) return json({ error: 'Unauthorized' }, 401);
    const { currentPassword, newPassword } = await readBody(request);
    const email = session.email;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCurrent = String(currentPassword || '').trim();
    const cleanNew = String(newPassword || '').trim();

    if (!cleanEmail || !cleanCurrent || !cleanNew) {
      return json({ error: 'أدخل كلمة السر الحالية والجديدة.' }, 400);
    }
    if (cleanNew.length < 12 || new TextEncoder().encode(cleanNew).length > 72) {
      return json({ error: 'كلمة السر الجديدة يجب أن تكون 12 حرفاً على الأقل (72 بايت كحد أقصى).' }, 400);
    }
    if (cleanNew === cleanCurrent) {
      return json({ error: 'كلمة السر الجديدة مطابقة للحالية.' }, 400);
    }

    const user = await env.DB.prepare('SELECT email, password_hash FROM users WHERE email = ?')
      .bind(cleanEmail).first<any>();

    if (!user) {
      return json({ error: 'الحساب غير موجود.' }, 404);
    }

    const isCurrentValid = await verifyPassword(cleanCurrent, user.password_hash);
    if (!isCurrentValid) {
      return json({ error: 'كلمة السر الحالية غير صحيحة.' }, 401);
    }

    const newHash = await hashPassword(cleanNew);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      .bind(newHash, cleanEmail).run();

    await env.DB.prepare('DELETE FROM center_sessions WHERE email = ?').bind(cleanEmail).run();
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في تغيير كلمة السر.' }, 500);
  }
};
