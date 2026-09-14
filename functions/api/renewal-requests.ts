import { Env, json, readBody, validateSession } from './_lib';
import { publishOnResponse } from './_pubnub';

const DAY_MS = 86400000;

const PLANS = new Set(['starter', 'growth', 'pro', 'custom']);
const CYCLES = new Set(['monthly', 'annual']);
const KINDS = new Set(['renewal', 'upgrade']);
const STATUSES = new Set(['pending', 'approved', 'rejected']);


function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function mapRequest(row: any): any {
  return {
    id: String(row.id),
    centerId: String(row.center_id),
    centerName: row.center_name ? String(row.center_name) : undefined,
    kind: String(row.kind || 'renewal'),
    currentPlan: String(row.current_plan || ''),
    currentStatus: String(row.current_status || ''),
    currentModules: parseJson(row.current_modules, [] as string[]),
    requestedPlan: String(row.requested_plan || ''),
    requestedModules: parseJson(row.requested_modules, [] as string[]),
    billingCycle: String(row.billing_cycle || 'monthly'),
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    status: String(row.status || 'pending'),
    effectiveAt: row.effective_at === null || row.effective_at === undefined ? null : Number(row.effective_at),
    note: String(row.note || ''),
    decisionNote: String(row.decision_note || ''),
    decidedBy: String(row.decided_by || ''),
    decidedAt: row.decided_at === null || row.decided_at === undefined ? null : Number(row.decided_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function tableExists(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT id FROM renewal_requests LIMIT 1').first();
    return true;
  } catch {
    return false;
  }
}

// GET /api/renewal-requests — only the authenticated center’s requests
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session) return json({ error: 'Session expirée.' }, 401);

    if (!(await tableExists(env.DB))) return json({ requests: [], history: [] });

    const centerId = session.centerId;

    let requests: any[] = [];
    if (centerId) {
      const { results } = await env.DB.prepare(
        `SELECT r.*, c.name as center_name
         FROM renewal_requests r LEFT JOIN centers c ON c.id = r.center_id
         WHERE r.center_id = ? ORDER BY r.created_at DESC`
      ).bind(centerId).all<any>();
      requests = (results || []).map(mapRequest);
    }

    // Historique des plans du centre (migration 0029) — vide si absent.
    let history: any[] = [];
    if (centerId) {
      try {
        const { results } = await env.DB.prepare(
          `SELECT id, action, details, amount, invoice_number, created_at
           FROM center_plan_history WHERE center_id = ? ORDER BY created_at DESC LIMIT 50`
        ).bind(centerId).all<any>();
        history = (results || []).map((row: any) => ({
          id: String(row.id),
          action: String(row.action || ''),
          details: String(row.details || ''),
          amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
          invoiceNumber: row.invoice_number || null,
          createdAt: Number(row.created_at),
        }));
      } catch {
        history = [];
      }
    }

    return json({ requests, history });
  } catch (err) {
    console.error('Error loading renewal requests:', err);
    return json({ error: 'Erreur lors du chargement des demandes.' }, 500);
  }
};

// POST /api/renewal-requests — le centre dépose une demande
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  try {
    const session = await validateSession(env.DB, request);
    if (!session) return json({ error: 'Session expirée.' }, 401);

    const centerId = session.centerId;
    const center = await env.DB.prepare(
      `SELECT id, name, plan, billing_cycle, enabled_modules, subscription_ends_at, status
       FROM centers WHERE id = ?`
    ).bind(centerId).first<any>();
    if (!center) return json({ error: 'المركز غير موجود.' }, 404);

    const body = await readBody<any>(request);
    const requestedPlan = String(body.requestedPlan || '').trim();
    if (!PLANS.has(requestedPlan)) return json({ error: 'Offre demandée invalide.' }, 400);

    const billingCycle = String(body.billingCycle || 'monthly').trim();
    if (!CYCLES.has(billingCycle)) return json({ error: 'Cycle de facturation invalide.' }, 400);

    const kind = KINDS.has(String(body.kind)) ? String(body.kind) : 'renewal';

    const rawModules = Array.isArray(body.requestedModules) ? body.requestedModules.map(String) : [];
    const requestedModules = Array.from(new Set(rawModules)).slice(0, 50);

    const amountRaw = Number(body.amount);
    const amount = Number.isFinite(amountRaw) && amountRaw >= 0 ? amountRaw : null;

    if (!(await tableExists(env.DB))) {
      return json({ error: 'Table des demandes absente — appliquez la migration 0033.' }, 503);
    }

    const now = Date.now();
    const currentEnd = Number(center.subscription_ends_at) || 0;
    // Renouvellement → à l'échéance en cours ; upgrade → dès que possible.
    const effectiveAt = kind === 'upgrade'
      ? now
      : (currentEnd > now ? currentEnd : now);

    const modulesJson = JSON.stringify(requestedModules);
    const currentModulesJson = String(center.enabled_modules || '[]');

    // Garde-fou anti double-clic : même demande déjà en attente.
    const duplicate = await env.DB.prepare(
      `SELECT id FROM renewal_requests
       WHERE center_id = ? AND status = 'pending' AND kind = ? AND requested_plan = ?
         AND billing_cycle = ? AND requested_modules = ? AND COALESCE(amount, -1) = ?
       LIMIT 1`
    ).bind(centerId, kind, requestedPlan, billingCycle, modulesJson, amount === null ? -1 : amount).first<any>();
    if (duplicate) return json({ error: 'Une demande identique est déjà en attente.' }, 409);

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO renewal_requests
         (id, center_id, kind, current_plan, current_status, current_modules, requested_plan, requested_modules,
          billing_cycle, amount, status, effective_at, note, decision_note, decided_by, decided_at,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, '', '', NULL, ?, ?)`
    ).bind(
      id,
      centerId,
      kind,
      String(center.plan || ''),
      String(center.status || ''),
      currentModulesJson,
      requestedPlan,
      modulesJson,
      billingCycle,
      amount,
      effectiveAt,
      String(body.note || '').slice(0, 500),
      now,
      now
    ).run();

    // Signal temps réel « nouvelle demande » → tableau de bord plateforme
    // (fire-and-forget : ne peut jamais faire échouer la requête).
    publishOnResponse(context, env, ['platform'], {
      type: 'refetch',
      topic: 'renewal_request_created',
      centerId,
      at: now,
    });

    return json({ success: true, id, status: 'pending' }, 201);
  } catch (err) {
    console.error('Error creating renewal request:', err);
    return json({ error: 'Erreur lors de la création de la demande.' }, 500);
  }
};


export { STATUSES };
