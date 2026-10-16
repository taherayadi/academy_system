import { Env, json, readBody, createStaffAdvance, updateStaffAdvanceStatus, getContextCenterId } from './_lib';

// POST / PUT ciblés pour UNE demande d'avance d'UN agent. La demande vit dans
// la table `staff_advances` : on ne réécrit jamais l'objet staff complet.

const isBadRequest = (err: unknown): boolean =>
  err instanceof Error && (err.message.includes('غير صالحة') || err.message.includes('مفقود') || err.message.includes('غير موجود'));

const fail = (err: unknown, fallback: string) => {
  console.error('Error:', err);
  const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : fallback;
  return json({ error: message }, isBadRequest(err) ? 400 : 500);
};

const handlePost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات طلب السلفة غير صالحة.' }, 400);
    }
    const { staffId, advance } = body as { staffId?: string; advance?: any };
    await createStaffAdvance(context.env.DB, String(staffId || ''), advance, centerId);
    return json({ ok: true });
  } catch (err) {
    return fail(err, 'تعذر حفظ طلب السلفة.');
  }
};

const handlePut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات طلب السلفة غير صالحة.' }, 400);
    }
    const { staffId, advanceId, status } = body as { staffId?: string; advanceId?: string; status?: string };
    await updateStaffAdvanceStatus(context.env.DB, String(staffId || ''), String(advanceId || ''), String(status || ''), centerId);
    return json({ ok: true });
  } catch (err) {
    return fail(err, 'تعذر تحديث طلب السلفة.');
  }
};

export const onRequestPost = handlePost;
export const onRequestPut = handlePut;
