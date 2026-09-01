import { Env, readState, writeState, json, readBody } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const state = await readState(env.DB);
    return json(state);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur lors de la lecture des données.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const state = await readBody(request);
    await writeState(env.DB, state);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur lors de la sauvegarde des données.' }, 500);
  }
};
