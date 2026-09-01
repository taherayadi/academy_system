import { Env, json, readBody, readMealPlans, writeMealPlans } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const mealPlans = await readMealPlans(env.DB);
    return json(mealPlans);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الوجبات.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const mealPlans = await readBody(request);
    if (!Array.isArray(mealPlans)) {
      return json({ error: 'بيانات الوجبات غير صالحة.' }, 400);
    }
    await writeMealPlans(env.DB, mealPlans);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات الوجبات.' }, 500);
  }
};
