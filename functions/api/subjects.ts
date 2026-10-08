import { Env, json, readBody, readSubjects, createSingleSubject, getContextCenterId } from './_lib';

/**
 * GET  /api/subjects — matières du centre (id UUID + nom). La table est
 * auto-seedée avec le catalogue de départ si le centre n'en a aucune.
 * POST /api/subjects { name } — ajoute UNE matière (idempotent par nom),
 * générée côté serveur (UUID) — jamais via le modèle settings/élève.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const subjects = await readSubjects(context.env.DB, centerId);
    return json({ subjects });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر تحميل المواد.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    const name = body && typeof body === 'object' ? body.name : null;
    if (!name || typeof name !== 'string') return json({ error: 'اسم المادة مطلوب.' }, 400);
    const id = await createSingleSubject(context.env.DB, name, centerId);
    return json({ ok: true, id, name: String(name).trim() });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('مطلوب') || message.includes('طويل')) return json({ error: message }, 400);
    return json({ error: 'تعذر إضافة المادة.' }, 500);
  }
};
