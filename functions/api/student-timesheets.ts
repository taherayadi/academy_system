import { Env, json, readBody, readStudentTimeSheets, writeStudentTimeSheets, deleteStudentTimeSheet, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const sheets = await readStudentTimeSheets(context.env.DB, centerId);
    return json(sheets);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة جداول التوقيت.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const sheets = await readBody(context.request);
    if (!Array.isArray(sheets)) {
      return json({ error: 'بيانات جداول التوقيت غير صالحة.' }, 400);
    }
    await writeStudentTimeSheets(context.env.DB, sheets, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ جداول التوقيت.' }, 500);
  }
};

// DELETE ?id= — supprime UN SEUL emploi du temps (student_years.time_sheet_id
// passe à NULL via la FK ON DELETE SET NULL), sans réécrire la liste complète.
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    await deleteStudentTimeSheet(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const notFound = err?.message === 'جدول التوقيت غير موجود في هذا المركز.';
    return json({ error: err?.message || 'تعذر حذف جدول التوقيت.' }, notFound ? 404 : 400);
  }
};
