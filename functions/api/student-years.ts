import { Env, json, readBody, readStudentYears, upsertSingleStudentYear, updateSingleStudentYear, deleteSingleStudentYear, getContextCenterId } from './_lib';

/**
 * GET /api/student-years — toutes les lignes student_years du centre
 * (grade + établissement + emploi du temps par année scolaire).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const years = await readStudentYears(context.env.DB, centerId);
    return json(years);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة سنوات التلاميذ.' }, 500);
  }
};

/**
 * POST /api/student-years — insère (ou met à jour) UNE ligne
 * { studentId, schoolYear, grade?, etablissementId?, timeSheetId? }.
 * L'élève n'est PAS renvoyé entier (comme /api/payments, /api/suivi-notes).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    await upsertSingleStudentYear(context.env.DB, body, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    return json({ error: err?.message || 'تعذر حفظ سنة التلميذ.' }, 400);
  }
};

/**
 * PUT /api/student-years — mise à jour partielle d'une ligne existante
 * (seuls les champs présents sont réécrits). 404-si-absent via changes=0.
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    await updateSingleStudentYear(context.env.DB, body, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const notFound = err?.message === 'سنة التلميذ غير موجودة في هذا المركز.';
    return json({ error: err?.message || 'تعذر تعديل سنة التلميذ.' }, notFound ? 404 : 400);
  }
};

/**
 * DELETE /api/student-years?studentId=…&schoolYear=… — supprime UNE ligne.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const studentId = url.searchParams.get('studentId') || '';
    const schoolYear = url.searchParams.get('schoolYear') || '';
    await deleteSingleStudentYear(context.env.DB, studentId, schoolYear, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const notFound = err?.message === 'سنة التلميذ غير موجودة في هذا المركز.';
    return json({ error: err?.message || 'تعذر حذف سنة التلميذ.' }, notFound ? 404 : 400);
  }
};
