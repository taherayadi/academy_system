import { Env, json, readBody, readEvents, writeEvents, createEvent, deleteEvent, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const events = await readEvents(context.env.DB, centerId);
    return json(events);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات الفعاليات.' }, 500);
  }
};

/**
 * POST : crée / met à jour UNE SEULE activité. L'ajout depuis l'UI envoie
 * uniquement l'objet créé — jamais la liste complète des événements.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات الفعالية غير صالحة.' }, 400);
    }
    await createEvent(context.env.DB, body, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حفظ الفعالية.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير صالحة') || err.message.includes('مفقود') || err.message.includes('غير موجود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    // Parité avec /api/formations : un objet seul = création ciblée de CETTE
    // activité (pointage / édition d'une seule ligne), un tableau = réécriture
    // du domaine complet (flux historique, conservé pour les anciens clients).
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      try {
        await createEvent(context.env.DB, body, centerId);
      } catch (err) {
        const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حفظ الفعالية.';
        const isBadRequest = err instanceof Error && (err.message.includes('غير صالحة') || err.message.includes('مفقود') || err.message.includes('غير موجود'));
        return json({ error: message }, isBadRequest ? 400 : 500);
      }
      return json({ ok: true });
    }
    if (!Array.isArray(body)) {
      return json({ error: 'بيانات الفعاليات غير صالحة.' }, 400);
    }
    await writeEvents(context.env.DB, body, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الفعاليات.' }, 500);
  }
};

/** DELETE /api/events?id=… : supprime UNE activité ciblée. */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return json({ error: 'معرّف الفعالية مفقود.' }, 400);
    await deleteEvent(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حذف الفعالية.';
    const isBadRequest = err instanceof Error && (err.message.includes('مفقود') || err.message.includes('غير موجود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};
