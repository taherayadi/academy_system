import { Env, json, readBody, readStudentAttendance, writeStudentAttendance, getContextCenterId } from './_lib';

/** Daily Pointage Élèves records for jardin centers. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    return json(await readStudentAttendance(context.env.DB, centerId));
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة pointage التلاميذ.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const records = await readBody(context.request);
    if (!Array.isArray(records)) {
      return json({ error: 'بيانات pointage التلاميذ غير صالحة.' }, 400);
    }
    await writeStudentAttendance(context.env.DB, records, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ pointage التلاميذ.' }, 500);
  }
};
