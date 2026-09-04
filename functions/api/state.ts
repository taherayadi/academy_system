import { Env, readState, writeState, json, readBody, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const state = await readState(context.env.DB, centerId);
    return json(state);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur lors de la lecture des données.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const state = await readBody(context.request);
    await writeState(context.env.DB, state, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur lors de la sauvegarde des données.' }, 500);
  }
};
