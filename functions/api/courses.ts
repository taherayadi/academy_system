import { Env, json, readBody, readCourses, writeCourses, createCourse, removeCourseEnrollment, deleteCourse, getContextCenterId } from './_lib';

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

// POST : ajoute UN SEUL cours (l'objet envoyé), sans réécrire la liste.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const course = await readBody(context.request);
    if (!course || typeof course !== 'object' || Array.isArray(course)) {
      return json({ error: 'بيانات الدرس غير صالحة.' }, 400);
    }
    await createCourse(context.env.DB, course, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const bad = err?.message && /مفقود|مطلوب|غير موجود|غير صالحة/.test(err.message);
    return json({ error: err?.message || 'تعذر حفظ الدرس.' }, bad ? 400 : 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const courses = await readBody(context.request);
    // Tableau = réécriture complète du domaine ; objet = upsert d'UN cours.
    if (Array.isArray(courses)) {
      await writeCourses(context.env.DB, courses, centerId);
    } else if (courses && typeof courses === 'object') {
      await createCourse(context.env.DB, courses, centerId);
    } else {
      return json({ error: 'بيانات الدروس غير صالحة.' }, 400);
    }
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
