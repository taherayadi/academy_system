import { Env, json, readBody, readSlots, writeSlots, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const slots = await readSlots(context.env.DB, centerId);
    return json(slots);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات الفترات.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const slots = await readBody(context.request);
    if (!Array.isArray(slots)) {
      return json({ error: 'بيانات الفترات غير صالحة.' }, 400);
    }
    await writeSlots(context.env.DB, slots, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الفترات.' }, 500);
  }
};
