import { Env, json, readBody, readSalles, createSalle, deleteSalle, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const salles = await readSalles(context.env.DB, centerId);
    return json(salles);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات القاعات.' }, 500);
  }
};

// POST : crée / met à jour UNE seule salle (l'objet envoyé), idempotent.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const salle = await readBody(context.request);
    if (!salle || typeof salle !== 'object' || Array.isArray(salle)) {
      return json({ error: 'بيانات القاعة غير صالحة.' }, 400);
    }
    await createSalle(context.env.DB, salle, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const message: string = err instanceof Error ? err.message : '';
    const bad = message.includes('مفقود') || message.includes('مطلوب') || message.includes('غير موجود') || message.includes('غير صالحة') || message.includes('مسبقاً') || message.includes('سالبة');
    return json({ error: err?.message || 'تعذر حفظ بيانات القاعة.' }, bad ? 400 : 500);
  }
};

// PUT : même sémantique que POST — upsert d'UNE salle (mise à jour ciblée).
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const salle = await readBody(context.request);
    if (!salle || typeof salle !== 'object' || Array.isArray(salle)) {
      return json({ error: 'بيانات القاعة غير صالحة.' }, 400);
    }
    await createSalle(context.env.DB, salle, centerId);
    return json({ ok: true });  } catch (err: any) {
    console.error('Error:', err);
    const message: string = err instanceof Error ? err.message : '';
    const bad = message.includes('مفقود') || message.includes('مطلوب') || message.includes('غير موجود') || message.includes('غير صالحة') || message.includes('مسبقاً') || message.includes('سالبة');
    return json({ error: err?.message || 'تعذر تحديث بيانات القاعة.' }, bad ? 400 : 500);
  }
};

// DELETE ?id= : supprime UNE seule salle du centre.
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    await deleteSalle(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const notFound = err?.message === 'القاعة غير موجودة في هذا المركز.';
    return json({ error: err?.message || 'تعذر حذف القاعة.' }, notFound ? 404 : 400);
  }
};
