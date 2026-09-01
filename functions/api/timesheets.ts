import { Env, json, readBody, readTimesheets, writeTimesheets } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const timesheets = await readTimesheets(env.DB);
    return json(timesheets);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات جداول الحضور.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const timesheets = await readBody(request);
    if (!Array.isArray(timesheets)) {
      return json({ error: 'بيانات جداول الحضور غير صالحة.' }, 400);
    }
    await writeTimesheets(env.DB, timesheets);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات جداول الحضور.' }, 500);
  }
};
