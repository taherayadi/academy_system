import { Env, json, readBody, addSkillEvaluation, getContextCenterId } from './_lib';

function mapError(err: unknown, fallback: string): Response {
  const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : fallback;
  const isBadRequest = err instanceof Error && (err.message.includes('غير صالحة') || err.message.includes('مفقود') || err.message.includes('غير موجود'));
  return json({ error: message }, isBadRequest ? 400 : 500);
}

/**
 * POST /api/skill-evaluations : ajoute / met à jour UNE SEULE évaluation ciblée.
 * L'UI envoie uniquement l'objet évaluation { id, studentId, skillId, level,
 * evaluatedByStaffId|evaluatedByName, evaluatedAt } — jamais le document complet.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات التقييم غير صالحة.' }, 400);
    }
    await addSkillEvaluation(context.env.DB, body, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return mapError(err, 'تعذر حفظ التقييم.');
  }
};
