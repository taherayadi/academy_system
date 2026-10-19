import { Env, json, readBody, createStaffPayslip, getContextCenterId } from './_lib';

// POST ciblé pour UNE fiche de paie d'UN agent. La fiche vit dans la table
// `staff_payslips` : on ne réécrit jamais l'objet staff complet.

const isBadRequest = (err: unknown): boolean =>
  err instanceof Error && (err.message.includes('غير صالحة') || err.message.includes('مفقود') || err.message.includes('غير موجود'));

const handlePost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات بطاقة الأجر غير صالحة.' }, 400);
    }
    const { staffId, payslip } = body as { staffId?: string; payslip?: any };
    await createStaffPayslip(context.env.DB, String(staffId || ''), payslip, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حفظ بطاقة الأجر.';
    return json({ error: message }, isBadRequest(err) ? 400 : 500);
  }
};

export const onRequestPost = handlePost;
