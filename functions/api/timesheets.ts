import { Env, json, readBody, readTimesheets, writeTimesheets, upsertSingleTimesheet, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const timesheets = await readTimesheets(context.env.DB, centerId);
    return json(timesheets);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات الحضور.' }, 500);
  }
};

// POST : upsert d'UN pointage (staff + date + créneau). Le client n'envoie
// que la ligne touchée (présent / absent / retard / congé) — pas tout le domaine.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const entry = await readBody(context.request);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return json({ error: 'سجل الحضور غير صالح.' }, 400);
    }
    await upsertSingleTimesheet(context.env.DB, entry, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && !err.message.includes('Error:') ? err.message : 'تعذر حفظ سجل الحضور.';
    return json({ error: message }, err instanceof Error && err.message.includes('غير موجود') || err.message.includes('غير صالحة') || err.message.includes('يجب') || err.message.includes('حالة') ? 400 : 500);
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
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الحضور.' }, 500);
  }
};
