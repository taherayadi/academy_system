import { Env, json, readBody, readSettings, writeSettings, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const settings = await readSettings(context.env.DB, centerId);
    return json(settings);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة إعدادات المنظومة.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const settings = await readBody(context.request);
    if (!settings || typeof settings !== 'object') {
      return json({ error: 'بيانات الإعدادات غير صالحة.' }, 400);
    }
    await writeSettings(context.env.DB, settings, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ إعدادات المنظومة.' }, 500);
  }
};
