import { Env, json, readBody, addEventParticipant, removeEventParticipant, getContextCenterId } from './_lib';

// POST / DELETE ciblés pour UN participant d'UNE activité. Les participants
// vivent dans la colonne JSON `participants` de la ligne `events` (pas de
// table `payments`) : on ne réécrit jamais la liste complète des événements.

const handlePost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات المشارك غير صالحة.' }, 400);
    }
    const { eventId, participant } = body as { eventId?: string; participant?: any };
    await addEventParticipant(context.env.DB, String(eventId || ''), participant, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حفظ بيانات المشارك.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير صالحة') || err.message.includes('مفقود') || err.message.includes('غير موجود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};

const handleDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const eventId = url.searchParams.get('eventId') || '';
    const participantId = url.searchParams.get('participantId') || '';
    if (!eventId || !participantId) return json({ error: 'معرّف الفعالية أو المشارك مفقود.' }, 400);
    await removeEventParticipant(context.env.DB, eventId, participantId, centerId);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر حذف المشارك.';
    const isBadRequest = err instanceof Error && (err.message.includes('مفقود') || err.message.includes('غير موجود'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};

export const onRequestPost = handlePost;
export const onRequestDelete = handleDelete;
