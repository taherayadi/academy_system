import { Env, json, readBody, readSlots, writeSlots } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const slots = await readSlots(env.DB);
    return json(slots);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الحصص.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const slots = await readBody(request);
    if (!Array.isArray(slots)) {
      return json({ error: 'بيانات الحصص غير صالحة.' }, 400);
    }
    await writeSlots(env.DB, slots);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات الحصص.' }, 500);
  }
};
