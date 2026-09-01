import { Env, json, readBody, readSettings, writeSettings } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const settings = await readSettings(env.DB);
    return json(settings);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة إعدادات المنظومة.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const settings = await readBody(request);
    if (!settings || typeof settings !== 'object') {
      return json({ error: 'بيانات الإعدادات غير صالحة.' }, 400);
    }
    await writeSettings(env.DB, settings);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ إعدادات المنظومة.' }, 500);
  }
};
