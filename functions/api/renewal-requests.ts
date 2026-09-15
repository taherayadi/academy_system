/**
 * /api/renewal-requests — platform-side review queue.
 *
 * The split keeps only what the SaaS console needs:
 *   • GET   — list every center's requests (optionally filtered by centerId)
 *             together with the plan history of the queried center.
 *   • PATCH — approve / reject a request (apply the plan, log history,
 *             publish the realtime refetch signal).
 *
 * `POST` (a center depositing a request) intentionally no longer exists here:
 * centers submit from their own application (academy_system), which keeps its
 * own copy of the submission handler. A POST against this deployment falls
 * through to the platform session middleware and then to a 405 from Pages
 * Functions (no exported onRequestPost) — a controlled rejection, never a
 * silent success.
 *
 * Every route variant is additionally gated by functions/api/_middleware.ts,
 * which accepts ONLY platform_sessions (tc_platform_session / platform bearer
 * tokens) — center credentials can never reach this handler at all.
 */
import {
  Env,
  json,
  readBody,
  validateSession,
  PLATFORM_ROLE,
} from './_lib';
import { logPlanHistory } from './_planHistory';
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

/** Session gate: a valid platform session (role re-checked by validateSession). */
async function requirePlatform(env: Env, request: Request) {
  const session = await validateSession(env.DB, request);
  if (!session || session.role !== PLATFORM_ROLE) return null;
  return session;
}

// GET /api/renewal-requests — toutes les demandes (plateforme), filtre centerId optionnel
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await requirePlatform(env, request);
    if (!session) return json({ error: 'غير مصرح.' }, 401);

    if (!(await tableExists(env.DB))) return json({ requests: [], history: [] });

    const url = new URL(request.url);
    const requestedCenterId = String(url.searchParams.get('centerId') || '').trim();
    const centerId = requestedCenterId || null;

    let requests: any[] = [];
    if (centerId) {
      const { results } = await env.DB.prepare(
        `SELECT r.*, c.name as center_name
         FROM renewal_requests r LEFT JOIN centers c ON c.id = r.center_id
         WHERE r.center_id = ? ORDER BY r.created_at DESC`
      ).bind(centerId).all<any>();
      requests = (results || []).map(mapRequest);
    } else {
      const { results } = await env.DB.prepare(
        `SELECT r.*, c.name as center_name
         FROM renewal_requests r LEFT JOIN centers c ON c.id = r.center_id
         ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 300`
      ).all<any>();
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

// PATCH /api/renewal-requests — la plateforme accepte ou refuse
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  try {
    const session = await requirePlatform(env, request);
    if (!session) return json({ error: 'غير مصرح.' }, 401);

    const body = await readBody<any>(request);
    const id = String(body.id || '').trim();
    const status = String(body.status || '').trim();
    if (!id) return json({ error: 'Identifiant de demande requis.' }, 400);
    if (status !== 'approved' && status !== 'rejected') {
      return json({ error: 'Statut invalide (acceptée ou refusée).' }, 400);
    }

    const row = await env.DB.prepare('SELECT * FROM renewal_requests WHERE id = ?').bind(id).first<any>();
    if (!row) return json({ error: 'Demande introuvable.' }, 404);
    if (String(row.status) !== 'pending') {
      return json({ error: 'Cette demande a déjà été traitée.' }, 409);
    }

    const now = Date.now();
    const decisionNote = String(body.decisionNote || '').slice(0, 500);
    // Modal « Examiner et appliquer » : le plan a déjà été appliqué via le
    // moteur « Plans & factures » (régularisation / programmation / facture).
    // On enregistre seulement la décision pour éviter une double application.
    const skipApply = body.skipApply === true || String(body.skipApply || '') === 'true';

    if (status === 'approved' && !skipApply) {
      const center = await env.DB.prepare(
        `SELECT id, status, plan, billing_cycle, subscription_ends_at, trial_ends_at, enabled_modules
         FROM centers WHERE id = ?`
      ).bind(String(row.center_id)).first<any>();
      if (!center) return json({ error: 'المركز غير موجود.' }, 404);

      const duration = String(row.billing_cycle) === 'annual' ? 365 : 30;
      const currentEnd = Number(center.subscription_ends_at) || 0;
      // Renouvellement : on prolonge à partir de l'échéance (ou d'aujourd'hui
      // si elle est passée). Upgrade : nouvelle période dès maintenant.
      const base = String(row.kind) === 'upgrade'
        ? now
        : (currentEnd > now ? currentEnd : now);
      const newEnd = base + duration * DAY_MS;

      await env.DB.prepare(
        `UPDATE centers
         SET plan = ?, billing_cycle = ?, monthly_price = ?, enabled_modules = ?,
             subscription_ends_at = ?, status = 'active'
         WHERE id = ?`
      ).bind(
        String(row.requested_plan),
        String(row.billing_cycle),
        row.amount === null || row.amount === undefined ? 0 : Number(row.amount),
        String(row.requested_modules || '[]'),
        newEnd,
        String(row.center_id)
      ).run();

      await logPlanHistory(env.DB, {
        centerId: String(row.center_id),
        action: String(row.kind) === 'upgrade' ? 'renewal_upgrade' : 'renewal_approved',
        details: String(row.kind) === 'upgrade'
          ? `Passage à l’offre ${row.requested_plan} (demande du centre)`
          : `Renouvellement de l’offre ${row.requested_plan} (demande du centre)`,
        amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
      });
    }

    await env.DB.prepare(
      `UPDATE renewal_requests
       SET status = ?, decision_note = ?, decided_by = ?, decided_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(status, decisionNote, session.email, now, now, id).run();

    // Signal temps réel « décision rendue » (acceptée ET refusée, chemin
    // direct comme chemin skipApply). Le centre reçoit l'info sur son propre
    // canal via l'application centre ; la console plateforme rafraîchit la
    // sienne sur le canal `platform`.
    console.log('[renewal] About to publish PubNub notification for centerId:', String(row.center_id));
    publishOnResponse(context, env, ['center.' + String(row.center_id), 'platform'], {
      type: 'refetch',
      topic: 'renewal_request_decided',
      centerId: String(row.center_id),
      at: now,
    });
    console.log('[renewal] publishOnResponse called');

    return json({ success: true, id, status });
  } catch (err) {
    console.error('Error deciding renewal request:', err);
    return json({ error: 'Erreur lors du traitement de la demande.' }, 500);
  }
};

// Exposed for tests: the submission vocabulary accepted by the review flow.
export { STATUSES, PLANS, CYCLES, KINDS };
