import { Env, json, readBody, readMealPlans, writeMealPlans, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const mealPlans = await readMealPlans(context.env.DB, centerId);
    return json(mealPlans);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات الوجبات.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const mealPlans = await readBody(context.request);
    if (!Array.isArray(mealPlans)) {
      return json({ error: 'بيانات الوجبات غير صالحة.' }, 400);
    }
    await writeMealPlans(context.env.DB, mealPlans, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الوجبات.' }, 500);
  }
};
