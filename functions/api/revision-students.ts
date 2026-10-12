import { Env, json, readBody, addRevisionStudent, getContextCenterId } from './_lib';

// POST : ajoute (ou met à jour) UN seul élève dans une séance de révision.
// Le client n'envoie que la ligne ajoutée — pas toute la liste des séances.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات التلميذ غير صالحة.' }, 400);
    }
    const { seanceId, student } = body as { seanceId?: string; student?: unknown };
    await addRevisionStudent(context.env.DB, String(seanceId || ''), student, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر إضافة التلميذ إلى حصة المراجعة.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير موجود') || err.message.includes('غير صالحة') || err.message.includes('مفقود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};
