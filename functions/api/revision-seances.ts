import { Env, json, readBody, readRevisionSeances, writeRevisionSeances, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const seances = await readRevisionSeances(context.env.DB, centerId);
    return json(seances);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات جلسات المراجعة.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const seances = await readBody(context.request);
    if (!Array.isArray(seances)) {
      return json({ error: 'بيانات جلسات المراجعة غير صالحة.' }, 400);
    }
    await writeRevisionSeances(context.env.DB, seances, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات جلسات المراجعة.' }, 500);
  }
};
