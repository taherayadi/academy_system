import { Env, json, validateSession, DEFAULT_CENTER_ID } from '../_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session) {
      return json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);
    }
    const user = await env.DB
      .prepare('SELECT email, name, role, description, center_id FROM users WHERE email = ?')
      .bind(session.email)
      .first<any>();
    if (!user) {
      return json({ error: 'المستخدم غير موجود.' }, 404);
    }

    const centerId = user.center_id || session.centerId || DEFAULT_CENTER_ID;
    let center = null;
    if (centerId) {
      center = await env.DB
        .prepare('SELECT id, name, slug, logo_url, plan, enabled_modules, status, max_students, subscription_end FROM centers WHERE id = ?')
        .bind(centerId)
        .first<any>();
      if (center && center.enabled_modules && typeof center.enabled_modules === 'string') {
        try {
          center.enabled_modules = JSON.parse(center.enabled_modules);
        } catch {
          center.enabled_modules = [];
        }
      }
    }

    return json({
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        description: user.description,
        centerId
      },
      center
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في جلب بيانات المستخدم.' }, 500);
  }
};
