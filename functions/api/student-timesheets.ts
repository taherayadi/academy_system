import { Env, json, readBody, readStudentTimeSheets, writeStudentTimeSheets } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const sheets = await readStudentTimeSheets(env.DB);
    return json(sheets);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة جداول التوقيت.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const sheets = await readBody(request);
    if (!Array.isArray(sheets)) {
      return json({ error: 'بيانات جداول التوقيت غير صالحة.' }, 400);
    }
    await writeStudentTimeSheets(env.DB, sheets);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ جداول التوقيت.' }, 500);
  }
};
