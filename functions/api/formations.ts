import { Env, json, readBody, readFormations, writeFormations, createFormation, deleteFormation, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const formations = await readFormations(context.env.DB, centerId);
    return json(formations);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة بيانات التكوينات.' }, 500);
  }
};

// POST : ajoute UN SEUL تكوين (l'objet envoyé), sans réécrire la liste.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const formation = await readBody(context.request);
    if (!formation || typeof formation !== 'object' || Array.isArray(formation)) {
      return json({ error: 'بيانات التكوين غير صالحة.' }, 400);
    }
    await createFormation(context.env.DB, formation, centerId);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const bad = err?.message && /مفقود|مطلوب|غير موجود|غير صالحة/.test(err.message);
    return json({ error: err?.message || 'تعذر حفظ التكوين.' }, bad ? 400 : 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const formations = await readBody(context.request);
    // Tableau = réécriture complète du domaine ; objet = upsert d'UN تكوين.
    if (Array.isArray(formations)) {
      await writeFormations(context.env.DB, formations, centerId);
    } else if (formations && typeof formations === 'object') {
      await createFormation(context.env.DB, formations, centerId);
    } else {
      return json({ error: 'بيانات التكوينات غير صالحة.' }, 400);
    }
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حفظ بيانات التكوينات.' }, 500);
  }
};

// DELETE : `?id=` supprime UN SEUL تكوين. Jamais de réécriture complète.
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return json({ error: 'معرّف التكوين مفقود.' }, 400);
    await deleteFormation(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حذف التكوين.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير موجود') || err.message.includes('مفقود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};
