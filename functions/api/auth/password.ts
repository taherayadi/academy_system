import { Env, json, readBody, sha256Hex, consumeAuthRateLimit } from '../_lib';

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

    const { email, currentPassword, newPassword } = await readBody(request);
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCurrent = String(currentPassword || '').trim();
    const cleanNew = String(newPassword || '').trim();

    if (!cleanEmail || !cleanCurrent || !cleanNew) {
      return json({ error: 'أدخل كلمة السر الحالية والجديدة.' }, 400);
    }
    if (cleanNew.length < 4) {
      return json({ error: 'كلمة السر الجديدة يجب أن تكون 4 أحرف على الأقل.' }, 400);
    }
    if (cleanNew === cleanCurrent) {
      return json({ error: 'كلمة السر الجديدة مطابقة للحالية.' }, 400);
    }

    const user = await env.DB.prepare('SELECT email, password_hash FROM users WHERE email = ?')
      .bind(cleanEmail).first<any>();

    if (!user) {
      return json({ error: 'الحساب غير موجود.' }, 404);
    }

    const currentHash = await sha256Hex(cleanCurrent);
    if (currentHash !== user.password_hash) {
      return json({ error: 'كلمة السر الحالية غير صحيحة.' }, 401);
    }

    const newHash = await sha256Hex(cleanNew);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      .bind(newHash, cleanEmail).run();

    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في تغيير كلمة السر.' }, 500);
  }
};
