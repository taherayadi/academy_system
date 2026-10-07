import { Env, json } from './_lib';

/**
 * GET /api/catalog — catalogue public (aucune session requise), consommé par
 * la landing page et le simulateur de renouvellement à l'EXÉCUTION :
 *   • modules           → table `modules` (clé, labels fr/ar, icône,
 *                         description, features, isBasic/isUnbilled/isHidden)
 *   • centerTypes       → table `center_types` (labels fr/ar, hints)
 *   • centerTypeModules → table `center_type_modules` (compatibilité type ×
 *                         module, source du gating côté client)
 * Aucune donnée tarifée ici : les prix vivent dans `module_prices` et sont
 * servis par /api/public-pricing.
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const [modules, centerTypes, centerTypeModules] = await Promise.all([
      env.DB.prepare(
        `SELECT key, label, label_ar AS labelAr, isBasic, isUnbilled, isHidden,
                icon, description, features
         FROM modules ORDER BY rowid`
      ).all<any>(),
      env.DB.prepare(
        `SELECT key, label, label_ar AS labelAr, hint, hint_ar AS hintAr
         FROM center_types ORDER BY rowid`
      ).all<any>(),
      env.DB.prepare(
        `SELECT center_type AS centerType, module_key AS moduleKey
         FROM center_type_modules ORDER BY module_key, center_type`
      ).all<any>()
    ]);

    const normBool = (v: unknown): boolean => v === 1 || v === true;

    return json({
      modules: (modules.results || []).map(m => ({
        key: String(m.key || ''),
        label: String(m.label || ''),
        labelAr: String(m.labelAr || ''),
        isBasic: normBool(m.isBasic),
        isUnbilled: normBool(m.isUnbilled),
        isHidden: normBool(m.isHidden),
        icon: String(m.icon || ''),
        description: String(m.description || ''),
        features: (() => {
          try {
            const parsed = JSON.parse(String(m.features || '[]'));
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return [];
          }
        })()
      })),
      centerTypes: (centerTypes.results || []).map(t => ({
        key: String(t.key || ''),
        label: String(t.label || ''),
        labelAr: String(t.labelAr || ''),
        hint: String(t.hint || ''),
        hintAr: String(t.hintAr || '')
      })),
      centerTypeModules: (centerTypeModules.results || []).map(p => ({
        centerType: String(p.centerType || ''),
        moduleKey: String(p.moduleKey || '')
      }))
    });
  } catch (err) {
    console.error('[catalog] load failed:', err);
    return json({ error: 'Erreur chargement du catalogue.' }, 500);
  }
};
