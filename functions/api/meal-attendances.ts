import { Env, json, readBody, createSingleMealAttendance, updateSingleMealAttendance, deleteSingleMealAttendance, getContextCenterId } from './_lib';

/**
 * Pointages repas granulaires — l'élève n'est JAMAIS renvoyé en entier.
 *   POST   /api/meal-attendances        crée UN pointage
 *   PUT    /api/meal-attendances        met à jour status / paid_payment_id /
 *                                       billing_mode / unit_price d'UN pointage
 *                                       (la ligne n'est jamais supprimée)
 *   DELETE /api/meal-attendances?...    supprime UN pointage (annulation)
 *
 * L'ancien flux utilisait PUT /api/students : il supprimait puis réinsérait
 * paiements, parents, inscriptions… pour un simple pointage.
 */
function errorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : '';
  if (/introuvable/i.test(message)) return 404;
  if (/déjà existant/i.test(message)) return 409;
  return 400;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const payload = await readBody(context.request);
    await createSingleMealAttendance(context.env.DB, payload, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: err instanceof Error ? err.message : 'تعذر تسجيل الوجبة.' }, errorStatus(err));
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const payload = await readBody(context.request);
    await updateSingleMealAttendance(context.env.DB, payload, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: err instanceof Error ? err.message : 'تعذر تحديث تسجيل الوجبة.' }, errorStatus(err));
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const params = new URL(context.request.url).searchParams;
    await deleteSingleMealAttendance(context.env.DB, {
      studentId: params.get('studentId'),
      date: params.get('date'),
      service: params.get('service')
    }, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: err instanceof Error ? err.message : 'تعذر إلغاء تسجيل الوجبة.' }, errorStatus(err));
  }
};
