import { Env, json, validateSession } from '../_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session) {
      return json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);
    }
    const user = await env.DB
      .prepare('SELECT email, name, role, description FROM users WHERE email = ?')
      .bind(session.email)
      .first<any>();
    if (!user) {
      return json({ error: 'المستخدم غير موجود.' }, 404);
    }
    return json({
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        description: user.description
      }
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في جلب بيانات المستخدم.' }, 500);
  }
};
