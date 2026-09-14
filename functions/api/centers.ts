import { Env, json, validateSession, mapCenterRow } from './_lib';

/** This deployment exposes only the calling center's subscription summary. */
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const session = await validateSession(env.DB, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT * FROM centers WHERE id = ?')
    .bind(session.centerId).first<any>();
  if (!row) return json({ error: 'Center not found' }, 404);
  return json({ centers: [mapCenterRow(row)] });
};
