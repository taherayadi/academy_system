import { Env, json, readBody, writeMealEnrollments, getContextCenterId } from './_lib';

/**
 * Inscription / désinscription aux services repas et goûter sans réécrire
 * l'élève complet. `enrolledServices.meals` et `mealSubscription.active` sont
 * dérivés côté lecture de `student_service_enrollments`.
 *
 * PUT /api/meal-enrollments — objet ou tableau :
 *   { studentId, schoolYear?, lunch?: { active, mode?, monthlyPrice?, unitPrice? },
 *     gouterMatin?, gouterSoir? }
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const payload = await readBody(context.request);
    await writeMealEnrollments(context.env.DB, payload, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error ? err.message : '';
    const status = /introuvable/i.test(message) ? 404 : 400;
    return json({ error: message || 'تعذر حفظ inscriptions المطعم.' }, status);
  }
};
