import { Env, json } from './_lib';

const BUNDLED_MODULE_KEY = 'studentTimeSheets';

function currentSchoolYear(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const schoolStartYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${schoolStartYear}/${schoolStartYear + 1}`;
}

/** Public read-only pricing used by the landing page. */
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const url = new URL(request.url);
    const requestedYear = url.searchParams.get('year')?.trim();
    let schoolYear = requestedYear || currentSchoolYear();

    let { results } = await env.DB.prepare(
      'SELECT module_key, price FROM module_prices WHERE school_year = ? ORDER BY module_key'
    ).bind(schoolYear).all<any>();

    // If a current-year price list has not been created yet, use the latest
    // configured list so the public page never falls back to hard-coded prices.
    if ((!results || results.length === 0) && !requestedYear) {
      const latest = await env.DB.prepare(
        'SELECT school_year FROM module_prices ORDER BY school_year DESC LIMIT 1'
      ).first<any>();
      if (latest?.school_year) {
        schoolYear = String(latest.school_year);
        ({ results } = await env.DB.prepare(
          'SELECT module_key, price FROM module_prices WHERE school_year = ? ORDER BY module_key'
        ).bind(schoolYear).all<any>());
      }
    }

    const prices = (results || []).map(row => ({
      module_key: String(row.module_key || ''),
      // Jd. Horaires is bundled and is never charged separately.
      price: row.module_key === BUNDLED_MODULE_KEY ? 0 : (Number(row.price) || 0)
    })).filter(row => row.module_key);

    return json({ schoolYear, prices });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur chargement des tarifs publics.' }, 500);
  }
};
