import { Env, json, readBody, readFormations, writeFormations, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const formations = await readFormations(context.env.DB, centerId);
    return json(formations);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات التكوينات.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const formations = await readBody(context.request);
    if (!Array.isArray(formations)) {
      return json({ error: 'بيانات التكوينات غير صالحة.' }, 400);
    }
    await writeFormations(context.env.DB, formations, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات التكوينات.' }, 500);
  }
};
