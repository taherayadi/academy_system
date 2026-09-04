import { Env, json, readBody, validateSession } from './_lib';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = await readBody(request);
    const fullName = String(body.fullName || body.full_name || '').trim();
    const academyName = String(body.academyName || body.academy_name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const estimatedSize = String(body.estimatedSize || body.estimated_students || '').trim();
    const requestedModules = Array.isArray(body.requestedModules) 
      ? JSON.stringify(body.requestedModules) 
      : String(body.requestedModules || body.requested_modules || '');
    const message = String(body.message || '').trim();
    const requestType = String(body.requestType || body.request_type || 'trial').trim();

    if (!fullName || !academyName || !email || !phone) {
      return json({ error: 'يرجى تعمير جميع الحقول الإجبارية (الاسم، المؤسسة، الهاتف، البريد).' }, 400);
    }

    const id = 'REQ_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
    const createdAt = Date.now();

    await env.DB.prepare(`
      INSERT INTO demo_requests (
        id, full_name, academy_name, email, phone, estimated_students, requested_modules, message, status, request_type, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, '', ?)
    `).bind(
      id, fullName, academyName, email, phone, estimatedSize, requestedModules, message, requestType, createdAt
    ).run();

    return json({ 
      success: true, 
      id, 
      message: 'تم تسجيل طلبك بنجاح! سيتصل بك فريقنا في أقرب وقت لتفعيل حساب المركز.' 
    }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في تسجيل الطلب.' }, 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح لك بالوصول إلى لوحة المنصة.' }, 403);
    }

    const { results } = await env.DB.prepare(`
      SELECT id, full_name, academy_name, email, phone, estimated_students, requested_modules, message, status, request_type, notes, created_at
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
        notes: r.notes || '',
        createdAt: r.created_at
      };
    });

    return json({ requests: formatted });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في جلب طلبات التجربة.' }, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const body = await readBody(request);
    const id = String(body.id || '').trim();
    if (!id) return json({ error: 'معرف الطلب مفقود.' }, 400);

    const status = body.status ? String(body.status).trim() : null;
    const notes = body.notes !== undefined ? String(body.notes).trim() : null;

    if (status && notes !== null) {
      await env.DB.prepare('UPDATE demo_requests SET status = ?, notes = ? WHERE id = ?').bind(status, notes, id).run();
    } else if (status) {
      await env.DB.prepare('UPDATE demo_requests SET status = ? WHERE id = ?').bind(status, id).run();
    } else if (notes !== null) {
      await env.DB.prepare('UPDATE demo_requests SET notes = ? WHERE id = ?').bind(notes, id).run();
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في تحديث الطلب.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'معرف الطلب مفقود.' }, 400);

    await env.DB.prepare('DELETE FROM demo_requests WHERE id = ?').bind(id).run();
    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في حذف الطلب.' }, 500);
  }
};
