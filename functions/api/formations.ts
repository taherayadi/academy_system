import { Env, json, readBody, readFormations, writeFormations } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const formations = await readFormations(env.DB);
    return json(formations);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات التكوينات والدورات.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const formations = await readBody(request);
    if (!Array.isArray(formations)) {
      return json({ error: 'بيانات التكوينات غير صالحة.' }, 400);
    }
    await writeFormations(env.DB, formations);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات التكوينات.' }, 500);
  }
};
