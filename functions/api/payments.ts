import { Env, json, readBody, createSinglePayment, updateSinglePayment, deleteSinglePayment, getContextCenterId } from './_lib';

/**
 * POST /api/payments  — ajoute UN paiement d'un élève existant, sans renvoyer
 * l'élève complet (l'ancien flux PUT /api/students réécrivait toutes les
 * tables enfants pour ajouter un simple paiement). Payload :
 *   { studentId, id?, date, amountPaid, totalRequired, service, month?,
 *     schoolYear?, paymentType, method, receiptNumber, notes?, discount?,
 *     chequeNumber?, chequeDate?, chequePaid? }
 * DELETE /api/payments?id=… — supprime un paiement par id.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const payment = await readBody(context.request);
    if (!payment || typeof payment !== 'object' || !payment.studentId || !payment.id) {
      return json({ error: 'بيانات الدفعة غير صالحة (studentId و id مطلوبان).' }, 400);
    }
    await createSinglePayment(context.env.DB, payment, centerId);
    return json({ ok: true, id: payment.id });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Élève introuvable')) return json({ error: 'التلميذ غير موجود في هذا المركز.' }, 404);
    if (message.includes('requ') || message.includes('nul')) return json({ error: message }, 400);
    return json({ error: 'تعذر إضافة الدفعة.' }, 500);
  }
};

/**
 * PUT /api/payments — mise à jour partielle (encaissement de chèque :
 * { id, chequePaid: true }). Uniquement les champs fournis sont modifiés.
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const patch = await readBody(context.request);
    if (!patch || typeof patch !== 'object' || !patch.id) {
      return json({ error: 'معرّف الدفعة مطلوب.' }, 400);
    }
    await updateSinglePayment(context.env.DB, patch, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Paiement introuvable')) return json({ error: 'الدفعة غير موجودة في هذا المركز.' }, 404);
    return json({ error: 'تعذر تعديل الدفعة.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'معرّف الدفعة مطلوب.' }, 400);
    await deleteSinglePayment(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حذف الدفعة.' }, 500);
  }
};
