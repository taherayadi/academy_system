/**
 * /api/modules — the DB-driven catalog for the console UI.
 *
 * GET  → { modules: [{key, label, labelAr, isBasic, isUnbilled, isHidden, allowedCenterTypes}],
 *          centerTypes: [{key, label, labelAr, hint}] }
 * POST → { action: 'update-module-eligibility', key, allowedCenterTypes }
 *        rewrites the center_type_modules rows of one module and answers with
 *        the SAME payload, freshly read, so the UI repaints in one round trip.
 *
 * The UI renders module pickers, eligibility locks, center-type selects and
 * the per-center-type eligibility editor from this payload instead of
 * hardcoded lists. Requires a platform session (writes require the
 * platform_super_admin role).
 */
import { Env, json, validateSession } from './_lib';
import {
  loadModuleCatalog,
  loadCenterTypeCatalog,
  writeModuleEligibility,
  type ModuleCatalog,
  type CenterTypeCatalog,
  type CenterType,
} from './_modules';
import { logError } from './_logger';

/** The HTTP shape of the catalog — shared by the read and the write answer. */
function catalogPayload(catalog: ModuleCatalog, typeCatalog: CenterTypeCatalog) {
  return {
    modules: catalog.keys.map(key => ({
      key,
      label: catalog.labels.get(key) || key,
      labelAr: catalog.labelsAr.get(key) || catalog.labels.get(key) || key,
      isBasic: catalog.basicKeys.has(key),
      isUnbilled: catalog.unbilledKeys.has(key),
      isHidden: catalog.hiddenKeys.has(key),
      // Empty array ⇒ universal (allowed with every center type).
      allowedCenterTypes: [...(catalog.allowedTypes.get(key) || [])],
    })),
    centerTypes: typeCatalog.keys.map(key => ({
      key,
      label: typeCatalog.labels.get(key) || key,
      labelAr: typeCatalog.labelsAr.get(key) || typeCatalog.labels.get(key) || key,
      hint: typeCatalog.hints.get(key) || '',
    })),
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session) {
      return json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);
    }

    const [catalog, typeCatalog] = await Promise.all([
      loadModuleCatalog(env.DB),
      loadCenterTypeCatalog(env.DB),
    ]);

    return json(catalogPayload(catalog, typeCatalog));
  } catch (err) {
    logError('fetch module catalog', err);
    return json({ error: 'خطأ في جلب كتالوج الوحدات.' }, 500);
  }
};

// POST /api/modules — edit which center types a module is offered to.
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || session.role !== 'platform_super_admin') {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string; key?: string; allowedCenterTypes?: unknown;
    };
    const action = String(body.action || '').trim();

    if (action === 'update-module-eligibility') {
      const key = String(body.key || '').trim();
      if (!key) return json({ error: 'module key requis.' }, 400);
      if (!Array.isArray(body.allowedCenterTypes)) {
        return json({ error: 'allowedCenterTypes requis — [] تعني «مسموح في كل الأنواع».' }, 400);
      }

      const [typeCatalog, moduleCatalog] = await Promise.all([
        loadCenterTypeCatalog(env.DB),
        loadModuleCatalog(env.DB),
      ]);
      if (!moduleCatalog.keys.includes(key)) return json({ error: 'وحدة غير موجودة.' }, 404);

      // Every key must exist in center_types (FK) — and never the 'other'
      // sentinel, which loadCenterTypeCatalog already drops from its keys.
      const valid = new Set<string>(typeCatalog.keys);
      const unknown = Array.from(new Set(body.allowedCenterTypes.map(String))).filter(t => !valid.has(t));
      if (unknown.length > 0) {
        return json({ error: `أنواع مراكز غير معروفة: ${unknown.join('، ')}` }, 400);
      }
      const allowed = body.allowedCenterTypes.map(String).filter(t => valid.has(t)) as CenterType[];

      await writeModuleEligibility(env.DB, key, allowed);

      // Fresh answer: loadModuleCatalog reads the DB on every call (no TTL),
      // so this payload already contains the rows written above.
      const fresh = await loadModuleCatalog(env.DB);
      return json({ success: true, catalog: catalogPayload(fresh, typeCatalog) });
    }

    return json({ error: 'Action inconnue.' }, 400);
  } catch (err) {
    logError('update module eligibility', err);
    return json({ error: 'خطأ في تحديث أحقية الوحدات.' }, 500);
  }
};
