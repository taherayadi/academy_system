import { isDeploymentRole } from './_deployment';
import { Env, json, readBody, validateSession } from './_lib';

/** Save the connected center's logo URL on that center's own row. */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || !isDeploymentRole(session.role) || !session.centerId) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const body = await readBody<{ logoUrl?: string }>(request);
    const logoUrl = String(body.logoUrl ?? '').trim();
    if (logoUrl.length > 2048) return json({ error: 'رابط الشعار طويل جداً.' }, 400);
    if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
      return json({ error: 'رابط الشعار غير صالح.' }, 400);
    }

    const centerId = session.centerId;
    await env.DB.prepare('UPDATE centers SET logo_url = ? WHERE id = ?').bind(logoUrl, centerId).run();
    return json({ success: true, logoUrl });
  } catch {
    return json({ error: 'خطأ في حفظ الشعار.' }, 500);
  }
};
