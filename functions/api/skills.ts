import { Env, json, readBody, readSkills, writeSkills, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const doc = await readSkills(context.env.DB, centerId);
    return json(doc);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات المهارات.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const doc = await readBody(context.request);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)
      || !Array.isArray((doc as any).catalog)
      || !Array.isArray((doc as any).evaluations)) {
      return json({ error: 'بيانات المهارات غير صالحة.' }, 400);
    }
    await writeSkills(context.env.DB, doc, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات المهارات.' }, 500);
  }
};
