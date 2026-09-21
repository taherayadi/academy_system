import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2, Clock,
  CheckCircle2, PauseCircle, Plus, RefreshCw,
  CalendarClock, Layers, Trash2, Check, X, Loader2, Upload,
  Mail, Phone, FileText, DollarSign, TrendingUp, AlertCircle,
  Receipt, Edit, BarChart3, Lock, Search, GraduationCap, ArrowRight,
  ChevronLeft, ChevronRight, ImagePlus, Printer, ChevronDown, AlertTriangle
} from 'lucide-react';
import {
  fetchCentersApi, createCenterApi, updateCenterApi, deleteCenterApi,
  uploadPlatformLogoApi,
  fetchDemoRequestsApi, updateDemoRequestApi, deleteDemoRequestApi,
  fetchPlatformBillingApi, fetchInvoicesApi, updateInvoiceApi, deleteInvoiceApi,
  fetchModulePricesApi, updateModulePricesApi, CenterInvoice, ModulePrice, PlatformBillingSummary, PlanChangeOutcome,
  fetchCenterPlansApi, centerPlanActionApi, CenterPlansView,
  fetchAdvertisementsApi, createAdvertisementApi, updateAdvertisementApi, deleteAdvertisementApi,
  uploadMultipleImagesApi,
  fetchRenewalRequestsApi
} from '../api';
import RenewalReviewModal from './RenewalReviewModal';
import { CenterTenant, DemoRequest, ModuleKey, PlatformAdvertisement, AD_POSITION_SPECS, adPositionLabel, RenewalRequest } from '../types';
import { planLabel } from '../utils/pricing';
import { openInvoicePrintWindow } from '../utils/invoicePrint';
import { RevenueChart } from './charts/RevenueChart';
import { PlanDistributionChart } from './charts/PlanDistributionChart';
import { SubscriptionGrowthChart } from './charts/SubscriptionGrowthChart';

const RENEWAL_STATUS_LABEL: Record<string, string> = {
  trial: 'تجربة', active: 'نشط', suspended: 'موقوف', expired: 'منتهٍ',
};
import { analyzePlanChange, ClientPlanDecision } from '../utils/planChange';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useLiveSync, LIVE_SYNC_INTERVAL_MS } from '../hooks/useLiveSync';
import { usePubNubSync } from '../hooks/usePubNubSync';
import icon from '../assets/icon.png';

// Phase 2 design system primitives (src/components/ui)
import { BaseModal, FormField, PrimaryButton, SecondaryButton, StatusBadge, SkeletonCard } from './ui';
import { StatusTone, toneClasses } from './ui/StatusBadge';

// ─── Constants ─────────────────────────────────────────────────────────────
// Base plan: Scolaire + Finance (priced) + Jd. Horaires (bundled, no tarif)
const BASE_MODULE_KEYS = ['scolaire', 'finance'];
const BUNDLED_MODULE_KEY = 'studentTimeSheets'; // Jd. Horaires — offert avec la base, sans tarif
const PAGE_SIZE = 9; // Centres & Demandes : 9 cartes par page (3 lignes × 3 colonnes)

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
const ALL_MODULE_KEYS = ALL_MODULES.map(module => module.key);
// Bibliothèque désactivée pour l'instant : masquée des sélections de modules
// (création / édition / Plans & factures) — la page Tarifs garde son prix.
const isModuleHidden = (key: string) => key === 'bibliotheque';
const SELECTABLE_MODULE_KEYS = ALL_MODULE_KEYS.filter(k => !isModuleHidden(k as string));
const BASIC_MODULE_KEYS = [...BASE_MODULE_KEYS, BUNDLED_MODULE_KEY];

const MODULE_LABEL = (key: string) => ALL_MODULES.find(m => m.key === key)?.label || key;
const isBaseModule = (key: string) =>
  (BASE_MODULE_KEYS as string[]).includes(key) || key === BUNDLED_MODULE_KEY;

function normalizeCenterModules(modules?: string[] | null): string[] {
  return Array.from(new Set([
    ...BASE_MODULE_KEYS,
    BUNDLED_MODULE_KEY,
    ...(modules || [])
  ]));
}

export type PlatformAdminPage = 'overview' | 'centers' | 'requests' | 'finance' | 'pricing' | 'advertisements' | 'renewals';

interface PlatformAdminDashboardProps {
  /** Page courante — pilotée par le menu de l'application (App.tsx) */
  page?: PlatformAdminPage;
  /** Navigation interne (vers une autre page du menu) */
  onNavigate?: (page: PlatformAdminPage) => void;
}

/** requestedModules may arrive as a JSON string, comma list, or array */
function parseModules(rm?: string[] | string): string[] {
  if (!rm) return [];
  if (Array.isArray(rm)) return rm.filter(Boolean);
  try {
    const parsed = JSON.parse(rm);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch { /* not JSON */ }
  return String(rm).split(',').map(s => s.trim()).filter(Boolean);
}

/** School year like 2026/2027 (September based) */
function currentSchoolYear(): string {
  const d = new Date();
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${y + 1}`;
}

// ─── Labels & badges ───────────────────────────────────────────────────────
// Basic is stored as 'starter'; the database also accepts Growth, Pro, and Custom.
const PLAN_LABEL: Record<string, string> = {
  starter: 'الأساسية',
  basic: 'الأساسية',
  growth: 'النمو',
  pro: 'الاحترافية',
  custom: 'مخصصة'
};

const PLAN_BADGE: Record<string, StatusTone> = {
  starter: 'neutral', basic: 'neutral', growth: 'neutral', pro: 'brand', custom: 'brand'
};

const CENTER_TYPE_LABEL: Record<string, string> = {
  jardin: 'روضة أطفال',
  formation: 'مركز تدريب'
};

/** Normalise le type d'établissement : 'jardin' | 'formation' | '' */
function normalizeCenterType(raw?: string): 'jardin' | 'formation' | '' {
  const v = String(raw || '').trim().toLowerCase();
  if (v.includes('jardin')) return 'jardin';
  if (v.includes('formation') || v.includes('centre')) return 'formation';
  return '';
}

/** Capitalise la première lettre de chaque mot : "ahmed ben-ali" → "Ahmed Ben-Ali" */
function titleCaseName(value?: string): string {
  return (value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(/([\s-])/)
    .map(p => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join('');
}

// Recherche insensible à la casse et aux accents (« école » trouve « École »).
function normalizeText(value?: string): string {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const CENTER_TYPES: { key: 'jardin' | 'formation'; label: string; hint: string }[] = [
  { key: 'jardin', label: 'روضة أطفال', hint: 'ما قبل المدرسي · الروضات' },
  { key: 'formation', label: 'مركز تدريب', hint: 'دعم · دروس · دورات' }
];

const STATUS_BADGE: Record<string, StatusTone> = {
  trial: 'brand', active: 'brand', suspended: 'neutral', expired: 'neutral',
};
const STATUS_LABEL: Record<string, string> = {
  trial: 'تجربة', active: 'نشط', suspended: 'موقوف', expired: 'منتهٍ'
};

const REQ_STATUS_BADGE: Record<string, StatusTone> = {
  new: 'brand', contacted: 'brand', converted: 'brand', archived: 'neutral',
};
const REQ_STATUS_LABEL: Record<string, string> = {
  new: 'جديد', contacted: 'تم الاتصال', converted: 'محوَّل', archived: 'مؤرشف'
};

const REQ_TYPE_LABEL: Record<string, string> = {
  trial: 'تجربة مجانية', demo: 'عرض توضيحي', info: 'Infos'
};

import { fmtDate, arPlural } from '../utils/format';

function daysLeft(ts?: number | null): number | null {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / 86400000);
}

function normalizePhoneInput(value?: string): string {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 8);
}

function isValidCenterPhone(value: string): boolean {
  return /^[0-9]{8}$/.test(value);
}

const AUTOMATIC_PLAN_KEYS = ['basic', 'growth', 'pro'];
const ANNUAL_DISCOUNT = 0.2;

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

function formatTnd(value: number): string {
  return `${value.toLocaleString('ar-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;
}

/** Badge + label of an invoice status (a pending cheque gets its own badge). */
function invoiceStatusMeta(inv: { status: string; paymentMethod?: string | null }): { label: string; tone: StatusTone } {
  if (inv.status === 'pending' && inv.paymentMethod === 'cheque') {
    return { label: 'شيك قيد الانتظار', tone: 'brand' };
  }
  switch (inv.status) {
    case 'pending': return { label: 'قيد الانتظار', tone: 'warning' };
    case 'paid': return { label: 'مدفوعة', tone: 'brand' };
    case 'overdue': return { label: 'متأخرة', tone: 'error' };
    case 'cancelled': return { label: 'ملغاة', tone: 'neutral' };
    default: return { label: inv.status, tone: 'neutral' };
  }
}

function paymentMethodLabel(method?: string | null): string {
  if (method === 'cash') return 'نقدًا';
  if (method === 'cheque') return 'شيك';
  return method || '—';
}

function inferredSubscriptionStart(center: CenterTenant): number | null {
  if (center.status === 'trial') return null;
  if (center.trialEndsAt) return center.trialEndsAt;
  if (!center.subscriptionEndsAt) return null;
  const durationDays = center.billingCycle === 'annual' ? 365 : 30;
  return center.subscriptionEndsAt - durationDays * 86400000;
}

// ─── Segmented filter control (landing style) ──────────────────────────────
// ── Pagination (thème plateforme) ──────────────────────────────────────────
function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current - 1, current, current + 1].filter(p => p >= 1 && p <= total));
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of [...set].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

function Pagination({ page, totalPages, total, onChange, size = PAGE_SIZE }: {
  page: number; totalPages: number; total: number; onChange: (page: number) => void; size?: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-3xl bg-white border border-slate-200 shadow-sm px-5 py-3">
      <span className="text-xs font-bold text-slate-500">
        {(page - 1) * size + 1}–{Math.min(page * size, total)} من {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-accent-500/40 hover:text-accent-500 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          aria-label="الصفحة السابقة">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {pageNumbers(page, totalPages).map((p, i) => p === '…' ? (
          <span key={`gap-${i}`} className="h-9 min-w-6 flex items-center justify-center text-xs font-black text-slate-400">…</span>
        ) : (
          <button key={p} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}
            className={`h-9 min-w-9 px-2 rounded-xl text-xs font-black transition cursor-pointer ${
              p === page
                ? 'bg-accent-500 text-white shadow-sm shadow-accent-500/20'
                : 'border border-slate-200 text-slate-500 hover:border-accent-500/40 hover:text-accent-500'
            }`}>
            {p}
          </button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-accent-500/40 hover:text-accent-500 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          aria-label="الصفحة التالية">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options, value, onChange
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center p-1 bg-white border border-slate-200 rounded-2xl shadow-sm">
      {options.map(o => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition-all cursor-pointer ${
              active
                ? 'bg-accent-500 text-white shadow-sm shadow-accent-500/20'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Dismissible notice dialog (duplicate name/slug/email, etc.) ───────────
function NoticeDialog({ notice, onDismiss }: {
  notice: { title: string; message: string } | null;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {notice && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onDismiss}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200/80"
          >
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500">
                  <AlertTriangle aria-hidden="true" className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-black text-sm">{notice.title}</h3>
              </div>
              <button onClick={onDismiss} aria-label="إغلاق" className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
                <X className="h-5 w-5 text-white/70" aria-hidden="true" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-slate-600 leading-relaxed">{notice.message}</p>
              <div className="mt-6 flex justify-end">
                <button onClick={onDismiss}
                  className="px-6 py-2.5 bg-accent-500 text-white font-black text-sm rounded-xl hover:bg-accent-700 transition cursor-pointer shadow-sm shadow-accent-500/20">
                  Compris
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

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

// ─── Edit Invoice Modal (statut / paiement / chèque) ────────────────────────
// `onPrint` reuses the Finance list's print path (src/utils/invoicePrint.ts):
// the printable copy always opens in its own window rather than being printed
// straight from this dialog (a `backdrop-blur` overlay + scaled modal print
// badly). The window's script-free markup, and the CSP reason for it, live
// with that module.
function EditInvoiceModal({ invoice, onClose, onSaved, onPrint }: {
  invoice: CenterInvoice;
  onClose: () => void;
  onSaved: () => void;
  onPrint?: (invoice: CenterInvoice) => void;
}) {
  const toast = useToast();
  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition';
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<CenterInvoice['status']>(invoice.status);
  const [method, setMethod] = useState<string>(
    invoice.paymentMethod === 'cash' || invoice.paymentMethod === 'cheque' ? invoice.paymentMethod : ''
  );
  const [chequeNumber, setChequeNumber] = useState(invoice.chequeNumber || '');
  const [chequeDate, setChequeDate] = useState(
    invoice.chequeDate ? new Date(invoice.chequeDate).toISOString().slice(0, 10) : ''
  );
  const [notes, setNotes] = useState(invoice.notes || '');

  const chequeMode = method === 'cheque';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'paid' && !method) {
      toast.error('اختر طريقة الدفع (نقدًا أو شيك).');
      return;
    }
    if (chequeMode && !chequeNumber.trim()) {
      toast.error('رقم الشيك إلزامي.');
      return;
    }
    if (chequeMode && !chequeDate) {
      toast.error('تاريخ الشيك إلزامي.');
      return;
    }
    setSaving(true);
    try {
      const chequeDateTs = chequeMode && chequeDate ? new Date(`${chequeDate}T12:00:00`).getTime() : null;
      await updateInvoiceApi(invoice.id, {
        status,
        paymentMethod: method || null,
        chequeNumber: chequeMode ? chequeNumber.trim() : null,
        chequeDate: chequeMode ? chequeDateTs : null,
        notes
      });
      toast.success('تم تحديث الفاتورة');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ أثناء التحديث.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div


        className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-accent-500/10 rounded-xl"><Receipt aria-hidden="true" className="h-4 w-4 text-accent-500" /></span>
            <h2 className="text-base font-black text-slate-900">فاتورة {invoice.invoiceNumber}</h2>
          </div>
          <div className="flex items-center gap-1">
            {onPrint && (
              <button type="button" onClick={() => onPrint(invoice)} title="طباعة الفاتورة" aria-label="طباعة الفاتورة"
                className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
                <Printer className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </button>
            )}
<button type="button" onClick={onClose} title="إغلاق" aria-label="إغلاق" className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
                <X className="h-5 w-5 text-slate-500" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 mb-4 text-xs font-bold text-slate-600">
          {invoice.centerName} · {invoice.amount.toFixed(2)} TND
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="الحالة" id="ei-status">
            <select id="ei-status" value={status} onChange={e => setStatus(e.target.value as CenterInvoice['status'])} className={`${inputCls} cursor-pointer`}>
              <option value="pending">قيد الانتظار</option>
              <option value="paid">مدفوعة</option>
              <option value="overdue">متأخرة</option>
              <option value="cancelled">ملغاة</option>
            </select>
          </FormField>

          <FormField label="طريقة الدفع" id="ei-method">
            <select id="ei-method" value={method} onChange={e => setMethod(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value="">—</option>
              <option value="cash">نقدًا</option>
              <option value="cheque">شيك</option>
            </select>
          </FormField>

          {chequeMode && (
            <div className="rounded-2xl border border-accent-500/20 bg-accent-500/5 p-3.5 space-y-3">
              <p className="text-[11px] font-bold text-accent-700 leading-relaxed">
                شيك مستلم: اترك الحالة «قيد الانتظار» — تظهر الفاتورة في «شيكات قيد الانتظار» و
                لا <span className="underline">تُحتسب ضمن الإيرادات</span> حتى تتحصيلها
                (زر «تحصيل»، الذي يجعل الفاتورة «مدفوعة»).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="رقم الشيك" id="ei-cheque">
                  <input
                    id="ei-cheque"
                    type="text"
                    value={chequeNumber}
                    onChange={e => setChequeNumber(e.target.value)}
                    placeholder="مثال: 001245"
                    dir="ltr"
                    className={`${inputCls} text-start`}
                  />
                </FormField>
                <FormField label="تاريخ الشيك" id="ei-cheque-date">
                  <input
                    id="ei-cheque-date"
                    type="date"
                    dir="ltr"
                    value={chequeDate}
                    onChange={e => setChequeDate(e.target.value)}
                    className={`${inputCls} cursor-pointer input-date-ltr text-start`}
                  />
                </FormField>
              </div>
            </div>
          )}

          <FormField label="ملاحظات" id="ei-notes">
            <textarea id="ei-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
          </FormField>

          <div className="flex items-center justify-between gap-3 pt-2">
            {onPrint ? (
              <button type="button" onClick={() => onPrint(invoice)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer"
>
                <Printer aria-hidden="true" className="h-4 w-4 text-slate-500" /> طباعة
              </button>
            ) : <span />}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2.5 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer">
                إلغاء
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-black text-white bg-accent-500 rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer disabled:opacity-60">
                {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                Sauvegarder
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Edit Center Modal ──────────────────────────────────────────────────────
function centerDateInputValue(timestamp?: number | null): string {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '';
}

function centerDateTimestamp(value: string): number | null {
  if (!value) return null;
  const timestamp = new Date(`${value}T23:59:59`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

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


// Labels/badges for the per-center plan audit trail (center_plan_history).
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
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">التفاصيل</th>
                        <th className="px-3 py-2 text-end">Montant</th>
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

// Emplacements connus → libellés français (une valeur inconnue s'affiche telle quelle).
const AD_LOCATION_LABELS: Record<string, string> = {
  landing_page: 'الصفحة الرئيسية',
  center_admin: 'لوحة تحكم المراكز',
  both: 'الرئيسية + لوحات التحكم',
};
const adLocationLabel = (loc?: string) => (loc && AD_LOCATION_LABELS[loc]) || loc || '—';

type AdStatus = 'live' | 'draft' | 'scheduled' | 'paused' | 'expired';
function adStatusOf(ad: PlatformAdvertisement, now = Date.now()): AdStatus {
  if (!ad.isActive) return 'paused';
  const sod = new Date(now); sod.setHours(0, 0, 0, 0);
  const eod = new Date(now); eod.setHours(23, 59, 59, 999);
  if (ad.dateEnd < sod.getTime()) return 'expired';
  if (ad.dateStart > eod.getTime()) return 'scheduled';
  return ad.isPublished ? 'live' : 'draft';
}
const AD_STATUS_META: Record<AdStatus, { label: string; tone: StatusTone }> = {
  live: { label: 'متصل', tone: 'brand' },
  draft: { label: 'مسودة', tone: 'warning' },
  scheduled: { label: 'مجدولة', tone: 'brand' },
  paused: { label: 'متوقفة', tone: 'neutral' },
  expired: { label: 'منتهية', tone: 'error' },
};
const AD_STATUS_FILTERS: Array<{ value: 'all' | AdStatus; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'live', label: 'متصل' },
  { value: 'draft', label: 'مسودات' },
  { value: 'scheduled', label: 'مجدولة' },
  { value: 'paused', label: 'متوقفة' },
  { value: 'expired', label: 'منتهية' },
];

// ─── Advertisement create/edit modal ───────────────────────────────────────
// The platform dashboard's « إعلان جديد » / « تعديل » buttons open this form.
// One upload per file (same ImageKit path as the platform logo); at least one
// image and one center are required — same rules as the backend.
const AD_LOCATION_OPTIONS = [
  { value: 'landing_page', label: 'الصفحة الرئيسية (الواجهة)' },
  { value: 'center_admin', label: 'لوحة تحكم المراكز' },
  { value: 'both', label: 'الرئيسية + لوحات التحكم' },
  { value: '__custom__', label: 'موقع مخصص…' },
];

function adDateInput(ts: number): string {
  const d = new Date(ts || Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function AdvertisementFormModal({ ad, centers, onClose, onSaved }: {
  ad?: PlatformAdvertisement | null;
  centers: CenterTenant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = !!ad;
  const fieldCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition';
  const knownLocation = !ad || ['landing_page', 'center_admin', 'both'].includes(String(ad.location));

  const [title, setTitle] = useState(ad?.title || '');
  const [locationSel, setLocationSel] = useState(knownLocation ? (ad?.location || 'landing_page') : '__custom__');
  const [customLocation, setCustomLocation] = useState(knownLocation ? '' : String(ad?.location || ''));
  const [dateStart, setDateStart] = useState(adDateInput(ad?.dateStart ?? Date.now()));
  const [dateEnd, setDateEnd] = useState(adDateInput(ad?.dateEnd ?? Date.now() + 30 * 86400000));
  const [imageUrls, setImageUrls] = useState<string[]>(ad?.imageUrls || []);
  const [extraImageUrl, setExtraImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState(ad?.linkUrl || '');
  const [priority, setPriority] = useState(String(ad?.priority ?? 100));
  const [isActive, setIsActive] = useState(ad ? !!ad.isActive : true);
  const [isPublished, setIsPublished] = useState(ad ? !!ad.isPublished : false);
  const [centerIds, setCenterIds] = useState<string[]>(ad?.centerIds || []);
  const [centerQuery, setCenterQuery] = useState('');
  const [positions, setPositions] = useState<string[]>(ad?.positions || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const location = locationSel === '__custom__' ? customLocation.trim() : locationSel;
  // Une pub de vitrine ne cible aucun centre ; tableau de bord (+ both) en exigent un.
  const centersRequired = locationSel === 'center_admin' || locationSel === 'both';
  const showCenterPicker = locationSel !== 'landing_page';

  // Filtre par nom : avec des dizaines de centres, la liste défilante seule
  // est inutilisable. La sélection déjà faite n'est jamais perdue en filtrant.
  const filteredCenters = useMemo(() => {
    const q = normalizeText(centerQuery.trim());
    if (!q) return centers;
    return centers.filter(c => normalizeText((c as any).name).includes(q));
  }, [centers, centerQuery]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadMultipleImagesApi(Array.from(files));
      setImageUrls(current => [...current, ...urls.filter(Boolean)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الصور');
    } finally {
      setUploading(false);
    }
  };

  const toggleCenter = (id: string) => setCenterIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  const togglePosition = (id: string) => setPositions(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startTs = new Date(`${dateStart}T00:00:00`).getTime();
    const endTs = new Date(`${dateEnd}T23:59:59`).getTime();
    if (!title.trim()) { toast.error('عنوان الإعلان إلزامي.'); return; }
    if (!location) { toast.error('اختر موقعًا (أو اكتبه).'); return; }
    if (imageUrls.length === 0) { toast.error('أضف صورة واحدة على الأقل.'); return; }
    if (centersRequired && centerIds.length === 0) { toast.error('اختر مركزًا مستهدفًا واحدًا على الأقل.'); return; }
    if (!startTs || !endTs || endTs < startTs) { toast.error('تواريخ غير صالحة — يجب أن تتلو النهاية البداية.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        dateStart: startTs,
        dateEnd: endTs,
        location,
        imageUrls,
        linkUrl: linkUrl.trim(),
        priority: Number(priority) || 100,
        isActive,
        isPublished,
        positions,
        centerIds: locationSel === 'landing_page' ? [] : centerIds,
      };
      if (isEdit && ad) await updateAdvertisementApi(ad.id, payload);
      else await createAdvertisementApi(payload);
      toast.success(isEdit ? 'تم تحديث الإعلان.' : 'تم إنشاء الإعلان.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ أثناء حفظ الإعلان');
    } finally {
      setSaving(false);
    }
  };

  const togglePill = (on: boolean, set: (v: boolean) => void, labelOn: string, labelOff: string) => (
    <button type="button" onClick={() => set(!on)}
      className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition cursor-pointer ${on ? 'border-accent-500 bg-accent-500/[0.06] text-accent-700' : 'border-slate-200 bg-white text-slate-500'}`}>
      {on ? labelOn : labelOff}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-accent-500" aria-hidden="true" /> {isEdit ? 'تعديل الإعلان' : 'إنشاء إعلان'}
          </h2>
          <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
            <X className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="ad-title" className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Titre *</label>
              <input id="ad-title" value={title} onChange={e => setTitle(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label htmlFor="ad-location" className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Emplacement *</label>
              <select id="ad-location" value={locationSel} onChange={e => setLocationSel(e.target.value)} className={`${fieldCls} cursor-pointer`}>
                {AD_LOCATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {locationSel === '__custom__' && (
                <input value={customLocation} onChange={e => setCustomLocation(e.target.value)} placeholder="مثال: فواتير، مقصف…"
                  className={`${fieldCls} mt-2`} />
              )}
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ad-priority">الأولوية (الأصغر = يُعرض أولًا)</label>
              <input id="ad-priority" type="number" min={1} max={9999} value={priority} onChange={e => setPriority(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ad-start">البداية *</label>
              <input id="ad-start" type="date" dir="ltr" value={dateStart} onChange={e => setDateStart(e.target.value)} className={`${fieldCls} text-start`} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ad-end">النهاية *</label>
              <input id="ad-end" type="date" dir="ltr" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className={`${fieldCls} text-start`} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ad-link" className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Lien cliquable (optionnel)</label>
              <input id="ad-link" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" className={fieldCls} dir="ltr" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {togglePill(isActive, setIsActive, 'Active', 'Inactive')}
            {togglePill(isPublished, setIsPublished, 'منشورة', 'مسودة')}
            <span className="text-[11px] font-semibold text-slate-500">الإعلان غير النشط أو المسودة لا يظهر في أي شريط عرض.</span>
          </div>

          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Images * (carrousel, dans l’ordre)</p>
            {imageUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                {imageUrls.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative group aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute top-1 start-1 text-[11px] font-black bg-white/90 text-slate-600 rounded px-1.5 py-0.5">#{i + 1}</span>
                    <button type="button" onClick={() => setImageUrls(cur => cur.filter((_, j) => j !== i))}
                      className="absolute top-1 end-1 p-1 rounded-lg bg-white/90 text-red-500 hover:bg-red-50 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center" title="إزالة هذه الصورة" aria-label='حذف الصورة'>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-100 transition">
                <ImagePlus className="h-4 w-4 text-accent-500" aria-hidden="true" /> Choisir des images
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              </label>
              {uploading && <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent-500" /> رفع…</span>}
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <input id="ad-image-url" value={extraImageUrl} onChange={e => setExtraImageUrl(e.target.value)} placeholder="…أو ألصق رابط صورة"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:border-accent-500 outline-none" dir="ltr" />
                <button type="button" disabled={!extraImageUrl.trim()}
                  onClick={() => { setImageUrls(cur => [...cur, extraImageUrl.trim()]); setExtraImageUrl(''); }}
                  className="px-3 py-2 text-xs font-black text-accent-500 bg-accent-500/10 border border-accent-500/30 rounded-xl hover:bg-accent-500/20 transition cursor-pointer disabled:opacity-40">
                  إضافة
                </button>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Positions d’affichage ({positions.length})</p>
            <div className="flex flex-wrap gap-2">
              {AD_POSITION_SPECS.map(spec => {
                const on = positions.includes(spec.id);
                return (
                  <button key={spec.id} type="button" title={spec.hint} onClick={() => togglePosition(spec.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${on ? 'border-accent-500 bg-accent-500/10 text-accent-500' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    {on ? '✓ ' : ''}{spec.label} <span className="font-black">· {spec.size}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] font-semibold text-slate-500 mt-1.5">كل موضع محدد يعرض الإعلان بتنسيقه: <span className="font-black text-slate-500">المستطيل</span> يشغل كامل العرض المتاح (<span className="font-black text-slate-500">حتى 1100 بكسل</span>، ارتفاع مرن من 220 إلى 420 بكسل — أكبر بكثير من 300×250 السابق) ضمن صفحات المحتوى، و<span className="font-black text-slate-500">الوشاح</span> كطبقة كاملة الشاشة قابلة للإغلاق — على الجوال والحاسوب، في الواجهة ولوحات التحكم. بدون موضع، يُستخدم شريط العرض المعتاد للموقع.</p>
          </div>

          {showCenterPicker && <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              المراكز المستهدفة{centersRequired ? ' *' : ' (اختياري)'} ({centerIds.length})
            </p>
            {centers.length === 0 ? (
              <p className="text-[11px] font-semibold text-slate-500">لا يوجد مركز على المنصة.</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    id="ad-center-search"
                    value={centerQuery}
                    onChange={e => setCenterQuery(e.target.value)}
                    placeholder="ابحث عن مركز بالاسم…"
                    className="w-full ps-9 pe-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-accent-500 focus:ring-0 outline-none transition"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
                  {filteredCenters.length === 0 ? (
                    <p className="px-3 py-2.5 text-[11px] font-semibold text-slate-500">
                      لا يوجد مركز يطابق « {centerQuery.trim()} ».
                    </p>
                  ) : filteredCenters.map(c => (
                    <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={centerIds.includes(c.id)} onChange={() => toggleCenter(c.id)} className="accent-accent-500" />
                      <span className="truncate">{titleCaseName((c as any).name) || c.name}</span>
                      <span className="ms-auto text-[11px] font-black text-slate-500">{RENEWAL_STATUS_LABEL[c.status] || c.status}</span>
                    </label>
                  ))}
                </div>
                {centerQuery.trim() !== '' && filteredCenters.length > 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    ${arPlural(filteredCenters.length, 'مركز', 'مركزان', 'مراكز', 'مركزًا')} من {centers.length}
                    {centerIds.length > 0 ? ` · ${arPlural(centerIds.length, 'مركز محدد', 'مركزان محددان', 'مراكز محددة', 'مركزًا محددًا')}` : ''}
                  </p>
                )}
              </>
            )}
          </div>}
          {!showCenterPicker && (
            <p className="text-[11px] font-semibold text-slate-500">إعلان الواجهة لا يستهدف أي مركز — يظهر في الصفحة الرئيسية.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer">إلغاء</button>
            <button type="submit" disabled={saving || uploading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-accent-500 rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer disabled:opacity-60">
              {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {isEdit ? 'حفظ التعديلات' : 'إنشاء الإعلان'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────
export default function PlatformAdminDashboard({ page = 'overview', onNavigate }: PlatformAdminDashboardProps) {
  const toast = useToast();
  const [centers, setCenters] = useState<CenterTenant[]>([]);
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Filters — centers
  const [centerTypeFilter, setCenterTypeFilter] = useState<'all' | 'jardin' | 'formation'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'trial' | 'active' | 'suspended' | 'expired'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | 'basic' | 'growth' | 'pro' | 'custom'>('all');
  // Filters — requests. No 'Tous' and no 'تم الاتصال' tab: the list always
  // starts on Nouveau (legacy 'contacted' requests stay visible there, so
  // none get lost), then Converti / Archivé.
  const [reqTypeFilter, setReqTypeFilter] = useState<'all' | 'jardin' | 'formation'>('all');
  const [reqStatusFilter, setReqStatusFilter] = useState<'new' | 'converted' | 'archived'>('new');
  const [centersPage, setCentersPage] = useState(1);
  const [requestsPage, setRequestsPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);

  const [showNewCenter, setShowNewCenter] = useState(false);
  const [convertRequest, setConvertRequest] = useState<DemoRequest | null>(null);
  const [editCenter, setEditCenter] = useState<CenterTenant | null>(null);
  // Plan manager (« Plans & factures ») — all subscription changes go through it.
  const [planCenter, setPlanCenter] = useState<CenterTenant | null>(null);
  const [deleteCenter, setDeleteCenter] = useState<CenterTenant | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DemoRequest | null>(null);

  // Finance data
  const [billingSummary, setBillingSummary] = useState<PlatformBillingSummary | null>(null);
  const [invoices, setInvoices] = useState<CenterInvoice[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [editInvoice, setEditInvoice] = useState<CenterInvoice | null>(null);

  // Module prices (Tarifs page)
  const [priceYear, setPriceYear] = useState(currentSchoolYear());
  const [priceList, setPriceList] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  // School years that actually exist in the database (module_prices.school_year).
  const [knownYears, setKnownYears] = useState<string[]>([]);
  const [addingYear, setAddingYear] = useState(false);

  // Advertisements
  const [advertisements, setAdvertisements] = useState<PlatformAdvertisement[]>([]);
  // Demandes de renouvellement / changement d'offre envoyées par les centres.
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [renewalsLoading, setRenewalsLoading] = useState(false);
  const [reviewRenewal, setReviewRenewal] = useState<RenewalRequest | null>(null);
  const [renewalKindFilter, setRenewalKindFilter] = useState<'all' | 'renewal' | 'upgrade'>('all');
  const [renewalStatusFilter, setRenewalStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsPage, setAdsPage] = useState(1);
  const [adsStatusFilter, setAdsStatusFilter] = useState<'all' | AdStatus>('all');
  const [showNewAd, setShowNewAd] = useState(false);
  const [editAd, setEditAd] = useState<PlatformAdvertisement | null>(null);
  const [deleteAd, setDeleteAd] = useState<PlatformAdvertisement | null>(null);

  const loadAdvertisements = useCallback(async () => {
    setAdsLoading(true);
    try {
      const ads = await fetchAdvertisementsApi();
      setAdvertisements(ads);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في تحميل الإعلانات');
    } finally {
      setAdsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (page === 'advertisements') {
      loadAdvertisements();
    }
  }, [page, loadAdvertisements]);

  // ── Demandes de renouvellement (migration 0033) ──────────────────────────
  /** Recharge les demandes ; renvoie la liste fraîche ([] si échec, déjà toasté). */
  const loadRenewals = useCallback(async (): Promise<RenewalRequest[]> => {
    setRenewalsLoading(true);
    try {
      const data = await fetchRenewalRequestsApi();
      const list = data.requests || [];
      setRenewalRequests(list);
      return list;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في تحميل الطلبات');
      return [];
    } finally {
      setRenewalsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (page === 'renewals') {
      loadRenewals();
    }
  }, [page, loadRenewals]);

  const filteredRenewals = renewalRequests.filter(r =>
    (renewalKindFilter === 'all' || r.kind === renewalKindFilter) &&
    (renewalStatusFilter === 'all' || r.status === renewalStatusFilter)
  );

  const visibleAds = adsStatusFilter === 'all'
    ? advertisements
    : advertisements.filter(a => adStatusOf(a) === adsStatusFilter);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([fetchCentersApi(), fetchDemoRequestsApi()]);
      setCenters(c);
      setRequests(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /** Après acceptation/refus via « Examiner et appliquer » : le plan et les
   *  factures peuvent avoir changé — on rafraîchit demandes + centres. */
  const onRenewalDecided = useCallback(async () => {
    await loadRenewals();
    load();
  }, [loadRenewals, load]);

  useEffect(() => { load(); }, [load]);

  // ── Temps réel (PubNub) ──────────────────────────────────────────────────
  // Comble le manque de synchro live du tableau de bord plateforme : un
  // signal « refetch » sur le canal `platform` relance les MÊMES handlers de
  // chargement (le payload poussé n'est jamais lu) et une nouvelle demande
  // en attente déclenche un toast. Clés absentes, grant refusé ou déconnexion
  // → `fallback` : un polling léger prend automatiquement le relais avec le
  // même handler (jusqu'ici le dashboard n'avait AUCUNE synchro live).
  const renewalRequestsRef = useRef<RenewalRequest[]>([]);
  renewalRequestsRef.current = renewalRequests;

  const syncLivePlatform = useCallback(async () => {
    const prevPendingIds = new Set(
      renewalRequestsRef.current.filter(r => r.status === 'pending').map(r => r.id)
    );
    const [list] = await Promise.all([loadRenewals(), load()]);
    const incoming = list.filter(r => r.status === 'pending' && !prevPendingIds.has(r.id));
    if (incoming.length > 0) {
      const last = incoming[incoming.length - 1];
      toast.info(
        `طلب تجديد جديد${last.centerName ? ` — ${last.centerName}` : ''} — تبويب «التجديدات».`
      );
    }
  }, [loadRenewals, load, toast]);

  const platformRealtime = usePubNubSync(true, syncLivePlatform);
  useLiveSync(platformRealtime !== 'active', syncLivePlatform, LIVE_SYNC_INTERVAL_MS);

  // Reset filters when switching page
  useEffect(() => {
    setSearch('');
    setCenterTypeFilter('all'); setStatusFilter('all'); setPlanFilter('all');
    setReqTypeFilter('all'); setReqStatusFilter('new');
    setRenewalKindFilter('all'); setRenewalStatusFilter('all');
    setInvoiceSearch(''); setInvoiceStatusFilter('all'); setInvoiceMonthFilter('all'); setInvoiceCentersPage(1);
    setCentersPage(1); setRequestsPage(1);
    setAdsStatusFilter('all'); setAdsPage(1);
  }, [page]);

  // Finance data is loaded exactly once per entry into the Finance tab, and on
  // first Overview visit when no summary is cached yet. Refs (not state) drive
  // the decision so a fetch never re-triggers itself while loading.
  const financePageRef = useRef<PlatformAdminPage | ''>('');
  const financeLoadingRef = useRef(false);
  const billingSummaryRef = useRef(billingSummary);
  billingSummaryRef.current = billingSummary;

  const loadFinanceData = useCallback(async () => {
    if (financeLoadingRef.current) return; // never stack overlapping finance fetches
    financeLoadingRef.current = true;
    setFinanceLoading(true);
    try {
      const [summary, invoiceList] = await Promise.all([
        fetchPlatformBillingApi(),
        fetchInvoicesApi({ limit: 500 })
      ]);
      setBillingSummary(summary.summary);
      setInvoices(invoiceList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في تحميل المالية');
    } finally {
      financeLoadingRef.current = false;
      setFinanceLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (page === 'finance') {
      // Entering the Finance tab always refreshes once (fresh invoices).
      if (financePageRef.current !== 'finance') {
        financePageRef.current = 'finance';
        loadFinanceData();
      }
    } else if (page === 'overview') {
      // Overview only loads finance data when none is cached yet.
      if (!billingSummaryRef.current) {
        financePageRef.current = 'overview';
        loadFinanceData();
      }
    } else {
      // Leaving finance/overview: the next entry must reload.
      financePageRef.current = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Invoice filters (center name + status + month) ──
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | CenterInvoice['status']>('all');
  const [invoiceMonthFilter, setInvoiceMonthFilter] = useState<'all' | string>('all'); // 'YYYY-MM' | 'all'
  const [invoiceCentersPage, setInvoiceCentersPage] = useState(1);
  const INVOICE_GROUPS_PAGE_SIZE = 10; // 10 centres par page
  // Group headers are expanded by default; clicking one toggles its collapse.
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<string, boolean>>({});

  // Months that actually contain invoices (based on the billing period start).
  const invoiceMonths = useMemo(() => {
    const keys = new Set<string>();
    invoices.forEach(inv => {
      const d = new Date(inv.periodStart);
      keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(keys).sort().reverse();
  }, [invoices]);

  const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('ar-TN', { month: 'long', year: 'numeric' });
  };

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter(inv => {
      if (invoiceStatusFilter !== 'all' && inv.status !== invoiceStatusFilter) return false;
      if (invoiceMonthFilter !== 'all') {
        const d = new Date(inv.periodStart);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key !== invoiceMonthFilter) return false;
      }
      if (q && !inv.centerName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invoices, invoiceSearch, invoiceStatusFilter, invoiceMonthFilter]);

  // Invoices paid by cheque but not encashed yet — tracked separately, they
  // are NEVER part of revenue until their status becomes 'paid'.
  const pendingCheques = useMemo(() => invoices.filter(inv =>
    inv.status === 'pending' && inv.paymentMethod === 'cheque' && !!inv.chequeNumber
  ), [invoices]);

  // Print a single invoice in a dedicated, print-ready window. The document is
  // generated by src/utils/invoicePrint.ts: the popup is an about:blank window,
  // so it inherits this app's CSP (`script-src 'self'`) and would refuse any
  // inline <script>/onclick inside it — the printing behaviour is wired from
  // there instead. Only the "popup blocked" case is reported here.
  const handlePrintInvoice = useCallback((inv: CenterInvoice) => {
    if (!openInvoicePrintWindow(inv)) {
      toast.error('اسمح بالنوافذ المنبثقة لطباعة الفاتورة.');
    }
  }, [toast]);

  const invoiceGroups = useMemo(() => {
    const byCenter = new Map<string, { centerId: string; centerName: string; invoices: CenterInvoice[] }>();
    filteredInvoices.forEach(inv => {
      const group = byCenter.get(inv.centerId)
        || { centerId: inv.centerId, centerName: inv.centerName, invoices: [] };
      group.invoices.push(inv);
      byCenter.set(inv.centerId, group);
    });
    return Array.from(byCenter.values()).sort((a, b) => a.centerName.localeCompare(b.centerName));
  }, [filteredInvoices]);

  // Pagination — 10 centres par page (chaque centre affiche toutes ses factures).
  const invoiceGroupsTotalPages = Math.max(1, Math.ceil(invoiceGroups.length / INVOICE_GROUPS_PAGE_SIZE));
  const safeInvoiceGroupsPage = Math.min(invoiceCentersPage, invoiceGroupsTotalPages);
  const pagedInvoiceGroups = invoiceGroups.slice(
    (safeInvoiceGroupsPage - 1) * INVOICE_GROUPS_PAGE_SIZE,
    safeInvoiceGroupsPage * INVOICE_GROUPS_PAGE_SIZE
  );

  // Revenir à la page 1 quand les filtres changent.
  useEffect(() => { setInvoiceCentersPage(1); }, [invoiceSearch, invoiceStatusFilter, invoiceMonthFilter]);

  const loadPrices = useCallback(async (year: string) => {
    setPricesLoading(true);
    try {
      const prices = await fetchModulePricesApi(year);
      const map: Record<string, number> = {};
      ALL_MODULES.forEach(m => { map[m.key] = 15; });
      (prices || []).forEach((p: ModulePrice) => { map[p.module_key] = p.price; });
      // Jd. Horaires est offert avec la base — aucun tarif dédié
      map[BUNDLED_MODULE_KEY] = 0;
      setPriceList(map);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في تحميل التعريفات');
    } finally {
      setPricesLoading(false);
    }
  }, [toast]);

  // Years present in the database → tabs.
  const loadPriceYears = useCallback(async () => {
    try {
      const rows = await fetchModulePricesApi(); // no year → all rows, all years
      const years = Array.from(new Set((rows || []).map(r => String(r.school_year || '')).filter(Boolean)));
      setKnownYears(years);
    } catch { /* silencieux : les années par défaut restent affichées */ }
  }, []);

  useEffect(() => {
    if (page === 'pricing') { loadPrices(priceYear); loadPriceYears(); }
  }, [page, priceYear, loadPrices, loadPriceYears]);

  // Onglets d'années : celles de la base + l'année courante et la suivante.
  const priceYears = useMemo(() => {
    const d = new Date();
    const base = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
    const set = new Set([...knownYears, `${base}/${base + 1}`, `${base + 1}/${base + 2}`]);
    return Array.from(set).sort();
  }, [knownYears]);

  const nextSchoolYear = useMemo(() => {
    const [startStr] = (priceYears[priceYears.length - 1] || currentSchoolYear()).split('/');
    const start = Number(startStr);
    return Number.isFinite(start) ? `${start + 1}/${start + 2}` : '';
  }, [priceYears]);

  // Ajouter une année scolaire : tarifs copiés depuis la dernière année,
  // persistés immédiatement pour que l'année survive à un rechargement.
  const addSchoolYear = async () => {
    if (addingYear || !nextSchoolYear) return;
    setAddingYear(true);
    try {
      const prevYear = priceYears[priceYears.length - 1];
      const prices = await fetchModulePricesApi(prevYear);
      const map: Record<string, number> = {};
      ALL_MODULES.forEach(m => { map[m.key] = 15; });
      (prices || []).forEach((p: ModulePrice) => { map[p.module_key] = p.price; });
      map[BUNDLED_MODULE_KEY] = 0; // Jd. Horaires toujours offert
      await updateModulePricesApi(nextSchoolYear, ALL_MODULES.map(m => ({ module_key: m.key, price: Number(map[m.key] || 0) })));
      setKnownYears(ys => Array.from(new Set([...ys, nextSchoolYear])));
      setPriceList(map);
      setPriceYear(nextSchoolYear);
      toast.success(`تمت إضافة سنة ${nextSchoolYear} — تم نسخ التعريفات من ${prevYear}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في إضافة السنة الدراسية');
    } finally {
      setAddingYear(false);
    }
  };

  const savePrices = async () => {
    setSavingPrices(true);
    try {
      await updateModulePricesApi(priceYear, ALL_MODULES.map(m => ({ module_key: m.key, price: Number(priceList[m.key] || 0) })));
      toast.success('تم حفظ التعريفات');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في حفظ التعريفات');
    } finally {
      setSavingPrices(false);
    }
  };

  // ── Derived KPIs ──
  const activeCenters = centers.filter(c => c.status === 'active').length;
  const trialCenters = centers.filter(c => c.status === 'trial').length;
  const newRequests = requests.filter(r => r.status === 'new').length;

  // Revenue by month (paid invoices) for the overview chart
  const revenueChart = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('ar-TN', { month: 'short' }).replace('.', ''),
        total: 0
      });
    }
    invoices.forEach(inv => {
      if (inv.status !== 'paid') return;
      const d = new Date(inv.paymentDate || inv.createdAt);
      const hit = months.find(m => m.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (hit) hit.total += inv.amount;
    });
    return months;
  }, [invoices]);

  // ── Filtered lists ──
  const q = search.trim().toLowerCase();
  const filteredCenters = centers.filter(c => {
    if (q && !`${c.name} ${c.adminEmail || ''} ${c.locationCity || ''}`.toLowerCase().includes(q)) return false;
    if (centerTypeFilter !== 'all' && normalizeCenterType(c.centerType) !== centerTypeFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (planFilter !== 'all' && (c.plan === 'starter' ? 'basic' : c.plan) !== planFilter) return false;
    return true;
  });
  const filteredRequests = requests.filter(r => {
    if (q && !`${r.fullName} ${r.academyName} ${r.email}`.toLowerCase().includes(q)) return false;
    if (reqTypeFilter !== 'all' && normalizeCenterType(r.centerType) !== reqTypeFilter) return false;
    // 'new' intentionally includes legacy 'contacted' requests.
    if (reqStatusFilter === 'new' ? (r.status !== 'new' && r.status !== 'contacted') : r.status !== reqStatusFilter) return false;
    return true;
  });

  // Retour à la page 1 dès qu'un filtre ou la recherche change
  useEffect(() => { setCentersPage(1); }, [search, centerTypeFilter, statusFilter, planFilter]);
  useEffect(() => { setRequestsPage(1); }, [search, reqTypeFilter, reqStatusFilter]);

  // Pagination — 9 éléments par page (grille 3 × 3)
  const centersTotalPages = Math.max(1, Math.ceil(filteredCenters.length / PAGE_SIZE));
  const safeCentersPage = Math.min(centersPage, centersTotalPages);
  const pagedCenters = filteredCenters.slice((safeCentersPage - 1) * PAGE_SIZE, safeCentersPage * PAGE_SIZE);
  const requestsTotalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const safeRequestsPage = Math.min(requestsPage, requestsTotalPages);
  const pagedRequests = filteredRequests.slice((safeRequestsPage - 1) * PAGE_SIZE, safeRequestsPage * PAGE_SIZE);

  // ── Handlers ──
  const handleToggleStatus = async (c: CenterTenant) => {
    const newStatus = c.status === 'suspended' ? 'active' : 'suspended';
    try {
      await updateCenterApi(c.id, { status: newStatus });
      toast.success(newStatus === 'active' ? 'تم تفعيل المركز' : 'تم إيقاف المركز');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ');
    }
  };

  const handleApplyScheduledPlan = async (c: CenterTenant) => {
    if (!c.scheduledPlan) return;
    const planLabelValue = PLAN_LABEL[c.scheduledPlan.plan === 'starter' ? 'basic' : c.scheduledPlan.plan];
    try {
      const res = await updateCenterApi(c.id, { applyScheduledPlan: true });
      const outcome = res.planChange;
      if (outcome?.invoice) {
        toast.success(
          `تم تطبيق باقة ${planLabelValue}. بدأت فترة جديدة — فاتورة ${outcome.invoice.invoiceNumber} (${formatTnd(outcome.invoice.amount)}), قيد الانتظار للدفع.`
        );
      } else {
        toast.success(`تم تطبيق باقة ${planLabelValue}`);
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ');
    }
  };

  const handleCancelScheduledPlan = async (c: CenterTenant) => {
    if (!c.scheduledPlan) return;
    try {
      await updateCenterApi(c.id, { cancelScheduledChange: true });
      toast.success('أُلغي تغيير الباقة المبرمج');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ');
    }
  };

  const handleReqStatus = async (req: DemoRequest, status: string) => {
    try {
      await updateDemoRequestApi(req.id, { status });
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: status as DemoRequest['status'] } : r));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ');
    }
  };

  const handleDeleteCenter = async () => {
    if (!deleteCenter) return;
    try {
      await deleteCenterApi(deleteCenter.id);
      toast.success('تم حذف المركز');
      setDeleteCenter(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ');
    }
  };

  const handleDeleteRequest = async () => {
    if (!deleteRequest) return;
    try {
      await deleteDemoRequestApi(deleteRequest.id);
      toast.success('تم حذف الطلب');
      setDeleteRequest(null);
      setRequests(prev => prev.filter(r => r.id !== deleteRequest.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ');
    }
  };

  const PAGE_META: Record<PlatformAdminPage, { title: string; sub: string }> = {
    overview: { title: 'Vue d’ensemble', sub: 'نشاط المنصة في الوقت الفعلي' },
    centers: { title: 'Centres & Abonnements', sub: `${arPlural(centers.length, 'مركز', 'مركزان', 'مراكز', 'مركزًا')} · ${arPlural(activeCenters, 'نشط', 'نشطان', 'أنشطة', 'نشطًا')}` },
    requests: { title: 'Demandes d’essai', sub: `${arPlural(newRequests, 'طلب جديد', 'طلبان جديدان', 'طلبات جديدة', 'طلبًا جديدًا')} قيد المعالجة` },
    finance: { title: 'المالية (SaaS)', sub: 'الفوترة وإيرادات المنصة' },
    pricing: { title: 'التعريفات والوحدات', sub: `السنة الدراسية ${priceYear}` },
    advertisements: { title: 'الإعلانات', sub: 'البانرات وشرائط العرض للمراكز والواجهة' },
    renewals: { title: 'طلبات التجديد', sub: 'تجديدات المراكز وتغييرات الباقات' },
  };

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition';

  return (
    <div className="relative space-y-6" dir="rtl">

      {/* soft wash — same spirit as the landing page */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 h-[280px] w-[760px] rounded-full bg-accent-500/[0.06] blur-[110px] pointer-events-none" />

      {/* ─── Header (landing style card) ──────────────────────────── */}
      <div className="relative flex items-center justify-between flex-wrap gap-4 rounded-3xl bg-white border border-slate-200 shadow-sm shadow-slate-900/5 px-5 py-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-accent-500 shadow-sm shadow-accent-500/20 flex items-center justify-center flex-shrink-0">
            <img src={icon} alt="SaaS" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">{PAGE_META[page].title}</h1>
            <p className="text-xs text-slate-500 font-bold">{PAGE_META[page].sub}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(page === 'centers' || page === 'requests') && (
            <div className="relative">
              <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={page === 'centers' ? 'ابحث عن مركز…' : 'ابحث عن طلب…'}
                className="w-48 sm:w-56 ps-9 pe-3 py-2.5 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:border-accent-500 focus:ring-0 outline-none transition"
              />
            </div>
          )}
          <button onClick={load} className="p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:border-accent-500/40 hover:text-accent-500 text-slate-600 transition cursor-pointer" title="تحديث" aria-label="تحديث">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowNewCenter(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent-500 hover:shadow-md text-white text-sm font-black rounded-xl shadow-sm shadow-accent-500/20 transition cursor-pointer">
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">مركز جديد</span>
            <span className="sm:hidden">Centre</span>
          </button>
        </div>
      </div>

      {/* ═══ OVERVIEW PAGE ═══ */}
      {page === 'overview' && (
        <motion.div key="overview" className="relative space-y-6">

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {[
              { label: 'MRR — شهري', value: billingSummary ? `${billingSummary.mrr.toFixed(0)} TND` : '—', icon: TrendingUp, tint: 'bg-accent-500/10 text-accent-500' },
              { label: 'إجمالي المراكز', value: centers.length, icon: Building2, tint: 'bg-accent-500/10 text-accent-500' },
              { label: 'Actifs', value: activeCenters, icon: CheckCircle2, tint: 'bg-accent-500/10 text-accent-500' },
              { label: 'في التجربة', value: trialCenters, icon: Clock, tint: 'bg-amber-100 text-amber-600' },
              { label: 'طلبات جديدة', value: newRequests, icon: FileText, tint: 'bg-accent-500/10 text-accent-500' },
              { label: 'مستحقات التحصيل', value: billingSummary ? `${billingSummary.pendingInvoices.toFixed(0)} TND` : '—', icon: Receipt, tint: 'bg-red-100 text-red-600' }
            ].map(kpi => (
              <div key={kpi.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 hover:shadow-md hover:shadow-slate-900/5 hover:-translate-y-0.5 transition-all">
                <div className={`inline-flex p-2.5 rounded-xl mb-3 ${kpi.tint}`}>
                  <kpi.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-xl font-black text-slate-900 leading-none tracking-tight">{kpi.value}</p>
                <p className="text-[11px] font-bold text-slate-500 mt-1.5 uppercase tracking-wider">{kpi.label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-5">

            {/* Revenue chart */}
            <RevenueChart
              monthlyData={revenueChart}
              loading={financeLoading}
              collectedThisYear={billingSummary?.collectedThisYear}
            />

            {/* Recent requests */}
            <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <span className="p-2.5 bg-accent-500/10 rounded-xl"><FileText aria-hidden="true" className="h-4 w-4 text-accent-500" /></span>
                  <h3 className="text-sm font-black text-slate-900">أحدث الطلبات</h3>
                </div>
                <button onClick={() => onNavigate?.('requests')} className="text-[11px] font-black text-accent-500 hover:text-accent-700 transition inline-flex items-center gap-1 cursor-pointer">
                  Tout voir <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-accent-500" /></div>
              ) : requests.length === 0 ? (
                <p className="text-center py-12 text-sm font-bold text-slate-500">لا توجد طلبات</p>
              ) : (
                <div className="space-y-3">
                  {requests.slice(0, 4).map(r => (
                    <div key={r.id} className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-[11px] font-black text-slate-500 flex-shrink-0">
                        {titleCaseName(r.fullName).split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-slate-900 truncate">{titleCaseName(r.academyName)}</div>
                        <div className="text-[11px] font-semibold text-slate-500 truncate">
                          {titleCaseName(r.fullName)} · {normalizeCenterType(r.centerType) ? CENTER_TYPE_LABEL[normalizeCenterType(r.centerType)] : fmtDate(r.createdAt)}
                        </div>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${toneClasses(REQ_STATUS_BADGE[r.status] || REQ_STATUS_BADGE.new)}`}>
                        {REQ_STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Charts placeholders — future chart components */}
          <div className="grid lg:grid-cols-2 gap-5">
            <PlanDistributionChart />
            <SubscriptionGrowthChart />
          </div>

          {/* Trials to watch */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="p-2.5 bg-amber-100 rounded-xl"><CalendarClock aria-hidden="true" className="h-4 w-4 text-amber-600" /></span>
              <h3 className="text-sm font-black text-slate-900">تجارب تستحق المتابعة</h3>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-10"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-accent-500" /></div>
            ) : centers.filter(c => c.status === 'trial').length === 0 ? (
              <p className="text-center py-10 text-sm font-bold text-slate-500">لا يوجد مركز في التجربة</p>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {centers
                  .filter(c => c.status === 'trial')
                  .sort((a, b) => (daysLeft(a.trialEndsAt) ?? 999) - (daysLeft(b.trialEndsAt) ?? 999))
                  .slice(0, 6)
                  .map(c => {
                    const days = daysLeft(c.trialEndsAt);
                    return (
                      <button key={c.id} onClick={() => onNavigate?.('centers')}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 hover:border-accent-500/50 hover:bg-accent-500/[0.04] p-3.5 text-start transition cursor-pointer">
                        {c.logoUrl ? (
                          <div className="h-11 w-11 rounded-2xl border border-slate-200 bg-white p-0.5 overflow-hidden flex-shrink-0">
                            <img src={c.logoUrl} alt={c.name} className="w-full h-full rounded-xl object-cover" />
                          </div>
                        ) : (
                          <div className="h-11 w-11 rounded-2xl bg-accent-500/10 flex items-center justify-center text-[11px] font-black text-accent-500 flex-shrink-0">
                            {c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-slate-900 truncate">{c.name}</div>
                          <div className="text-[11px] font-semibold text-slate-500">{c.adminEmail || '—'}</div>
                        </div>
                        <span className={`text-[11px] font-black px-2.5 py-1 rounded-full flex-shrink-0 ${
                          days === null ? 'bg-slate-50 text-slate-500 border border-slate-100'
                            : days <= 3 ? 'bg-accent-500/15 text-accent-500 border border-accent-500/30'
                            : days <= 7 ? 'bg-accent-500/10 text-accent-500 border border-accent-500/30'
                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                          {days === null ? '—' : days > 0 ? `${days} j` : 'منتهٍ'}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══ CENTERS PAGE ═══ */}
      {page === 'centers' && (
        <motion.div key="centers" className="relative space-y-4">

          {/* Filters — type / statut / plan */}
          <div ref={listTopRef} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white border border-slate-200 shadow-sm px-5 py-4 scroll-mt-24">
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">النوع</div>
              <Segmented<'all' | 'jardin' | 'formation'>
                value={centerTypeFilter}
                onChange={setCenterTypeFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'jardin', label: 'روضة أطفال' },
                  { key: 'formation', label: 'مركز تدريب' }
                ]}
              />
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">الحالة</div>
              <Segmented<'all' | 'trial' | 'active' | 'suspended' | 'expired'>
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'trial', label: 'تجربة' },
                  { key: 'active', label: 'نشط' },
                  { key: 'suspended', label: 'موقوف' },
                  { key: 'expired', label: 'منتهٍ' }
                ]}
              />
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">الباقة</div>
              <Segmented<'all' | 'basic' | 'growth' | 'pro' | 'custom'>
                value={planFilter}
                onChange={setPlanFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'basic', label: 'الأساسية' },
                  { key: 'growth', label: 'النمو' },
                  { key: 'pro', label: 'الاحترافية' },
                  { key: 'custom', label: 'مخصصة' }
                ]}
              />
            </div>
            <span className="ms-auto text-xs font-bold text-slate-500">
              ${arPlural(filteredCenters.length, 'نتيجة', 'نتيجتان', 'نتائج', 'نتيجة')}
            </span>
          </div>

          {loading ? (
            <div className="grid gap-6 py-20">
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
            </div>
          ) : filteredCenters.length === 0 ? (
            <div className="text-center py-20 rounded-3xl bg-white border border-slate-200 text-slate-500">
              <Building2 aria-hidden="true" className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">{q ? 'لا توجد نتائج لهذا البحث' : 'لا توجد مراكز'}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
              {pagedCenters.map(c => {
            const days = daysLeft(c.trialEndsAt);
            const subscriptionStart = inferredSubscriptionStart(c);
            const subscriptionDays = daysLeft(c.subscriptionEndsAt);
            const mods = (c.enabledModules as string[]) || [];
            return (
              <motion.div key={c.id}
                className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm shadow-slate-900/5 hover:shadow-md hover:shadow-slate-900/5 hover:border-accent-500/30 transition flex flex-col">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    {c.logoUrl ? (
                      <div className="h-9 w-9 rounded-xl border border-slate-200 bg-white p-0.5 overflow-hidden flex-shrink-0">
                        <img src={c.logoUrl} alt={c.name} className="w-full h-full rounded-lg object-cover" />
                      </div>
                    ) : (
                      <div className="h-9 w-9 rounded-xl bg-accent-500/10 flex items-center justify-center text-sm font-black text-accent-500 flex-shrink-0">
                        {c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <p className="font-black text-slate-900 text-sm">{c.name}</p>
                      <p className="text-xs text-slate-500 font-semibold">{c.adminEmail || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {normalizeCenterType(c.centerType) && (
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${normalizeCenterType(c.centerType) === 'jardin' ? 'bg-accent-500/[0.06] text-accent-700 border border-accent-500/20' : 'bg-accent-500/10 text-accent-500 border border-accent-500/30'}`}>
                        {CENTER_TYPE_LABEL[normalizeCenterType(c.centerType)]}
                      </span>
                    )}
                    <StatusBadge tone={STATUS_BADGE[c.status] || 'neutral'} label={STATUS_LABEL[c.status] || c.status} />
                    <StatusBadge tone={PLAN_BADGE[c.plan] || PLAN_BADGE.starter} label={PLAN_LABEL[c.plan] || c.plan} />
                  </div>
                </div>

                {/* Trial and subscription lifecycle dates */}
                {c.status === 'trial' && c.trialEndsAt && (
                  <div className={`mt-3.5 flex items-center gap-2 text-xs font-bold rounded-xl px-3.5 py-2.5 border ${
                    (days ?? 0) <= 3
                      ? 'bg-accent-500/15 text-accent-500 border-accent-500/25'
                      : (days ?? 0) <= 7
                        ? 'bg-accent-500/10 text-accent-500 border-accent-500/20'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    {days !== null && days > 0
                      ? `فترة تجريبية: ${arPlural(days, 'يوم متبقٍ', 'يومان متبقيان', 'أيام متبقية', 'يومًا متبقيًا')} · تنتهي في ${fmtDate(c.trialEndsAt)}`
                      : `انتهت الفترة التجريبية في ${fmtDate(c.trialEndsAt)}`}
                  </div>
                )}
                {c.status !== 'trial' && (c.subscriptionEndsAt || c.trialEndsAt) && (
                  <div className="mt-3.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] font-bold text-slate-600 space-y-1">
                    {c.trialEndsAt && <div>نهاية الفترة التجريبية: {fmtDate(c.trialEndsAt)}</div>}
                    {c.subscriptionEndsAt && (
                      <div className={subscriptionDays !== null && subscriptionDays <= 7 ? 'text-amber-700' : 'text-slate-600'}>
                        الاشتراك: بداية {subscriptionStart ? fmtDate(subscriptionStart) : '—'} · نهاية {fmtDate(c.subscriptionEndsAt)}
                        {subscriptionDays !== null && subscriptionDays > 0 ? ` · ${arPlural(subscriptionDays, 'يوم متبقٍ', 'يومان متبقيان', 'أيام متبقية', 'يومًا متبقيًا')}` : ' · منتهٍ'}
                      </div>
                    )}
                  </div>
                )}

                {/* Scheduled plan change */}
                {c.scheduledPlan && (
                  <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-[11px] font-black text-amber-800 inline-flex items-center gap-1.5">
                      <CalendarClock className="h-4 w-4" aria-hidden="true" />
                      → {PLAN_LABEL[c.scheduledPlan.plan === 'starter' ? 'basic' : c.scheduledPlan.plan]}
                      <span className="font-semibold text-amber-700">
                        مجدولة{c.scheduledPlan.applyAt ? ` في ${fmtDate(c.scheduledPlan.applyAt)}` : ' (عند التجديد القادم)'}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 ms-auto">
                      <button
                        onClick={() => handleApplyScheduledPlan(c)}
                        disabled={!!c.scheduledPlan.applyAt && c.scheduledPlan.applyAt > Date.now() && c.status === 'active'}
                          className="text-[11px] font-black px-2.5 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        تطبيق
                      </button>
                      <button
                        onClick={() => handleCancelScheduledPlan(c)}
                        title="إلغاء التغيير المجدول"
                        className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                        aria-label="إلغاء التغيير المجدول"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                )}

                {/* Modules */}
                {mods.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {mods.filter(mk => isBaseModule(mk)).map(mk => (
                      <span key={mk} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-500 text-white inline-flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" aria-hidden="true" /> {MODULE_LABEL(mk)}
                      </span>
                    ))}
                    {mods.filter(mk => !isBaseModule(mk)).map(mk => (
                      <span key={mk} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-500/10 text-accent-500">
                        {MODULE_LABEL(mk)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto pt-4">
                <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3.5">
                  <button onClick={() => setEditCenter(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                    title="معلومات أساسية عن المركز">
                    <Edit className="h-4 w-4" aria-hidden="true" /> تعديل
                  </button>
                  <button onClick={() => handleToggleStatus(c)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
                      c.status === 'suspended'
                        ? 'bg-accent-500/[0.06] text-accent-700 border-accent-500/20 hover:bg-accent-500/10'
                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    }`}>
                    {c.status === 'suspended' ? <><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> تفعيل</> : <><PauseCircle className="h-4 w-4" aria-hidden="true" /> إيقاف</>}
                  </button>
                  <button onClick={() => setPlanCenter(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-accent-500/10 text-accent-500 border border-accent-500/30 rounded-xl hover:bg-accent-500/20 transition cursor-pointer flex items-center gap-1.5"
                    title="إدارة الباقة والوحدات والفواتير والتغييرات المبرمجة">
                    <Layers className="h-4 w-4" aria-hidden="true" /> الباقات &amp; الفواتير
                  </button>
                  <button onClick={() => setDeleteCenter(c)}
                    className="ms-auto text-[11px] font-bold px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
                  </button>
                </div>
                </div>
              </motion.div>
            );
              })}
              </div>
              <Pagination
                page={safeCentersPage}
                totalPages={centersTotalPages}
                total={filteredCenters.length}
                onChange={p => { setCentersPage(p); listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              />
            </>
          )}
        </motion.div>
      )}

      {/* ═══ REQUESTS PAGE ═══ */}
      {page === 'requests' && (
        <motion.div key="requests" className="relative space-y-4">

          {/* Filters — type / statut */}
          <div ref={listTopRef} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white border border-slate-200 shadow-sm px-5 py-4 scroll-mt-24">
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">نوع المؤسسة</div>
              <Segmented<'all' | 'jardin' | 'formation'>
                value={reqTypeFilter}
                onChange={setReqTypeFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'jardin', label: 'روضة أطفال' },
                  { key: 'formation', label: 'مركز تدريب' }
                ]}
              />
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">الحالة</div>
              <Segmented<'new' | 'converted' | 'archived'>
                value={reqStatusFilter}
                onChange={setReqStatusFilter}
                options={[
                  { key: 'new', label: 'جديد' },
                  { key: 'converted', label: 'محوَّل' },
                  { key: 'archived', label: 'مؤرشف' }
                ]}
              />
            </div>
            <span className="ms-auto text-xs font-bold text-slate-500">
              ${arPlural(filteredRequests.length, 'نتيجة', 'نتيجتان', 'نتائج', 'نتيجة')}
            </span>
          </div>

          {loading ? (
            <div className="grid gap-6 py-20">
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-20 rounded-3xl bg-white border border-slate-200 text-slate-500">
              <FileText aria-hidden="true" className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">{q ? 'لا توجد نتائج لهذا البحث' : 'لا توجد طلبات مستلمة'}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
              {pagedRequests.map(req => {
            const mods = parseModules(req.requestedModules);
            return (
              <motion.div key={req.id}
                className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm shadow-slate-900/5 hover:shadow-md hover:shadow-slate-900/5 hover:border-accent-500/30 transition flex flex-col">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    <div className="h-11 w-11 rounded-2xl bg-accent-500/5 flex items-center justify-center text-sm font-black text-accent-500 flex-shrink-0">
                      {titleCaseName(req.fullName).split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm">{titleCaseName(req.fullName)}</p>
                      <p className="text-xs font-black text-accent-500">{titleCaseName(req.academyName)}</p>
                      <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{fmtDate(req.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {normalizeCenterType(req.centerType) && (
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${normalizeCenterType(req.centerType) === 'jardin' ? 'bg-accent-500/[0.06] text-accent-700 border border-accent-500/20' : 'bg-accent-500/10 text-accent-500 border border-accent-500/30'}`}>
                        {CENTER_TYPE_LABEL[normalizeCenterType(req.centerType)]}
                      </span>
                    )}
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${toneClasses(REQ_STATUS_BADGE[req.status] || REQ_STATUS_BADGE.new)}`}>
                      {REQ_STATUS_LABEL[req.status] || req.status}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      {REQ_TYPE_LABEL[req.requestType] || req.requestType}
                    </span>
                  </div>
                </div>

                {/* Contact links */}
                <div className="mt-3 flex items-center gap-4 flex-wrap">
                  {req.email && (
                    <a href={`mailto:${req.email}`}
                      className="flex items-center gap-1.5 text-xs font-bold text-accent-500 hover:underline">
                      <Mail aria-hidden="true" className="h-4 w-4" /> {req.email}
                    </a>
                  )}
                  {req.phone && (
                    <a href={`tel:${req.phone}`}
                      className="flex items-center gap-1.5 text-xs font-bold text-accent-500 hover:underline">
                      <Phone aria-hidden="true" className="h-4 w-4" /> {req.phone}
                    </a>
                  )}
                </div>

                {req.message && (
                  <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-xl px-3.5 py-2.5 leading-relaxed">{req.message}</p>
                )}

                {/* Requested modules — envoyées avec la demande */}
                {mods.length > 0 && (
                  <div className="mt-3.5">
                    <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-2 flex items-center gap-1.5">
                      <GraduationCap aria-hidden="true" className="h-4 w-4" />
                      الوحدات المطلوبة ({mods.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {mods.map(mk => isBaseModule(mk) ? (
                        <span key={mk} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-500 text-white inline-flex items-center gap-1">
                          <Lock aria-hidden="true" className="h-2.5 w-2.5" /> {MODULE_LABEL(mk)}
                        </span>
                      ) : (
                        <span key={mk} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-500/10 text-accent-500">
                          {MODULE_LABEL(mk)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto pt-4">
                <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3.5">
                  {req.status === 'converted' ? (
                    // Convertie : verrouillée — seule l'archivation est proposée.
                    <select
                      value="converted"
                      onChange={e => { if (e.target.value === 'archived') handleReqStatus(req, 'archived'); }}
                      aria-label="حالة الطلب"
                      className="text-[11px] font-bold px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-600 focus:border-accent-500 focus:ring-0 outline-none cursor-pointer">
                      <option value="converted">محوَّل</option>
                      <option value="archived">مؤرشف</option>
                    </select>
                  ) : (
                    <select
                      value={req.status === 'contacted' ? 'new' : req.status}
                      onChange={e => handleReqStatus(req, e.target.value)}
                      className="text-[11px] font-bold px-3 py-1.5 border border-slate-200 rounded-xl bg-white focus:border-accent-500 focus:ring-0 outline-none cursor-pointer">
                      <option value="new">جديد</option>
                      <option value="archived">مؤرشف</option>
                    </select>
                  )}

                  {req.status !== 'converted' ? (
                    <button
                      onClick={() => { setConvertRequest(req); setShowNewCenter(true); }}
                      className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 bg-accent-500 text-white rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer">
                      <Building2 aria-hidden="true" className="h-4 w-4" /> Convertir en Centre
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 bg-accent-500/[0.06] text-accent-700 border border-accent-500/20 rounded-xl"
                      title='تم تحويل هذا الطلب إلى مركز مسبقًا — التحويل ممكن مرة واحدة فقط.'
                    >
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> تم تحويله
                    </span>
                  )}

                  <button onClick={() => setDeleteRequest(req)}
                    className="ms-auto flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer">
                    <Trash2 aria-hidden="true" className="h-4 w-4" /> حذف
                  </button>
                </div>
                </div>
              </motion.div>
            );
              })}
              </div>
              <Pagination
                page={safeRequestsPage}
                totalPages={requestsTotalPages}
                total={filteredRequests.length}
                onChange={p => { setRequestsPage(p); listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              />
            </>
          )}
        </motion.div>
      )}

      {/* ═══ FINANCE PAGE ═══ */}
      {page === 'finance' && (
        <motion.div key="finance" className="relative space-y-6">
          {financeLoading ? (
            <div className="flex items-center justify-center py-20 rounded-3xl bg-white border border-slate-200">
              <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-accent-500" />
            </div>
          ) : (
            <>
              {/* KPI cards */}
              {billingSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'MRR (الفواتير المدفوعة)', value: `${billingSummary.mrr.toFixed(2)} TND`, icon: TrendingUp, tint: 'bg-accent-500/10 text-accent-500' },
                    { label: 'تحصيل هذا الشهر', value: `${billingSummary.collectedThisMonth.toFixed(2)} TND`, icon: DollarSign, tint: 'bg-accent-500/10 text-accent-500' },
                    { label: 'تحصيل هذه السنة', value: `${billingSummary.collectedThisYear.toFixed(2)} TND`, icon: BarChart3, tint: 'bg-accent-500/10 text-accent-500' },
                    { label: 'فواتير قيد الانتظار', value: `${billingSummary.pendingInvoices.toFixed(2)} TND`, icon: AlertCircle, tint: 'bg-amber-100 text-amber-600' }
                  ].map(kpi => (
                    <div key={kpi.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
                      <div className={`inline-flex p-2.5 rounded-xl mb-3 ${kpi.tint}`}>
                        <kpi.icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <p className="text-xl font-black text-slate-900 tracking-tight">{kpi.value}</p>
                      <p className="text-[11px] font-bold text-slate-500 mt-1 uppercase tracking-wider">{kpi.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Chèques en attente — le revenu n'est compté qu'après encaissement */}
              {pendingCheques.length > 0 && (
                <div className="bg-white rounded-3xl border border-accent-500/20 p-6 shadow-sm shadow-slate-900/5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2.5">
                      <span className="p-2 bg-accent-500/10 rounded-xl"><Receipt aria-hidden="true" className="h-4 w-4 text-accent-500" /></span>
                      شيكات قيد الانتظار
                      <span className="text-[11px] font-bold text-slate-500 font-sans">{pendingCheques.length}</span>
                    </h3>
                    <p className="text-[11px] font-bold text-slate-500">
                      الشيكات المعلقة <span className="text-accent-500">لا تُحتسب ضمن الإيرادات</span> — تحصّلها لتُحتسب.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full text-sm text-start">
                      <thead className="text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="pb-3 px-3">Centre</th>
                          <th className="pb-3 px-3">N° Facture</th>
                          <th className="pb-3 px-3">المبلغ</th>
                          <th className="pb-3 px-3">رقم الشيك</th>
                          <th className="pb-3 px-3">تاريخ الشيك</th>
                          <th className="pb-3 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingCheques.map(inv => (
                          <tr key={inv.id} className="hover:bg-accent-500/5">
                            <td className="py-3 px-3 font-black text-slate-900 whitespace-nowrap">{inv.centerName}</td>
                            <td className="py-3 px-3 font-mono text-xs text-slate-500 whitespace-nowrap">{inv.invoiceNumber}</td>
                            <td className="py-3 px-3 font-black text-slate-900 whitespace-nowrap">{inv.amount.toFixed(2)} TND</td>
                            <td className="py-3 px-3 text-slate-600 text-xs font-bold">{inv.chequeNumber || '—'}</td>
                            <td className="py-3 px-3 text-slate-600 text-xs whitespace-nowrap">{inv.chequeDate ? new Date(inv.chequeDate).toLocaleDateString('ar-TN') : '—'}</td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={async () => {
                                    try {
                                      await updateInvoiceApi(inv.id, { status: 'paid' });
                                      toast.success(`تم تحصيل الشيك — الفاتورة ${inv.invoiceNumber} مدفوعة`);
                                      loadFinanceData();
                                    } catch (err) {
                                      toast.error(err instanceof Error ? err.message : 'خطأ');
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1.5 bg-accent-500 text-white rounded-lg hover:bg-accent-700 transition cursor-pointer"
                                  aria-label="تحصيل الشيك"
                                >
                                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> تحصيل
                                </button>
                                <button onClick={() => handlePrintInvoice(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="طباعة الفاتورة" aria-label="طباعة الفاتورة">
                                  <Printer className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                </button>
                                <button onClick={() => setEditInvoice(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="تعديل" aria-label="تعديل الفاتورة">
                                  <Edit className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Factures — groupées par centre */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm shadow-slate-900/5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2.5">
                    <span className="p-2 bg-accent-500/10 rounded-xl"><Receipt aria-hidden="true" className="h-4 w-4 text-accent-500" /></span>
                    Factures
                    <span className="text-[11px] font-bold text-slate-500 font-sans">${arPlural(invoiceGroups.length, 'مركز', 'مركزان', 'مراكز', 'مركزًا')} · {filteredInvoices.length} facture{filteredInvoices.length > 1 ? 's' : ''}</span>
                  </h3>

                  {/* Filters — centre + statut */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        value={invoiceSearch}
                        onChange={e => setInvoiceSearch(e.target.value)}
                        placeholder="تصفية باسم المركز…"
                        className="ps-9 pe-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-accent-500 focus:ring-0 outline-none transition w-48 sm:w-56"
                      />
                    </div>
                    <select
                      value={invoiceStatusFilter}
                      onChange={e => setInvoiceStatusFilter(e.target.value as 'all' | CenterInvoice['status'])}
                      className="px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-white focus:border-accent-500 focus:ring-0 outline-none cursor-pointer"
                    >
                      <option value="all">كل الحالات</option>
                      <option value="pending">قيد الانتظار</option>
                      <option value="paid">مدفوعة</option>
                      <option value="overdue">متأخرة</option>
                      <option value="cancelled">ملغاة</option>
                    </select>
                    <select
                      value={invoiceMonthFilter}
                      onChange={e => setInvoiceMonthFilter(e.target.value)}
                      className="px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-white focus:border-accent-500 focus:ring-0 outline-none cursor-pointer capitalize"
                      aria-label="تصفية حسب شهر الفترة المفوترة"
                    >
                      <option value="all">كل الأشهر</option>
                      {invoiceMonths.map(key => (
                        <option key={key} value={key}>{monthLabel(key)}</option>
                      ))}
                    </select>
                    {(invoiceSearch || invoiceStatusFilter !== 'all' || invoiceMonthFilter !== 'all') && (
                      <button
                        onClick={() => { setInvoiceSearch(''); setInvoiceStatusFilter('all'); setInvoiceMonthFilter('all'); }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                      >
                        <X className="h-4 w-4" aria-hidden="true" /> إعادة تعيين
                      </button>
                    )}
                  </div>
                </div>

                {invoices.length === 0 ? (
                  <p className="text-center py-12 text-slate-500 text-sm font-bold">لا توجد فواتير</p>
                ) : filteredInvoices.length === 0 ? (
                  <p className="text-center py-12 text-slate-500 text-sm font-bold">لا توجد فاتورة تطابق الفلاتر</p>
                ) : (
                  <div className="space-y-5">
                    {pagedInvoiceGroups.map(group => {
                      const paidTotal = group.invoices
                        .filter(inv => inv.status === 'paid')
                        .reduce((sum, inv) => sum + inv.amount, 0);
                      const outstandingTotal = group.invoices
                        .filter(inv => inv.status === 'pending' || inv.status === 'overdue')
                        .reduce((sum, inv) => sum + inv.amount, 0);
                      return (
                        <div key={group.centerId} className="rounded-2xl border border-slate-200/80 overflow-hidden">
                          {/* Centre header — cliquer pour replier / déplier */}
                          <button type="button"
                            onClick={() => setCollapsedGroupIds(prev => ({ ...prev, [group.centerId]: !prev[group.centerId] }))}
                            className="w-full flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition text-start cursor-pointer border-b border-slate-200">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform flex-shrink-0 ${collapsedGroupIds[group.centerId] ? '-rotate-90' : ''}`} aria-hidden="true" />
                              <span className="h-8 w-8 rounded-lg bg-accent-500 text-white flex items-center justify-center text-[11px] font-black flex-shrink-0">
                                {group.centerName.split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-900 truncate">{group.centerName}</p>
                                <p className="text-[11px] font-semibold text-slate-500">
                                  {group.invoices.length} facture{group.invoices.length > 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {outstandingTotal > 0 && (
                                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  متبقي للتحصيل: {outstandingTotal.toFixed(2)} دينار
                                </span>
                              )}
                              {paidTotal > 0 && (
                                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-accent-500/[0.06] text-accent-700 border border-accent-500/20">
                                  مدفوع: {paidTotal.toFixed(2)} دينار
                                </span>
                              )}
                            </div>
                          </button>
                          <div className={`overflow-x-auto${collapsedGroupIds[group.centerId] ? ' hidden' : ''}`}>
                            <table className="min-w-[640px] w-full text-sm text-start">
                              <thead className="text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200 bg-white">
                                <tr>
                                  <th className="py-2.5 px-3">N° Facture</th>
                                  <th className="py-2.5 px-3">الفترة</th>
                                  <th className="py-2.5 px-3">المبلغ</th>
                                  <th className="py-2.5 px-3">Paiement</th>
                                  <th className="py-2.5 px-3">الحالة</th>
                                  <th className="py-2.5 px-3">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.invoices.map(inv => {
                                  const meta = invoiceStatusMeta(inv);
                                  return (
                                    <tr key={inv.id} className="hover:bg-slate-50/70">
                                      <td className="py-3 px-3 font-mono text-xs text-slate-500 whitespace-nowrap">{inv.invoiceNumber}</td>
                                      <td className="py-3 px-3 text-slate-600 text-xs whitespace-nowrap">
                                        {new Date(inv.periodStart).toLocaleDateString('ar-TN')} – {new Date(inv.periodEnd).toLocaleDateString('ar-TN')}
                                      </td>
                                      <td className="py-3 px-3 font-black text-slate-900 whitespace-nowrap">{inv.amount.toFixed(2)} TND</td>
                                      <td className="py-3 px-3 text-slate-600 text-xs font-semibold whitespace-nowrap">{paymentMethodLabel(inv.paymentMethod)}</td>
                                      <td className="py-3 px-3 whitespace-nowrap">
                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${toneClasses(meta.tone)}`}>{meta.label}</span>
                                      </td>
                                      <td className="py-3 px-3 whitespace-nowrap">
                                        <div className="flex items-center gap-1">
                                          <button onClick={() => handlePrintInvoice(inv)}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="طباعة الفاتورة" aria-label="طباعة الفاتورة">
                                            <Printer className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                          </button>
                                          <button onClick={() => setEditInvoice(inv)}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="تعديل" aria-label="تعديل الفاتورة">
                                            <Edit className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                          </button>
                                          <button onClick={async () => {
                                            try {
                                              await deleteInvoiceApi(inv.id);
                                              toast.success('تم حذف الفاتورة');
                                              loadFinanceData();
                                            } catch (err) {
                                              toast.error(err instanceof Error ? err.message : 'خطأ');
                                            }
                                          }}
                                            className="p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer" title="حذف" aria-label="حذف الفاتورة">
                                            <Trash2 className="h-4 w-4 text-red-400" aria-hidden="true" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination — 10 centres par page */}
                {invoiceGroupsTotalPages > 1 && (
                  <div className="mt-5">
                    <Pagination
                      page={safeInvoiceGroupsPage}
                      totalPages={invoiceGroupsTotalPages}
                      total={invoiceGroups.length}
                      size={INVOICE_GROUPS_PAGE_SIZE}
                      onChange={p => setInvoiceCentersPage(p)}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* ═══ PRICING PAGE (Tarifs & Modules) ═══ */}
      {page === 'pricing' && (
        <motion.div key="pricing" className="relative space-y-5">

          {/* Year selector — sélecteur compact : quelle que soit la taille
              de la liste des années, rien ne déborde et tout reste visible. */}
          <div className="rounded-3xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex-shrink-0">
                  السنة الدراسية
                </span>
                <select
                  value={priceYear}
                  onChange={e => setPriceYear(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:border-accent-500 focus:ring-0 outline-none cursor-pointer min-w-[140px]"
                >
                  {priceYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <button onClick={addSchoolYear} disabled={addingYear}
                className="ms-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl border border-dashed border-accent-500/50 text-accent-500 text-xs sm:text-sm font-black whitespace-nowrap hover:bg-accent-500/5 transition cursor-pointer disabled:opacity-60"
                title={`أنشئ ${nextSchoolYear} بتعريفات منسوخة من ${priceYears[priceYears.length - 1] || ''}`}
              >
                {addingYear ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                إضافة السنة الدراسية {nextSchoolYear}
              </button>
            </div>
          </div>

          {pricesLoading ? (
            <div className="flex items-center justify-center py-20 rounded-3xl bg-white border border-slate-200">
              <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-accent-500" />
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-5">

              {/* Base plan card */}
              <div className="rounded-3xl bg-accent-500 text-white p-6 shadow-xl shadow-accent-500/25 relative overflow-hidden">
                <div className="absolute -top-16 -right-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Lock className="h-4 w-4 text-white/80" aria-hidden="true" />
                    <span className="text-[11px] font-black text-white/80 uppercase tracking-[0.15em]">Le plan de base</span>
                  </div>
                  <h3 className="text-lg font-black mb-1">مدرسي + مالية</h3>
                  <p className="text-xs text-white/70 font-semibold mb-5">مضمون دائمًا في كل اشتراك — مع سجل الدوام المجاني وغير القابل للإزالة.</p>
                  <div className="flex items-end gap-2 mb-6">
                    <span className="text-4xl font-black tracking-tight">
                      {(priceList['scolaire'] || 0) + (priceList['finance'] || 0)}
                    </span>
                    <span className="text-xs font-bold text-white/70 pb-1.5">دينار/شهر</span>
                  </div>
                  <div className="space-y-2.5 text-xs font-bold">
                    <div className="flex items-center justify-between rounded-xl bg-white/10 px-3.5 py-2.5">
                      <span className="flex items-center gap-2"><GraduationCap className="h-4 w-4" aria-hidden="true" /> Scolaire</span>
                      <span className="font-black">{priceList['scolaire'] ?? '—'} TND</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-white/10 px-3.5 py-2.5">
                      <span className="flex items-center gap-2"><DollarSign className="h-4 w-4" aria-hidden="true" /> Finance</span>
                      <span className="font-black">{priceList['finance'] ?? '—'} TND</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-white/10 border border-white/20 px-3.5 py-2.5">
                      <span className="flex items-center gap-2"><Clock className="h-4 w-4" aria-hidden="true" /> Jd. Horaires</span>
                      <span className="font-black text-white/90">Inclus — offert</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Module price editor */}
              <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
                <h3 className="text-sm font-black text-slate-900 mb-1">أسعار الوحدات الإضافية</h3>
                <p className="text-xs text-slate-500 font-semibold mb-5">
                  تُستخدم هذه التعريفات في الحساب التلقائي لسعر المركز وفق وحداته المفعلة — سنة {priceYear}.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {ALL_MODULES.map(m => {
                    const base = isBaseModule(m.key);
                    return (
                      <div key={m.key}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${base ? 'border-accent-500/30 bg-accent-500/[0.05]' : 'border-slate-200 bg-white hover:border-accent-500/30 transition'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            {m.label}
                            {m.key === BUNDLED_MODULE_KEY ? (
                              <span className="text-[8px] font-black text-accent-700 bg-accent-500/[0.06] border border-accent-500/20 rounded-full px-1.5 py-px uppercase">Offert</span>
                            ) : base ? (
                              <span className="text-[8px] font-black text-accent-500 bg-accent-500/10 border border-accent-500/30 rounded-full px-1.5 py-px uppercase">Base</span>
                            ) : null}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-500">{m.key}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {m.key === BUNDLED_MODULE_KEY ? (
                            <span className="text-sm font-black text-accent-500 w-20 text-center">Inclus</span>
                          ) : (
                            <input
                              type="number" step="0.5" min="0"
                              value={priceList[m.key] ?? 0}
                              onChange={e => setPriceList(p => ({ ...p, [m.key]: Number(e.target.value) }))}
                              className="w-20 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm font-black text-end text-slate-800 focus:border-accent-500 focus:ring-0 outline-none bg-white transition"
                            />
                          )}
                          <span className="text-[11px] font-bold text-slate-500">{m.key === BUNDLED_MODULE_KEY ? 'مجاني' : 'دينار/شهر'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Sauvegarde — sous la grille des tarifs */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
            <p className="text-[11px] font-bold text-slate-500">
              تعريفات مطبقة على السنة الدراسية {priceYear}.
            </p>
            <button onClick={savePrices} disabled={savingPrices || pricesLoading}
              className="flex items-center gap-2 px-6 py-3 bg-accent-500 hover:shadow-md text-white text-sm font-black rounded-2xl shadow-sm shadow-accent-500/20 transition cursor-pointer disabled:opacity-60">
              {savingPrices ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Sauvegarder les tarifs
            </button>
          </div>
        </motion.div>
      )}

      {/* ─── Advertisements Page ───────────────────────────────────────── */}
      {page === 'advertisements' && (
        <motion.div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-black text-slate-800">إدارة الإعلانات</h2>
              {!adsLoading && (
                <span className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-sm font-black text-slate-600">
                  {advertisements.length}
                </span>
              )}
              <div className="flex flex-wrap gap-1.5">
                {AD_STATUS_FILTERS.map(f => {
                  const count = f.value === 'all' ? advertisements.length : advertisements.filter(a => adStatusOf(a) === f.value).length;
                  const on = adsStatusFilter === f.value;
                  return (
                    <button key={f.value}
                      onClick={() => { setAdsStatusFilter(f.value); setAdsPage(1); }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-black border transition cursor-pointer ${on ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-slate-500 border-slate-200 hover:border-accent-500/40'}`}>
                      {f.label} <span className={on ? 'text-white/70' : 'text-slate-500'}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadAdvertisements} disabled={adsLoading} title="تحديث" aria-label="تحديث"
                className="p-2 hover:bg-slate-100 rounded-xl transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
                <RefreshCw className={`h-5 w-5 text-slate-600 ${adsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
              <button onClick={() => setShowNewAd(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent-500 text-white text-sm font-black rounded-xl shadow-md hover:shadow-md transition cursor-pointer">
                <Plus className="h-4 w-4" aria-hidden="true" />
                إعلان جديد
              </button>
            </div>
          </div>

          {adsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-accent-500" />
            </div>
          ) : advertisements.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <ImagePlus className="h-12 w-12 mx-auto mb-3 text-slate-400" aria-hidden="true" />
              <p className="font-bold">{advertisements.length === 0 ? 'لا توجد إعلانات' : 'لا توجد إعلانات لهذا الفلتر'}</p>
              <p className="text-sm">{advertisements.length === 0 ? 'أنشئ أول بانر للواجهة أو لوحات التحكم.' : 'غيّر الفلتر لعرض حالات أخرى.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleAds.slice((adsPage - 1) * PAGE_SIZE, adsPage * PAGE_SIZE).map(ad => (
                <div key={ad.id} className="border border-slate-200 rounded-xl p-4 bg-white hover:border-accent-500/30 transition">
                  <div className="aspect-video bg-slate-100 rounded-lg mb-3 overflow-hidden">
                    {ad.imageUrls?.[0] && (
                      <img src={ad.imageUrls[0]} alt={ad.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <h3 className="font-black text-slate-800 mb-2">{ad.title}</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${toneClasses(AD_STATUS_META[adStatusOf(ad)].tone)}`}>
                      {AD_STATUS_META[adStatusOf(ad)].label}
                    </span>
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
                      {adLocationLabel(ad.location)}
                    </span>
                    {ad.centerIds?.length > 0 && (
                      <span className="px-2 py-1 bg-accent-500/5 text-accent-700 text-xs font-bold rounded-full">
                        ${arPlural(ad.centerIds.length, 'مركز', 'مركزان', 'مراكز', 'مركزًا')}
                      </span>
                    )}
                    {(ad.positions?.length ?? 0) > 0 && (
                      <span className="px-2 py-1 bg-accent-500/10 text-accent-500 text-[11px] font-bold rounded-full"
                        title={ad.positions!.map(adPositionLabel).join(', ')}>
                        {ad.positions!.map(pid => AD_POSITION_SPECS.find(sp => sp.id === pid)?.size || pid).join(' · ')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mb-3">
                    {fmtDate(ad.dateStart)} → {fmtDate(ad.dateEnd)}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditAd(ad)}
                      className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition">
                      <Edit className="h-4 w-4 inline me-1" aria-hidden="true" />
                      تعديل
                    </button>
                    <button onClick={() => setDeleteAd(ad)} title="حذف"
                      className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition cursor-pointer">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!adsLoading && visibleAds.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setAdsPage(p => Math.max(1, p - 1))}
                disabled={adsPage === 1}
                className="px-3 py-2 border border-slate-200 rounded-lg disabled:opacity-50 hover:border-accent-500 transition"
                aria-label="الصفحة السابقة">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="px-4 py-2 text-sm font-bold text-slate-600">
                {adsPage} / {Math.ceil(visibleAds.length / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setAdsPage(p => Math.min(Math.ceil(visibleAds.length / PAGE_SIZE), p + 1))}
                disabled={adsPage >= Math.ceil(visibleAds.length / PAGE_SIZE)}
                className="px-3 py-2 border border-slate-200 rounded-lg disabled:opacity-50 hover:border-accent-500 transition"
                aria-label="الصفحة التالية">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* ─── Renewal Requests Page ───────────────────────────────────────── */}
      {page === 'renewals' && (
        <motion.div className="space-y-6">
          {/* Filters — type / statut */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white border border-slate-200 shadow-sm px-5 py-4">
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">النوع</div>
              <Segmented<'all' | 'renewal' | 'upgrade'>
                value={renewalKindFilter}
                onChange={setRenewalKindFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'renewal', label: 'تجديد' },
                  { key: 'upgrade', label: 'تغيير الباقة' }
                ]}
              />
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">الحالة</div>
              <Segmented<'all' | 'pending' | 'approved' | 'rejected'>
                value={renewalStatusFilter}
                onChange={setRenewalStatusFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'pending', label: 'قيد الانتظار' },
                  { key: 'approved', label: 'مقبولة' },
                  { key: 'rejected', label: 'مرفوضة' }
                ]}
              />
            </div>
              <button onClick={loadRenewals} title="تحديث" aria-label="تحديث"
              className="ms-auto p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:border-accent-500/40 hover:text-accent-500 text-slate-600 transition cursor-pointer">
              <RefreshCw className={`h-4 w-4 ${renewalsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>

          {renewalsLoading ? (
            <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent-500" /> جارٍ التحميل…
            </p>
          ) : renewalRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
              <p className="text-sm font-black text-slate-500">لا توجد طلبات</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                تقدم المراكز هنا بطلبات التجديد وتغيير الباقة.
              </p>
            </div>
          ) : filteredRenewals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
              <p className="text-sm font-black text-slate-500">لا توجد نتائج لهذه الفلاتر</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                عدّل النوع أو الحالة لعرض طلبات أخرى.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRenewals.map(r => (
                <div key={r.id} className={`rounded-2xl border bg-white p-4 ${r.status === 'pending' ? 'border-amber-200' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">{r.centerName || r.centerId}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                      r.kind === 'upgrade' ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {r.kind === 'upgrade' ? 'Changement d’offre' : 'Renouvellement'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                      r.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : r.status === 'approved' ? 'bg-accent-500/[0.06] text-accent-700 border-accent-500/20'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {r.status === 'pending' ? 'قيد الانتظار' : r.status === 'approved' ? 'مقبولة' : 'مرفوضة'}
                    </span>
                    <span className="ms-auto text-[11px] font-bold text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString('ar-TN')}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                    <span>
                      {r.currentStatus && (
                        <span className="text-slate-500">{RENEWAL_STATUS_LABEL[r.currentStatus] || r.currentStatus} · </span>
                      )}
                      {planLabel(r.currentPlan)} <span className="text-slate-500">→</span>{' '}
                      <span className="font-black text-accent-500">{planLabel(r.requestedPlan)}</span>
                    </span>
                    <span>${arPlural(r.requestedModules.length, 'وحدة', 'وحدتان', 'وحدات', 'وحدة')}</span>
                    <span>{r.billingCycle === 'annual' ? 'سنوي' : 'شهري'}</span>
                    {r.amount !== null && <span className="font-black text-slate-900">{r.amount} TND</span>}
                  </div>

                  {r.note && (
                    <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">« {r.note} »</p>
                  )}

                  {r.status === 'pending' ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewRenewal(r)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-accent-500 rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        مراجعة وتطبيق
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-semibold text-slate-500">
                        تمت المعالجة{r.decidedBy ? ` بواسطة ${r.decidedBy}` : ''}{r.decidedAt ? ` في ${new Date(r.decidedAt).toLocaleDateString('ar-TN')}` : ''}
                        {r.decisionNote ? ` — « ${r.decisionNote} »` : ''}
                      </p>
                      <button
                        type="button"
                        onClick={() => setReviewRenewal(r)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black text-accent-500 bg-accent-500/10 hover:bg-accent-500/20 border border-accent-500/30 rounded-xl transition cursor-pointer"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        عرض التفاصيل
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ─── Modals ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewCenter && (
          <NewCenterModal
            initialData={convertRequest || undefined}
            convertRequestId={convertRequest?.id}
            onClose={() => { setShowNewCenter(false); setConvertRequest(null); }}
            onCreated={load}
          />
        )}
        {editCenter && (
          <EditCenterModal
            center={editCenter}
            onClose={() => setEditCenter(null)}
            onSaved={load}
          />
        )}
        {planCenter && (
          <PlanManagerModal
            center={planCenter}
            onClose={() => setPlanCenter(null)}
            onSaved={load}
          />
        )}
        {reviewRenewal && (
          <RenewalReviewModal
            request={reviewRenewal}
            onClose={() => setReviewRenewal(null)}
            onDecided={onRenewalDecided}
          />
        )}
        {editInvoice && (
          <EditInvoiceModal
            invoice={editInvoice}
            onClose={() => setEditInvoice(null)}
            onSaved={loadFinanceData}
            onPrint={handlePrintInvoice}
          />
        )}
        {(showNewAd || editAd) && (
          <AdvertisementFormModal
            ad={editAd}
            centers={centers}
            onClose={() => { setShowNewAd(false); setEditAd(null); }}
            onSaved={loadAdvertisements}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!deleteCenter}
        title="حذف المركز؟"
        message={`هل أنت متأكد من حذف «${deleteCenter?.name}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        onConfirm={handleDeleteCenter}
        onCancel={() => setDeleteCenter(null)}
      />
      <ConfirmDialog
        open={!!deleteRequest}
        title="حذف الطلب؟"
        message={`حذف طلب «${titleCaseName(deleteRequest?.fullName)}»؟`}
        onConfirm={handleDeleteRequest}
        onCancel={() => setDeleteRequest(null)}
      />
      <ConfirmDialog
        open={!!deleteAd}
        title="حذف هذا الإعلان؟"
        message={`حذف «${deleteAd?.title}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        onConfirm={async () => {
          if (!deleteAd) return;
          try {
            await deleteAdvertisementApi(deleteAd.id);
            toast.success('تم حذف الإعلان');
            setDeleteAd(null);
            loadAdvertisements();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'خطأ أثناء الحذف');
          }
        }}
        onCancel={() => setDeleteAd(null)}
      />
    </div>
  );
}
