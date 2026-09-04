import { Env, json, readBody, readStaff, writeStaff, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const staff = await readStaff(context.env.DB, centerId);
    return json(staff);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الإطار التربوي.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const staff = await readBody(context.request);
    if (!Array.isArray(staff)) {
      return json({ error: 'بيانات الإطار التربوي غير صالحة.' }, 400);
    }
    await writeStaff(context.env.DB, staff, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات الإطار التربوي.' }, 500);
  }
};
