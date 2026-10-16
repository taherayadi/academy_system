import { Env, json, readBody, updateFormationSchedule, getContextCenterId } from './_lib';

// PUT (et POST) : remplace UNIQUEMENT le جدول الحصص d'UNE formation existante.
// Le client n'envoie que { formationId, schedule } — jamais toute la liste des
// formations, ni ses élèves/matières/paiements.
const handle: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات جدول الحصص غير صالحة.' }, 400);
    }
    const { formationId, schedule } = body as { formationId?: string; schedule?: unknown };
    await updateFormationSchedule(context.env.DB, String(formationId || ''), schedule, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حفظ جدول الحصص.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير موجود') || err.message.includes('غير صالحة') || err.message.includes('مفقود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};

export const onRequestPut = handle;
export const onRequestPost = handle;
