import { Env, json, readBody, readSlots, writeSlots, createSlot, deleteSlot, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const slots = await readSlots(context.env.DB, centerId);
    return json(slots);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات الفترات.' }, 500);
  }
};

// POST : ajoute UNE seule séance (l'objet envoyé), sans réécrire la liste.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const slot = await readBody(context.request);
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
      return json({ error: 'بيانات الفترة غير صالحة.' }, 400);
    }
    await createSlot(context.env.DB, slot, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const bad = err?.message && /مفقود|مطلوب|غير موجود في هذا المركز|غير صالحة/.test(err.message);
    return json({ error: err?.message || 'تعذر حفظ بيانات الفترة.' }, bad ? 400 : 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const slots = await readBody(context.request);
    // Tableau = réécriture complète du domaine ; objet = upsert d'UNE séance.
    if (Array.isArray(slots)) {
      await writeSlots(context.env.DB, slots, centerId);
    } else if (slots && typeof slots === 'object') {
      await createSlot(context.env.DB, slots, centerId);
    } else {
      return json({ error: 'بيانات الفترات غير صالحة.' }, 400);
    }
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات الفترات.' }, 500);
  }
};

// DELETE ?id= : supprime UNE seule séance (slot_enrollments CASCADE).
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    await deleteSlot(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const notFound = err?.message === 'الحصة غير موجودة في هذا المركز.';
    return json({ error: err?.message || 'تعذر حذف الفترة.' }, notFound ? 404 : 400);
  }
};
