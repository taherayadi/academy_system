import React, { useState, useEffect } from 'react';
import { Trash2, Check, X, Loader2, Edit, ImagePlus } from 'lucide-react';
import { updateCenterApi, uploadPlatformLogoApi, fetchInvoicesApi, fetchModulePricesApi, CenterInvoice, PlanChangeOutcome } from '../../api';
import { CenterTenant } from '../../types';
import { analyzePlanChange, ClientPlanDecision } from '../../utils/planChange';
import { useToast } from '../Toast';
import icon from '../../assets/icon.png';
import { BaseModal, PrimaryButton, SecondaryButton } from '../ui';
import { fmtDate } from '../../utils/format';
import { normalizeCenterModules, normalizePhoneInput, normalizeCenterType, centerDateInputValue, currentSchoolYear, AUTOMATIC_PLAN_KEYS, calculatePlanTariff, centerDateTimestamp, addSubscriptionPeriod, SELECTABLE_MODULE_KEYS, BASIC_MODULE_KEYS, isBaseModule, formatTnd, isValidCenterPhone } from './constants';

function EditCenterModal({ center, onClose, onSaved }: { center: CenterTenant; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition';
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [modulePrices, setModulePrices] = useState<Record<string, number>>({});
  const [enabledModules, setEnabledModules] = useState<string[]>(() => normalizeCenterModules(center.enabledModules as string[] || []));
  const [form, setForm] = useState(() => ({
    name: center.name,
    logoUrl: center.logoUrl || '',
    phoneNumber: normalizePhoneInput(center.phoneNumber),
    locationCity: center.locationCity || '',
    centerType: normalizeCenterType(center.centerType),
    plan: center.plan === 'starter' ? 'basic' : (center.plan || 'basic'),
    status: center.status,
    billingCycle: center.billingCycle || 'monthly',
    monthlyPrice: String(center.monthlyPrice ?? 0),
    trialEndsAt: centerDateInputValue(center.trialEndsAt),
  }));

  useEffect(() => {
    let mounted = true;
    fetchModulePricesApi(currentSchoolYear()).then(prices => {
      if (!mounted) return;
      setModulePrices((prices || []).reduce<Record<string, number>>((result, price) => {
        result[price.module_key] = Number(price.price) || 0;
        return result;
      }, {}));
    }).catch(() => { /* backend remains authoritative */ });
    return () => { mounted = false; };
  }, []);

  // Invoices of this center are used to detect whether the current subscription
  // window was already paid (prorated settlement is smaller in that case).
  const [invoices, setInvoices] = useState<CenterInvoice[]>([]);
  const [windowPaid, setWindowPaid] = useState(false);
  // Mid-period plan change options: settle immediately or schedule at renewal.
  const [applyChoice, setApplyChoice] = useState<'settle' | 'schedule'>('settle');
  const [paymentState, setPaymentState] = useState<'paid' | 'unpaid'>('unpaid');
  const [pricesReady, setPricesReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchModulePricesApi(currentSchoolYear()).then(prices => {
      if (!mounted) return;
      setModulePrices((prices || []).reduce<Record<string, number>>((result, price) => {
        result[price.module_key] = Number(price.price) || 0;
        return result;
      }, {}));
      setPricesReady(true);
    }).catch(() => { /* backend remains authoritative */ });
    fetchInvoicesApi({ centerId: center.id, limit: 200 }).then(list => {
      if (!mounted) return;
      setInvoices(list);
      // Auto-detect: has the current window already been invoiced & paid?
      const end = center.subscriptionEndsAt;
      if (end) {
        const tolerance = 3 * 86400000;
        const found = (list || []).some(inv =>
          inv.status === 'paid' && Math.abs(inv.periodEnd - end) <= tolerance);
        setWindowPaid(found);
        setPaymentState(found ? 'paid' : 'unpaid');
      }
    }).catch(() => { /* optional */ });
    return () => { mounted = false; };
  }, [center.id, center.subscriptionEndsAt]);

  const automaticPlan = AUTOMATIC_PLAN_KEYS.includes(form.plan);
  const calculatedTariff = form.status === 'trial'
    ? 0
    : calculatePlanTariff(form.plan, form.billingCycle, enabledModules, modulePrices, Number(form.monthlyPrice));
  const originalModules = normalizeCenterModules(center.enabledModules as string[] || []);
  const planChanged = form.plan !== (center.plan === 'starter' ? 'basic' : center.plan);
  const billingCycleChanged = form.billingCycle !== (center.billingCycle || 'monthly');
  const statusChangedToPaid = form.status === 'active' && (center.status === 'trial' || center.status === 'expired');
  const previewTrialEnd = centerDateTimestamp(form.trialEndsAt) || center.trialEndsAt || null;
  const startsAfterTrial = statusChangedToPaid && !!previewTrialEnd && previewTrialEnd > Date.now();

  // Decide what a plan/module/cycle change means for the running subscription.
  const decision: ClientPlanDecision = pricesReady
    ? analyzePlanChange({
      plan: center.plan,
      billingCycle: center.billingCycle || 'monthly',
      monthlyPrice: center.monthlyPrice,
      enabledModules: originalModules,
      status: center.status,
      subscriptionEndsAt: center.subscriptionEndsAt,
    }, {
      plan: (form.plan === 'starter' ? 'basic' : form.plan) as 'basic' | 'growth' | 'pro' | 'custom',
      billingCycle: form.billingCycle,
      enabledModules,
      manualPrice: Number(form.monthlyPrice) || 0,
    }, modulePrices)
    : { kind: 'no_change' };
  const midPeriod = decision.kind === 'mid_period_increase'
    || decision.kind === 'mid_period_decrease'
    || decision.kind === 'mid_period_same_price';
  const settlementRelevant = decision.kind === 'mid_period_increase';
  // Downgrades inside a paid window are scheduled by design (no refund for the
  // current window, the lower price applies from the next renewal).
  const scheduleOnly = decision.kind === 'mid_period_decrease';
  const effectiveApplyChoice = scheduleOnly ? 'schedule' : applyChoice;

  // Renewal semantics (fresh full period) only when the result is ACTIVE and
  // the change happens outside a running paid window.
  const extendsSubscription = form.status === 'active'
    && (billingCycleChanged || statusChangedToPaid || decision.kind === 'renewal');
  const shouldExtendSubscription = extendsSubscription;

  const previewSubscriptionEnd = form.status === 'trial'
    ? null
    : extendsSubscription
      ? addSubscriptionPeriod(
        center.status === 'trial' && previewTrialEnd && previewTrialEnd > Date.now()
          ? previewTrialEnd
          : (center.subscriptionEndsAt && center.subscriptionEndsAt > Date.now() ? center.subscriptionEndsAt : Date.now()),
        form.billingCycle
      )
      : (center.subscriptionEndsAt || addSubscriptionPeriod(Date.now(), form.billingCycle));

  // The subscription end date shown in the summary never moves for an
  // immediate mid-period switch — the settlement invoice covers the rest.
  const unchangedEndDate = midPeriod && effectiveApplyChoice === 'settle';
  const displayedEnd = unchangedEndDate
    ? (center.subscriptionEndsAt || previewSubscriptionEnd)
    : previewSubscriptionEnd;
  const showPlanChangePanel = pricesReady && midPeriod;

  useEffect(() => {
    if (form.plan === 'pro') {
      setEnabledModules([...SELECTABLE_MODULE_KEYS]);
    } else if (
      form.plan === 'basic'
      && (enabledModules.length !== BASIC_MODULE_KEYS.length || !BASIC_MODULE_KEYS.every(key => enabledModules.includes(key)))
    ) {
      setEnabledModules([...BASIC_MODULE_KEYS]);
    }
  }, [form.plan]);

  const handleEditPlanChange = (plan: string) => {
    setForm(current => ({ ...current, plan }));
    if (plan === 'pro') setEnabledModules([...SELECTABLE_MODULE_KEYS]);
    if (plan === 'basic') setEnabledModules([...BASIC_MODULE_KEYS]);
  };

  const toggleEditModule = (key: string) => {
    if (isBaseModule(key)) return;
    setEnabledModules(current => current.includes(key)
      ? current.filter(moduleKey => moduleKey !== key)
      : [...current, key]);
  };

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const handleLogoSelect = (file?: File) => {
    setLogoFile(file || null);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleRemoveLogo = () => {
    setForm(current => ({ ...current, logoUrl: '' }));
    setLogoFile(null);
    setLogoPreview(null);
  };

  const planChangeToast = (outcome?: PlanChangeOutcome) => {
    const mode = outcome?.mode;
    if (mode === 'mid_period_increase' || mode === 'mid_period_same_price') {
      const settlement = outcome?.settlement;
      if (settlement && !settlement.skipped && settlement.amount > 0) {
        toast.success(
          `تم تغيير الباقة فورًا. الرصيد المستحق: ${formatTnd(settlement.amount)} ` +
          `(${settlement.paid ? 'الفترة مسدَّدة — فرق السعر' : 'فاتورة جديدة'}${settlement.invoiceNumber ? ` ${settlement.invoiceNumber}` : ''}).`
        );
      } else {
        toast.success('تم تغيير الباقة فورًا. تاريخ نهاية الاشتراك لا يتغير.');
      }
    } else if (mode === 'scheduled') {
      toast.success(
        outcome?.applyAt
          ? `تغيير مجدول — سيُطبَّق في ${fmtDate(outcome.applyAt)}.`
          : 'تغيير مجدول — سيُطبَّق عند التجديد القادم.'
      );
    } else if (mode === 'renewal') {
      toast.success(
        outcome?.invoice
          ? `بدأت فترة جديدة. فاتورة ${outcome.invoice.invoiceNumber} (${formatTnd(outcome.invoice.amount)}) — قيد الانتظار للدفع.`
          : 'تم تحديث المركز. بدأت فترة اشتراك جديدة.'
      );
    } else {
      toast.success('تم تحديث المركز');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidCenterPhone(form.phoneNumber)) {
      toast.error('يجب أن يحتوي رقم الهاتف على 8 أرقام بالضبط.');
      return;
    }
    if (!form.name.trim()) {
      toast.error('اسم المركز إلزامي.');
      return;
    }

    // Édition « informations de base » uniquement : le plan, le cycle, le
    // tarif, la durée, les modules et les factures ne sont PLUS touchés ici
    // (ils appartiennent au gestionnaire « Plans & factures »). Sauvegarder
    // ces champs ne doit donc jamais générer de nouvelle facture.
    setSaving(true);
    try {
      const logoUrl = logoFile ? await uploadPlatformLogoApi(logoFile) : form.logoUrl;
      await updateCenterApi(center.id, {
        name: form.name.trim(),
        logoUrl,
        phoneNumber: form.phoneNumber.trim(),
        locationCity: form.locationCity.trim(),
        centerType: form.centerType,
      });
      toast.success('تم تحديث المركز');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ أثناء تحديث المركز.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <BaseModal onClose={onClose} labelledBy="ec-modal-title">
      <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10 rounded-t-3xl">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-accent-500/10"><Edit aria-hidden="true" className="h-4 w-4 text-accent-500" /></span>
          <div>
            <h2 id="ec-modal-title" className="text-base font-black text-slate-900">تعديل المركز</h2>
            <p className="text-[11px] font-semibold text-slate-500 truncate max-w-[16rem] sm:max-w-none">{center.name}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center" aria-label="إغلاق">
          <X className="h-5 w-5 text-slate-500" aria-hidden="true" />
        </button>
      </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ec-name">اسم المركز *</label>
              <input id="ec-name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ec-logo">شعار المركز</label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="h-16 w-16 rounded-2xl bg-accent-500 p-1 shadow-md shadow-accent-500/20 ring-1 ring-white/40 overflow-hidden shrink-0">
                  <img src={logoPreview || form.logoUrl || icon} alt="Logo du centre" className="w-full h-full rounded-xl object-cover bg-white" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-100 transition">
                      <ImagePlus aria-hidden="true" className="h-4 w-4 text-accent-500" />
                      اختيار صورة
                      <input id="ec-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden" onChange={e => handleLogoSelect(e.target.files?.[0])} />
                    </label>
                    {(form.logoUrl || logoFile) && (
                      <button type="button" onClick={handleRemoveLogo} disabled={saving} className="inline-flex items-center gap-2 px-3.5 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-black hover:bg-red-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        حذف
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500">PNG · JPG · WEBP · SVG · GIF — 2 ميغابايت كحد أقصى. يُرسَل الشعار الجديد إلى ImageKit عند الحفظ.</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ec-city">المدينة</label>
              <input id="ec-city" value={form.locationCity} onChange={e => setForm(f => ({ ...f, locationCity: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ec-phone">الهاتف *</label>
              <input id="ec-phone" required type="tel" inputMode="numeric" maxLength={8} pattern="[0-9]{8}" dir="ltr" value={form.phoneNumber}
                onChange={e => setForm(f => ({ ...f, phoneNumber: normalizePhoneInput(e.target.value) }))}
                className={`${inputCls} text-start`} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ec-type">نوع المؤسسة</label>
              <select id="ec-type" value={form.centerType} onChange={e => setForm(f => ({ ...f, centerType: e.target.value as 'jardin' | 'formation' | '' }))} className={`${inputCls} cursor-pointer`}>
                <option value="">غير معرّف</option>
                <option value="jardin">روضة أطفال</option>
                <option value="formation">مركز تدريب</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ec-email">بريد المدير</label>
              <input id="ec-email" value={center.adminEmail || '—'} readOnly className={`${inputCls} bg-slate-50 text-slate-500 cursor-not-allowed`} />
            </div>
          </div>

          <div className="rounded-2xl bg-accent-500/[0.05] border border-accent-500/15 px-4 py-3.5">
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              الاشتراك (الباقة، الدورة، التعرفة، تاريخ النهاية، الوحدات والفواتير) لم يعد يُدار هنا:
              استخدم زر <span className="text-accent-500 font-black">«الباقات &amp; الفواتير»</span> في بطاقة المركز.
              هذا التعديل لن يؤدي أبدًا إلى إنشاء فاتورة جديدة.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <SecondaryButton type="button" onClick={onClose}>إلغاء</SecondaryButton>
            <PrimaryButton
              type="submit"
              disabled={saving}
              loading={saving}
              icon={saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
            >
              حفظ
            </PrimaryButton>
          </div>
        </form>
      </BaseModal>
    </>
  );
}

export default EditCenterModal;
