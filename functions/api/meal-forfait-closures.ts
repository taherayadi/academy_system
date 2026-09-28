import { Env, json, readBody, readMealForfaitClosures, createMealForfaitClosure, writeMealForfaitClosures, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const closures = await readMealForfaitClosures(context.env.DB, centerId);
    return json(closures);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات إغلاقات الوجبات.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const closure = await readBody(context.request);
    if (!closure || typeof closure !== 'object' || !closure.id) {
      return json({ error: 'بيانات الإغلاق غير صالحة.' }, 400);
    }
    await createMealForfaitClosure(context.env.DB, closure, centerId);
    return json({ ok: true, closure });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر إنشاء إغلاق الشهر.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const closures = await readBody(context.request);
    if (!Array.isArray(closures)) {
      return json({ error: 'بيانات الإغلاقات غير صالحة.' }, 400);
    }
    await writeMealForfaitClosures(context.env.DB, closures, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الإغلاقات.' }, 500);
  }
};
