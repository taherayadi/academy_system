import { Env, json, readBody, readRevisionSeances, writeRevisionSeances, createRevisionSeance, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const seances = await readRevisionSeances(context.env.DB, centerId);
    return json(seances);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات جلسات المراجعة.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const seance = await readBody(context.request);
    if (!seance || typeof seance !== 'object' || Array.isArray(seance)) {
      return json({ error: 'بيانات حصة المراجعة غير صالحة.' }, 400);
    }
    await createRevisionSeance(context.env.DB, seance, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ حصة المراجعة.' }, 500);
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
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات جلسات المراجعة.' }, 500);
  }
};
