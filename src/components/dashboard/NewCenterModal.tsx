import React, { useState } from 'react';
import { Trash2, Check, X, Loader2, Upload, Lock, ImagePlus } from 'lucide-react';
import { createCenterApi, uploadPlatformLogoApi, fetchModulePricesApi } from '../../api';
import { DemoRequest } from '../../types';
import { useToast } from '../Toast';
import icon from '../../assets/icon.png';
import { BaseModal, PrimaryButton, SecondaryButton } from '../ui';
import { fmtDate, arPlural } from '../../utils/format';
import { currentSchoolYear, parseModules, BASE_MODULE_KEYS, BUNDLED_MODULE_KEY, normalizePhoneInput, AUTOMATIC_PLAN_KEYS, calculatePlanTariff, addSubscriptionPeriod, SELECTABLE_MODULE_KEYS, BASIC_MODULE_KEYS, isBaseModule, isValidCenterPhone, formatTnd, CENTER_TYPES, MODULE_LABEL, ALL_MODULES, isModuleHidden } from './constants';
import { NoticeDialog } from './uiParts';

// ─── New / Convert Center Modal ────────────────────────────────────────────
interface NewCenterModalProps {
  initialData?: Partial<DemoRequest>;
  convertRequestId?: string;
  onClose: () => void;
  onCreated: () => void;
}

function NewCenterModal({ initialData, convertRequestId, onClose, onCreated }: NewCenterModalProps) {
  const toast = useToast();
  // Duplicate name/slug/email → custom dismissible dialog (no raw DB toast).
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [modulePrices, setModulePrices] = useState<Record<string, number>>({});

  React.useEffect(() => {
    let mounted = true;
    fetchModulePricesApi(currentSchoolYear()).then(prices => {
      if (!mounted) return;
      setModulePrices((prices || []).reduce<Record<string, number>>((result, price) => {
        result[price.module_key] = Number(price.price) || 0;
        return result;
      }, {}));
    }).catch(() => {
      // The backend remains authoritative; an empty map gives a conservative preview.
    });
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const handleLogoSelect = (file?: File) => {
    setLogoFile(file || null);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  };

  const uploadSelectedLogo = async (): Promise<string> => {
    if (!logoFile) return form.logoUrl;
    const url = await uploadPlatformLogoApi(logoFile);
    setForm(current => ({ ...current, logoUrl: url }));
    setLogoFile(null);
    setLogoPreview(null);
    return url;
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setLogoUploading(true);
    try {
      await uploadSelectedLogo();
      toast.success('تم رفع شعار المركز.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ أثناء رفع الشعار.');
    } finally {
      setLogoUploading(false);
    }
  };

  const [form, setForm] = useState(() => {
    // Base toujours incluse + modules demandés lors d'une conversion
    const requested = parseModules(initialData?.requestedModules);
    const enabled = Array.from(new Set<string>([
      ...BASE_MODULE_KEYS,
      BUNDLED_MODULE_KEY,
      ...(requested.length ? requested : [])
    ]));
    return {
      name: initialData?.academyName || '',
      logoUrl: '',
      phoneNumber: normalizePhoneInput(initialData?.phone),
      locationCity: '',
      plan: 'trial' as string,
      billingCycle: 'monthly' as 'monthly' | 'annual',
      monthlyPrice: '',
      trialDays: '14',
      offerDays: '0',
      centerType: (initialData?.centerType as 'jardin' | 'formation' | '') || '',
      directorName: initialData?.fullName || '',
      directorEmail: initialData?.email || '',
      directorPassword: '',
      enabledModules: enabled,
    };
  });

  const automaticPlan = AUTOMATIC_PLAN_KEYS.includes(form.plan);
  const calculatedTariff = calculatePlanTariff(
    form.plan,
    form.billingCycle,
    form.enabledModules,
    modulePrices,
    Number(form.monthlyPrice)
  );
  const trialDays = Math.max(1, Math.floor(Number(form.trialDays) || 14));
  const offerDays = Math.max(0, Math.floor(Number(form.offerDays) || 0));
  const previewOfferEnd = form.plan !== 'trial' && offerDays > 0
    ? Date.now() + offerDays * 86400000
    : null;
  const previewEnd = form.plan === 'trial'
    ? Date.now() + trialDays * 86400000
    : addSubscriptionPeriod(Date.now() + offerDays * 86400000, form.billingCycle);

  const handlePlanChange = (plan: string) => {
    setForm(current => ({
      ...current,
      plan,
      offerDays: plan === 'trial' ? '0' : current.offerDays,
      enabledModules: plan === 'pro'
        ? [...SELECTABLE_MODULE_KEYS]
        : plan === 'basic'
          ? [...BASIC_MODULE_KEYS]
          : current.enabledModules
    }));
  };

  // Keep the Pro preset true even when the form is opened or updated from
  // another flow instead of through the plan select change handler.
  React.useEffect(() => {
    if (form.plan === 'pro' && form.enabledModules.length !== SELECTABLE_MODULE_KEYS.length) {
      setForm(current => ({ ...current, enabledModules: [...SELECTABLE_MODULE_KEYS] }));
    } else if (
      form.plan === 'basic'
      && (form.enabledModules.length !== BASIC_MODULE_KEYS.length || !BASIC_MODULE_KEYS.every(key => form.enabledModules.includes(key)))
    ) {
      setForm(current => ({ ...current, enabledModules: [...BASIC_MODULE_KEYS] }));
    }
  }, [form.plan]);

  // La base ne peut pas être retirée — on ne peut qu'ajouter des modules
  const toggle = (key: string) => {
    if (isBaseModule(key)) return;
    setForm(f => ({
      ...f,
      enabledModules: f.enabledModules.includes(key)
        ? f.enabledModules.filter(k => k !== key)
        : [...f.enabledModules, key]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidCenterPhone(form.phoneNumber)) {
      toast.error('يجب أن يحتوي رقم الهاتف على 8 أرقام بالضبط.');
      return;
    }
    if (!form.centerType) {
      toast.error('اختر نوع المؤسسة (روضة أطفال أو مركز تدريب).');
      return;
    }
    setSaving(true);
    try {
      const logoUrl = logoFile ? await uploadSelectedLogo() : form.logoUrl;
      const created = await createCenterApi({ ...form, logoUrl, convertFromRequestId: convertRequestId });
      if (created.invoice) {
        toast.success(`تم إنشاء المركز. فاتورة ${created.invoice.invoiceNumber} (${formatTnd(created.invoice.amount)}) — قيد الانتظار للدفع.`);
      } else {
        toast.success('تم إنشاء المركز بنجاح!');
      }
      onCreated();
      onClose();
    } catch (err) {
      const code = (err as (Error & { code?: string }))?.code;
      if (code === 'duplicate_email' || code === 'duplicate_slug' || code === 'duplicate_name' || code === 'duplicate') {
        setNotice({
          title: code === 'duplicate_email' ? 'بريد المدير مستخدم مسبقًا'
            : code === 'duplicate_name' ? 'اسم المركز محجوز مسبقًا'
            : code === 'duplicate_slug' ? 'اسم المركز محجوز مسبقًا'
            : 'اسم المركز أو البريد مستخدم مسبقًا',
          message: code === 'duplicate_email'
            ? 'البريد الإلكتروني المدخل للمدير ينتمي إلى مركز آخر. اختر بريدًا إداريًا آخر وحاول مجددًا.'
            : code === 'duplicate_name'
              ? 'يوجد مركز بهذا الاسم بالضبط. الاسم يُستخدم أيضًا كمعرف (slug) — اختر اسمًا مختلفًا.'
              : code === 'duplicate_slug'
                ? 'هذا الاسم يولّد معرفًا (slug) مستخدمًا من مركز آخر. اختر اسمًا مختلفًا.'
                : 'يوجد مركز بنفس المعرف (slug) أو بريد المدير نفسه. عدّل الاسم أو البريد ثم حاول مجددًا.',
        });
      } else {
        toast.error(err instanceof Error ? err.message : 'خطأ في إنشاء المركز');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <BaseModal onClose={onClose} labelledBy="nc-modal-title">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10 rounded-t-3xl">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl overflow-hidden bg-accent-500 shadow-sm shadow-accent-500/20 flex items-center justify-center">
            <img src={icon} alt="" className="w-full h-full object-cover" />
          </span>
          <div>
            <h2 id="nc-modal-title" className="text-base font-black text-slate-900">{convertRequestId ? 'تحويل إلى مركز' : 'مركز جديد'}</h2>
            {convertRequestId && <p className="text-[11px] font-bold text-accent-500">تم تحديد النوع والوحدات المطلوبة مسبقًا</p>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center" aria-label="إغلاق">
          <X className="h-5 w-5 text-slate-500" aria-hidden="true" />
        </button>
      </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          {/* Centre info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="nc-name">اسم المركز *</label>
              <input id="nc-name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition" />
            </div>

            {/* Type d'établissement */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" id="nc-type-label">نوع المؤسسة *</label>
              <div role="radiogroup" aria-labelledby="nc-type-label" className="grid grid-cols-2 gap-3">
                {CENTER_TYPES.map(ct => {
                  const active = form.centerType === ct.key;
                  return (
                    <button key={ct.key} type="button" onClick={() => setForm(f => ({ ...f, centerType: ct.key }))}
                      className={`p-3.5 rounded-2xl border text-start transition-all duration-200 ${
                        active
                          ? 'border-accent-500 bg-accent-500/[0.06] shadow-md shadow-accent-500/10'
                          : 'border-slate-200 bg-white hover:border-accent-500/40 hover:bg-slate-50/50'
                      }`}>
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className={`h-2.5 w-2.5 rounded-full border-2 transition-colors ${active ? 'border-accent-500 bg-accent-500' : 'border-slate-300'}`} />
                        <span className={`text-sm font-black ${active ? 'text-accent-500' : 'text-slate-800'}`}>{ct.label}</span>
                      </div>
                      <span className="block text-[11px] font-semibold text-slate-500 pe-5">{ct.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="nc-logo">شعار المركز</label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="h-16 w-16 rounded-2xl bg-accent-500 p-1 shadow-md shadow-accent-500/20 ring-1 ring-white/40 overflow-hidden shrink-0">
                  <img
                    src={logoPreview || form.logoUrl || icon}
                    alt="Logo du centre"
                    className="w-full h-full rounded-xl object-cover bg-white"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-100 transition">
                      <ImagePlus aria-hidden="true" className="h-4 w-4 text-accent-500" />
                      اختيار صورة
                      <input id="nc-logo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                        className="hidden"
                        onChange={e => handleLogoSelect(e.target.files?.[0])}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleLogoUpload}
                      disabled={!logoFile || logoUploading}
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-accent-500 text-white rounded-xl text-xs font-black shadow-md shadow-accent-500/20 hover:shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {logoUploading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                      تحميل وحفظ
                    </button>
                    {(form.logoUrl || logoFile) && (
                      <button
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, logoUrl: '' })); setLogoFile(null); setLogoPreview(null); }}
                        disabled={logoUploading}
                        className="inline-flex items-center gap-2 px-3.5 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-black hover:bg-red-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        حذف
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500">PNG · JPG · WEBP · SVG · GIF — 2 ميغابايت كحد أقصى. يُرسَل الشعار إلى ImageKit قبل إنشاء المركز.</p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="nc-city">المدينة</label>
              <input id="nc-city" value={form.locationCity} onChange={e => setForm(f => ({ ...f, locationCity: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="nc-phone">الهاتف *</label>
              <input id="nc-phone" required type="tel" inputMode="numeric" maxLength={8} pattern="[0-9]{8}" dir="ltr" value={form.phoneNumber}
                onChange={e => setForm(f => ({ ...f, phoneNumber: normalizePhoneInput(e.target.value) }))}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition text-start" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="nc-plan">الباقة *</label>
              <select id="nc-plan" required value={form.plan} onChange={e => handlePlanChange(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition cursor-pointer">
                <option value="trial">تجربة مجانية</option>
                <option value="basic">Basic</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {form.plan !== 'trial' && (
              <>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="nc-cycle">دورة الفوترة</label>
                  <select id="nc-cycle" value={form.billingCycle} onChange={e => setForm(f => ({ ...f, billingCycle: e.target.value as 'monthly' | 'annual' }))}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition cursor-pointer">
                    <option value="monthly">شهري</option>
                    <option value="annual">سنوي — خصم 20%</option>
                  </select>
                </div>
                {/* Same presentation as the « Essai gratuit » card — free days
                    are an trial before the billing starts, not a separate note. */}
                <div className="sm:col-span-2 rounded-2xl border border-accent-500/30 bg-accent-500/[0.05] px-4 py-3 space-y-2" dir="ltr">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-start">
                    <label htmlFor="new-center-offer-days" className="text-xs font-black text-slate-600">مدة التجربة قبل الاشتراك</label>
                    <div className="flex items-center gap-2">
                      <input id="new-center-offer-days" type="number" min="0" max="3650" step="1" inputMode="numeric" value={form.offerDays}
                        onChange={e => setForm(f => ({ ...f, offerDays: e.target.value }))}
                        className="w-20 border border-accent-500/30 rounded-xl px-2.5 py-2 text-sm font-black text-slate-800 bg-white focus:border-accent-500 focus:ring-0 outline-none text-center" />
                      <span className="text-xs font-bold text-slate-500">يوم</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-start">
                    <span className="text-xs font-black text-slate-600">بداية الاشتراك ({arPlural(offerDays, 'يوم', 'يومان', 'أيام', 'يومًا')})</span>
                    <span className="text-sm font-black text-slate-800">{previewOfferEnd ? fmtDate(previewOfferEnd) : 'اليوم'}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 text-start">مجاني أثناء التجربة — تبدأ الفوترة بعده وفق التعرفة المختارة.</p>
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-accent-500/30 bg-accent-500/[0.05] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-600">التعرفة المحسوبة</span>
                    <span className="text-lg font-black text-accent-500">
                      {automaticPlan ? formatTnd(calculatedTariff) : 'تعرفة متفق عليها'}
                    </span>
                  </div>
                  {automaticPlan ? (
                    <p className="text-[11px] font-semibold text-slate-500 mt-1">
                      {form.billingCycle === 'annual'
                        ? 'الإجمالي السنوي: الإجمالي الشهري × 12 مع خصم 20%.'
                        : 'الإجمالي الشهري للوحدات المختارة.'}
                    </p>
                  ) : (
                    <input type="number" min="0" step="0.01" value={form.monthlyPrice}
                      aria-label="التعرفة الشهرية المتفق عليها بالدينار"
                      onChange={e => setForm(f => ({ ...f, monthlyPrice: e.target.value }))}
                      placeholder="أدخل التعرفة المتفق عليها (دينار)"
                      className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 outline-none" />
                  )}
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1" dir="ltr">
                  <div className="flex items-center justify-between gap-3 text-start">
                    <span className="text-xs font-black text-slate-600">نهاية الاشتراك المحسوبة</span>
                    <span className="text-sm font-black text-slate-800">{fmtDate(previewEnd)}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 text-start">
                    {offerDays > 0
                      ? `تجربة مجانية لمدة ${arPlural(offerDays, 'يوم', 'يومان', 'أيام', 'يومًا')}, ثم ${form.billingCycle === 'annual' ? '365 يومًا' : '30 يومًا'} محسوبًا وفق تعرفة الباقة.`
                      : `${form.billingCycle === 'annual' ? '365 يومًا' : '30 يومًا'} من تاريخ الإنشاء.`}
                  </p>
                </div>
              </>
            )}
            {form.plan === 'trial' && (
              <div className="sm:col-span-2 rounded-2xl border border-accent-500/30 bg-accent-500/[0.05] px-4 py-3 space-y-2" dir="ltr">
                <div className="flex flex-wrap items-center justify-between gap-3 text-start">
                  <label htmlFor="new-center-trial-days" className="text-xs font-black text-slate-600">مدة التجربة المجانية</label>
                  <div className="flex items-center gap-2">
                    <input id="new-center-trial-days" type="number" min="1" max="3650" step="1" inputMode="numeric" value={form.trialDays}
                      onChange={e => setForm(f => ({ ...f, trialDays: e.target.value }))}
                      className="w-20 border border-accent-500/30 rounded-xl px-2.5 py-2 text-sm font-black text-slate-800 bg-white focus:border-accent-500 focus:ring-0 outline-none text-center" />
                    <span className="text-xs font-bold text-slate-500">يوم</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-start">
                  <span className="text-xs font-black text-slate-600">نهاية التجربة ({trialDays} يوم)</span>
                  <span className="text-sm font-black text-slate-800">{fmtDate(previewEnd)}</span>
                </div>
                <p className="text-[11px] font-semibold text-slate-500 text-start">Le centre d’essai reste gratuit.</p>
              </div>
            )}
          </div>

          {/* Director */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] mb-3">Compte Directeur</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="nc-dir-name">الاسم *</label>
                <input id="nc-dir-name" required value={form.directorName} onChange={e => setForm(f => ({ ...f, directorName: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="nc-dir-email">البريد الإلكتروني *</label>
                <input id="nc-dir-email" required type="email" value={form.directorEmail} onChange={e => setForm(f => ({ ...f, directorEmail: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition" />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="nc-dir-password">كلمة السر الأولية *</label>
                <input id="nc-dir-password" required type="password" minLength={6} value={form.directorPassword} onChange={e => setForm(f => ({ ...f, directorPassword: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition" />
              </div>
            </div>
          </div>

          {/* Modules : base verrouillée + additions */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] mb-3">وحدات مفعّلة</p>

            <div className="flex flex-wrap gap-2 mb-3">
              {BASE_MODULE_KEYS.map(key => (
                <span key={key} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-accent-500 text-white shadow-sm shadow-accent-500/25 cursor-default">
                  <Lock aria-hidden="true" className="h-4 w-4" />
                  {MODULE_LABEL(key)}
                  <span className="text-[11px] font-bold bg-white/25 rounded-full px-1.5 py-px uppercase">Base</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-accent-500 text-white shadow-sm shadow-accent-500/25 cursor-default">
                <Lock aria-hidden="true" className="h-4 w-4" />
                {MODULE_LABEL(BUNDLED_MODULE_KEY)}
                <span className="text-[11px] font-bold bg-white/25 rounded-full px-1.5 py-px uppercase">Offert</span>
              </span>
            </div>

            {form.plan === 'basic' ? (
              <p className="text-[11px] font-semibold text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                باقة Basic تستخدم وحدات الأساس فقط. تُعاد التعرفة الحساب تلقائيًا.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ALL_MODULES.filter(m => !isBaseModule(m.key) && !isModuleHidden(m.key)).map(m => {
                  const on = form.enabledModules.includes(m.key);
                  return (
                    <button key={m.key} type="button" onClick={() => toggle(m.key)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer inline-flex items-center gap-1 ${
                        on
                          ? 'bg-accent-500 text-white border-accent-500'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-accent-500/40'
                      }`}>
                      {on && <Check aria-hidden="true" className="h-4 w-4" />}
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] font-semibold text-slate-500 mt-2.5">الأساس (مدرسي + مالية) مضمون دائمًا مع سجل الدوام المجاني — لا يمكن إزالتها.</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <SecondaryButton type="button" onClick={onClose}>إلغاء</SecondaryButton>
            <PrimaryButton
              type="submit"
              disabled={saving}
              loading={saving}
              icon={saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
            >
              إنشاء المركز
            </PrimaryButton>
          </div>
        </form>
      </BaseModal>
      <NoticeDialog notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}

export default NewCenterModal;
