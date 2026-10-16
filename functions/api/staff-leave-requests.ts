import { Env, json, readBody, createStaffLeaveRequest, updateStaffLeaveRequestStatus, getContextCenterId } from './_lib';

// POST / PUT ciblés pour UNE demande de congé d'UN agent. La demande vit dans
// la table `staff_leave_requests` : on ne réécrit jamais l'objet staff complet.

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
      return json({ error: 'بيانات طلب الإجازة غير صالحة.' }, 400);
    }
    const { staffId, leaveRequest } = body as { staffId?: string; leaveRequest?: any };
    await createStaffLeaveRequest(context.env.DB, String(staffId || ''), leaveRequest, centerId);
    return json({ ok: true });
  } catch (err) {
    return fail(err, 'تعذر حفظ طلب الإجازة.');
  }
};

const handlePut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات طلب الإجازة غير صالحة.' }, 400);
    }
    const { staffId, requestId, status } = body as { staffId?: string; requestId?: string; status?: string };
    await updateStaffLeaveRequestStatus(context.env.DB, String(staffId || ''), String(requestId || ''), String(status || ''), centerId);
    return json({ ok: true });
  } catch (err) {
    return fail(err, 'تعذر تحديث طلب الإجازة.');
  }
};

export const onRequestPost = handlePost;
export const onRequestPut = handlePut;
