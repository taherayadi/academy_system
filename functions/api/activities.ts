import { Env, json, readBody, readActivities, writeActivities, createActivity, deleteActivity, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const activities = await readActivities(context.env.DB, centerId);
    return json(activities);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات الأنشطة.' }, 500);
  }
};

/** Mappe les erreurs de validation du helper vers le bon statut HTTP. */
function mapActivityError(err: unknown, fallback: string): Response {
  const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : fallback;
  const isBadRequest = err instanceof Error && (err.message.includes('غير صالحة') || err.message.includes('مفقود') || err.message.includes('غير موجود'));
  return json({ error: message }, isBadRequest ? 400 : 500);
}

/**
 * POST : crée / met à jour UNE SEULE activité. L'ajout depuis l'UI envoie
 * uniquement l'objet créé — jamais la liste complète du planning.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات النشاط غير صالحة.' }, 400);
    }
    await createActivity(context.env.DB, body, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return mapActivityError(err, 'تعذر حفظ النشاط.');
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const activities = await readBody(context.request);
    // Parité avec /api/events : un objet seul = création ciblée de CETTE
    // activité, un tableau = réécriture du domaine complet (flux historique,
    // conservé pour les anciens clients).
    if (activities && typeof activities === 'object' && !Array.isArray(activities)) {
      try {
        await createActivity(context.env.DB, activities, centerId);
      } catch (err) {
        return mapActivityError(err, 'تعذر حفظ النشاط.');
      }
      return json({ ok: true });
    }
    if (!Array.isArray(activities)) {
      return json({ error: 'بيانات الأنشطة غير صالحة.' }, 400);
    }
    await writeActivities(context.env.DB, activities, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الأنشطة.' }, 500);
  }
};

/** DELETE /api/activities?id=… : supprime UNE activité ciblée. */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return json({ error: 'معرّف النشاط مفقود.' }, 400);
    await deleteActivity(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return mapActivityError(err, 'تعذر حذف النشاط.');
  }
};
