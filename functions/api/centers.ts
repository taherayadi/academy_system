import { Env, json, readBody, validateSession, sha256Hex, DEFAULT_CENTER_ID, getCenterAccessState } from './_lib';
import {
  DAY_MS, PRICE_EPSILON, evaluatePlanChange, planLabel,
  round2, upgradeSettlement, BillingCycle, PlanChangeEvaluation
} from './planLogic';
import { logPlanHistory } from './_planHistory';
import { publishOnResponse } from './_pubnub';

const DEFAULT_ACADEMIC_YEARS = [
  '2022/2023', '2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'
];
const BUNDLED_MODULE_KEY = 'studentTimeSheets';
const REQUIRED_MODULE_KEYS = ['scolaire', 'finance', BUNDLED_MODULE_KEY];
// Bibliothèque désactivée pour l'instant : hors preset Pro (11 modules comme
// le simulateur) et jamais facturée, même si un centre l'a encore en stock.
// Pour réactiver : remettre 'bibliotheque' ici et retirer le filtre prix.
const ALL_MODULE_KEYS = [
  'scolaire', 'finance', 'etude', 'coursParticuliers', 'revision',
  'formations', 'cantine', 'transport', 'events',
  BUNDLED_MODULE_KEY, 'staff'
];
const UNBILLED_MODULE_KEYS = new Set([BUNDLED_MODULE_KEY, 'bibliotheque']);
const ANNUAL_DISCOUNT = 0.2;
const AUTO_PRICED_PLANS = new Set(['starter', 'growth', 'pro']);

function normalizeEnabledModules(value: unknown, plan?: string): string[] {
  const requested = Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : [];
  const modules = plan === 'pro' ? ALL_MODULE_KEYS : plan === 'starter' ? [] : requested;
  return Array.from(new Set([...REQUIRED_MODULE_KEYS, ...modules]));
}

function normalizeDayCount(value: unknown, fallback: number): number {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(3650, Math.max(0, Math.floor(parsed)));
}

function currentSchoolYear(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const schoolStartYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${schoolStartYear}/${schoolStartYear + 1}`;
}

// ---------------------------------------------------------------------------
// Scheduled plan changes (center_plan_schedules)
// ---------------------------------------------------------------------------

interface PlanScheduleRow {
  id: string;
  center_id: string;
  to_plan: string;
  to_billing_cycle: string;
  to_enabled_modules: string;
  to_monthly_price: number | null;
  status: string;
  apply_at: number | null;
  notes: string | null;
  created_at: number;
}

function parseModulesJson(value: unknown): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function getPendingSchedule(db: D1Database, centerId: string): Promise<PlanScheduleRow | null> {
  return db.prepare(
    `SELECT * FROM center_plan_schedules WHERE center_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`
  ).bind(centerId).first<PlanScheduleRow>() || null;
}

/** Keep at most one pending schedule per center: supersede any older one. */
function supersedePendingSchedules(db: D1Database, centerId: string): D1PreparedStatement {
  return db.prepare(`UPDATE center_plan_schedules SET status = 'cancelled', notes = COALESCE(notes, '') || ' — superseded' WHERE center_id = ? AND status = 'pending'`).bind(centerId);
}

function insertPlanSchedule(
  db: D1Database,
  centerId: string,
  target: { plan: string; billingCycle: BillingCycle; enabledModules: string[]; monthlyPrice: number | null },
  applyAt: number | null,
  notes: string
): D1PreparedStatement {
  const id = crypto.randomUUID();
  return db.prepare(`
    INSERT INTO center_plan_schedules (id, center_id, to_plan, to_billing_cycle, to_enabled_modules, to_monthly_price, status, apply_at, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).bind(id, centerId, target.plan, target.billingCycle, JSON.stringify(target.enabledModules), target.monthlyPrice, applyAt, notes, Date.now());
}

function markScheduleApplied(db: D1Database, scheduleId: string): D1PreparedStatement {
  return db.prepare(`UPDATE center_plan_schedules SET status = 'applied', applied_at = ? WHERE id = ? AND status = 'pending'`).bind(Date.now(), scheduleId);
}

// ---------------------------------------------------------------------------
// Prorated settlement invoices (mid-period plan price increase)
// ---------------------------------------------------------------------------

function invoiceNumberFor(createdAt: number): string {
  return `INV-${new Date(createdAt).getFullYear()}-${String(crypto.randomUUID()).slice(0, 8).toUpperCase()}`;
}

/** Insert a pending settlement invoice, cancelling old pending invoices when the window was not paid yet. */
async function createSettlementInvoice(
  db: D1Database,
  args: {
    centerId: string;
    amount: number;
    periodStart: number;
    periodEnd: number;
    paid: boolean;
    oldPlan: string;
    newPlan: string;
    remainingDays: number;
  }
): Promise<{ id: string; invoiceNumber: string; amount: number; cancelledOld: boolean }> {
  const { centerId, amount, periodStart, periodEnd, paid, oldPlan, newPlan, remainingDays } = args;
  let cancelledOld = false;

  if (!paid) {
    // The current window was not invoiced/paid yet: cancel the pending old
    // invoices that cover it, then bill the remaining window at the new price.
    const res = await db.prepare(
      `UPDATE center_invoices SET status = 'cancelled' WHERE center_id = ? AND status = 'pending' AND period_start <= ? AND period_end >= ?`
    ).bind(centerId, periodEnd, periodStart).run();
    cancelledOld = (res.meta.changes || 0) > 0;
  }

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const invoiceNumber = invoiceNumberFor(createdAt);
  const label = `${planLabel(oldPlan)} → ${planLabel(newPlan)}`;
  const d = (ts: number) => new Date(ts).toLocaleDateString('fr-TN', { day: '2-digit', month: 'short', year: 'numeric' });
  const notes = paid
    ? `Solde proratisé changement de plan ${label} (${d(periodStart)} → ${d(periodEnd)}), ${remainingDays} j restants. Période déjà réglée: complément ${round2(amount)} TND.`
    : `Changement de plan ${label} le ${d(Date.now())}. Période restante ${d(periodStart)} → ${d(periodEnd)} facturée au nouveau tarif: ${round2(amount)} TND. Anciennes factures en attente annulées.`;

  await db.prepare(`
    INSERT INTO center_invoices (id, center_id, invoice_number, period_start, period_end, amount, status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(id, centerId, invoiceNumber, periodStart, periodEnd, round2(amount), notes, createdAt).run();

  return { id, invoiceNumber, amount: round2(amount), cancelledOld };
}

/** Whether the platform already invoiced (and collected) the current window. */
async function hasPaidInvoiceForWindow(db: D1Database, centerId: string, windowEnd: number): Promise<boolean> {
  const tolerance = 3 * DAY_MS;
  const row = await db.prepare(
    `SELECT id FROM center_invoices WHERE center_id = ? AND status = 'paid' AND period_end >= ? AND period_end <= ? LIMIT 1`
  ).bind(centerId, windowEnd - tolerance, windowEnd + tolerance).first();
  return !!row;
}

// ---------------------------------------------------------------------------
// Automatic subscription invoices (creation / activation / renewal)
// ---------------------------------------------------------------------------

/**
 * Create (or refresh) the PENDING invoice that covers a subscription window.
 *
 * Rules:
 *  - amount <= 0            → nothing to bill, returns null.
 *  - a PAID invoice already covers the window → do nothing (never double-bill).
 *  - otherwise any PENDING invoice covering the window is cancelled and a
 *    fresh pending invoice is created at the current plan price — the same
 *    "annuler l'ancienne + créer la nouvelle, marquée non payée" rule used
 *    for mid-period changes.
 */
export async function ensurePeriodInvoice(
  db: D1Database,
  args: { centerId: string; periodStart: number; periodEnd: number; amount: number; notes: string }
): Promise<{ id: string; invoiceNumber: string; amount: number } | null> {
  const { centerId, periodStart, periodEnd, amount } = args;
  if (!amount || amount <= 0 || !periodEnd || periodEnd <= periodStart) return null;

  const paid = await db.prepare(
    `SELECT id FROM center_invoices WHERE center_id = ? AND status = 'paid' AND period_start < ? AND period_end > ? LIMIT 1`
  ).bind(centerId, periodEnd, periodStart).first();
  if (paid) return null;

  await db.prepare(
    `UPDATE center_invoices SET status = 'cancelled' WHERE center_id = ? AND status = 'pending' AND period_start < ? AND period_end > ?`
  ).bind(centerId, periodEnd, periodStart).run();

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const invoiceNumber = invoiceNumberFor(createdAt);
  await db.prepare(`
    INSERT INTO center_invoices (id, center_id, invoice_number, period_start, period_end, amount, status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(id, centerId, invoiceNumber, periodStart, periodEnd, round2(amount), args.notes, createdAt).run();

  return { id, invoiceNumber, amount: round2(amount) };
}

const fmtFr = (ts: number) => new Date(ts).toLocaleDateString('fr-TN', { day: '2-digit', month: 'short', year: 'numeric' });


// ---------------------------------------------------------------------------
// Module price lookup shared by POST / PATCH
// ---------------------------------------------------------------------------

async function computePeriodAmount(
  db: D1Database,
  args: { plan: string; modules: string[]; billingCycle: BillingCycle; customPrice?: number | null }
): Promise<number> {
  if (args.plan === 'custom') return Math.max(0, Number(args.customPrice) || 0);
  if (!AUTO_PRICED_PLANS.has(args.plan)) return 0;
  const placeholders = args.modules.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT module_key, price FROM module_prices WHERE school_year = ? AND module_key IN (${placeholders})`
  ).bind(currentSchoolYear(), ...args.modules).all<any>();
  let total = (results || []).reduce(
    (sum, row) => sum + (UNBILLED_MODULE_KEYS.has(row.module_key) ? 0 : (Number(row.price) || 0)),
    0
  );
  if (args.billingCycle === 'annual') total *= 12 * (1 - ANNUAL_DISCOUNT);
  return total;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session) {
      return json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);
    }

    const isPlatformAdmin = session.role === 'super_admin' || session.role === 'platform_super_admin';

    if (isPlatformAdmin) {
      const { results } = await env.DB.prepare(`
        SELECT
          c.id, c.name, c.slug, c.phone_number, c.location_city, c.plan,
          c.enabled_modules, c.meal_operating_mode, c.status,
          c.trial_ends_at, c.subscription_ends_at, c.billing_cycle, c.monthly_price,
          c.center_type, c.logo_url, c.created_at,
          (SELECT COUNT(*) FROM students s WHERE s.center_id = c.id) as student_count,
          (SELECT email FROM users u WHERE u.center_id = c.id AND u.role IN ('admin', 'super_admin') LIMIT 1) as admin_email
        FROM centers c
        ORDER BY c.created_at DESC
      `).all<any>();

      // Older centers may predate the billing columns being populated. Compute
      // their current subscription total from the enabled modules so the edit
      // form does not show a misleading zero for an active paid center.
      const { results: priceRows } = await env.DB.prepare(
        'SELECT module_key, price FROM module_prices WHERE school_year = ?'
      ).bind(currentSchoolYear()).all<any>();
      const modulePrices = new Map<string, number>((priceRows || []).map(row => [row.module_key, Number(row.price) || 0]));

      // Keep lifecycle status in sync for centers whose trial or paid period
      // elapsed without a login attempt. This also makes the admin card badge
      // and the login gate agree on the same state.
      const expiredUpdates = (results || [])
        .filter(c => {
          const state = getCenterAccessState(c);
          return (state === 'trial_expired' || state === 'subscription_expired') && c.status !== 'expired';
        })
        .map(c => env.DB.prepare('UPDATE centers SET status = ? WHERE id = ?').bind('expired', c.id));
      if (expiredUpdates.length > 0) await env.DB.batch(expiredUpdates);

      const formatted = (results || []).map(c => {
        let modules: string[] = [];
        try {
          modules = typeof c.enabled_modules === 'string' ? JSON.parse(c.enabled_modules) : (c.enabled_modules || []);
        } catch {
          modules = [];
        }
        const storedMonthlyPrice = c.monthly_price === null || c.monthly_price === undefined
          ? 0
          : Number(c.monthly_price) || 0;
        const calculatedMonthlyPrice = modules.reduce(
          (total, moduleKey) => total + (UNBILLED_MODULE_KEYS.has(moduleKey) ? 0 : (modulePrices.get(moduleKey) || 0)),
          0
        );
        const storedStatus = c.status || 'active';
        const accessState = getCenterAccessState(c);
        const status = accessState === 'trial_expired' || accessState === 'subscription_expired'
          ? 'expired'
          : storedStatus;
        const billingCycle = c.billing_cycle || 'monthly';
        const monthlyPrice = storedMonthlyPrice > 0 || storedStatus === 'trial' || !AUTO_PRICED_PLANS.has(c.plan || 'starter')
          ? storedMonthlyPrice
          : calculatedMonthlyPrice * (billingCycle === 'annual' ? 12 * (1 - ANNUAL_DISCOUNT) : 1);

        return {
          id: c.id,
          name: c.name,
          slug: c.slug || '',
          phoneNumber: c.phone_number || '',
          locationCity: c.location_city || '',
          plan: c.plan || 'starter',
          enabledModules: modules,
          mealOperatingMode: c.meal_operating_mode || 'external_traiteur',
          status,
          trialEndsAt: c.trial_ends_at || null,
          subscriptionEndsAt: c.subscription_ends_at || null,
          billingCycle,
          monthlyPrice,
          centerType: c.center_type || '',
          logoUrl: c.logo_url || '',
          createdAt: c.created_at || Date.now(),
          studentCount: Number(c.student_count) || 0,
          adminEmail: c.admin_email || ''
        };
      });

      // Attach the pending scheduled plan change (if any) to each center so the
      // platform admin can see / cancel / force-apply it.
      const schedulesById = new Map<string, PlanScheduleRow>();
      const { results: scheduleRows } = await env.DB.prepare(
        `SELECT * FROM center_plan_schedules WHERE status = 'pending' ORDER BY created_at DESC`
      ).all<PlanScheduleRow>();
      (scheduleRows || []).forEach(row => {
        if (!schedulesById.has(row.center_id)) schedulesById.set(row.center_id, row);
      });

      const withSchedules = formatted.map(c => {
        const pending = schedulesById.get(c.id);
        return {
          ...c,
          scheduledPlan: pending ? {
            id: pending.id,
            plan: pending.to_plan,
            billingCycle: pending.to_billing_cycle,
            enabledModules: parseModulesJson(pending.to_enabled_modules),
            monthlyPrice: pending.to_monthly_price === null || pending.to_monthly_price === undefined
              ? null : Number(pending.to_monthly_price),
            applyAt: pending.apply_at || null,
            createdAt: pending.created_at
          } : null
        };
      });

      return json({ centers: withSchedules });
    } else {
      const centerId = session.centerId || DEFAULT_CENTER_ID;
      const center = await env.DB.prepare('SELECT * FROM centers WHERE id = ?').bind(centerId).first<any>();
      if (!center) return json({ error: 'المركز غير موجود.' }, 404);

      let modules: string[] = [];
      try {
        modules = typeof center.enabled_modules === 'string' ? JSON.parse(center.enabled_modules) : (center.enabled_modules || []);
      } catch {
        modules = [];
      }

      return json({
        centers: [{
          id: center.id,
          name: center.name,
          slug: center.slug || '',
          phoneNumber: center.phone_number || '',
          locationCity: center.location_city || '',
          plan: center.plan || 'starter',
          enabledModules: modules,
          mealOperatingMode: center.meal_operating_mode || 'external_traiteur',
          status: center.status || 'active',
          trialEndsAt: center.trial_ends_at || null,
          subscriptionEndsAt: center.subscription_ends_at || null,
          billingCycle: center.billing_cycle || 'monthly',
          monthlyPrice: center.monthly_price !== null ? Number(center.monthly_price) : 0,
          centerType: center.center_type || '',
          logoUrl: center.logo_url || '',
          createdAt: center.created_at || Date.now()
        }]
      });
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في جلب بيانات المراكز.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح لك بإنشاء مراكز جديدة.' }, 403);
    }

    const body = await readBody(request);
    const name = String(body.name || '').trim();
    const slug = String(body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || '').trim();
    const phoneNumber = String(body.phoneNumber || body.phone || '').trim();
    if (!/^[0-9]{8}$/.test(phoneNumber)) {
      return json({ error: 'رقم الهاتف مطلوب ويجب أن يتكون من 8 أرقام.' }, 400);
    }
    const locationCity = String(body.locationCity || body.city || 'تونس').trim();
    // "trial" is not a valid `plan` value (CHECK constraint only allows starter/growth/pro/custom),
    // so a trial center is stored as plan='starter' with status='trial'.
    // Basic is stored as 'starter' because the DB CHECK constraint does not include 'basic'.
    // Growth, Pro, and Custom retain their storage values.
    const rawPlan = String(body.plan || 'trial').trim();
    const requestedStatus = String(body.status || '').trim();
    const isTrial = rawPlan === 'trial' || requestedStatus === 'trial';
    const normalizedPlan = rawPlan === 'basic' ? 'starter' : rawPlan; // basic → starter (storage)
    const plan = isTrial ? 'starter' : (normalizedPlan === '' ? 'starter' : normalizedPlan);
    const isCustomPlan = plan === 'custom';
    const autoPrice = !isTrial && AUTO_PRICED_PLANS.has(plan);
    const status = requestedStatus || (isTrial ? 'trial' : 'active');
    const mealOperatingMode = String(body.mealOperatingMode || 'external_traiteur').trim();
    const trialDays = Math.max(1, normalizeDayCount(body.trialDays, 14));
    const offerDays = normalizeDayCount(body.offerDays, 0);
    const adminName = String(body.adminName || `مدير ${name}`).trim();
    const adminEmail = String(body.adminEmail || '').trim().toLowerCase();
    const adminPassword = String(body.adminPassword || '').trim();
    const demoRequestId = body.demoRequestId
      ? String(body.demoRequestId).trim()
      : (body.convertFromRequestId ? String(body.convertFromRequestId).trim() : null);

    if (!name) return json({ error: 'اسم المركز مطلوب.' }, 400);
    if (!adminEmail || !adminPassword) {
      return json({ error: 'البريد الإلكتروني وكلمة السر لحساب مدير المركز مطلوبان.' }, 400);
    }

    const existingUser = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(adminEmail).first();
    if (existingUser) {
      return json({ error: 'البريد الإلكتروني مسجل مسبقاً لمستخدم آخر.', code: 'duplicate_email' }, 409);
    }

    // Friendly duplicates — never leak the raw DB constraint error to the UI.
    if (slug) {
      const slugTaken = await env.DB.prepare('SELECT id FROM centers WHERE slug = ?').bind(slug).first();
      if (slugTaken) {
        return json({ error: 'Ce nom de centre existe déjà (identifiant/slug identique).', code: 'duplicate_slug' }, 409);
      }
    }
    const nameTaken = await env.DB.prepare('SELECT id FROM centers WHERE lower(name) = lower(?)').bind(name.trim()).first();
    if (nameTaken) {
      return json({ error: 'Un centre porte déjà ce nom exact.', code: 'duplicate_name' }, 409);
    }

    // A demo request converts exactly once: refuse any second conversion
    // (stale tab, double click or replayed call).
    if (demoRequestId) {
      const demoReq = await env.DB.prepare('SELECT status FROM demo_requests WHERE id = ?').bind(demoRequestId).first<any>();
      if (demoReq && demoReq.status === 'converted') {
        return json({ error: 'تم تحويل هذا الطلب إلى مركز مسبقاً — لا يمكن تحويله مرة أخرى.' }, 409);
      }
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();
    // A paid offer is represented as a trial boundary without changing the
    // selected plan or status: access stays active, while the subscription
    // starts after the free offer and ends after the full paid period.
    const trialEndsAt = isTrial
      ? (createdAt + trialDays * 86400000)
      : (offerDays > 0 ? createdAt + offerDays * 86400000 : null);

    const billingCycle = isTrial ? 'monthly' : (String(body.billingCycle || 'monthly').trim() === 'annual' ? 'annual' : 'monthly');

    // Pro starts with the complete catalogue selected; the backend enforces
    // this preset even when a caller does not send the module list.
    const enabledModules = normalizeEnabledModules(body.enabledModules, plan);
    const modulesJson = JSON.stringify(enabledModules);

    // Compute the automatic tariff from module_prices for the current school year
    const billingMonth = new Date(createdAt).getMonth(); // 0-indexed
    const billingYear = new Date(createdAt).getFullYear();
    // School year: months Sep (8) – Jul (6) → start year; Aug (7) + first days Sep → same academic year as start
    const schoolStartYear = billingMonth >= 8 ? billingYear : billingYear - 1;
    const currentSchoolYear = `${schoolStartYear}/${schoolStartYear + 1}`;

    let monthlyPrice = isCustomPlan ? (Number(body.monthlyPrice) || 0) : 0;
    if (autoPrice) {
      const placeholders = enabledModules.map(() => '?').join(',');
      const { results: priceRows } = await env.DB.prepare(
        `SELECT module_key, price FROM module_prices WHERE school_year = ? AND module_key IN (${placeholders})`
      ).bind(currentSchoolYear, ...enabledModules).all<any>();
      monthlyPrice = priceRows.reduce(
        (sum, r) => sum + (UNBILLED_MODULE_KEYS.has(r.module_key) ? 0 : (Number(r.price) || 0)),
        0
      );
      if (billingCycle === 'annual') {
        monthlyPrice = monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT);
      }
    }

    // subscription_ends_at: 30 days for monthly or 365 days for annual,
    // starting after any promotional days granted during creation.
    let subscriptionEndsAt = null;
    if (!isTrial) {
      const periodMs = billingCycle === 'annual' ? 365 * 86400000 : 30 * 86400000;
      subscriptionEndsAt = createdAt + offerDays * 86400000 + periodMs;
    }

    const passwordHash = await sha256Hex(adminPassword);

    const stmts: D1PreparedStatement[] = [];

    // 1. Center
    stmts.push(env.DB.prepare(`
      INSERT INTO centers (
        id, name, slug, phone_number, location_city, plan, enabled_modules,
        meal_operating_mode, status, trial_ends_at, subscription_ends_at, billing_cycle, monthly_price, center_type, logo_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, name, slug, phoneNumber, locationCity, plan, modulesJson,
      mealOperatingMode, status, trialEndsAt, subscriptionEndsAt, billingCycle, monthlyPrice,
      String(body.centerType || '').trim(), String(body.logoUrl || '').trim(), createdAt
    ));

    // 2. Center Settings
    stmts.push(env.DB.prepare(`
      INSERT INTO center_settings (
        center_id, center_name, phone_number, location_city, meal_operating_mode
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(id, name, phoneNumber, locationCity, mealOperatingMode));

    // 3. Fee Sets
    for (const yr of DEFAULT_ACADEMIC_YEARS) {
      stmts.push(env.DB.prepare(`
        INSERT INTO center_fee_sets (
          center_id, year, frais_annuel_suivi, frais_mensuel_suivi, 
          frais_annuel_bibliotheque, frais_mensuel_bibliotheque, 
          frais_abonnement_repas, frais_par_repas, frais_abonnement_repas_traiteur,
          frais_annuel_etude, frais_mensuel_etude, frais_assurance_cours_externes,
          frais_gouter_matin_mensuel, frais_gouter_matin_unitaire,
          frais_gouter_soir_mensuel, frais_gouter_soir_unitaire, frais_deux_gouters_mensuel
        ) VALUES (?, ?, 50, 40, 30, 20, 150, 8, 6, 60, 50, 25, 30, 2.5, 30, 2.5, 50)
      `).bind(id, yr));
    }

    // 4. Admin User
    stmts.push(env.DB.prepare(`
      INSERT INTO users (
        email, name, role, description, password_hash, center_id
      ) VALUES (?, ?, 'admin', 'مدير المركز', ?, ?)
    `).bind(adminEmail, adminName, passwordHash, id));

    // 5. Update demo request if converted
    if (demoRequestId) {
      stmts.push(env.DB.prepare(`
        UPDATE demo_requests SET status = 'converted', notes = ? WHERE id = ?
      `).bind(`تم تحويل الطلب إلى مركز (${name}) بنجاح بتاريخ ${new Date().toLocaleDateString('fr-FR')}`, demoRequestId));
    }

    // 6. Automatic subscription invoice — creating a PAID center starts a
    // subscription, so a pending invoice covering the first period is created
    // automatically (trial centers stay free and are invoiced on activation).
    let createdInvoice: { invoiceNumber: string; amount: number } | null = null;
    if (!isTrial && subscriptionEndsAt && monthlyPrice > 0) {
      const periodMs = billingCycle === 'annual' ? 365 * 86400000 : 30 * 86400000;
      const periodStart = subscriptionEndsAt - periodMs;
      const invoiceId = crypto.randomUUID();
      const invoiceCreatedAt = Date.now();
      const invoiceNumber = invoiceNumberFor(invoiceCreatedAt);
      const invoiceNotes = `Abonnement ${planLabel(plan)} (${billingCycle}) — ${fmtFr(periodStart)} → ${fmtFr(subscriptionEndsAt)} · création du centre`;
      stmts.push(env.DB.prepare(`
        INSERT INTO center_invoices (id, center_id, invoice_number, period_start, period_end, amount, status, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).bind(invoiceId, id, invoiceNumber, periodStart, subscriptionEndsAt, round2(monthlyPrice), invoiceNotes, invoiceCreatedAt));
      createdInvoice = { invoiceNumber, amount: round2(monthlyPrice) };
    }

    await env.DB.batch(stmts);

    await logPlanHistory(env.DB, {
      centerId: id,
      action: 'center_created',
      amount: isTrial ? null : (monthlyPrice || null),
      invoiceNumber: createdInvoice?.invoiceNumber || null,
      details: isTrial
        ? `Centre créé en période d’essai (${trialDays} j) — aucun plan facturé tant que l’essai court.`
        : `Centre créé — plan ${planLabel(plan)} (${billingCycle}) du ${fmtFr(createdAt + offerDays * 86400000)} au ${fmtFr(subscriptionEndsAt || createdAt)}`
          + (offerDays > 0 ? ` après ${offerDays} j offerts.` : '.'),
    });

    // Signal temps réel (fire-and-forget) — plateforme + canal du centre.
    publishOnResponse(context, env, ['center.' + id, 'platform'], {
      type: 'refetch',
      topic: 'center_created',
      centerId: id,
      at: Date.now(),
    });

    return json({
      success: true,
      centerId: id,
      invoice: createdInvoice,
      message: `تم إنشاء مركز (${name}) وتعيين حساب المدير (${adminEmail}) بنجاح!`
    }, 201);
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'خطأ في إنشاء المركز.';
    if (/UNIQUE constraint failed/i.test(raw)) {
      // Race between the pre-check and the INSERT — map to the friendly code.
      return json({ error: 'Ce nom de centre (slug) ou cet email administrateur est déjà utilisé.', code: 'duplicate' }, 409);
    }
    return json({ error: raw }, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const body = await readBody(request);
    const id = String(body.id || '').trim();
    if (!id) return json({ error: 'معرف المركز مطلوب.' }, 400);

    if (body.phoneNumber !== undefined && !/^[0-9]{8}$/.test(String(body.phoneNumber).trim())) {
      return json({ error: 'رقم الهاتف يجب أن يتكون من 8 أرقام.' }, 400);
    }

    const requestedAutoCalculatePrice = body.autoCalculatePrice === true;
    const requestedAutoCalculateSubscription = body.autoCalculateSubscription === true;
    const scheduleChangeBody = body.scheduleChange && typeof body.scheduleChange === 'object'
      ? body.scheduleChange as Record<string, unknown>
      : null;
    const cancelScheduledChange = body.cancelScheduledChange === true;
    const applyScheduledPlan = body.applyScheduledPlan === true;
    const needsCenter = requestedAutoCalculatePrice || requestedAutoCalculateSubscription
      || body.addOfferDays !== undefined || body.extendTrialDays !== undefined
      || body.plan !== undefined || body.billingCycle !== undefined || body.enabledModules !== undefined
      || body.status !== undefined || scheduleChangeBody || cancelScheduledChange || applyScheduledPlan
      || body.monthlyPrice !== undefined;

    let current: any = null;
    if (needsCenter) {
      current = await env.DB.prepare('SELECT plan, enabled_modules, status, billing_cycle, monthly_price, subscription_ends_at, trial_ends_at FROM centers WHERE id = ?').bind(id).first<any>();
      if (!current) return json({ error: 'المركز غير موجود.' }, 404);
    }

    // A center with a running subscription cannot be turned back into a trial
    // (that would silently void its paid period). Trial periods are only added
    // while the center is still IN trial.
    if (current && body.status !== undefined && String(body.status).trim() === 'trial' && current.status === 'active') {
      return json({ error: 'لا يمكن تحويل مركز باشتراك فعّال إلى فترة تجريبية.' }, 400);
    }

    const now = Date.now();

    // ─────────────────────────────────────────────────────────────────────────
    // Scheduled-plan bookkeeping (no live plan change)
    // ─────────────────────────────────────────────────────────────────────────

    // Cancel a previously scheduled change.
    if (cancelScheduledChange) {
      if (!current) return json({ error: 'المركز غير موجود.' }, 404);
      const res = await env.DB.prepare(
        `UPDATE center_plan_schedules SET status = 'cancelled', applied_at = NULL WHERE center_id = ? AND status = 'pending'`
      ).bind(id).run();
      publishOnResponse(context, env, ['center.' + id, 'platform'], { type: 'refetch', topic: 'center_updated', centerId: id, at: Date.now() });
      return json({ success: true, planChange: { mode: 'schedule_cancelled', cancelled: (res.meta.changes || 0) > 0 } });
    }

    // Store a scheduled change ("at the end of the current period please switch
    // to Growth/Pro"). The live plan / modules / price / dates are untouched.
    if (scheduleChangeBody) {
      if (!current) return json({ error: 'المركز غير موجود.' }, 404);
      const rawPlan = String(scheduleChangeBody.plan || '').trim();
      if (!rawPlan) return json({ error: 'الخطة المبرمجة مطلوبة.' }, 400);
      if (!['starter', 'growth', 'pro', 'custom'].includes(rawPlan === 'basic' ? 'starter' : rawPlan)) {
        return json({ error: 'خطة غير صالحة.' }, 400);
      }
      const toPlan = rawPlan === 'basic' ? 'starter' : rawPlan;
      const toCycle: BillingCycle = String(scheduleChangeBody.billingCycle || current.billing_cycle || 'monthly') === 'annual' ? 'annual' : 'monthly';
      const toModules = normalizeEnabledModules(
        Array.isArray(scheduleChangeBody.enabledModules) ? scheduleChangeBody.enabledModules : parseModulesJson(current.enabled_modules),
        toPlan
      );
      const toPrice = scheduleChangeBody.monthlyPrice !== undefined && scheduleChangeBody.monthlyPrice !== null && String(scheduleChangeBody.monthlyPrice).trim() !== ''
        ? Number(scheduleChangeBody.monthlyPrice)
        : (current.monthly_price !== null && current.monthly_price !== undefined ? Number(current.monthly_price) : null);

      // Apply at the end of the current paid window (or right away when there
      // is no active window — e.g. scheduling while expired).
      const currentEnd = Number(current.subscription_ends_at) || 0;
      const applyAt = current.status !== 'trial' && currentEnd > now ? currentEnd : null;

      const target: { plan: string; billingCycle: BillingCycle; enabledModules: string[]; monthlyPrice: number | null } = {
        plan: toPlan,
        billingCycle: toCycle,
        enabledModules: toModules,
        monthlyPrice: toPlan === 'custom' ? toPrice : null
      };
      const label = `Changement programmé: ${planLabel(current.plan || 'starter')} → ${planLabel(toPlan)} (${toCycle})`;
      await env.DB.batch([
        supersedePendingSchedules(env.DB, id),
        insertPlanSchedule(env.DB, id, target, applyAt, label)
      ]);

      // Identity/contact fields may travel with the scheduled change — persist
      // them too so a combined save is not silently truncated. Billing fields
      // (status/plan/modules/dates) are intentionally ignored here.
      const scheduleBaseUpdates: string[] = [];
      const scheduleBaseBinds: any[] = [];
      if (body.name !== undefined) { scheduleBaseUpdates.push('name = ?'); scheduleBaseBinds.push(String(body.name).trim()); }
      if (body.logoUrl !== undefined) { scheduleBaseUpdates.push('logo_url = ?'); scheduleBaseBinds.push(String(body.logoUrl).trim()); }
      if (body.phoneNumber !== undefined) { scheduleBaseUpdates.push('phone_number = ?'); scheduleBaseBinds.push(String(body.phoneNumber).trim()); }
      if (body.locationCity !== undefined) { scheduleBaseUpdates.push('location_city = ?'); scheduleBaseBinds.push(String(body.locationCity).trim()); }
      if (body.centerType !== undefined) { scheduleBaseUpdates.push('center_type = ?'); scheduleBaseBinds.push(String(body.centerType).trim()); }
      if (body.mealOperatingMode !== undefined) { scheduleBaseUpdates.push('meal_operating_mode = ?'); scheduleBaseBinds.push(String(body.mealOperatingMode).trim()); }
      if (scheduleBaseUpdates.length > 0) {
        scheduleBaseBinds.push(id);
        await env.DB.prepare(`UPDATE centers SET ${scheduleBaseUpdates.join(', ')} WHERE id = ?`).bind(...scheduleBaseBinds).run();
      }
      const scheduleSettingsUpdates: string[] = [];
      const scheduleSettingsBinds: any[] = [];
      if (body.name !== undefined) { scheduleSettingsUpdates.push('center_name = ?'); scheduleSettingsBinds.push(String(body.name).trim()); }
      if (body.phoneNumber !== undefined) { scheduleSettingsUpdates.push('phone_number = ?'); scheduleSettingsBinds.push(String(body.phoneNumber).trim()); }
      if (body.locationCity !== undefined) { scheduleSettingsUpdates.push('location_city = ?'); scheduleSettingsBinds.push(String(body.locationCity).trim()); }
      if (body.mealOperatingMode !== undefined) { scheduleSettingsUpdates.push('meal_operating_mode = ?'); scheduleSettingsBinds.push(String(body.mealOperatingMode).trim()); }
      if (scheduleSettingsUpdates.length > 0) {
        scheduleSettingsBinds.push(id);
        await env.DB.prepare(`UPDATE center_settings SET ${scheduleSettingsUpdates.join(', ')} WHERE center_id = ?`).bind(...scheduleSettingsBinds).run();
      }

      publishOnResponse(context, env, ['center.' + id, 'platform'], { type: 'refetch', topic: 'center_updated', centerId: id, at: Date.now() });
      return json({
        success: true,
        planChange: {
          mode: 'scheduled',
          applyAt,
          plan: toPlan,
          billingCycle: toCycle,
          enabledModules: toModules
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Live update path (includes legacy fields + the new mid-period logic)
    // ─────────────────────────────────────────────────────────────────────────

    const pending = await getPendingSchedule(env.DB, id);
    const normalizedBodyPlan = body.plan === undefined
      ? null
      : (String(body.plan).trim() === 'basic' ? 'starter' : String(body.plan).trim());
    const currentPlan = current?.plan || 'starter';
    const currentModules = parseModulesJson(current?.enabled_modules);
    const currentCycle = (current?.billing_cycle as BillingCycle) || 'monthly';
    const currentStatus = current?.status || 'active';
    // Force-applying a scheduled plan ("Appliquer" on the card) is also a
    // renewal when the current paid window is over: the center becomes ACTIVE
    // again and a fresh period starts at the scheduled plan/price.
    const autoRenewScheduled = applyScheduledPlan && body.status === undefined && Boolean(pending)
      && (currentStatus === 'expired'
        || (currentStatus === 'active' && (!Number(current?.subscription_ends_at) || Number(current?.subscription_ends_at) <= now)));
    const requestedStatus = body.status === undefined
      ? (autoRenewScheduled ? 'active' : currentStatus)
      : String(body.status).trim();
    const effectiveStatus = requestedStatus === 'trial' ? 'trial'
      : (['active', 'suspended', 'expired'].includes(requestedStatus) ? requestedStatus : 'active');
    const statusChangedToPaid = Boolean(current && (current.status === 'trial' || current.status === 'expired') && effectiveStatus === 'active');
    // A request that starts (or restarts) a paid window: trial → active,
    // expired → active, or an explicit renewal extension.
    const renewalTrigger = statusChangedToPaid || requestedAutoCalculateSubscription;

    // Fold the pending scheduled change when this request renews the center,
    // or when the platform admin explicitly force-applies it.
    const explicitLivePlanConflict = Boolean(normalizedBodyPlan) && pending && normalizedBodyPlan !== pending.to_plan;
    const scheduleEligible = Boolean(pending) && (applyScheduledPlan
      || (renewalTrigger && (!pending!.apply_at || pending!.apply_at <= now)));
    const foldSchedule = Boolean(pending) && scheduleEligible && !explicitLivePlanConflict;
    if (applyScheduledPlan && !pending) {
      return json({ error: 'لا يوجد تغيير خطة مبرمج لهذا المركز.' }, 400);
    }
    if (applyScheduledPlan && explicitLivePlanConflict) {
      return json({ error: 'لا يمكن تطبيق الخطة المبرمجة مع تغيير خطة يدوي في نفس الطلب.' }, 400);
    }

    const effectivePlan = foldSchedule
      ? pending!.to_plan
      : (normalizedBodyPlan || currentPlan);
    let effectiveBillingCycle: BillingCycle = body.billingCycle === undefined
      ? (foldSchedule ? (pending!.to_billing_cycle as BillingCycle) : currentCycle)
      : (String(body.billingCycle).trim() === 'annual' ? 'annual' : 'monthly');
    const cycleWrite = effectiveBillingCycle !== currentCycle;

    const requestedModulesRaw = foldSchedule
      ? parseModulesJson(pending!.to_enabled_modules)
      : (Array.isArray(body.enabledModules) ? body.enabledModules : currentModules);
    const targetModules = normalizeEnabledModules(requestedModulesRaw, effectivePlan);
    const modulesChanged = JSON.stringify(targetModules) !== JSON.stringify(currentModules);
    const planChanged = (normalizedBodyPlan !== null && normalizedBodyPlan !== currentPlan) || (foldSchedule && effectivePlan !== currentPlan);
    const billingCycleChanged = cycleWrite;
    const customPriceForTarget = effectivePlan === 'custom'
      ? (body.monthlyPrice !== undefined && body.monthlyPrice !== null && String(body.monthlyPrice).trim() !== ''
        ? Number(body.monthlyPrice)
        : (foldSchedule ? (pending!.to_monthly_price !== null && pending!.to_monthly_price !== undefined ? Number(pending!.to_monthly_price) : null)
          : (current?.monthly_price !== null && current?.monthly_price !== undefined ? Number(current.monthly_price) : null)))
      : null;
    const customPriceAvailable = effectivePlan === 'custom' && customPriceForTarget !== null;

    // Amounts used both for the mid-period evaluation and for the monthly_price
    // write, so the UI decision and the stored price always agree.
    const oldPeriodAmount = effectiveStatus === 'trial' || !current
      ? 0
      : ((Number(current.monthly_price) || 0) > 0
        ? Number(current.monthly_price)
        : await computePeriodAmount(env.DB, { plan: currentPlan, modules: currentModules, billingCycle: currentCycle }));
    const newPeriodAmount = effectiveStatus === 'trial'
      ? 0
      : await computePeriodAmount(env.DB, { plan: effectivePlan, modules: targetModules, billingCycle: effectiveBillingCycle, customPrice: customPriceAvailable ? customPriceForTarget : null });

    const planRelevantChange = planChanged || modulesChanged || billingCycleChanged;
    const evaluation: PlanChangeEvaluation = evaluatePlanChange(
      { status: currentStatus, plan: currentPlan, billingCycle: currentCycle, monthlyPrice: oldPeriodAmount, trialEndsAt: current?.trial_ends_at, subscriptionEndsAt: current?.subscription_ends_at },
      { plan: effectivePlan, billingCycle: effectiveBillingCycle, periodAmount: newPeriodAmount, modulesChanged },
      now
    );

    const midPeriodMode = evaluation.mode === 'mid_period_increase'
      || evaluation.mode === 'mid_period_decrease'
      || evaluation.mode === 'mid_period_same_price';
    // The heart of the fix: a plan change made WHILE a paid period is running
    // must NOT silently push the subscription end date by a full extra period.
    const suppressExtension = midPeriodMode && !requestedAutoCalculateSubscription && !statusChangedToPaid && !billingCycleChanged;

    // Mid-period price DECREASE is applied at the end of the current period
    // (the center already paid the higher price for the window). Unless the
    // platform admin explicitly force-applies an already scheduled change.
    const scheduleDecrease = evaluation.mode === 'mid_period_decrease' && !applyScheduledPlan && !foldSchedule;

    const autoCalculatePrice = requestedAutoCalculatePrice
      || body.plan !== undefined
      || body.billingCycle !== undefined
      || body.enabledModules !== undefined
      || body.status !== undefined
      || foldSchedule;
    const autoCalculateSubscription = (requestedAutoCalculateSubscription || planChanged || billingCycleChanged || statusChangedToPaid)
      && !suppressExtension && !scheduleDecrease;

    const updates: string[] = [];
    const binds: any[] = [];
    const scheduleStmts: D1PreparedStatement[] = [];
    let planChangeResponse: any = { mode: evaluation.mode };

    if (body.name !== undefined) { updates.push('name = ?'); binds.push(String(body.name).trim()); }
    if (body.phoneNumber !== undefined) { updates.push('phone_number = ?'); binds.push(String(body.phoneNumber).trim()); }
    if (body.locationCity !== undefined) { updates.push('location_city = ?'); binds.push(String(body.locationCity).trim()); }
    if (body.centerType !== undefined) { updates.push('center_type = ?'); binds.push(String(body.centerType).trim()); }

    // Plan / enabled modules: applied live, except for a scheduled decrease.
    if (!scheduleDecrease && (planChanged || modulesChanged || foldSchedule || body.plan !== undefined || body.enabledModules !== undefined)) {
      if (planChanged || body.plan !== undefined || foldSchedule) {
        updates.push('plan = ?');
        binds.push(effectivePlan);
      }
      if (modulesChanged || body.enabledModules !== undefined || foldSchedule) {
        updates.push('enabled_modules = ?');
        binds.push(JSON.stringify(targetModules));
      }
    }

    if (body.status !== undefined || autoRenewScheduled) { updates.push('status = ?'); binds.push(effectiveStatus); }
    if (body.mealOperatingMode !== undefined) { updates.push('meal_operating_mode = ?'); binds.push(String(body.mealOperatingMode).trim()); }
    if (body.trialEndsAt !== undefined) { updates.push('trial_ends_at = ?'); binds.push(body.trialEndsAt ? Number(body.trialEndsAt) : null); }
    if (body.logoUrl !== undefined) { updates.push('logo_url = ?'); binds.push(String(body.logoUrl).trim()); }
    if (body.billingCycle !== undefined || foldSchedule) { updates.push('billing_cycle = ?'); binds.push(effectiveBillingCycle); }

    // Manual price (custom plans only — auto plans are recomputed below).
    if (!scheduleDecrease && body.monthlyPrice !== undefined && effectiveStatus !== 'trial' && effectivePlan === 'custom') {
      updates.push('monthly_price = ?');
      binds.push(body.monthlyPrice === null ? null : Number(body.monthlyPrice));
    }

    // Automatic price (module total / manual custom / zero while in trial).
    if (autoCalculatePrice && !scheduleDecrease) {
      if (effectiveStatus === 'trial') {
        updates.push('monthly_price = ?');
        binds.push(0);
      } else if (AUTO_PRICED_PLANS.has(effectivePlan)) {
        updates.push('monthly_price = ?');
        binds.push(newPeriodAmount);
      } else if (effectivePlan === 'custom' && foldSchedule && customPriceAvailable) {
        updates.push('monthly_price = ?');
        binds.push(customPriceForTarget);
      }
    }

    // subscription_ends_at: manual override only when dates are not managed
    // automatically by this handler.
    if (body.subscriptionEndsAt !== undefined && !autoCalculateSubscription
      && !(autoCalculatePrice && effectiveStatus === 'trial')) {
      updates.push('subscription_ends_at = ?');
      binds.push(body.subscriptionEndsAt ? Number(body.subscriptionEndsAt) : null);
    }

    // Audit trail entries for this PATCH — flushed after the writes succeed.
    const historyEntries: Array<{ action: string; details: string; amount?: number | null; invoiceNumber?: string | null }> = [];

    // Add promotional/trial days — ONLY while the center is still in its trial
    // period. A center already inside a paid subscription window cannot be
    // granted a trial extension (a paid plan change must never silently give
    // free days). Keep extendTrialDays as a backwards-compatible alias.
    const requestedOfferDays = body.addOfferDays !== undefined ? body.addOfferDays : body.extendTrialDays;
    if (requestedOfferDays !== undefined) {
      const extraDays = normalizeDayCount(requestedOfferDays, 0);
      if (extraDays > 0 && current) {
        if (current.status !== 'trial') {
          return json({ error: 'لا يمكن إضافة أيام تجريبية لمركز مشترك. الفترة التجريبية تُضاف فقط أثناء الاشتراك التجريبي.' }, 400);
        }
        const existingTrialEnd = Number(current.trial_ends_at) || 0;
        const baseTrialEnd = existingTrialEnd > now ? existingTrialEnd : now;
        updates.push('trial_ends_at = ?');
        binds.push(baseTrialEnd + extraDays * DAY_MS);
        historyEntries.push({
          action: 'trial_added',
          details: `Essai prolongé de ${extraDays} jour(s) — fin reportée au ${fmtFr(baseTrialEnd + extraDays * DAY_MS)}.`,
        });
      }
    }

    // ── Subscription extension ────────────────────────────────────────────────
    // Only an ACTIVE center gets a paid window (a center saved as expired or
    // suspended must not silently accumulate future time).
    let newSubscriptionEndsAt: number | null = null;
    let extensionBase = 0;
    if (autoCalculateSubscription && effectiveStatus === 'active') {
      const existingEnd = Number(current?.subscription_ends_at) || 0;
      const requestedTrialEnd = body.trialEndsAt === undefined
        ? (Number(current?.trial_ends_at) || 0)
        : (Number(body.trialEndsAt) || 0);
      const trialEnd = current?.status === 'trial' && requestedTrialEnd > now ? requestedTrialEnd : 0;
      // Activating a center during its trial starts the paid period at the
      // trial boundary, not immediately. Other renewals extend from an
      // existing future subscription end when present.
      extensionBase = trialEnd || (existingEnd > now ? existingEnd : now);
      const duration = effectiveBillingCycle === 'annual' ? 365 : 30;
      newSubscriptionEndsAt = extensionBase + duration * DAY_MS;
      updates.push('subscription_ends_at = ?');
      binds.push(newSubscriptionEndsAt);
    } else if (autoCalculatePrice && effectiveStatus === 'trial' && (body.status !== undefined || current?.status === 'trial')) {
      updates.push('subscription_ends_at = ?');
      binds.push(null);
    }

    // ── Mid-period handling ──────────────────────────────────────────────────
    // (a) Price INCREASE while inside a paid window: apply immediately, keep
    // the end date, and settle the prorated difference.
    let settlementResult: any = null;
    if (evaluation.mode === 'mid_period_increase') {
      const policy = String(body.settlementPolicy || 'auto').trim();
      const paid = policy === 'paid' ? true
        : policy === 'unpaid' ? false
          : (await hasPaidInvoiceForWindow(env.DB, id, Number(current.subscription_ends_at)));
      const settlement = upgradeSettlement(evaluation, paid, now);
      if (settlement && settlement.amount > PRICE_EPSILON && current?.subscription_ends_at) {
        const invoice = await createSettlementInvoice(env.DB, {
          centerId: id,
          amount: settlement.amount,
          periodStart: now,
          periodEnd: Number(current.subscription_ends_at),
          paid,
          oldPlan: currentPlan,
          newPlan: effectivePlan,
          remainingDays: settlement.remainingDays
        });
        settlementResult = { ...invoice, paid, remainingDays: settlement.remainingDays };
      } else {
        settlementResult = { amount: 0, paid, remainingDays: settlement?.remainingDays || 0, skipped: true };
      }
      if (settlementResult && !(settlementResult as any).skipped) {
        historyEntries.push({
          action: 'plan_settled',
          amount: settlementResult.amount,
          invoiceNumber: settlementResult.invoiceNumber || null,
          details: `Changement en cours de période ${planLabel(currentPlan)} → ${planLabel(effectivePlan)} — `
            + (settlementResult.paid
              ? 'complément au prorata des jours restants (la facture payée reste intacte)'
              : 'facture en attente annulée puis remplacée au nouveau tarif')
            + ` · ${settlementResult.remainingDays} j restants, échéance inchangée.`,
        });
      }
      planChangeResponse.settlement = settlementResult;
      // A live change supersedes any pending scheduled change.
      if (pending && !foldSchedule) scheduleStmts.push(supersedePendingSchedules(env.DB, id));
    }

    // (b) Price DECREASE while inside a paid window: schedule it for the end
    // of the current period instead of applying it live.
    if (evaluation.mode === 'mid_period_decrease' && scheduleDecrease) {
      const end = Number(current?.subscription_ends_at) || 0;
      const applyAt = end > now ? end : null;
      const target: { plan: string; billingCycle: BillingCycle; enabledModules: string[]; monthlyPrice: number | null } = {
        plan: effectivePlan,
        billingCycle: effectiveBillingCycle,
        enabledModules: targetModules,
        monthlyPrice: customPriceAvailable ? customPriceForTarget : null
      };
      scheduleStmts.push(
        supersedePendingSchedules(env.DB, id),
        insertPlanSchedule(env.DB, id, target, applyAt, `Downgrade programmé: ${planLabel(currentPlan)} → ${planLabel(effectivePlan)} (${effectiveBillingCycle})`)
      );
      planChangeResponse.mode = 'scheduled';
      planChangeResponse.applyAt = applyAt;
      planChangeResponse.scheduledPlan = { plan: effectivePlan, billingCycle: effectiveBillingCycle, enabledModules: targetModules };
      historyEntries.push({
        action: 'plan_scheduled',
        details: `Basse de plan programmée : ${planLabel(currentPlan)} → ${planLabel(effectivePlan)} (${effectiveBillingCycle}) pour le `
          + (applyAt ? fmtFr(applyAt) : 'prochaine reconduction') + ' — période déjà payée conservée intégralement.',
      });
    }

    // Folded/force-applied scheduled change → mark it as applied.
    if (foldSchedule && pending) {
      scheduleStmts.push(markScheduleApplied(env.DB, pending.id));
      planChangeResponse.appliedScheduleId = pending.id;
      planChangeResponse.mode = evaluation.mode === 'mid_period_increase' || evaluation.mode === 'mid_period_same_price'
        ? evaluation.mode : 'renewal';
      if (newSubscriptionEndsAt) planChangeResponse.newSubscriptionEndsAt = newSubscriptionEndsAt;
      historyEntries.push({
        action: 'plan_applied',
        details: `Plan programmé appliqué : ${planLabel(currentPlan)} → ${planLabel(effectivePlan)} (${effectiveBillingCycle}).`,
      });
    }

    if (updates.length > 0) {
      binds.push(id);
      const mainStmts: D1PreparedStatement[] = [
        env.DB.prepare(`UPDATE centers SET ${updates.join(', ')} WHERE id = ?`).bind(...binds)
      ];
      await env.DB.batch([...mainStmts, ...scheduleStmts]);
    } else if (scheduleStmts.length > 0) {
      await env.DB.batch(scheduleStmts);
    }

    // ── Automatic subscription invoice for a NEW/RENEWED paid window ────────
    // Trial activation, expired → active renewal, a scheduled plan applied at
    // renewal ("Appliquer"): a pending invoice is created for the fresh window
    // at the (possibly new) plan price. No regularization here — that only
    // happens for mid-period plan changes handled above.
    let autoInvoice: { invoiceNumber: string; amount: number } | null = null;
    if (autoCalculateSubscription && effectiveStatus === 'active' && !suppressExtension && !scheduleDecrease
      && newSubscriptionEndsAt && extensionBase > 0) {
      const amount = effectivePlan === 'custom'
        ? (customPriceAvailable && customPriceForTarget !== null ? customPriceForTarget : (Number(current?.monthly_price) || 0))
        : newPeriodAmount;
      if (amount > 0) {
        const tag = foldSchedule
          ? `plan programmé appliqué (${planLabel(currentPlan)} → ${planLabel(effectivePlan)})`
          : statusChangedToPaid && current?.status === 'trial'
            ? 'activation après la période d’essai'
            : 'reconduction de l’abonnement';
        const invoice = await ensurePeriodInvoice(env.DB, {
          centerId: id,
          periodStart: extensionBase,
          periodEnd: newSubscriptionEndsAt,
          amount,
          notes: `Abonnement ${planLabel(effectivePlan)} (${effectiveBillingCycle}) — ${fmtFr(extensionBase)} → ${fmtFr(newSubscriptionEndsAt)} · ${tag}`
        });
        autoInvoice = invoice ? { invoiceNumber: invoice.invoiceNumber, amount: invoice.amount } : null;
        historyEntries.push({
          action: statusChangedToPaid && current?.status === 'trial' ? 'plan_activated' : 'plan_renewed',
          amount: autoInvoice ? autoInvoice.amount : null,
          invoiceNumber: autoInvoice?.invoiceNumber || null,
          details: `Abonnement ${planLabel(effectivePlan)} (${effectiveBillingCycle}) — ${fmtFr(extensionBase)} → ${fmtFr(newSubscriptionEndsAt)} · ${tag}`
            + (autoInvoice ? ` · facture ${autoInvoice.invoiceNumber} en attente (${autoInvoice.amount.toFixed(2)} TND)` : ' · aucune facture (tarif nul ou période déjà réglée)'),
        });
      }
    }
    planChangeResponse.invoice = autoInvoice;

    // Keep the tenant-facing settings in sync when platform admin edits
    // the center's identity or contact details.
    const settingsUpdates: string[] = [];
    const settingsBinds: any[] = [];
    if (body.name !== undefined) { settingsUpdates.push('center_name = ?'); settingsBinds.push(String(body.name).trim()); }
    if (body.phoneNumber !== undefined) { settingsUpdates.push('phone_number = ?'); settingsBinds.push(String(body.phoneNumber).trim()); }
    if (body.locationCity !== undefined) { settingsUpdates.push('location_city = ?'); settingsBinds.push(String(body.locationCity).trim()); }
    if (body.mealOperatingMode !== undefined) { settingsUpdates.push('meal_operating_mode = ?'); settingsBinds.push(String(body.mealOperatingMode).trim()); }
    if (settingsUpdates.length > 0) {
      settingsBinds.push(id);
      await env.DB.prepare(`UPDATE center_settings SET ${settingsUpdates.join(', ')} WHERE center_id = ?`).bind(...settingsBinds).run();
    }

    // Also update admin password if requested
    if (body.newAdminPassword && body.adminEmail) {
      const newHash = await sha256Hex(String(body.newAdminPassword).trim());
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE email = ? AND center_id = ?')
        .bind(newHash, String(body.adminEmail).trim().toLowerCase(), id).run();
    }

    // Also cancel a pending schedule when this live change supersedes it but
    // no scheduled/plan bookkeeping statement was added above.
    if (pending && !foldSchedule && planRelevantChange
      && evaluation.mode !== 'mid_period_decrease'
      && !planChangeResponse.settlement) {
      await env.DB.prepare(`UPDATE center_plan_schedules SET status = 'cancelled', notes = COALESCE(notes, '') || ' — remplacé par un changement immédiat' WHERE id = ?`).bind(pending.id).run();
      planChangeResponse.cancelledScheduleId = pending.id;
    }

    for (const entry of historyEntries) {
      await logPlanHistory(env.DB, { centerId: id, ...entry });
    }

    // Platform edit published to the center's channel (fire-and-forget).
    publishOnResponse(context, env, ['center.' + id, 'platform'], { type: 'refetch', topic: 'center_updated', centerId: id, at: Date.now() });
    return json({ success: true, planChange: planChangeResponse });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في تحديث المركز.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'معرف المركز مطلوب.' }, 400);

    const existing = await env.DB.prepare('SELECT id FROM centers WHERE id = ?').bind(id).first<any>();
    if (!existing) return json({ error: 'المركز غير موجود.' }, 404);

    // Full cleanup of the center's data: users, students, payments, staff…
    // Child rows are deleted explicitly in dependency order so the cleanup is
    // complete whether or not FK cascades are enforced by the engine.
    // Platform super-admins are never deleted (they may reference this center
    // historically but belong to the platform, not to a center).
    const stmts = [
      // ── students & their child rows ──
      env.DB.prepare('DELETE FROM payments WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM meal_attendances WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM suivi_notes WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM student_parents WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM siblings WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM authorized_persons WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM academic_history WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM students WHERE center_id = ?').bind(id),
      // ── staff & their child rows ──
      env.DB.prepare('DELETE FROM staff_subjects WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_schedule WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_payments WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_payslips WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_leave_requests WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_advances WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff WHERE center_id = ?').bind(id),
      // ── étude slots ──
      env.DB.prepare('DELETE FROM slot_enrollments WHERE slot_id IN (SELECT id FROM etude_slots WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM etude_slots WHERE center_id = ?').bind(id),
      // ── external courses ──
      env.DB.prepare('DELETE FROM course_enrolled_students WHERE course_id IN (SELECT id FROM external_courses WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_present_students WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_one_time_students WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_month_paid WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_seance_status WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_seance_amount WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM external_course_sessions WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM external_payments WHERE student_id IN (SELECT id FROM external_students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM external_attendance WHERE student_id IN (SELECT id FROM external_students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM external_students WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM external_courses WHERE center_id = ?').bind(id),
      // ── meals ──
      env.DB.prepare('DELETE FROM meal_plan_attendees WHERE meal_plan_id IN (SELECT id FROM meal_plan_days WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM meal_plan_days WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM meal_forfait_closure_items WHERE closure_id IN (SELECT id FROM meal_forfait_closures WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM meal_forfait_closures WHERE center_id = ?').bind(id),
      // ── revision seances ──
      env.DB.prepare('DELETE FROM revision_seance_students WHERE seance_id IN (SELECT id FROM revision_seances WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM revision_seances WHERE center_id = ?').bind(id),
      // ── formations / timesheets / expenses ──
      env.DB.prepare('DELETE FROM formations WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM student_time_sheets WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM student_attendance WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM timesheets WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM expenses WHERE center_id = ?').bind(id),
      // ── auth: sessions + the center's users (platform admins preserved) ──
      env.DB.prepare('DELETE FROM sessions WHERE center_id = ?').bind(id),
      env.DB.prepare("DELETE FROM users WHERE center_id = ? AND role != 'platform_super_admin'").bind(id),
      // ── center config & billing ──
      env.DB.prepare('DELETE FROM center_settings WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM center_fee_sets WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM center_plan_schedules WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM center_invoices WHERE center_id = ?').bind(id),
      // ── finally the center itself ──
      env.DB.prepare('DELETE FROM centers WHERE id = ?').bind(id)
    ];
    await env.DB.batch(stmts);

    return json({ success: true, message: 'تم حذف المركز بنجاح.' });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في حذف المركز.' }, 500);
  }
};
