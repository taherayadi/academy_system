import { Env, json, readBody, readSkills, writeSkills, createSkill, deleteSkill, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const doc = await readSkills(context.env.DB, centerId);
    return json(doc);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات المهارات.' }, 500);
  }
};

/** Mappe les erreurs de validation du helper vers le bon statut HTTP. */
function mapSkillError(err: unknown, fallback: string): Response {
  const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : fallback;
  const isBadRequest = err instanceof Error && (err.message.includes('غير صالحة') || err.message.includes('مفقود') || err.message.includes('غير موجود'));
  return json({ error: message }, isBadRequest ? 400 : 500);
}

/**
 * POST : crée / met à jour UNE SEULE compétence. L'ajout depuis l'UI envoie
 * uniquement l'objet compétence — jamais le document complet (catalogue +
 * évaluations).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات المهارة غير صالحة.' }, 400);
    }
    await createSkill(context.env.DB, body, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return mapSkillError(err, 'تعذر حفظ المهارة.');
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const doc = await readBody(context.request);
    // Parité avec /api/activities et /api/events : un objet seul (une compétence,
    // avec `label`/`domain`) = création ciblée, le document {catalog,evaluations}
    // = réécriture du domaine complet (flux historique, conservé pour compat).
    if (doc && typeof doc === 'object' && !Array.isArray(doc)
      && (doc as any).label !== undefined && !Array.isArray((doc as any).catalog)) {
      try {
        await createSkill(context.env.DB, doc, centerId);
      } catch (err) {
        return mapSkillError(err, 'تعذر حفظ المهارة.');
      }
      return json({ ok: true });
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)
      || !Array.isArray((doc as any).catalog)
      || !Array.isArray((doc as any).evaluations)) {
      return json({ error: 'بيانات المهارات غير صالحة.' }, 400);
    }
    await writeSkills(context.env.DB, doc, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات المهارات.' }, 500);
  }
};

/** DELETE /api/skills?id=… : supprime UNE compétence ciblée (+ ses évaluations). */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return json({ error: 'معرّف المهارة مفقود.' }, 400);
    await deleteSkill(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return mapSkillError(err, 'تعذر حذف المهارة.');
  }
};
