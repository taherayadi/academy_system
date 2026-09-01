import { Env, json, readBody, readStaff, writeStaff } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const staff = await readStaff(env.DB);
    return json(staff);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الإطار التربوي.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const staff = await readBody(request);
    if (!Array.isArray(staff)) {
      return json({ error: 'بيانات الإطار التربوي غير صالحة.' }, 400);
    }
    await writeStaff(env.DB, staff);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات الإطار التربوي.' }, 500);
  }
};
