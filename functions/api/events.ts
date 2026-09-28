import { Env, json, readBody, readEvents, writeEvents, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const events = await readEvents(context.env.DB, centerId);
    return json(events);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات الفعاليات.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const events = await readBody(context.request);
    if (!Array.isArray(events)) {
      return json({ error: 'بيانات الفعاليات غير صالحة.' }, 400);
    }
    await writeEvents(context.env.DB, events, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الفعاليات.' }, 500);
  }
};
