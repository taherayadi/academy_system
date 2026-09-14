/**
 * GET /api/auth/me — resolves the platform session of the caller.
 * Returns only the platform account identity; the SaaS console has no tenant
 * view here (center profile editing lives in the center application).
 * A session whose account was deleted or whose role changed away from
 * platform_super_admin is rejected by validateSession (401).
 */
import { Env, json, validateSession, PLATFORM_ROLE } from '../_lib';

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
    if (!user || user.role !== PLATFORM_ROLE) {
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
