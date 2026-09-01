import { Env, json, readBody, readStudents, writeStudents } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const students = await readStudents(env.DB);
    return json(students);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات التلاميذ.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const students = await readBody(request);
    if (!Array.isArray(students)) {
      return json({ error: 'بيانات التلاميذ غير صالحة.' }, 400);
    }
    await writeStudents(env.DB, students);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات التلاميذ.' }, 500);
  }
};
