import { Env, json, readBody, readSlots, writeSlots, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const slots = await readSlots(context.env.DB, centerId);
    return json(slots);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الفترات.' }, 500);
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
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات الفترات.' }, 500);
  }
};
