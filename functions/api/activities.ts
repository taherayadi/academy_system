import { Env, json, readBody, readActivities, writeActivities, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const activities = await readActivities(context.env.DB, centerId);
    return json(activities);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات الأنشطة.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const activities = await readBody(context.request);
    if (!Array.isArray(activities)) {
      return json({ error: 'بيانات الأنشطة غير صالحة.' }, 400);
    }
    await writeActivities(context.env.DB, activities, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الأنشطة.' }, 500);
  }
};
