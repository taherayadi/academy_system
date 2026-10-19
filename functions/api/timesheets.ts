import { Env, json, readBody, readTimesheets, writeTimesheets, upsertSingleTimesheet, updateSingleTimesheet, deleteSingleTimesheet, getContextCenterId } from './_lib';

const isBadRequest = (err: unknown): boolean =>
  err instanceof Error && (err.message.includes('غير صالحة') || err.message.includes('غير موجود') || err.message.includes('يجب') || err.message.includes('حالة'));

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

// POST : CRÉATION d'UN pointage (staff + date + créneau). Le client n'envoie que
// la ligne créée — pas tout le domaine.
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
    return json({ error: message }, isBadRequest(err) ? 400 : 500);
  }
};

// PUT : MISE À JOUR d'UN pointage existant (corps = objet). Un tableau reste
// accepté pour la compatibilité (remplacement du domaine entier, ex. /state).
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (Array.isArray(body)) {
      await writeTimesheets(context.env.DB, body, centerId);
      return json({ ok: true });
    }
    if (!body || typeof body !== 'object') {
      return json({ error: 'سجل الحضور غير صالح.' }, 400);
    }
    await updateSingleTimesheet(context.env.DB, body, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && !err.message.includes('Error:') ? err.message : 'تعذر حفظ سجل الحضور.';
    return json({ error: message }, isBadRequest(err) ? 400 : 500);
  }
};

// DELETE : SUPPRESSION d'UN pointage (par `id`, ou par staff + date + créneau).
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    let payload = await readBody(context.request).catch(() => ({}));
    if (!payload || typeof payload !== 'object') payload = {};
    const url = new URL(context.request.url);
    if (!payload.id && !payload.staffId) {
      const id = url.searchParams.get('id');
      const staffId = url.searchParams.get('staffId');
      const date = url.searchParams.get('date');
      const slotTime = url.searchParams.get('slotTime');
      if (id) payload = { id };
      else if (staffId && date) payload = { staffId, date, slotTime: slotTime ?? undefined };
    }
    await deleteSingleTimesheet(context.env.DB, payload, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && !err.message.includes('Error:') ? err.message : 'تعذر حذف سجل الحضور.';
    return json({ error: message }, isBadRequest(err) ? 400 : 500);
  }
};
