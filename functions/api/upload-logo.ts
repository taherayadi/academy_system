import { isDeploymentRole } from './_deployment';
import { Env, json, validateSession, getClientIp } from './_lib';
import { requireImageKitKey } from './_validate-env';
import { logAudit } from './_audit';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Upload a center logo to ImageKit without exposing the private key to the browser. */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || !isDeploymentRole(session.role) || !session.centerId) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    try {
      requireImageKitKey(env);
    } catch {
      return json({ error: 'خدمة رفع الشعار غير مهيأة: أضف IMAGEKIT_PRIVATE_KEY في متغيرات البيئة على Cloudflare.' }, 500);
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return json({ error: 'لم يتم إرسال أي صورة.' }, 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return json({ error: 'صيغة الصورة غير مدعومة (PNG, JPG, WEBP, SVG).' }, 400);
    }
    if (file.size > MAX_LOGO_BYTES) {
      return json({ error: 'حجم الصورة كبير جداً (الحد الأقصى 2 ميغا).' }, 400);
    }

    const centerId = session.centerId;
    const fileName = `${centerId}-logo-${Date.now()}`;
    const ip = getClientIp(request);
    const auth = btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`);
    const ikForm = new FormData();
    ikForm.append('file', file, fileName);
    ikForm.append('fileName', fileName);
    ikForm.append('folder', 'academy-logos');
    ikForm.append('useUniqueFileName', 'true');
    ikForm.append('overwriteFile', 'false');

    const ikRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
      body: ikForm
    });
    const ikData: { url?: string; fileId?: string; message?: string } = await ikRes.json().catch(() => ({}));
    if (!ikRes.ok || !ikData.url) {
      console.error('ImageKit upload failed:', ikRes.status, ikData.message || 'no message');
      logAudit(env, request, { email: session.email, action: 'logo_upload', details: 'upload_failed', entityType: 'center', entityId: centerId, ip }).catch(() => {});
      return json({ error: 'تعذر رفع الصورة إلى ImageKit.' }, 502);
    }
    logAudit(env, request, { email: session.email, action: 'logo_upload', details: `fileName:${fileName}`, entityType: 'center', entityId: centerId, ip }).catch(() => {});
    return json({ url: ikData.url, fileId: ikData.fileId || '' });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'خطأ في رفع الشعار.' }, 500);
  }
};
