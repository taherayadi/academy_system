import { Env, json } from './_lib';

function currentSchoolYear(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const schoolStartYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${schoolStartYear}/${schoolStartYear + 1}`;
}

interface CatalogModuleRow {
  key: string;
  label: string;
  labelAr: string;
  icon: string;
  description: string;
  features: string[];
  mock: string;
  isBasic: boolean;
  isUnbilled: boolean;
  isHidden: boolean;
}

/** Public read-only pricing + catalog used by the landing page. */
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

    // ── Catalog: modules, center types and their compatibility matrix ──
    // Single source of truth is the D1 tables; nothing is hardcoded here.
    const moduleRows = (await env.DB.prepare(
      `SELECT key, label, label_ar, icon, description, features, mock, isBasic, isUnbilled, isHidden
       FROM modules ORDER BY rowid`
    ).all<any>()).results || [];

    // Every module flagged isUnbilled = 1 is bundled with the base and never
    // charged separately — the flag list (not a hardcoded key) zeroes prices.
    const unbilledKeys = new Set(
      moduleRows.filter(row => Number(row.isUnbilled) === 1).map(row => String(row.key || ''))
    );

    const prices = (results || []).map(row => ({
      module_key: String(row.module_key || ''),
      price: unbilledKeys.has(String(row.module_key)) ? 0 : (Number(row.price) || 0)
    })).filter(row => row.module_key);
    const typeRows = (await env.DB.prepare(
      'SELECT key, label, label_ar, hint, hint_ar FROM center_types ORDER BY rowid'
    ).all<any>()).results || [];
    const compatRows = (await env.DB.prepare(
      'SELECT center_type, module_key FROM center_type_modules'
    ).all<any>()).results || [];

    // Only center types that actually serve at least one module are offered —
    // "other" (no compatibility rows) stays out of the public catalog.
    const servedTypes = new Set(compatRows.map(r => String(r.center_type)));

    const modules: CatalogModuleRow[] = moduleRows.map(row => {
      let features: string[] = [];
      try { features = JSON.parse(String(row.features || '[]')); } catch { /* [] */ }
      if (!Array.isArray(features)) features = [];
      return {
        key: String(row.key || ''),
        label: String(row.label || ''),
        labelAr: String(row.label_ar || ''),
        icon: String(row.icon || ''),
        description: String(row.description || ''),
        features: features.map(String),
        mock: String(row.mock || ''),
        isBasic: Number(row.isBasic) === 1,
        isUnbilled: Number(row.isUnbilled) === 1,
        isHidden: Number(row.isHidden) === 1,
      };
    }).filter(m => m.key);

    const centerTypes = typeRows
      .map(row => ({
        key: String(row.key || ''),
        label: String(row.label || ''),
        labelAr: String(row.label_ar || ''),
        hint: String(row.hint || ''),
        hintAr: String(row.hint_ar || ''),
      }))
      .filter(t => t.key && servedTypes.has(t.key));

    const moduleCenterTypes: Record<string, string[]> = {};
    for (const row of compatRows) {
      const moduleKey = String(row.module_key || '');
      const typeKey = String(row.center_type || '');
      if (!moduleKey || !typeKey) continue;
      (moduleCenterTypes[moduleKey] ||= []).push(typeKey);
    }

    return json({
      schoolYear,
      prices,
      modules,
      centerTypes,
      moduleCenterTypes,
    });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'Erreur chargement des tarifs publics.' }, 500);
  }
};
