import { Env, json, getContextCenterId } from './_lib';

// GET /api/etablissements
// Liste des établissements du centre (nom + id), dérivée du contexte de
// session — jamais d'un paramètre client. Le combo « اسم المؤسسة » du module
// جداول التوقيت charge cette liste après le login.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const query = 'SELECT id, name FROM etablissements WHERE center_id = ? ORDER BY name COLLATE NOCASE';
    const rows = await context.env.DB.prepare(query).bind(centerId).all();
    return json(rows.results || []);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة قائمة المؤسسات.' }, 500);
  }
};
