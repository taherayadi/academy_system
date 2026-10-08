import { Env, json, readBody, readSuiviNotes, upsertSingleSuiviNote, deleteSingleSuiviNote, getContextCenterId } from './_lib';

/**
 * POST /api/suivi-notes — enregistre UNE note d'un élève existant, sans
 * renvoyer l'élève complet (l'ancien flux PUT /api/students réécrivait toutes
 * les tables enfants pour saisir une simple note). L'id est généré côté
 * serveur (UUID v4) : aucun conflit possible entre centres.
 * Payload :
 *   { studentId, schoolYear, trimester, subject, devoir1?, devoir2?, synthese? }
 *
 * GET /api/suivi-notes[?studentId=…] — notes du centre (ou d'un élève).
 *
 * DELETE /api/suivi-notes?id=… — supprime une note par id.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const studentId = url.searchParams.get('studentId');
    const rows = await readSuiviNotes(context.env.DB, centerId, studentId);
    return json({ notes: rows });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر تحميل النقط.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const note = await readBody(context.request);
    if (!note || typeof note !== 'object' || !note.studentId) {
      return json({ error: 'بيانات النقطة غير صالحة (studentId مطلوب).' }, 400);
    }
    await upsertSingleSuiviNote(context.env.DB, note, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('غير موجود')) return json({ error: message }, 404);
    if (message.includes('مطلوب') || message.includes('صال') || message.includes('0 و 20')) return json({ error: message }, 400);
    return json({ error: 'تعذر حفظ النقطة.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'معرّف النقطة مطلوب.' }, 400);
    await deleteSingleSuiviNote(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حذف النقطة.' }, 500);
  }
};
