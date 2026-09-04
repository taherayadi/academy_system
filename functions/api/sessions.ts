import { Env, json, readBody, readSessions, writeSessions, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const sessions = await readSessions(context.env.DB, centerId);
    return json(sessions);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الحصص.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const sessions = await readBody(context.request);
    if (!Array.isArray(sessions)) {
      return json({ error: 'بيانات الحصص غير صالحة.' }, 400);
    }
    await writeSessions(context.env.DB, sessions, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات الحصص.' }, 500);
  }
};
