import { Env, json, readBody, readRevisionSeances, writeRevisionSeances, createRevisionSeance, deleteRevisionSeance, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const seances = await readRevisionSeances(context.env.DB, centerId);
    return json(seances);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات جلسات المراجعة.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const seance = await readBody(context.request);
    if (!seance || typeof seance !== 'object' || Array.isArray(seance)) {
      return json({ error: 'بيانات حصة المراجعة غير صالحة.' }, 400);
    }
    await createRevisionSeance(context.env.DB, seance, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ حصة المراجعة.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    // Tableau = réécriture complète du domaine ; objet = mise à jour d'UNE
    // séance (pointage / édition), sans toucher aux autres séances.
    if (Array.isArray(body)) {
      await writeRevisionSeances(context.env.DB, body, centerId);
    } else if (body && typeof body === 'object') {
      await createRevisionSeance(context.env.DB, body, centerId);
    } else {
      return json({ error: 'بيانات جلسات المراجعة غير صالحة.' }, 400);
    }
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات جلسات المراجعة.' }, 500);
  }
};

// DELETE : supprime UNE seule séance (id en query).
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    await deleteRevisionSeance(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حذف حصة المراجعة.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير موجود') || err.message.includes('مفقود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};
