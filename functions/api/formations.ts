import { Env, json, readBody, readFormations, writeFormations, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const formations = await readFormations(context.env.DB, centerId);
    return json(formations);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات التكوينات.' }, 500);
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
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات التكوينات.' }, 500);
  }
};
