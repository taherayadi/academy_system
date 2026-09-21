import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { Clock, CalendarClock, Trash2, Check, X, Loader2, Receipt, Edit } from 'lucide-react';
import { updateCenterApi, fetchModulePricesApi, fetchCenterPlansApi, centerPlanActionApi, CenterPlansView } from '../../api';
import { CenterTenant } from '../../types';
import { analyzePlanChange, ClientPlanDecision } from '../../utils/planChange';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import { StatusBadge } from '../ui';
import { StatusTone, toneClasses } from '../ui/StatusBadge';
import { fmtDate, arPlural } from '../../utils/format';
import { currentSchoolYear, ALL_MODULES, BUNDLED_MODULE_KEY, normalizeCenterModules, AUTOMATIC_PLAN_KEYS, calculatePlanTariff, SELECTABLE_MODULE_KEYS, BASIC_MODULE_KEYS, isBaseModule, formatTnd, PLAN_LABEL, isModuleHidden, PLAN_BADGE, PLAN_HISTORY_LABEL } from './constants';

// ─── Plan manager per center (Plans & factures) ─────────────────────────────
// All subscription operations live here (the center edit is basic info only).
// Updating the CURRENT plan reuses the established mid-period rules:
//   • window already PAID  → the paid invoice is never touched; the settlement
//     (prorated difference for the remaining used days) or a schedule at the
//     period end is proposed, and the end date never moves;
//   • window NOT paid      → the old pending invoice is cancelled and replaced
//     by the new one at the new plan price;
//   • decrease / explicit 'Programmer' → scheduled for the period end.
// Removing a plan asks for confirmation, then voids unpaid invoices, expires
// the center and closes the dialog.
interface PlanDraft { plan: string; billingCycle: 'monthly' | 'annual'; monthlyPrice: string }

function PlanManagerModal({ center, onClose, onSaved }: {
  center: CenterTenant;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  // useToast() may hand back a fresh object every render — referencing it from
  // a useCallback dep list would recreate `reload` and loop the mount effect.
  // Keep it in a ref so the effect deps stay stable.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const fieldCls = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition';
  const [view, setView] = useState<CenterPlansView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'schedule' | 'trial'>('view');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [trialDaysInput, setTrialDaysInput] = useState('7');
  const [draft, setDraft] = useState<PlanDraft>({ plan: 'basic', billingCycle: 'monthly', monthlyPrice: '' });
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [modulePrices, setModulePrices] = useState<Record<string, number>>({});
  const [pricesReady, setPricesReady] = useState(false);
  const [applyChoice, setApplyChoice] = useState<'settle' | 'schedule'>('settle');
  const [paymentState, setPaymentState] = useState<'paid' | 'unpaid'>('unpaid');

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

  const draftFromView = useCallback((v: CenterPlansView) => {
    const plan = v.center.plan === 'starter' || !v.center.plan ? 'basic' : v.center.plan;
    setDraft({ plan, billingCycle: v.center.billingCycle || 'monthly', monthlyPrice: String(v.center.monthlyPrice ?? '') });
    setEnabledModules(normalizeCenterModules(v.center.enabledModules));
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await fetchCenterPlansApi(center.id);
      setView(data);
      draftFromView(data);
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
  }, [center.id, draftFromView]);

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
  const extendsSubscription = !hasLiveWindow || billingCycleChanged || decision.kind === 'renewal';

  // Trial placement (mirrors the add-trial endpoint): a trial, or a window
  // that starts today / has not started yet, takes the free days BEFORE the
  // billing; a running window takes them at the END.
  const DAY_MS = 86400000;
  const trialDaysNum = Math.floor(Number(trialDaysInput) || 0);
  const windowCycleDays = view?.center.billingCycle === 'annual' ? 365 : 30;
  const windowStartDate = liveEnd > 0 ? liveEnd - windowCycleDays * DAY_MS : 0;
  const startOfToday = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const trialGoesToStart = isTrial || !hasLiveWindow || windowStartDate >= startOfToday;

  const handleDraftPlanChange = (plan: string) => {
    setDraft(d => ({ ...d, plan }));
    if (plan === 'pro') setEnabledModules([...SELECTABLE_MODULE_KEYS]);
    if (plan === 'basic') setEnabledModules([...BASIC_MODULE_KEYS]);
  };

  const toggleDraftModule = (key: string) => {
    if (isBaseModule(key)) return;
    setEnabledModules(current => current.includes(key)
      ? current.filter(moduleKey => moduleKey !== key)
      : [...current, key]);
  };

  const runAction = async (payload: Parameters<typeof centerPlanActionApi>[0], fallbackMsg: string) => {
    setSaving(true);
    try {
      const res = await centerPlanActionApi(payload);
      toast.success(res.message || fallbackMsg);
      onSaved();
      await reload();
      setMode('view');
      return res;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في تحديث الباقة');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const submitPlan = async () => {
    // Trial activation or relaunch of an expired/suspended center: fresh
    // period starting now, ONE pending invoice (marked paid in Finance).
    if (isTrial || !hasLiveWindow) {
      await runAction({
        action: 'set-plan',
        centerId: center.id,
        plan: draft.plan,
        billingCycle: draft.billingCycle,
        enabledModules,
        ...(draft.plan === 'custom' ? { monthlyPrice: Number(draft.monthlyPrice) || 0 } : {}),
      }, isTrial ? 'تفعيل الاشتراك' : 'تم استئناف الاشتراك');
      return;
    }
    setSaving(true);
    try {
      if (scheduleOnly || effectiveApplyChoice === 'schedule') {
        const outcome = await updateCenterApi(center.id, {
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
        const outcome = await updateCenterApi(center.id, {
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
      onSaved();
      await reload();
      setMode('view');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في تحديث الباقة');
    } finally {
      setSaving(false);
    }
  };

  const submitScheduled = () => runAction({
    action: 'set-plan',
    mode: 'scheduled',
    centerId: center.id,
    plan: draft.plan,
    billingCycle: draft.billingCycle,
    enabledModules,
    ...(draft.plan === 'custom' ? { monthlyPrice: Number(draft.monthlyPrice) || 0 } : {}),
  }, 'باقة مجدولة لنهاية الفترة');

  // Suppression du plan : confirmation → annulation des factures en attente
  // + expiration du centre, puis fermeture du dialog.
  const doRemovePlan = async () => {
    setConfirmRemove(false);
    setSaving(true);
    try {
      await centerPlanActionApi({ action: 'remove-plan', centerId: center.id });
      toast.success('تم حذف الاشتراك — أُلغيت الفواتير المعلقة وصُنّف المركز منتهيًا.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في حذف الباقة');
    } finally {
      setSaving(false);
    }
  };

  const openForm = (next: 'edit' | 'schedule') => {
    if (view) draftFromView(view);
    setApplyChoice('settle');
    setMode(next);
  };

  // Jours offerts : ajoutés au début si l'abonnement ne court pas encore
  // (essai en cours / période démarrant aujourd'hui), sinon à la fin.
  // L'API décide de la placement réelle — cette règle est la sienne.
  const submitTrial = async () => {
    if (trialDaysNum < 1 || trialDaysNum > 3650) {
      toast.error('أدخل عدد أيام صالحًا (من 1 إلى 3650).');
      return;
    }
    await runAction({
      action: 'add-trial',
      centerId: center.id,
      days: trialDaysNum,
    }, 'تمت إضافة فترة تجريبية');
  };

  const planTitle = view ? (PLAN_LABEL[view.center.plan] || view.center.plan || 'لا توجد باقة') : '—';

  const renderFields = () => (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1" htmlFor="pm-plan">الباقة</label>
          <select id="pm-plan"
            value={draft.plan}
            onChange={e => handleDraftPlanChange(e.target.value)}
            className={`${fieldCls} cursor-pointer`}
          >
            <option value="basic">Basic</option>
            <option value="growth">Growth</option>
            <option value="pro">Pro</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1" htmlFor="pm-cycle">الدورة</label>
          <select id="pm-cycle"
            value={draft.billingCycle}
            onChange={e => setDraft(d => ({ ...d, billingCycle: e.target.value as 'monthly' | 'annual' }))}
            className={`${fieldCls} cursor-pointer`}
          >
            <option value="monthly">شهري</option>
            <option value="annual">سنوي — خصم 20%</option>
          </select>
        </div>
        {draft.plan === 'custom' ? (
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1" htmlFor="pm-price">التعرفة الشهرية (دينار)</label>
            <input id="pm-price" type="number" min="0" step="0.01" value={draft.monthlyPrice}
              onChange={e => setDraft(d => ({ ...d, monthlyPrice: e.target.value }))} className={fieldCls} />
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 flex flex-col justify-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">التعرفة {draft.billingCycle === 'annual' ? 'السنوية' : 'الشهرية'} المحسوبة</span>
            <span className="text-sm font-black text-accent-500">
              {formatTnd(automaticPlan ? calculatedTariff : (Number(draft.monthlyPrice) || 0))} · {draft.billingCycle === 'annual' ? 'دينار/سنة' : 'دينار/شهر'}
            </span>
          </div>
        )}
      </div>

      {/* Modules — sélectionnables pour Growth (Pro = tout, Basic = base) */}
      {draft.plan === 'growth' && (
        <div>
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">وحدات للتفعيل</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MODULES.filter(m => !isBaseModule(m.key) && m.key !== BUNDLED_MODULE_KEY && !isModuleHidden(m.key)).map(module => {
              const selected = enabledModules.includes(module.key);
              return (
                <button key={module.key} type="button" onClick={() => toggleDraftModule(module.key)}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition cursor-pointer inline-flex items-center gap-1 ${selected ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-slate-500 border-slate-200 hover:border-accent-500/40'}`}>
                  {selected && <Check className="h-4 w-4" aria-hidden="true" />} {module.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {draft.plan === 'pro' && (
        <p className="text-[11px] font-semibold text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
          Pro: تُفعَّل كل الوحدات تلقائيًا.
        </p>
      )}
      {draft.plan === 'basic' && (
        <p className="text-[11px] font-semibold text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
          Basic : Scolaire + Finance (+ Jd. Horaires offert).
        </p>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-accent-500" aria-hidden="true" /> Plans &amp; factures
            </h2>
            <p className="text-[11px] font-bold text-slate-500 truncate">{center.name}</p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center flex-shrink-0">
            <X className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : !view ? (
          <p className="text-center text-sm font-bold text-slate-500 py-16">البيانات غير متاحة</p>
        ) : (
          <div className="p-5 space-y-4">
            {/* ── Abonnement en cours ── */}
            <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50">
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
                    <StatusBadge tone={PLAN_BADGE[view.center.plan] || PLAN_BADGE.starter} label={planTitle} />
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
                      نهاية الاشتراك: {liveEnd > 0 ? fmtDate(liveEnd) : '—'}
                    </p>
                  )}
                  {!expiredState && pendingInvoice && (
                    <p className="text-[11px] font-bold text-amber-700 mt-1.5">
                      فاتورة {pendingInvoice.invoiceNumber} —{' '}
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

            {/* ── Actions ── */}
            {mode === 'view' && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => openForm('edit')} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-accent-500 rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer disabled:opacity-60">
                    <Edit className="h-4 w-4" aria-hidden="true" /> {isTrial ? 'اختر باقة وفعّل' : hasLiveWindow ? 'تعديل الباقة' : 'استئناف اشتراك'}
                  </button>
                  <button onClick={() => openForm('schedule')} disabled={saving || isTrial || !hasLiveWindow}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={isTrial ? 'متاحة بعد اشتراك المركز — تُطبَّق الباقة المجدولة في نهاية الفترة.' : !hasLiveWindow ? 'لا توجد فترة جارٍ — استأنف اشتراكًا أولًا.' : 'تُطبَّق في نهاية الفترة الحالية'}>
                    <CalendarClock className="h-4 w-4" aria-hidden="true" /> جدولة باقة
                  </button>
                  {(hasLiveWindow || isTrial) && (
                    <button onClick={() => setMode('trial')} disabled={saving}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-accent-500 bg-accent-500/[0.06] border border-accent-500/30 rounded-xl hover:bg-accent-500/[0.12] transition cursor-pointer disabled:opacity-40"
>
                      <Clock className="h-4 w-4" aria-hidden="true" /> إضافة فترة تجريبية
                    </button>
                  )}
                  {!isTrial && (
                    <button onClick={() => setConfirmRemove(true)} disabled={!hasLiveWindow || saving}
                      className={`flex items-center gap-1.5 ms-auto px-3.5 py-2 text-xs font-bold rounded-xl border transition ${hasLiveWindow ? 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100 cursor-pointer' : 'text-slate-300 bg-slate-50 border-slate-200 cursor-not-allowed'}`}
                      title={hasLiveWindow ? undefined : 'لا يوجد اشتراك نشط للحذف'}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> حذف الباقة
                    </button>
                  )}
                </div>
                {hasLiveWindow && windowPaidInvoice && (
                  <p className="text-[11px] font-semibold text-slate-500 -mt-2">
                    الفترة مدفوعة مسبقًا: لن تتغير أي فاتورة مدفوعة — الأيام المسددة تبقى محفوظة والفرق إن وُجد يُسوَّأ بالتناسب أو يُبرمج.
                  </p>
                )}
              </>
            )}

            {/* ── Formulaire : ajouter une période d'essai ── */}
            {mode === 'trial' && (
              <div className="rounded-2xl border border-accent-500/30 bg-accent-500/[0.04] p-4 space-y-3" dir="ltr">
                <p className="text-xs font-black text-slate-700">إضافة فترة تجريبية مقدمة</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="plan-manager-trial-days" className="text-xs font-black text-slate-600">عدد الأيام</label>
                  <div className="flex items-center gap-2">
                    <input id="plan-manager-trial-days" type="number" min={1} max={3650} step={1} inputMode="numeric"
                      value={trialDaysInput} onChange={e => setTrialDaysInput(e.target.value)}
                      className="w-24 border border-accent-500/30 rounded-xl px-2.5 py-2 text-sm font-black text-slate-800 bg-white focus:border-accent-500 focus:ring-0 outline-none text-center" />
                    <span className="text-xs font-bold text-slate-500">يوم</span>
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                  {isTrial && !hasLiveWindow &&
                    <>التجربة جارية — سيتم تمديدها بـ{arPlural(Math.max(1, trialDaysNum), 'يوم', 'يومان', 'أيام', 'يومًا')} وستبدأ الفوترة بعدها.</>
                  }
                  {!isTrial && trialGoesToStart && hasLiveWindow &&
                    <>يبدأ الاشتراك {windowStartDate > startOfToday ? `في ${fmtDate(windowStartDate)}` : 'اليوم'} — الأيام المقدمة {arPlural(Math.max(1, trialDaysNum), 'يوم', 'يومان', 'أيام', 'يومًا')} تكون في البداية: تُؤخَّر الفاتورة المعلقة بمقدارها ويُمدَّد تاريخ نهاية الاشتراك إلى {fmtDate(liveEnd + Math.max(1, trialDaysNum) * DAY_MS)}.</>}
                  {!trialGoesToStart &&
                    <>الفترة بدأت بالفعل — تُضاف الأيام المقدمة {arPlural(Math.max(1, trialDaysNum), 'يوم', 'يومان', 'أيام', 'يومًا')} في النهاية: تاريخ الاستحقاق الجديد {fmtDate(liveEnd + Math.max(1, trialDaysNum) * DAY_MS)} (بدلًا من {fmtDate(liveEnd)}). لا تتغير أي فاتورة مدفوعة.</>}
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setMode('view')} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer">إلغاء</button>
                  <button onClick={submitTrial} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-accent-500 rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer disabled:opacity-60">
                    {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" aria-hidden="true" />}
                    إضافة التجربة ({Math.max(1, trialDaysNum)} يوم)
                  </button>
                </div>
              </div>
            )}

            {/* ── Formulaire : modifier le plan courant / programmer ── */}
            {(mode === 'edit' || mode === 'schedule') && (
              <div className={`rounded-2xl border p-4 space-y-3 ${mode === 'edit' ? 'border-accent-500/20 bg-accent-500/[0.04]' : 'border-amber-300/50 bg-amber-50/50'}`}>
                <p className="text-xs font-black text-slate-700">
                  {mode === 'schedule'
                    ? 'جدولة باقة لنهاية الفترة الحالية'
                    : isTrial
                      ? 'تفعيل الاشتراك'
                      : !hasLiveWindow
                        ? 'اشتراك جديد — تبدأ الفترة من اليوم'
                        : 'تعديل الباقة الحالية'}
                </p>
                {renderFields()}

                {/* Mid-period consequence — settlement (difference) vs schedule */}
                {mode === 'edit' && midPeriod && decision.kind !== 'mid_period_same_price' && (
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
                            className={`text-start rounded-xl border px-3 py-2.5 transition cursor-pointer ${applyChoice === 'settle' ? 'border-accent-500 bg-white shadow-md shadow-accent-500/10' : 'border-slate-200 bg-white/60 hover:border-accent-500/40'}`}>
                            <div className="text-[11px] font-black text-slate-800">تطبيق الآن</div>
                            <div className="text-[11px] font-semibold text-slate-500 mt-1">نهاية الاشتراك دون تغيير · تسوية بالتناسب مع الأيام المستهلكة</div>
                          </button>
                          <button type="button" onClick={() => setApplyChoice('schedule')}
                            className={`text-start rounded-xl border px-3 py-2.5 transition cursor-pointer ${applyChoice === 'schedule' ? 'border-accent-500 bg-white shadow-md shadow-accent-500/10' : 'border-slate-200 bg-white/60 hover:border-accent-500/40'}`}>
                            <div className="text-[11px] font-black text-slate-800">Programmer pour {hasLiveWindow ? fmtDate(liveEnd) : 'عند التجديد'}</div>
                            <div className="text-[11px] font-semibold text-slate-500 mt-1">تبقى الباقة الحالية سارية حتى نهاية الفترة</div>
                          </button>
                        </div>
                        {effectiveApplyChoice === 'settle' && (
                          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                            <p className="text-[11px] font-black text-slate-600 mb-1.5">Facturation actuelle : {formatTnd(decision.oldAmount)} → nouveau : {formatTnd(decision.newAmount)}</p>
                            <div className="grid sm:grid-cols-2 gap-2">
                              <button type="button" onClick={() => setPaymentState('paid')}
                                className={`text-start rounded-xl border px-3 py-2 transition cursor-pointer ${paymentState === 'paid' ? 'border-accent-500 bg-accent-500/[0.06]' : 'border-slate-200 bg-white hover:border-accent-500/40'}`}>
                                <div className="text-[11px] font-black text-accent-700">الفترة مدفوعة</div>
                                <div className="text-sm font-black text-accent-700">+ {formatTnd(decision.paidAmount)}</div>
                                <div className="text-[11px] font-semibold text-slate-500">الفرق = فرق السعر × الأيام المتبقية</div>
                              </button>
                              <button type="button" onClick={() => setPaymentState('unpaid')}
                                className={`text-start rounded-xl border px-3 py-2 transition cursor-pointer ${paymentState === 'unpaid' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-400'}`}>
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

                {mode === 'edit' && !midPeriod && !isTrial && hasLiveWindow && (
                  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                    {windowPaidInvoice
                      ? 'الفاتورة المدفوعة للفترة الحالية لن تتغير.'
                      : pendingInvoice
                        ? `الفاتورة قيد الانتظار ${pendingInvoice.invoiceNumber} ستُستبدل بفاتورة جديدة وفق تعرفة الباقة المختارة (بدون خصم مزدوج).`
                        : 'ستُنشأ فاتورة «قيد الانتظار» للفترة الحالية.'}
                  </p>
                )}
                {mode === 'edit' && (isTrial || !hasLiveWindow) && (
                  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                    ستُنشأ فاتورة جديدة «قيد الانتظار» للفترة الأولى — علّمها كمدفوعة في SaaS → المالية عندما يسدّد العميل.
                  </p>
                )}
                {mode === 'schedule' && (
                  <p className="text-[11px] font-semibold text-amber-800 leading-relaxed">
                    تبقى الباقة الحالية سارية حتى {hasLiveWindow ? fmtDate(liveEnd) : 'التجديد القادم'}، ثم التحويل تلقائي (فاتورة «قيد الانتظار» للفترة الجديدة).
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setMode('view')} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer">إلغاء</button>
                  <button onClick={mode === 'schedule' ? submitScheduled : submitPlan} disabled={saving}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white rounded-xl shadow-md transition cursor-pointer disabled:opacity-60 ${mode === 'schedule' ? 'bg-amber-500 shadow-sm shadow-amber-500/20 hover:shadow-md' : 'bg-accent-500 shadow-sm shadow-accent-500/20 hover:shadow-md'}`}>
                    {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : mode === 'schedule' ? <CalendarClock className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                    {mode === 'schedule' ? 'جدولة' : isTrial ? 'تفعيل الاشتراك' : 'حفظ الباقة'}
                  </button>
                </div>
              </div>
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
                      <CalendarClock className="h-4 w-4 text-amber-500 flex-shrink-0" aria-hidden="true" />
                      <span className="text-xs font-black text-slate-800">{PLAN_LABEL[s.plan === 'starter' ? 'basic' : s.plan] || s.plan}</span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {s.billingCycle === 'annual' ? 'سنوي' : 'شهري'}
                        {s.monthlyPrice ? ` · ${Number(s.monthlyPrice).toFixed(2)} TND` : ''}
                      </span>
                      <span className="ms-auto text-[11px] font-bold text-slate-500">
                        {s.applyAt ? `في ${fmtDate(s.applyAt)}` : 'عند التجديد القادم'}
                      </span>
                      <button onClick={() => runAction({ action: 'remove-schedule', centerId: center.id, scheduleId: s.id }, 'تم حذف الباقة المجدولة')}
                        disabled={saving}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer disabled:opacity-50" title="حذف هذه الباقة المجدولة" aria-label="حذف هذه الباقة المجدولة">
                        <Trash2 className="h-4 w-4 text-red-400" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Historique des plans (audit trail, migration 0029) ── */}
            <div>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2">
                سجل الباقات ({(view.history || []).length})
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
          </div>
        )}
      </motion.div>

      {/* Confirmation avant suppression du plan (expiration du centre). */}
      <ConfirmDialog
        open={confirmRemove}
        title="حذف هذه الباقة؟"
        message="سيصبح المركز «منتهيًا» وتُلغى كل فواتيره المعلقة. الفواتير المدفوعة تبقى محسوبة. هل تؤكد؟"
        confirmLabel="نعم، احذف الباقة"
        cancelLabel="إلغاء"
        danger
        onConfirm={doRemovePlan}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

export default PlanManagerModal;
