import { Env, json, readBody, readCourses, writeCourses, removeCourseEnrollment, deleteCourse, getContextCenterId } from './_lib';

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

// DELETE : `?id=` supprime UN cours ; `?courseId=&studentId=` retire UN élève
// d'un cours. Jamais de réécriture complète du domaine.
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    if (id) {
      await deleteCourse(context.env.DB, id, centerId);
      return json({ ok: true });
    }
    const courseId = url.searchParams.get('courseId') || '';
    const studentId = url.searchParams.get('studentId') || '';
    await removeCourseEnrollment(context.env.DB, courseId, studentId, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حذف الدرس.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير موجود') || err.message.includes('مفقود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};
