import { Env, json, readBody, addFormationStudent, removeFormationStudent, getContextCenterId } from './_lib';

// POST : inscrit UN seul élève dans une formation existante. Le client n'envoie
// que la ligne ajoutée — pas toute la liste des formations.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات التلميذ غير صالحة.' }, 400);
    }
    const { formationId, student } = body as { formationId?: string; student?: unknown };
    await addFormationStudent(context.env.DB, String(formationId || ''), student, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر تسجيل التلميذ في التكوين.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير موجود') || err.message.includes('غير صالحة') || err.message.includes('مفقود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};

// DELETE : retire UN seul élève (formationId + studentId en query) de sa formation.
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const formationId = url.searchParams.get('formationId') || '';
    const studentId = url.searchParams.get('studentId') || '';
    await removeFormationStudent(context.env.DB, formationId, studentId, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حذف التلميذ من التكوين.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير موجود') || err.message.includes('غير صالحة') || err.message.includes('مفقود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};
