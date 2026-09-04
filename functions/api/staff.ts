import { Env, json, readBody, readStaff, writeStaff, createSingleStaff, updateSingleStaff, deleteSingleStaff, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const staff = await readStaff(context.env.DB, centerId);
    return json(staff);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات الإطار التربوي.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const staffMember = await readBody(context.request);
    if (!staffMember || typeof staffMember !== 'object' || !staffMember.id) {
      return json({ error: 'بيانات عضو الإطار غير صالحة.' }, 400);
    }
    await createSingleStaff(context.env.DB, staffMember, centerId);
    return json({ ok: true, staff: staffMember });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر إضافة عضو الإطار.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (Array.isArray(body)) {
      await writeStaff(context.env.DB, body, centerId);
      return json({ ok: true });
    }
    if (body && typeof body === 'object' && body.id) {
      await updateSingleStaff(context.env.DB, body, centerId);
      return json({ ok: true, staff: body });
    }
    return json({ error: 'بيانات عضو الإطار غير صالحة.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر تعديل بيانات عضو الإطار.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    let id = url.searchParams.get('id');
    if (!id) {
      const body = await readBody(context.request).catch(() => ({}));
      id = body?.id;
    }
    if (!id) {
      return json({ error: 'معرّف عضو الإطار مطلوب.' }, 400);
    }
    await deleteSingleStaff(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حذف عضو الإطار.' }, 500);
  }
};
