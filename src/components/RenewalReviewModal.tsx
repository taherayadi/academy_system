import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import {Receipt, CalendarClock, Trash2, Check, X, Loader2, Info } from 'lucide-react';
import {
  fetchCenterPlansApi, centerPlanActionApi, updateCenterApi,
  decideRenewalRequestApi, fetchModulePricesApi, CenterPlansView,
} from '../api';
import type { ModuleKey, RenewalRequest } from '../types';
import { analyzePlanChange, ClientPlanDecision } from '../utils/planChange';
import { useToast } from './Toast';

// ─── Catalogue & helpers — same values as Plans & factures ──────────────────
const BUNDLED_MODULE_KEY = 'studentTimeSheets';
const ALL_MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'scolaire', label: 'مدرسي' },
  { key: 'finance', label: 'مالية' },
  { key: 'etude', label: 'مراجعة مشرفة' },
  { key: 'coursParticuliers', label: 'دروس خاصة' },
  { key: 'revision', label: 'مراجعة الامتحانات' },
  { key: 'formations', label: 'دورات' },
  { key: 'cantine', label: 'مقصف / وجبات' },
  { key: 'transport', label: 'نقل' },
  { key: 'events', label: 'مناسبات' },
  { key: 'bibliotheque', label: 'مكتبة' },
  { key: 'studentTimeSheets', label: 'سجل الدوام' },
  { key: 'staff', label: 'الموظفون' },
];
const MODULE_LABEL = (key: string) => ALL_MODULES.find(m => m.key === key)?.label || key;

function normalizeCenterModules(modules?: string[] | null): string[] {
  const set = new Set(['scolaire', 'finance', 'studentTimeSheets', ...(Array.isArray(modules) ? modules : [])]);
  return Array.from(set);
}

const RENEWAL_STATUS_LABEL: Record<string, string> = {
  trial: 'تجربة', active: 'نشط', suspended: 'موقوف', expired: 'منتهٍ',
};

const PLAN_LABEL: Record<string, string> = {
  starter: 'Basic', basic: 'Basic', growth: 'Growth', pro: 'Pro', custom: 'Custom',
};
const PLAN_BADGE: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600 border border-slate-200',
  basic: 'bg-slate-100 text-slate-600 border border-slate-200',
  growth: 'bg-slate-100 text-slate-600 border border-slate-200',
  pro: 'bg-slate-100 text-slate-600 border border-slate-200',
  custom: 'bg-accent-500/10 text-accent-500 border border-accent-500/20',
};

const PLAN_HISTORY_LABEL: Record<string, { text: string; tone: StatusTone }> = {
  center_created: { text: 'إنشاء', tone: 'neutral' },
  plan_set: { text: 'تطبيق الباقة', tone: 'brand' },
  plan_activated: { text: 'تفعيل الاشتراك', tone: 'brand' },
  plan_renewed: { text: 'تجديد', tone: 'brand' },
  plan_settled: { text: 'تسوية', tone: 'brand' },
  plan_scheduled: { text: 'باقة مجدولة', tone: 'warning' },
  plan_applied: { text: 'تطبيق البرنامج', tone: 'brand' },
  schedule_cancelled: { text: 'إلغاء البرنامج', tone: 'neutral' },
  plan_removed: { text: 'إلغاء الاشتراك', tone: 'error' },
  trial_added: { text: 'أيام مقدمة', tone: 'brand' },
  renewal_approved: { text: 'قبول التجديد', tone: 'brand' },
  renewal_upgrade: { text: 'قبول تغيير الباقة', tone: 'brand' },
};

const AUTOMATIC_PLAN_KEYS = ['basic', 'growth', 'pro'];
const ANNUAL_DISCOUNT = 0.2;

function currentSchoolYear(): string {
  const d = new Date();
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${y + 1}`;
}

import { fmtDate, arPlural } from '../utils/format';
import { StatusTone, toneClasses } from './ui/StatusBadge';
import { FormField } from './ui/FormField';

function formatTnd(value: number): string {
  return `${value.toLocaleString('ar-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;
}

function calculateModuleTotal(enabledModules: string[], modulePrices: Record<string, number>): number {
  // Bibliothèque désactivée pour l'instant : jamais facturée.
  return enabledModules.reduce((total, key) => (
    total + (key === BUNDLED_MODULE_KEY || key === 'bibliotheque' ? 0 : (Number(modulePrices[key]) || 0))
  ), 0);
}

function calculatePlanTariff(plan: string, billingCycle: 'monthly' | 'annual', enabledModules: string[], modulePrices: Record<string, number>, manualTariff = 0): number {
  if (plan === 'custom') return Math.max(0, Number(manualTariff) || 0);
  if (!AUTOMATIC_PLAN_KEYS.includes(plan)) return 0;
  const monthlyTotal = calculateModuleTotal(enabledModules, modulePrices);
  return billingCycle === 'annual' ? monthlyTotal * 12 * (1 - ANNUAL_DISCOUNT) : monthlyTotal;
}

function addSubscriptionPeriod(timestamp: number, billingCycle: 'monthly' | 'annual'): number {
  return timestamp + (billingCycle === 'annual' ? 365 : 30) * 86400000;
}

interface PlanDraft { plan: string; billingCycle: 'monthly' | 'annual'; monthlyPrice: string }

interface RenewalReviewModalProps {
  request: RenewalRequest;
  onClose: () => void;
  /** Called after the request was approved/rejected (parent reloads lists). */
  onDecided: () => void | Promise<void>;
}

/**
 * « Examiner et appliquer » — même moteur que « Plans & factures », pré-rempli
 * depuis la demande du centre : fenêtre payée / non payée → analyzePlanChange
 * → règlement immédiat au prorata (updateCenterApi + settlementPolicy) ou
 * programmation à l'échéance, empilement d'une période pour un renouvellement
 * à l'identique, facture créée, échéances recalculées, historique.
 */
export default function RenewalReviewModal({ request, onClose, onDecided }: RenewalReviewModalProps) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [view, setView] = useState<CenterPlansView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [draft, setDraft] = useState<PlanDraft>({ plan: 'basic', billingCycle: 'monthly', monthlyPrice: '' });
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [modulePrices, setModulePrices] = useState<Record<string, number>>({});
  const [pricesReady, setPricesReady] = useState(false);
  const [applyChoice, setApplyChoice] = useState<'settle' | 'schedule'>('settle');
  const [paymentState, setPaymentState] = useState<'paid' | 'unpaid'>('unpaid');
  const [decisionNote, setDecisionNote] = useState('');

  const isDecided = request.status !== 'pending';

  // Module prices drive the live tariff preview (same convention as the
  // Tarifs page: unknown modules default to 15, Jd. Horaires is free).
  useEffect(() => {
    let mounted = true;
    fetchModulePricesApi(currentSchoolYear()).then(prices => {
      if (!mounted) return;
      const map: Record<string, number> = {};
      ALL_MODULES.forEach(m => { map[m.key] = 15; });
      (prices || []).forEach(p => { map[p.module_key] = Number(p.price) || 0; });
      map[BUNDLED_MODULE_KEY] = 0;
      setModulePrices(map);
      setPricesReady(true);
    }).catch(() => { if (mounted) setPricesReady(true); });
    return () => { mounted = false; };
  }, []);

  /** Prefill from the center's request (never from the current plan). */
  const draftFromRequest = useCallback((v: CenterPlansView) => {
    const plan = request.requestedPlan === 'starter' || !request.requestedPlan ? 'basic' : request.requestedPlan;
    setDraft({
      plan,
      billingCycle: request.billingCycle || 'monthly',
      monthlyPrice: plan === 'custom' && request.amount != null
        ? String(request.amount)
        : String(v.center.monthlyPrice ?? ''),
    });
    setEnabledModules(normalizeCenterModules(request.requestedModules));
  }, [request.requestedPlan, request.billingCycle, request.amount, request.requestedModules]);

  const reload = useCallback(async () => {
    try {
      const data = await fetchCenterPlansApi(request.centerId);
      setView(data);
      draftFromRequest(data);
      // Paid detection covers invoices whose period starts in the future
      // (activation chosen during the trial) — they DO cover the window.
      const nowTs = Date.now();
      const endTs = data.center.subscriptionEndsAt || 0;
      const paid = (data.invoices || []).some(inv =>
        inv.status === 'paid' && inv.periodEnd > nowTs && (!endTs || inv.periodStart <= endTs)
      );
      setPaymentState(paid ? 'paid' : 'unpaid');
    } catch (err) {
      toastRef.current.error(err instanceof Error ? err.message : 'خطأ في تحميل الاشتراك');
    } finally {
      setLoading(false);
    }
  }, [request.centerId, draftFromRequest]);

  useEffect(() => { reload(); }, [reload]);

  const now = Date.now();
  const liveEnd = view?.center.subscriptionEndsAt || 0;
  const centerStatus = view?.center.status || '';
  // A removed plan keeps its (possibly future) end date in the DB — the
  // 'expired' status must win, otherwise the delete button stays enabled
  // and relaunches get mis-routed through the mid-period engine (which
  // never re-activates).
  const hasLiveWindow = !!view && liveEnd > now && centerStatus !== 'expired' && centerStatus !== 'trial';
  const isTrial = centerStatus === 'trial';
  const expiredState = !!view && !isTrial && !hasLiveWindow
    && (view.center.status === 'expired' || (liveEnd > 0 && liveEnd <= now));
  const windowPaidInvoice = (view?.invoices || []).find(inv =>
    inv.status === 'paid' && inv.periodEnd > now && (!liveEnd || inv.periodStart <= liveEnd)
  ) || null;
  const pendingInvoice = (view?.invoices || []).find(inv =>
    (inv.status === 'pending' || inv.status === 'overdue') && inv.periodEnd > now
  ) || null;

  // ── Live decision (mid-period rules) shared with the plan-change engine ──
  const automaticPlan = AUTOMATIC_PLAN_KEYS.includes(draft.plan);
  const calculatedTariff = calculatePlanTariff(
    draft.plan, draft.billingCycle, enabledModules, modulePrices, Number(draft.monthlyPrice) || 0
  );
  const decision: ClientPlanDecision = (pricesReady && view)
    ? analyzePlanChange({
      plan: view.center.plan,
      billingCycle: view.center.billingCycle || 'monthly',
      monthlyPrice: view.center.monthlyPrice,
      enabledModules: normalizeCenterModules(view.center.enabledModules),
      status: view.center.status,
      subscriptionEndsAt: view.center.subscriptionEndsAt,
    }, {
      plan: draft.plan as 'basic' | 'growth' | 'pro' | 'custom',
      billingCycle: draft.billingCycle,
      enabledModules,
      manualPrice: Number(draft.monthlyPrice) || 0,
    }, modulePrices)
    : { kind: 'no_change' };
  const midPeriod = decision.kind === 'mid_period_increase'
    || decision.kind === 'mid_period_decrease'
    || decision.kind === 'mid_period_same_price';
  const settlementRelevant = decision.kind === 'mid_period_increase';
  const scheduleOnly = decision.kind === 'mid_period_decrease';
  const effectiveApplyChoice = scheduleOnly ? 'schedule' : applyChoice;
  const billingCycleChanged = draft.billingCycle !== (view?.center.billingCycle || 'monthly');

  /** Same-plan renewal on a live window: stack one full period from the end date. */
  const isPureRenewalExtension = decision.kind === 'no_change'
    && request.kind === 'renewal' && hasLiveWindow;
  const previewNewEnd = isPureRenewalExtension
    ? addSubscriptionPeriod(liveEnd, draft.billingCycle)
    : null;

  const extendsSubscription = !hasLiveWindow || billingCycleChanged || decision.kind === 'renewal' || isPureRenewalExtension;

  const planTitle = view ? (PLAN_LABEL[view.center.plan] || view.center.plan || 'لا توجد باقة') : '—';

  /** Read-only recap of the requested plan/cycle/modules — the platform applies
   *  the center's request as-is (the offer REPLACES the current plan). */
  const renderRequestedPlan = () => (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 flex flex-col justify-center">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">الباقة المطلوبة</span>
          <span data-testid="review-apply-plan" className="text-sm font-black text-slate-900">
            {PLAN_LABEL[draft.plan] || draft.plan}
          </span>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 flex flex-col justify-center">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">الدورة المطلوبة</span>
          <span data-testid="review-apply-cycle" className="text-sm font-black text-slate-900">
            {draft.billingCycle === 'annual' ? 'سنوي — خصم 20%' : 'شهري'}
          </span>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 flex flex-col justify-center">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">التعرفة {draft.billingCycle === 'annual' ? 'السنوية' : 'الشهرية'} المحسوبة</span>
          <span data-testid="review-apply-tariff" className="text-sm font-black text-accent-500">
            {formatTnd(automaticPlan ? calculatedTariff : (Number(draft.monthlyPrice) || 0))} · {draft.billingCycle === 'annual' ? 'دينار/سنة' : 'دينار/شهر'}
          </span>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">الوحدات المطلوبة</p>
        <div data-testid="review-apply-modules" className="flex flex-wrap gap-1.5">
          {enabledModules.map(key => (
            <span key={key} className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-accent-500 text-white border border-accent-500 inline-flex items-center gap-1">
              {MODULE_LABEL(key)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  /** Accept: apply the plan through the Plans & factures engine, then record the decision. */
  const submitApprove = async () => {
    if (!view || saving || rejecting || isDecided) return;
    // Trial activation or relaunch of an expired/suspended center: fresh
    // period starting now, ONE pending invoice (marked paid in Finance).
    if (isTrial || !hasLiveWindow) {
      setSaving(true);
      try {
        const res = await centerPlanActionApi({
          action: 'set-plan',
          centerId: request.centerId,
          plan: draft.plan,
          billingCycle: draft.billingCycle,
          enabledModules,
          ...(draft.plan === 'custom' ? { monthlyPrice: Number(draft.monthlyPrice) || 0 } : {}),
        });
        toast.success(res.message || (isTrial ? 'تفعيل الاشتراك' : 'استئناف الاشتراك'));
        // The plan was just applied: record the decision without re-applying.
        await decideRenewalRequestApi(request.id, 'approved', decisionNote, { skipApply: true });
        await onDecided();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'خطأ في تحديث الباقة');
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      if (isPureRenewalExtension) {
        // Same-plan renewal: stack one full period from the current end date.
        const outcome = await updateCenterApi(request.centerId, {
          plan: draft.plan,
          billingCycle: draft.billingCycle,
          enabledModules,
          ...(draft.plan === 'custom' ? { monthlyPrice: Number(draft.monthlyPrice) || 0 } : {}),
          autoCalculatePrice: true,
          autoCalculateSubscription: true,
        });
        const change = outcome?.planChange;
        const newEnd = change?.newSubscriptionEndsAt || previewNewEnd;
        toast.success(
          `تم تطبيق التجديد${newEnd ? ` — تاريخ استحقاق جديد: ${fmtDate(newEnd)}` : ''}` +
          (change?.invoice ? ` — فاتورة ${change.invoice.invoiceNumber} (${formatTnd(change.invoice.amount)})` : '')
        );
      } else if (scheduleOnly || effectiveApplyChoice === 'schedule') {
        const outcome = await updateCenterApi(request.centerId, {
          scheduleChange: {
            plan: draft.plan,
            billingCycle: draft.billingCycle,
            enabledModules,
            ...(draft.plan === 'custom' ? { monthlyPrice: Number(draft.monthlyPrice) || 0 } : {}),
          },
        });
        const applyAt = outcome?.planChange?.applyAt;
        toast.success(applyAt
          ? `تغيير مبرمج ليوم ${fmtDate(applyAt)} — الفترة المدفوعة تبقى كما هي.`
          : 'تغيير مبرمج عند التجديد القادم.');
      } else {
        const outcome = await updateCenterApi(request.centerId, {
          plan: draft.plan,
          billingCycle: draft.billingCycle,
          enabledModules,
          ...(draft.plan === 'custom' ? { monthlyPrice: Number(draft.monthlyPrice) || 0 } : {}),
          autoCalculatePrice: true,
          autoCalculateSubscription: extendsSubscription,
          ...(settlementRelevant ? { settlementPolicy: paymentState } : {}),
        });
        const settlement = outcome?.planChange?.settlement;
        if (settlement && !settlement.skipped && settlement.amount > 0) {
          toast.success(
            `تسوية ${formatTnd(settlement.amount)} — ${settlement.paid ? 'فرق السعر (الفترة مدفوعة مسبقًا)' : 'فاتورة جديدة، وأُلغيت القديمة المعلقة'}`
            + `${settlement.invoiceNumber ? ` (${settlement.invoiceNumber})` : ''}.`
          );
        } else {
          toast.success('تم تحديث الباقة.');
        }
      }
      // The plan was just applied: record the decision without re-applying.
      await decideRenewalRequestApi(request.id, 'approved', decisionNote, { skipApply: true });
      await onDecided();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في تحديث الباقة');
    } finally {
      setSaving(false);
    }
  };

  const submitReject = async () => {
    if (saving || rejecting || isDecided) return;
    setRejecting(true);
    try {
      await decideRenewalRequestApi(request.id, 'rejected', decisionNote);
      toast.success('تم رفض طلب التجديد.');
      await onDecided();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ أثناء الرفض');
    } finally {
      setRejecting(false);
    }
  };

  const removeSchedule = async (scheduleId: string) => {
    setSaving(true);
    try {
      const res = await centerPlanActionApi({ action: 'remove-schedule', centerId: request.centerId, scheduleId });
      toast.success(res.message || 'تم حذف الباقة المجدولة');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ أثناء إلغاء البرنامج');
    } finally {
      setSaving(false);
    }
  };

  const formTitle = isTrial
    ? 'تفعيل الاشتراك'
    : !hasLiveWindow
      ? 'اشتراك جديد — تبدأ الفترة من اليوم'
      : 'استبدال الباقة الحالية';

  const requestedModules = useMemo(
    () => normalizeCenterModules(request.requestedModules),
    [request.requestedModules]
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-accent-500" /> مراجعة وتطبيق
            </h2>
            <p className="text-[11px] font-bold text-slate-500 truncate">
              {request.centerName || request.centerId}
              {' · '}طلب بتاريخ {fmtDate(request.createdAt)}
            </p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center flex-shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : !view ? (
          <p className="text-center text-sm font-bold text-slate-500 py-16">البيانات غير متاحة</p>
        ) : (
          <div className="p-5 space-y-4">
            {/* ── Demande du centre ── */}
            <div className="rounded-2xl border-2 border-amber-200/70 bg-amber-50/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                  request.kind === 'upgrade' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'
                }`}>
                  {request.kind === 'upgrade' ? 'تغيير الباقة' : 'تجديد'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                  request.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : request.status === 'approved' ? 'bg-accent-500/[0.06] text-accent-700 border-accent-500/20'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {request.status === 'pending' ? 'قيد الانتظار' : request.status === 'approved' ? 'مقبولة' : 'مرفوضة'}
                </span>
                <span className="text-[11px] font-bold text-slate-600">
                  {RENEWAL_STATUS_LABEL[request.currentStatus] || request.currentStatus || '—'}
                  {' · '}{PLAN_LABEL[request.currentPlan] || request.currentPlan || '—'}
                  {' → '}<span className="font-black text-accent-500">{PLAN_LABEL[request.requestedPlan] || request.requestedPlan}</span>
                  {' · '}{request.billingCycle === 'annual' ? 'سنوي' : 'شهري'}
                  {request.amount != null ? ` · ${formatTnd(request.amount)} تقديرية` : ''}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {requestedModules.map(m => (
                  <span key={m} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
                    {MODULE_LABEL(m)}
                  </span>
                ))}
              </div>
              {request.note && (
                <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-[11px] font-semibold text-slate-600">« {request.note} »</p>
              )}
              {isDecided && (
                <p className="mt-2 text-[11px] font-semibold text-slate-500">
                  تمت المعالجة{request.decidedBy ? ` بواسطة ${request.decidedBy}` : ''}{request.decidedAt ? ` في ${fmtDate(request.decidedAt)}` : ''}
                  {request.decisionNote ? ` — « ${request.decisionNote} »` : ''}
                </p>
              )}
            </div>

            {/* ── Abonnement en cours ── */}
            <div className="rounded-2xl border-2 border-slate-200/70 p-4 bg-slate-50/50">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em]">
                  {isTrial ? 'فترة تجريبية' : 'اشتراك جارٍ'}
                </p>
                {hasLiveWindow && (
                  <span className={`ms-auto text-[11px] font-bold px-2 py-0.5 rounded-full ${windowPaidInvoice ? 'bg-accent-500/10 text-accent-700' : pendingInvoice ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                    {windowPaidInvoice ? 'فترة مدفوعة' : pendingInvoice ? 'فترة غير مدفوعة' : 'بدون فاتورة'}
                  </span>
                )}
                {expiredState && (
                  <span className="ms-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">منتهٍ</span>
                )}
              </div>
              {isTrial ? (
                <p className="text-sm font-black text-amber-700">
                  Essai jusqu’au {view.center.trialEndsAt ? fmtDate(view.center.trialEndsAt) : '—'}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full ${PLAN_BADGE[view.center.plan] || PLAN_BADGE.starter}`}>
                      {planTitle}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
                      {view.center.billingCycle === 'annual' ? 'سنوي' : 'شهري'}
                      {view.center.monthlyPrice > 0 ? ` · ${view.center.monthlyPrice.toFixed(2)} TND` : ''}
                    </span>
                  </div>
                  {expiredState ? (
                    <p className="text-[11px] font-bold text-red-600 mt-1.5">
                      {centerStatus === 'expired' && liveEnd > now
                        ? `حُذف الاشتراك في ${fmtDate(now)} — استأنف باقة للفوترة من جديد.`
                        : <>انتهى الاشتراك{liveEnd > 0 ? ` في ${fmtDate(liveEnd)}` : ''} — استأنف باقة للفوترة من جديد.</>}
                    </p>
                  ) : (
                    <p className="text-[11px] font-semibold text-slate-500 mt-1.5">
                      Fin de l’abonnement : {liveEnd > 0 ? fmtDate(liveEnd) : '—'}
                    </p>
                  )}
                  {!expiredState && pendingInvoice && (
                    <p className="text-[11px] font-bold text-amber-700 mt-1.5">
                      Facture {pendingInvoice.invoiceNumber} —{' '}
                      {pendingInvoice.status === 'overdue' ? 'متأخرة' : 'قيد الانتظار'} · {pendingInvoice.amount.toFixed(2)} TND
                    </p>
                  )}
                  {!expiredState && windowPaidInvoice && (
                    <p className="text-[11px] font-bold text-accent-700 mt-1.5">
                      فاتورة {windowPaidInvoice.invoiceNumber} مدفوعة · {windowPaidInvoice.amount.toFixed(2)} دينار
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Offre à appliquer (demande du centre, affichée seule — non modifiable) ── */}
            {!isDecided && (
              <div className="rounded-2xl border-2 p-4 space-y-3 border-accent-500/20 bg-accent-500/[0.04]">
                <p className="text-xs font-black text-slate-700">{formTitle}</p>
                {renderRequestedPlan()}

                {/* Mid-period consequence — settlement (difference) vs schedule */}
                {midPeriod && decision.kind !== 'mid_period_same_price' && (
                  <div className="rounded-xl bg-white border border-slate-200 px-3.5 py-3 space-y-2.5">
                    <p className="text-[11px] font-black text-slate-700">
                      تغيير خلال الفترة الجارية —{' '}
                      {decision.kind === 'mid_period_increase' ? 'إلى أعلى' : 'إلى أسفل'}
                      {decision.kind === 'mid_period_increase' && (
                        <> · ${arPlural(decision.remainingDays, 'يوم متبقٍ', 'يومان متبقيان', 'أيام متبقية', 'يومًا متبقيًا')} على الفترة المدفوعة</>
                      )}
                    </p>
                    {settlementRelevant ? (
                      <>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <button type="button" onClick={() => setApplyChoice('settle')}
                            className={`text-start rounded-xl border-2 px-3 py-2.5 transition cursor-pointer ${applyChoice === 'settle' ? 'border-accent-500 bg-white shadow-md shadow-accent-500/10' : 'border-slate-200 bg-white/60 hover:border-accent-500/40'}`}>
                            <div className="text-[11px] font-black text-slate-800">تطبيق الآن</div>
                            <div className="text-[11px] font-semibold text-slate-500 mt-1">نهاية الاشتراك دون تغيير · تسوية بالتناسب مع الأيام المستهلكة</div>
                          </button>
                          <button type="button" onClick={() => setApplyChoice('schedule')}
                            className={`text-start rounded-xl border-2 px-3 py-2.5 transition cursor-pointer ${applyChoice === 'schedule' ? 'border-accent-500 bg-white shadow-md shadow-accent-500/10' : 'border-slate-200 bg-white/60 hover:border-accent-500/40'}`}>
                            <div className="text-[11px] font-black text-slate-800">جدولة ليوم {hasLiveWindow ? fmtDate(liveEnd) : 'عند التجديد'}</div>
                            <div className="text-[11px] font-semibold text-slate-500 mt-1">تبقى الباقة الحالية سارية حتى نهاية الفترة</div>
                          </button>
                        </div>
                        {effectiveApplyChoice === 'settle' && (
                          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                            <p className="text-[11px] font-black text-slate-600 mb-1.5">Facturation actuelle : {formatTnd(decision.oldAmount)} → nouveau : {formatTnd(decision.newAmount)}</p>
                            <div className="grid sm:grid-cols-2 gap-2">
                              <button type="button" onClick={() => setPaymentState('paid')}
                                className={`text-start rounded-xl border-2 px-3 py-2 transition cursor-pointer ${paymentState === 'paid' ? 'border-accent-500 bg-accent-500/[0.06]' : 'border-slate-200 bg-white hover:border-accent-500/40'}`}>
                                <div className="text-[11px] font-black text-accent-700">الفترة مدفوعة</div>
                                <div className="text-sm font-black text-accent-700">+ {formatTnd(decision.paidAmount)}</div>
                                <div className="text-[11px] font-semibold text-slate-500">الفرق = فرق السعر × الأيام المتبقية</div>
                              </button>
                              <button type="button" onClick={() => setPaymentState('unpaid')}
                                className={`text-start rounded-xl border-2 px-3 py-2 transition cursor-pointer ${paymentState === 'unpaid' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-400'}`}>
                                <div className="text-[11px] font-black text-amber-800">الفترة غير مدفوعة بعد</div>
                                <div className="text-sm font-black text-amber-700">{formatTnd(decision.unpaidAmount)}</div>
                                <div className="text-[11px] font-semibold text-slate-500">تُلغى الفاتورة القديمة المعلقة وتُستبدل</div>
                              </button>
                            </div>
                            {!windowPaidInvoice && paymentState !== 'unpaid' && (
                              <p className="text-[11px] font-semibold text-slate-500 mt-1.5">
                                مكتشف: لا توجد فاتورة مدفوعة تغطي الفترة — الخيار «غير مدفوعة بعد» يناسب حالتك.
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[11px] font-semibold text-amber-800 leading-relaxed">
                        الفترة الحالية مدفوعة مسبقًا بالتعرفة الحالية: خفض الباقة لا يمكن تعويضه نقدًا — سيُطبَّق في نهاية الفترة ({hasLiveWindow ? fmtDate(liveEnd) : 'التجديد القادم'})، دون تعويض ودون أيام تضيع.
                      </div>
                    )}
                  </div>
                )}

                {/* Same-plan renewal: stack one full period from the current end date. */}
                {isPureRenewalExtension && previewNewEnd && (
                  <div className="rounded-xl bg-white border border-accent-500/25 px-3.5 py-3">
                    <p className="text-[11px] font-black text-slate-700">تجديد مطابق</p>
                    <p className="text-[11px] font-semibold text-slate-500 leading-relaxed mt-1">
                      ستُمَدَّد الفترة بدورة كاملة من تاريخ الاستحقاق الحالي — النهاية الجديدة في {fmtDate(previewNewEnd)}.
                      ستُنشأ فاتورة «قيد الانتظار» ويبقى المركز نشطًا باستمرار.
                    </p>
                  </div>
                )}

                {!midPeriod && !isPureRenewalExtension && !isTrial && hasLiveWindow && (
                  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                    {windowPaidInvoice
                      ? 'الفاتورة المدفوعة للفترة الحالية لن تتغير.'
                      : pendingInvoice
                        ? `الفاتورة قيد الانتظار ${pendingInvoice.invoiceNumber} ستُستبدل بفاتورة جديدة وفق تعرفة الباقة المختارة (بدون خصم مزدوج).`
                        : 'ستُنشأ فاتورة «قيد الانتظار» للفترة الحالية.'}
                  </p>
                )}
                {(isTrial || !hasLiveWindow) && (
                  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                    ستُنشأ فاتورة جديدة «قيد الانتظار» للفترة الأولى — علّمها كمدفوعة في SaaS → المالية عندما يسدّد العميل.
                  </p>
                )}
              </div>
            )}

            {/* ── Note de décision ── */}
            {!isDecided && (
              <FormField label="ملاحظة تُرسل إلى المركز (اختياري)" id="rr-note"
                labelClassName="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
                <input id="rr-note"
                  value={decisionNote}
                  onChange={e => setDecisionNote(e.target.value)}
                  placeholder="مثال: تم تفعيل باقة Growth وأُرسلت الفاتورة بالبريد…"
                  maxLength={500}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:border-accent-500 outline-none"
                />
              </FormField>
            )}

            {/* ── Plans programmés ── */}
            <div>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2">
                باقات مجدولة ({view.schedules.length})
              </p>
              {view.schedules.length === 0 ? (
                <p className="text-[11px] font-semibold text-slate-500">لا توجد باقات مجدولة.</p>
              ) : (
                <div className="space-y-2">
                  {view.schedules.map(s => (
                    <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                      <CalendarClock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      <span className="text-xs font-black text-slate-800">{PLAN_LABEL[s.plan === 'starter' ? 'basic' : s.plan] || s.plan}</span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {s.billingCycle === 'annual' ? 'سنوي' : 'شهري'}
                        {s.monthlyPrice ? ` · ${Number(s.monthlyPrice).toFixed(2)} TND` : ''}
                      </span>
                      <span className="ms-auto text-[11px] font-bold text-slate-500">
                        {s.applyAt ? `في ${fmtDate(s.applyAt)}` : 'عند التجديد القادم'}
                      </span>
                      {!isDecided && (
                        <button onClick={() => removeSchedule(s.id)}
                          disabled={saving}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer disabled:opacity-50" title="حذف هذه الباقة المجدولة" aria-label="حذف هذه الباقة المجدولة">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Historique des plans (audit trail, migration 0029) ── */}
            <div>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2">
                Historique des plans ({(view.history || []).length})
              </p>
              {(view.history || []).length === 0 ? (
                <p className="text-[11px] font-semibold text-slate-500">لا توجد أنشطة مسجلة.</p>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="min-w-[560px] w-full" dir="ltr">
                    <thead>
                      <tr className="bg-slate-50 text-start text-[11px] font-black uppercase tracking-wider text-slate-500">
                        <th scope="col" className="px-3 py-2">التاريخ</th>
                        <th scope="col" className="px-3 py-2">الإجراء</th>
                        <th scope="col" className="px-3 py-2">التفاصيل</th>
                        <th scope="col" className="px-3 py-2 text-end">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(view.history || []).map(h => {
                        const meta = PLAN_HISTORY_LABEL[h.action] || { text: h.action, tone: 'neutral' as StatusTone };
                        return (
                          <tr key={h.id} className="border-t border-slate-100 align-top">
                            <td className="px-3 py-2 text-[11px] font-bold text-slate-500 whitespace-nowrap">{fmtDate(h.createdAt)}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${toneClasses(meta.tone)}`}>{meta.text}</span>
                            </td>
                            <td className="px-3 py-2 text-[11px] font-semibold text-slate-600">
                              {h.details}{h.invoiceNumber ? ` · ${h.invoiceNumber}` : ''}
                            </td>
                            <td className="px-3 py-2 text-[11px] font-black text-slate-700 whitespace-nowrap text-end">
                              {h.amount ? formatTnd(h.amount) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Actions ── */}
            <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
              <button
                onClick={onClose}
                className="rounded-xl px-5 py-2.5 text-[13px] font-bold text-slate-500 transition hover:bg-slate-100 cursor-pointer"
              >
                {isDecided ? 'إغلاق' : 'إلغاء'}
              </button>
              {!isDecided && (
                <p className="flex items-start gap-1.5 text-[11px] font-semibold text-slate-500 mb-3">
                  <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-accent-500" aria-hidden="true" />
                  <span>القبول يطبّق القرار فورًا — تجديد الاشتراك أو تغيير الباقة مع تحديث الفوترة؛ والرفض يُغلق الطلب دون تغيير.</span>
                </p>
              )}
              {!isDecided && (
                <>
                  <button
                    onClick={submitReject}
                    disabled={rejecting || saving}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-accent-500/10 px-5 py-2.5 text-[13px] font-bold text-accent-500 transition hover:bg-accent-500/20 disabled:opacity-60 cursor-pointer"
                  >
                    {rejecting ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                    رفض
                  </button>
                  <button
                    onClick={submitApprove}
                    disabled={saving || rejecting}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-accent-500 px-5 py-2.5 text-[13px] font-bold text-white shadow-lg shadow-accent-500/25 transition hover:shadow-xl hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    {effectiveApplyChoice === 'schedule' && !isTrial && hasLiveWindow
                      ? `قبول وجدولة ليوم ${fmtDate(liveEnd)}`
                      : 'قبول وتطبيق'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
