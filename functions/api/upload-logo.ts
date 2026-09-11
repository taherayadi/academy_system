import { Env, json, validateSession, DEFAULT_CENTER_ID } from './_lib';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Upload a center logo to ImageKit without exposing the private key to the browser. */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || session.role === 'platform_super_admin') {
      return json({ error: 'غير مصرح.' }, 403);
    }

    if (!env.IMAGEKIT_PRIVATE_KEY) {
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

    const centerId = session.centerId || DEFAULT_CENTER_ID;
    const fileName = `${centerId}-logo-${Date.now()}`;
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
      return json({ error: ikData.message || 'تعذر رفع الصورة إلى ImageKit.' }, 502);
    }
    return json({ url: ikData.url, fileId: ikData.fileId || '' });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في رفع الشعار.' }, 500);
  }
};
