import { Env, json, readBody, readTimesheets, writeTimesheets, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const timesheets = await readTimesheets(context.env.DB, centerId);
    return json(timesheets);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الحضور.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const timesheets = await readBody(context.request);
    if (!Array.isArray(timesheets)) {
      return json({ error: 'بيانات الحضور غير صالحة.' }, 400);
    }
    await writeTimesheets(context.env.DB, timesheets, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات الحضور.' }, 500);
  }
};
