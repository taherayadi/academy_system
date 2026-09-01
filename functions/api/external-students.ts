import { Env, json, readBody, readExternalStudents, writeExternalStudents } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const externalStudents = await readExternalStudents(env.DB);
    return json(externalStudents);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات التلاميذ الخارجيين.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const externalStudents = await readBody(request);
    if (!Array.isArray(externalStudents)) {
      return json({ error: 'بيانات التلاميذ الخارجيين غير صالحة.' }, 400);
    }
    await writeExternalStudents(env.DB, externalStudents);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات التلاميذ الخارجيين.' }, 500);
  }
};
