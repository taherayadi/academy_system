import { Env, json, readBody, readCourses, writeCourses } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const courses = await readCourses(env.DB);
    return json(courses);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الدروس.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const courses = await readBody(request);
    if (!Array.isArray(courses)) {
      return json({ error: 'بيانات الدروس غير صالحة.' }, 400);
    }
    await writeCourses(env.DB, courses);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات الدروس.' }, 500);
  }
};
