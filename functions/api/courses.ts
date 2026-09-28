import { Env, json, readBody, readCourses, writeCourses, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const courses = await readCourses(context.env.DB, centerId);
    return json(courses);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات الدروس.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const courses = await readBody(context.request);
    if (!Array.isArray(courses)) {
      return json({ error: 'بيانات الدروس غير صالحة.' }, 400);
    }
    await writeCourses(context.env.DB, courses, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الدروس.' }, 500);
  }
};
