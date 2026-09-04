import { Env, json, readBody, readStudents, writeStudents, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const students = await readStudents(context.env.DB, centerId);
    return json(students);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات التلاميذ.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const students = await readBody(context.request);
    if (!Array.isArray(students)) {
      return json({ error: 'بيانات التلاميذ غير صالحة.' }, 400);
    }
    await writeStudents(context.env.DB, students, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات التلاميذ.' }, 500);
  }
};
