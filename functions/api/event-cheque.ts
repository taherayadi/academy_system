import { Env, json, readBody, updateEventParticipantCheque, getContextCenterId } from './_lib';

// PUT (et POST) : encaisse le chèque d'UN participant d'UNE activité.
// Le client n'envoie que { eventId, participantId, chequePaid, chequeNumber, chequeDate } —
// jamais toute la liste des événements. Les participants vivent dans le JSON de
// l'événement (pas de ligne `payments`), d'où cet endpoint dédié.
const handle: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات الشيك غير صالحة.' }, 400);
    }
    const { eventId, participantId, chequePaid, chequeNumber, chequeDate } = body as {
      eventId?: string; participantId?: string; chequePaid?: boolean; chequeNumber?: string; chequeDate?: string;
    };
    await updateEventParticipantCheque(
      context.env.DB,
      String(eventId || ''),
      String(participantId || ''),
      { chequePaid, chequeNumber, chequeDate },
      centerId
    );
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    const message = err instanceof Error && err.message && !err.message.includes('Error:') ? err.message : 'تعذر تحديث حالة الشيك.';
    const isBadRequest = err instanceof Error && (err.message.includes('غير موجود') || err.message.includes('مفقود') || err.message.includes('غير صالحة'));
    return json({ error: message }, isBadRequest ? 400 : 500);
  }
};

export const onRequestPut = handle;
export const onRequestPost = handle;
