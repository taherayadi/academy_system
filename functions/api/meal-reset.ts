import { Env, json, resetMealData, getContextCenterId } from './_lib';

/**
 * « مسح كل بيانات المطعم » : supprime en une opération les pointages, les
 * inscriptions lunch et les paiements Repas du centre. L'ancien flux envoyait
 * PUT /api/students avec TOUS les élèves (et toutes leurs tables enfants).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    await resetMealData(context.env.DB, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر مسح بيانات المطعم.' }, 500);
  }
};
