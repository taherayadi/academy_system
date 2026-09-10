import { Env, json, readBody, validateSession } from './_lib';
import { round2, planLabel, BillingCycle } from './planLogic';

// ─── Platform SaaS — per-center plan manager ────────────────────────────────
// Editing a center's basic info must NEVER touch its plan or invoices.
// All plan operations go through this endpoint:
//   • set-plan (immediate): while the current window is NOT paid, the old
//     pending invoice is removed and a new one replaces it for the new plan
//     (period restarts today). When the window IS already paid, the change is
//     scheduled for the end of the paid period instead (paid days are never
//     discarded).
//   • set-plan (scheduled): explicitly schedule a plan for the next renewal.
//   • remove-schedule: cancel a scheduled plan.
//   • remove-plan: cancel the subscription — pending/overdue invoices are
//     voided, scheduled plans cancelled, the center becomes 'expired'.

const DAY_MS = 86400000;
const BUNDLED_MODULE_KEY = 'studentTimeSheets';
const REQUIRED_MODULE_KEYS = ['scolaire', 'finance', BUNDLED_MODULE_KEY];
const ALL_MODULE_KEYS = [
  'scolaire', 'finance', 'etude', 'coursParticuliers', 'revision',
  'formations', 'cantine', 'transport', 'events', 'bibliotheque',
  BUNDLED_MODULE_KEY, 'staff',
];
const ANNUAL_DISCOUNT = 0.2;
const AUTO_PRICED_PLANS = new Set(['starter', 'growth', 'pro']);
const VALID_PLANS = new Set(['starter', 'basic', 'growth', 'pro', 'custom']);

function storagePlan(plan: string): string {
  return plan === 'basic' ? 'starter' : plan;
}

function parseModulesJson(value: unknown): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeEnabledModules(value: unknown, plan?: string): string[] {
  const requested = Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : [];
  const modules = plan === 'pro' ? ALL_MODULE_KEYS : plan === 'starter' || plan === 'basic' ? [] : requested;
  return Array.from(new Set([...REQUIRED_MODULE_KEYS, ...modules]));
}

function currentSchoolYear(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const schoolStartYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${schoolStartYear}/${schoolStartYear + 1}`;
}

function invoiceNumberFor(createdAt: number): string {
  return `INV-${new Date(createdAt).getFullYear()}-${String(crypto.randomUUID()).slice(0, 8).toUpperCase()}`;
}

const fmtFr = (ts: number) => new Date(ts).toLocaleDateString('fr-TN', { day: '2-digit', month: 'short', year: 'numeric' });

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
    (sum, row) => sum + (row.module_key === BUNDLED_MODULE_KEY ? 0 : (Number(row.price) || 0)),
    0
  );
  if (args.billingCycle === 'annual') total *= 12 * (1 - ANNUAL_DISCOUNT);
  return total;
}

async function isAuthorized(env: Env, request: Request): Promise<boolean> {
  const session = await validateSession(env.DB, request);
  return !!session && (session.role === 'super_admin' || session.role === 'platform_super_admin');
}

// GET /api/center-plans?centerId=… — everything the plan manager needs
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!(await isAuthorized(env, request))) return json({ error: 'غير مصرح.' }, 403);

    const url = new URL(request.url);
    const centerId = url.searchParams.get('centerId');
    if (!centerId) return json({ error: 'معرف المركز مطلوب.' }, 400);

    const center = await env.DB.prepare(`
      SELECT id, name, status, plan, billing_cycle, monthly_price,
             subscription_ends_at, trial_ends_at, enabled_modules
      FROM centers WHERE id = ?
    `).bind(centerId).first<any>();
    if (!center) return json({ error: 'المركز غير موجود.' }, 404);

    const [invoicesRes, schedulesRes] = await Promise.all([
      env.DB.prepare(`
        SELECT id, invoice_number, period_start, period_end, amount, status,
               payment_method, payment_date, cheque_number, created_at
        FROM center_invoices WHERE center_id = ?
        ORDER BY created_at DESC LIMIT 60
      `).bind(centerId).all<any>(),
      // Degrade gracefully if migration 0027 is not applied yet.
      env.DB.prepare(`
        SELECT id, to_plan, to_billing_cycle, to_monthly_price, apply_at, notes, created_at
        FROM center_plan_schedules WHERE center_id = ? AND status = 'pending'
        ORDER BY created_at DESC
      `).bind(centerId).all<any>().catch(() => ({ results: [] as any[] })),
    ]);

    return json({
      center: {
        id: center.id,
        name: center.name,
        status: center.status,
        plan: center.plan,
        billingCycle: center.billing_cycle || 'monthly',
        monthlyPrice: Number(center.monthly_price) || 0,
        subscriptionEndsAt: center.subscription_ends_at || null,
        trialEndsAt: center.trial_ends_at || null,
        enabledModules: parseModulesJson(center.enabled_modules),
      },
      invoices: (invoicesRes.results || []).map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        periodStart: inv.period_start,
        periodEnd: inv.period_end,
        amount: Number(inv.amount),
        status: inv.status,
        paymentMethod: inv.payment_method || null,
        paymentDate: inv.payment_date || null,
        chequeNumber: inv.cheque_number || null,
        createdAt: inv.created_at,
      })),
      schedules: (schedulesRes.results || []).map(s => ({
        id: s.id,
        plan: s.to_plan,
        billingCycle: s.to_billing_cycle,
        monthlyPrice: s.to_monthly_price === null ? null : Number(s.to_monthly_price),
        applyAt: s.apply_at,
        notes: s.notes || '',
        createdAt: s.created_at,
      })),
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في جلب بيانات الاشتراك.' }, 500);
  }
};

// POST /api/center-plans — plan operations for one center
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!(await isAuthorized(env, request))) return json({ error: 'غير مصرح.' }, 403);

    const body = await readBody(request);
    const action = String(body.action || '').trim();
    const centerId = String(body.centerId || '').trim();
    if (!centerId) return json({ error: 'معرف المركز مطلوب.' }, 400);

    const center = await env.DB.prepare(`
      SELECT id, status, plan, billing_cycle, monthly_price, subscription_ends_at, trial_ends_at, enabled_modules
      FROM centers WHERE id = ?
    `).bind(centerId).first<any>();
    if (!center) return json({ error: 'المركز غير موجود.' }, 404);

    const now = Date.now();
    const existingEnd = Number(center.subscription_ends_at) || 0;
    const hasLiveWindow = center.status === 'active' && existingEnd > now;

    if (action === 'remove-schedule') {
      const scheduleId = String(body.scheduleId || '').trim();
      if (!scheduleId) return json({ error: 'معرف الخطة المبرمجة مطلوب.' }, 400);
      await env.DB.prepare(
        `UPDATE center_plan_schedules SET status = 'cancelled', notes = COALESCE(notes, '') || ' — annulée par l’administrateur' WHERE id = ? AND center_id = ? AND status = 'pending'`
      ).bind(scheduleId, centerId).run();
      return json({ success: true, mode: 'schedule_cancelled' });
    }

    if (action === 'add-trial') {
      // Offer free days on top of the current subscription:
      //   • trial running, or a plan that starts today / has not started yet
      //     → days are added at the START: the pending invoice is pushed back
      //       (nothing is billed during the free days);
      //   • middle / end of a started period → days are added at the END:
      //       the subscription end date moves out and the unpaid invoice
      //       covering the window is stretched. Paid invoices are never
      //       touched, so no paid day is ever discarded.
      const days = Math.floor(Number(body.days));
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        return json({ error: 'Nombre de jours invalide (1 à 3650).' }, 400);
      }
      const nowTs = Date.now();
      const oldTrialEnd = Number(center.trial_ends_at) || 0;
      const trialOngoing = center.status === 'trial' && oldTrialEnd > nowTs;
      const liveEnd = Number(center.subscription_ends_at) || 0;
      const hasLive = liveEnd > nowTs;
      if (!trialOngoing && !hasLive) {
        return json({ error: 'Aucun abonnement ni essai en cours — activez d’abord un plan.' }, 400);
      }
      const cycleDays = String(center.billing_cycle) === 'annual' ? 365 : 30;
      const windowStart = liveEnd - cycleDays * DAY_MS;
      const startOfToday = new Date(nowTs);
      startOfToday.setHours(0, 0, 0, 0);
      const prepend = trialOngoing || !hasLive || windowStart >= startOfToday.getTime();
      const shift = days * DAY_MS;
      const newTrialEnd = trialOngoing ? oldTrialEnd + shift : oldTrialEnd;
      const newEnd = hasLive ? liveEnd + shift : liveEnd;

      await env.DB.prepare(
        `UPDATE centers SET subscription_ends_at = ?, trial_ends_at = ? WHERE id = ?`
      ).bind(newEnd || null, newTrialEnd || null, centerId).run();

      if (prepend) {
        // Not-yet-billed period (starts today or later, incl. future-start
        // activation invoices created during a trial): push the whole
        // unpaid window back by the free days.
        await env.DB.prepare(`
          UPDATE center_invoices SET period_start = period_start + ?, period_end = period_end + ?
          WHERE center_id = ? AND status IN ('pending','overdue') AND period_start >= ?
        `).bind(shift, shift, centerId, startOfToday.getTime()).run();
      } else {
        // Extend the unpaid invoice covering the window end (amount kept —
        // the extra days are the offer). Paid invoices stay untouched.
        await env.DB.prepare(`
          UPDATE center_invoices SET period_end = period_end + ?
          WHERE center_id = ? AND status IN ('pending','overdue') AND period_end = ?
        `).bind(shift, centerId, liveEnd).run();
      }

      const message = trialOngoing && !hasLive
        ? `Essai prolongé de ${days} jour(s) — fin de l’essai reportée au ${fmtFr(newTrialEnd)} ; la facturation démarrera après.`
        : prepend
          ? `${days} jour(s) offerts ajoutés au début de l’abonnement — la facture en attente est décalée d’autant, échéance ${fmtFr(newEnd)}.`
          : `${days} jour(s) offerts ajoutés à la fin de l’abonnement — nouvelle échéance le ${fmtFr(newEnd)}.`;
      return json({ success: true, mode: 'trial_added', placement: prepend ? 'start' : 'end', days, subscriptionEndsAt: newEnd, message });
    }

    if (action === 'remove-plan') {
      // Void anything not yet collected, cancel scheduled plans, expire the
      // subscription. Paid invoices stay as-is (history + revenue).
      await env.DB.prepare(
        `UPDATE center_invoices SET status = 'cancelled' WHERE center_id = ? AND status IN ('pending','overdue')`
      ).bind(centerId).run();
      try {
        await env.DB.prepare(
          `UPDATE center_plan_schedules SET status = 'cancelled' WHERE center_id = ? AND status = 'pending'`
        ).bind(centerId).run();
      } catch { /* schedules table missing (migration 0027) — nothing pending to cancel */ }
      await env.DB.prepare(
        `UPDATE centers SET status = 'expired' WHERE id = ? AND status IN ('active','trial','suspended')`
      ).bind(centerId).run();
      return json({ success: true, mode: 'plan_removed' });
    }

    if (action === 'set-plan') {
      const rawPlan = String(body.plan || '').trim().toLowerCase();
      if (!VALID_PLANS.has(rawPlan)) return json({ error: 'خطة غير صالحة.' }, 400);
      const targetPlan = storagePlan(rawPlan);
      const targetCycle: BillingCycle = String(body.billingCycle || 'monthly') === 'annual' ? 'annual' : 'monthly';
      const targetModules = normalizeEnabledModules(
        body.enabledModules !== undefined
          ? body.enabledModules
          : parseModulesJson(center.enabled_modules),
        targetPlan
      );
      const customPrice = targetPlan === 'custom'
        ? Math.max(0, Number(body.monthlyPrice ?? center.monthly_price) || 0)
        : null;
      const periodAmount = round2(await computePeriodAmount(env.DB, {
        plan: targetPlan,
        modules: targetModules,
        billingCycle: targetCycle,
        customPrice,
      }));

      // Was the running window already paid? Paid days must never be
      // discarded — schedule the change for the period end instead.
      // (A future-starting invoice — activation during the trial — also
      // covers the window, so match by overlap with the subscription, not
      // strictly by "covers today".)
      let windowPaid = false;
      if (hasLiveWindow) {
        windowPaid = !!(await env.DB.prepare(
          `SELECT id FROM center_invoices WHERE center_id = ? AND status = 'paid' AND period_end > ? AND period_start <= ? LIMIT 1`
        ).bind(centerId, now, existingEnd).first());
      }

      const forceScheduled = String(body.mode || '').trim() === 'scheduled';
      if (forceScheduled || (hasLiveWindow && windowPaid)) {
        try {
          await env.DB.prepare(
            `UPDATE center_plan_schedules SET status = 'cancelled', notes = COALESCE(notes, '') || ' — superseded' WHERE center_id = ? AND status = 'pending'`
          ).bind(centerId).run();
          const applyAt = hasLiveWindow ? existingEnd : null;
          await env.DB.prepare(`
            INSERT INTO center_plan_schedules (id, center_id, to_plan, to_billing_cycle, to_enabled_modules, to_monthly_price, status, apply_at, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
          `).bind(
            crypto.randomUUID(), centerId, targetPlan, targetCycle, JSON.stringify(targetModules),
            periodAmount || null,
            applyAt,
            forceScheduled
              ? `Changement programmé par l'administrateur: ${planLabel(targetPlan)} (${targetCycle})`
              : `Période déjà payée — ${planLabel(targetPlan)} (${targetCycle}) programmé pour la fin de la période`,
            now
          ).run();
          return json({
            success: true,
            mode: 'scheduled',
            applyAt,
            amount: periodAmount,
            reason: forceScheduled ? 'manual' : windowPaid ? 'window_paid' : 'active_window',
            message: applyAt
              ? `Changement programmé pour le ${fmtFr(applyAt)} — la période payée reste inchangée.`
              : 'Changement programmé pour la prochaine reconduction.',
          });
        } catch {
          // Never apply a paid-window change immediately as a fallback — that
          // would discard paid days. Fail loudly instead.
          return json({ error: 'Impossible d’enregistrer le changement programmé (table center_plan_schedules absente — appliquez la migration 0027).' }, 503);
        }
      }

      // Immediate replacement: the window is NOT paid (or the center is in
      // trial / expired / never subscribed) → cancel every pending/overdue
      // invoice and create ONE new invoice for the fresh window at the new
      // plan's price. A trial center gets activated through this same action.
      await env.DB.prepare(
        `UPDATE center_invoices SET status = 'cancelled' WHERE center_id = ? AND status IN ('pending','overdue')`
      ).bind(centerId).run();
      try {
        await env.DB.prepare(
          `UPDATE center_plan_schedules SET status = 'cancelled', notes = COALESCE(notes, '') || ' — superseded' WHERE center_id = ? AND status = 'pending'`
        ).bind(centerId).run();
      } catch { /* schedules table missing (migration 0027) */ }

      const base = center.status === 'trial' && Number(center.trial_ends_at) > now
        ? Number(center.trial_ends_at)
        : now;
      const duration = targetCycle === 'annual' ? 365 : 30;
      const periodEnd = base + duration * DAY_MS;

      await env.DB.prepare(`
        UPDATE centers
        SET plan = ?, billing_cycle = ?, monthly_price = ?, enabled_modules = ?,
            subscription_ends_at = ?, status = 'active'
        WHERE id = ?
      `).bind(
        targetPlan, targetCycle, periodAmount, JSON.stringify(targetModules),
        periodEnd, centerId
      ).run();

      let invoice: { invoiceNumber: string; amount: number } | null = null;
      if (periodAmount > 0) {
        const tag = center.status === 'trial'
          ? 'activation après la période d’essai'
          : center.status === 'active'
            ? 'plan modifié en cours de période (facture en attente remplacée)'
            : 'reprise de l’abonnement';
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        const invoiceNumber = invoiceNumberFor(createdAt);
        const notes = `Abonnement ${planLabel(targetPlan)} (${targetCycle}) — ${fmtFr(base)} → ${fmtFr(periodEnd)} · ${tag}`;
        await env.DB.prepare(`
          INSERT INTO center_invoices (id, center_id, invoice_number, period_start, period_end, amount, status, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).bind(id, centerId, invoiceNumber, base, periodEnd, periodAmount, notes, createdAt).run();
        invoice = { invoiceNumber, amount: periodAmount };
      }

      return json({
        success: true,
        mode: center.status === 'trial' ? 'activated' : 'replaced',
        plan: targetPlan === 'starter' ? 'basic' : targetPlan,
        billingCycle: targetCycle,
        amount: periodAmount,
        subscriptionEndsAt: periodEnd,
        invoice,
        message: invoice
          ? `Facture ${invoice.invoiceNumber} créée (${invoice.amount.toFixed(2)} TND) — en attente de paiement.`
          : 'Abonnement mis à jour.',
      });
    }

    return json({ error: 'Action inconnue.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في تحديث الخطة.' }, 500);
  }
};
