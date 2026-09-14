import { Env, json, readBody } from './_lib';

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
    const centerType = String(body.centerType || body.center_type || '').trim(); // jardin | formation

    if (!fullName || !academyName || !email || !phone) {
      return json({ error: 'يرجى تعمير جميع الحقول الإجبارية (الاسم، المؤسسة، الهاتف، البريد).' }, 400);
    }

    const id = 'REQ_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
    const createdAt = Date.now();

    await env.DB.prepare(`
      INSERT INTO demo_requests (
        id, full_name, academy_name, email, phone, estimated_students, requested_modules, message, status, request_type, notes, center_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, '', ?, ?)
    `).bind(
      id, fullName, academyName, email, phone, estimatedSize, requestedModules, message, requestType, centerType, createdAt
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
