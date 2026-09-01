import { Env, json, readBody, readRevisionSeances, writeRevisionSeances } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const seances = await readRevisionSeances(env.DB);
    return json(seances);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات حصص المراجعة.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const seances = await readBody(request);
    if (!Array.isArray(seances)) {
      return json({ error: 'بيانات حصص المراجعة غير صالحة.' }, 400);
    }
    await writeRevisionSeances(env.DB, seances);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات حصص المراجعة.' }, 500);
  }
};
