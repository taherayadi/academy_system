import { Env, json, readBody, readExternalStudents, writeExternalStudents, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const students = await readExternalStudents(context.env.DB, centerId);
    return json(students);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات التلاميذ الخارجيين.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const students = await readBody(context.request);
    if (!Array.isArray(students)) {
      return json({ error: 'بيانات التلاميذ الخارجيين غير صالحة.' }, 400);
    }
    await writeExternalStudents(context.env.DB, students, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات التلاميذ الخارجيين.' }, 500);
  }
};
