/**
 * /api/demo-requests — platform-side management of demo / trial requests
 * deposited through the center application's landing page.
 */
import { Env, json, readBody, validateSession, truncateField } from './_lib';
import { logError } from './_logger';

/**
 * POST deliberately absent: public demo/trial submission belongs to the
 * center application's landing page deployment. A POST against this SaaS
 * console hits the platform session middleware (401 for anonymous callers)
 * and, even with a platform session, gets Pages' controlled 405 — no handler
 * is exported here.
 */

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || session.role !== 'platform_super_admin') {
      return json({ error: 'غير مصرح لك بالوصول إلى لوحة المنصة.' }, 403);
    }

    const { results } = await env.DB.prepare(`
      SELECT id, full_name, academy_name, email, phone, estimated_students, requested_modules, message, status, request_type, notes, center_type, created_at
      FROM demo_requests
      ORDER BY created_at DESC
    `).all<any>();

    const formatted = (results || []).map(r => {
      let modules = [];
      try {
        modules = r.requested_modules ? JSON.parse(r.requested_modules) : [];
      } catch {
        modules = r.requested_modules ? [r.requested_modules] : [];
      }
      // Normalize the center type to 'jardin' | 'formation' | ''
      // (the DB may contain variants like "jardin d'enfant", "Jardin", "Centre de formation"…)
      const rawType = String(r.center_type || '').trim().toLowerCase();
      const centerType = rawType.includes('jardin')
        ? 'jardin'
        : (rawType.includes('formation') || rawType.includes('centre')) ? 'formation' : '';
      return {
        id: r.id,
        fullName: r.full_name,
        academyName: r.academy_name,
        email: r.email,
        phone: r.phone,
        estimatedSize: r.estimated_students,
        requestedModules: modules,
        message: r.message,
        status: r.status,
        requestType: r.request_type || 'trial',
        centerType,
        notes: r.notes || '',
        createdAt: r.created_at
      };
    });

    return json({ requests: formatted });
  } catch (err) {
    logError('fetch demo requests', err);
    return json({ error: 'خطأ في جلب طلبات التجربة.' }, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || session.role !== 'platform_super_admin') {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const body = await readBody(request);
    const id = String(body.id || '').trim();
    if (!id) return json({ error: 'معرف الطلب مفقود.' }, 400);

    const status = body.status ? String(body.status).trim() : null;
    const notes = body.notes !== undefined ? truncateField(body.notes, 1000) : null;

    // 'converted' is one-way: a request that already became a center can only
    // be archived afterwards (never reopened, never converted a second time).
    if (status) {
      const current = await env.DB.prepare('SELECT status FROM demo_requests WHERE id = ?').bind(id).first<any>();
      if (current && current.status === 'converted' && status !== 'converted' && status !== 'archived') {
        return json({ error: 'تم تحويل هذا الطلب إلى مركز مسبقاً — يمكن أرشفته فقط.' }, 409);
      }
    }

    if (status && notes !== null) {
      await env.DB.prepare('UPDATE demo_requests SET status = ?, notes = ? WHERE id = ?').bind(status, notes, id).run();
    } else if (status) {
      await env.DB.prepare('UPDATE demo_requests SET status = ? WHERE id = ?').bind(status, id).run();
    } else if (notes !== null) {
      await env.DB.prepare('UPDATE demo_requests SET notes = ? WHERE id = ?').bind(notes, id).run();
    }

    return json({ success: true });
  } catch (err) {
    logError('update demo request', err);
    return json({ error: 'خطأ في تحديث الطلب.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || session.role !== 'platform_super_admin') {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'معرف الطلب مفقود.' }, 400);

    await env.DB.prepare('DELETE FROM demo_requests WHERE id = ?').bind(id).run();
    return json({ success: true });
  } catch (err) {
    logError('delete demo request', err);
    return json({ error: 'خطأ في حذف الطلب.' }, 500);
  }
};
