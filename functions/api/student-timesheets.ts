import { Env, json, readBody, readStudentTimeSheets, writeStudentTimeSheets, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const sheets = await readStudentTimeSheets(context.env.DB, centerId);
    return json(sheets);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة جداول التوقيت.' }, 500);
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
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ جداول التوقيت.' }, 500);
  }
};
