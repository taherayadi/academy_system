import { Env, json, readBody, readSessions, writeSessions } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const sessions = await readSessions(env.DB);
    return json(sessions);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الجلسات.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const sessions = await readBody(request);
    if (!Array.isArray(sessions)) {
      return json({ error: 'بيانات الجلسات غير صالحة.' }, 400);
    }
    await writeSessions(env.DB, sessions);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات الجلسات.' }, 500);
  }
};
