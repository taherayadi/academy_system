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
  uploadMultipleImagesApi
} from '../api';
import { CenterTenant, DemoRequest, ModuleKey, PlatformAdvertisement, AD_POSITION_SPECS, adPositionLabel } from '../types';
import { analyzePlanChange, ClientPlanDecision } from '../utils/planChange';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import icon from '../assets/icon.png';

// ─── Constants ─────────────────────────────────────────────────────────────
// Base plan: Scolaire + Finance (priced) + Jd. Horaires (bundled, no tarif)
const BASE_MODULE_KEYS = ['scolaire', 'finance'];
const BUNDLED_MODULE_KEY = 'studentTimeSheets'; // Jd. Horaires — offert avec la base, sans tarif
const PAGE_SIZE = 9; // Centres & Demandes : 9 cartes par page (3 lignes × 3 colonnes)

const ALL_MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'scolaire', label: 'Scolaire' },
  { key: 'finance', label: 'Finance' },
  { key: 'etude', label: 'Étude' },
  { key: 'coursParticuliers', label: 'Cours Particuliers' },
  { key: 'revision', label: 'Révision' },
  { key: 'formations', label: 'Formations' },
  { key: 'cantine', label: 'Cantine / Repas' },
  { key: 'transport', label: 'Transport' },
  { key: 'events', label: 'Événements' },
  { key: 'bibliotheque', label: 'Bibliothèque' },
  { key: 'studentTimeSheets', label: 'Jd. Horaires' },
  { key: 'staff', label: 'Personnel' },
];
const ALL_MODULE_KEYS = ALL_MODULES.map(module => module.key);
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

export type PlatformAdminPage = 'overview' | 'centers' | 'requests' | 'finance' | 'pricing' | 'advertisements';

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
  starter: 'Basic',
  basic: 'Basic',
  growth: 'Growth',
  pro: 'Pro',
  custom: 'Custom'
};

const PLAN_BADGE: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600 border border-slate-200',
  basic: 'bg-slate-100 text-slate-600 border border-slate-200',
  growth: 'bg-slate-100 text-slate-600 border border-slate-200',
  pro: 'bg-slate-100 text-slate-600 border border-slate-200',
  custom: 'bg-[#257C86]/10 text-[#257C86] border border-[#257C86]/20'
};

const CENTER_TYPE_LABEL: Record<string, string> = {
  jardin: 'Jardin d’enfant',
  formation: 'Centre de formation'
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

const CENTER_TYPES: { key: 'jardin' | 'formation'; label: string; hint: string }[] = [
  { key: 'jardin', label: 'Jardin d’enfant', hint: 'Préscolaire · maternelle' },
  { key: 'formation', label: 'Centre de formation', hint: 'Soutien · cours · formations' }
];

const STATUS_BADGE: Record<string, string> = {
  trial: 'bg-[#257C86]/10 text-[#257C86] border border-[#257C86]/20',
  active: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  suspended: 'bg-slate-100 text-slate-500 border border-slate-200',
  expired: 'bg-slate-50 text-slate-400 border border-slate-100',
};
const STATUS_LABEL: Record<string, string> = {
  trial: 'Essai', active: 'Actif', suspended: 'Suspendu', expired: 'Expiré'
};

const REQ_STATUS_BADGE: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-violet-100 text-violet-800',
  converted: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-slate-100 text-slate-500',
};
const REQ_STATUS_LABEL: Record<string, string> = {
  new: 'Nouveau', contacted: 'Contacté', converted: 'Converti', archived: 'Archivé'
};

const REQ_TYPE_LABEL: Record<string, string> = {
  trial: 'Essai gratuit', demo: 'Démo guidée', info: 'Infos'
};

function daysLeft(ts?: number | null): number | null {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / 86400000);
}

function fmtDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-TN', { day: '2-digit', month: 'short', year: 'numeric' });
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
  return enabledModules.reduce((total, key) => (
    total + (key === BUNDLED_MODULE_KEY ? 0 : (Number(modulePrices[key]) || 0))
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
  return `${value.toLocaleString('fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;
}

/** Badge + label of an invoice status (a pending cheque gets its own badge). */
function invoiceStatusMeta(inv: { status: string; paymentMethod?: string | null }): { label: string; cls: string } {
  if (inv.status === 'pending' && inv.paymentMethod === 'cheque') {
    return { label: 'Chèque en attente', cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' };
  }
  switch (inv.status) {
    case 'pending': return { label: 'En attente', cls: 'bg-amber-50 text-amber-800 border border-amber-200' };
    case 'paid': return { label: 'Payée', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
    case 'overdue': return { label: 'En retard', cls: 'bg-red-50 text-red-700 border border-red-200' };
    case 'cancelled': return { label: 'Annulée', cls: 'bg-slate-100 text-slate-500 border border-slate-200' };
    default: return { label: inv.status, cls: 'bg-slate-100 text-slate-600 border border-slate-200' };
  }
}

function paymentMethodLabel(method?: string | null): string {
  if (method === 'cash') return 'Espèces';
  if (method === 'cheque') return 'Chèque';
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
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-200/70 shadow-sm px-5 py-3">
      <span className="text-xs font-bold text-slate-400">
        {(page - 1) * size + 1}–{Math.min(page * size, total)} sur {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-[#257C86]/40 hover:text-[#257C86] transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageNumbers(page, totalPages).map((p, i) => p === '…' ? (
          <span key={`gap-${i}`} className="h-9 min-w-6 flex items-center justify-center text-xs font-black text-slate-300">…</span>
        ) : (
          <button key={p} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}
            className={`h-9 min-w-9 px-2 rounded-xl text-xs font-black transition cursor-pointer ${
              p === page
                ? 'bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white shadow-md shadow-[#257C86]/25'
                : 'border border-slate-200 text-slate-500 hover:border-[#257C86]/40 hover:text-[#257C86]'
            }`}>
            {p}
          </button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-[#257C86]/40 hover:text-[#257C86] transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
          <ChevronRight className="h-4 w-4" />
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
    <div className="inline-flex items-center p-1 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
      {options.map(o => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition-all cursor-pointer ${
              active
                ? 'bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white shadow-md shadow-[#257C86]/25'
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
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200/80"
          >
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500">
                  <AlertTriangle className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-black text-sm">{notice.title}</h3>
              </div>
              <button onClick={onDismiss} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer">
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-slate-600 leading-relaxed">{notice.message}</p>
              <div className="mt-6 flex justify-end">
                <button onClick={onDismiss}
                  className="px-6 py-2.5 bg-[#257C86] text-white font-black text-sm rounded-xl hover:bg-[#1e626b] transition cursor-pointer shadow-lg shadow-[#257C86]/25">
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
      toast.success('Logo du centre téléchargé.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du téléchargement du logo.');
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
        ? [...ALL_MODULE_KEYS]
        : plan === 'basic'
          ? [...BASIC_MODULE_KEYS]
          : current.enabledModules
    }));
  };

  // Keep the Pro preset true even when the form is opened or updated from
  // another flow instead of through the plan select change handler.
  React.useEffect(() => {
    if (form.plan === 'pro' && form.enabledModules.length !== ALL_MODULE_KEYS.length) {
      setForm(current => ({ ...current, enabledModules: [...ALL_MODULE_KEYS] }));
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
      toast.error('Le téléphone doit contenir exactement 8 chiffres.');
      return;
    }
    if (!form.centerType) {
      toast.error('Sélectionnez le type d’établissement (jardin d’enfant ou centre de formation).');
      return;
    }
    setSaving(true);
    try {
      const logoUrl = logoFile ? await uploadSelectedLogo() : form.logoUrl;
      const created = await createCenterApi({ ...form, logoUrl, convertFromRequestId: convertRequestId });
      if (created.invoice) {
        toast.success(`Centre créé. Facture ${created.invoice.invoiceNumber} créée (${formatTnd(created.invoice.amount)}) — en attente de paiement.`);
      } else {
        toast.success('Centre créé avec succès !');
      }
      onCreated();
      onClose();
    } catch (err) {
      const code = (err as (Error & { code?: string }))?.code;
      if (code === 'duplicate_email' || code === 'duplicate_slug' || code === 'duplicate_name' || code === 'duplicate') {
        setNotice({
          title: code === 'duplicate_email' ? 'Email administrateur déjà utilisé'
            : code === 'duplicate_name' ? 'Nom de centre déjà pris'
            : code === 'duplicate_slug' ? 'Nom de centre déjà pris'
            : 'Nom de centre ou email déjà utilisé',
          message: code === 'duplicate_email'
            ? 'L’email du directeur saisi appartient déjà à un autre centre. Choisissez un autre email administrateur et réessayez.'
            : code === 'duplicate_name'
              ? 'Un centre porte déjà ce nom exact. Le nom sert aussi d’identifiant (slug) — choisissez un nom différent.'
              : code === 'duplicate_slug'
                ? 'Ce nom de centre génère un identifiant (slug) déjà utilisé par un autre centre. Choisissez un nom différent.'
                : 'Un centre avec le même nom (slug) ou le même email administrateur existe déjà. Modifiez le nom ou l’email, puis réessayez.',
        });
      } else {
        toast.error(err instanceof Error ? err.message : 'Erreur création centre');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl overflow-hidden bg-gradient-to-br from-[#257C86] to-[#1e626b] shadow-lg shadow-[#257C86]/25 flex items-center justify-center">
              <img src={icon} alt="" className="w-full h-full object-cover" />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-900">{convertRequestId ? 'Convertir en centre' : 'Nouveau Centre'}</h2>
              {convertRequestId && <p className="text-[11px] font-bold text-[#257C86]">Type et modules demandés présélectionnés</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          {/* Centre info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Nom du centre *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition" />
            </div>

            {/* Type d'établissement */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Type d’établissement *</label>
              <div className="grid grid-cols-2 gap-3">
                {CENTER_TYPES.map(ct => {
                  const active = form.centerType === ct.key;
                  return (
                    <button key={ct.key} type="button" onClick={() => setForm(f => ({ ...f, centerType: ct.key }))}
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all duration-200 ${
                        active
                          ? 'border-[#257C86] bg-[#257C86]/[0.06] shadow-md shadow-[#257C86]/10'
                          : 'border-slate-200 bg-white hover:border-[#257C86]/40 hover:bg-slate-50/50'
                      }`}>
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className={`h-2.5 w-2.5 rounded-full border-2 transition-colors ${active ? 'border-[#257C86] bg-[#257C86]' : 'border-slate-300'}`} />
                        <span className={`text-sm font-black ${active ? 'text-[#257C86]' : 'text-slate-800'}`}>{ct.label}</span>
                      </div>
                      <span className="block text-[11px] font-semibold text-slate-400 pr-5">{ct.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Logo du centre</label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#257C86] to-[#1e626b] p-1 shadow-md shadow-[#257C86]/20 ring-1 ring-white/40 overflow-hidden shrink-0">
                  <img
                    src={logoPreview || form.logoUrl || icon}
                    alt="Logo du centre"
                    className="w-full h-full rounded-xl object-cover bg-white"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-100 transition">
                      <ImagePlus className="h-4 w-4 text-[#257C86]" />
                      Choisir une image
                      <input
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
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white rounded-xl text-xs font-black shadow-md shadow-[#257C86]/20 hover:shadow-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Télécharger et enregistrer
                    </button>
                    {(form.logoUrl || logoFile) && (
                      <button
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, logoUrl: '' })); setLogoFile(null); setLogoPreview(null); }}
                        disabled={logoUploading}
                        className="inline-flex items-center gap-2 px-3.5 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-black hover:bg-red-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-400">PNG · JPG · WEBP · SVG · GIF — 2 Mo maximum. Le logo est envoyé à ImageKit avant la création du centre.</p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Ville</label>
              <input value={form.locationCity} onChange={e => setForm(f => ({ ...f, locationCity: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Téléphone *</label>
              <input required type="tel" inputMode="numeric" maxLength={8} pattern="[0-9]{8}" dir="ltr" value={form.phoneNumber}
                onChange={e => setForm(f => ({ ...f, phoneNumber: normalizePhoneInput(e.target.value) }))}
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition text-left" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Plan *</label>
              <select required value={form.plan} onChange={e => handlePlanChange(e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition cursor-pointer">
                <option value="trial">Essai gratuit</option>
                <option value="basic">Basic</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {form.plan !== 'trial' && (
              <>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Cycle de facturation</label>
                  <select value={form.billingCycle} onChange={e => setForm(f => ({ ...f, billingCycle: e.target.value as 'monthly' | 'annual' }))}
                    className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition cursor-pointer">
                    <option value="monthly">Mensuel</option>
                    <option value="annual">Annuel — 20 % de remise</option>
                  </select>
                </div>
                {/* Same presentation as the « Essai gratuit » card — free days
                    are an trial before the billing starts, not a separate note. */}
                <div className="sm:col-span-2 rounded-2xl border border-[#257C86]/20 bg-[#257C86]/[0.05] px-4 py-3 space-y-2" dir="ltr">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-left">
                    <label htmlFor="new-center-offer-days" className="text-xs font-black text-slate-600">Durée de l’essai avant l’abonnement</label>
                    <div className="flex items-center gap-2">
                      <input id="new-center-offer-days" type="number" min="0" max="3650" step="1" inputMode="numeric" value={form.offerDays}
                        onChange={e => setForm(f => ({ ...f, offerDays: e.target.value }))}
                        className="w-20 border-2 border-[#257C86]/20 rounded-xl px-2.5 py-2 text-sm font-black text-slate-800 bg-white focus:border-[#257C86] focus:ring-0 outline-none text-center" />
                      <span className="text-xs font-bold text-slate-500">jours</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-left">
                    <span className="text-xs font-black text-slate-600">Début de l’abonnement ({offerDays} jour{offerDays > 1 ? 's' : ''})</span>
                    <span className="text-sm font-black text-slate-800">{previewOfferEnd ? fmtDate(previewOfferEnd) : 'Aujourd’hui'}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 text-left">Gratuit pendant l’essai — la facturation ne démarre qu’ensuite, au tarif sélectionné.</p>
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-[#257C86]/20 bg-[#257C86]/[0.05] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-600">Tarif calculé</span>
                    <span className="text-lg font-black text-[#257C86]">
                      {automaticPlan ? formatTnd(calculatedTariff) : 'Tarif négocié'}
                    </span>
                  </div>
                  {automaticPlan ? (
                    <p className="text-[11px] font-semibold text-slate-500 mt-1">
                      {form.billingCycle === 'annual'
                        ? 'Total annuel : total mensuel × 12 avec 20 % de remise.'
                        : 'Total mensuel des modules sélectionnés.'}
                    </p>
                  ) : (
                    <input type="number" min="0" step="0.01" value={form.monthlyPrice}
                      onChange={e => setForm(f => ({ ...f, monthlyPrice: e.target.value }))}
                      placeholder="Saisir le tarif négocié en TND"
                      className="mt-2 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] outline-none" />
                  )}
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1" dir="ltr">
                  <div className="flex items-center justify-between gap-3 text-left">
                    <span className="text-xs font-black text-slate-600">Fin d’abonnement calculée</span>
                    <span className="text-sm font-black text-slate-800">{fmtDate(previewEnd)}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 text-left">
                    {offerDays > 0
                      ? `Essai gratuit de ${offerDays} jour${offerDays > 1 ? 's' : ''}, puis ${form.billingCycle === 'annual' ? '365 jours' : '30 jours'} facturés au tarif du plan.`
                      : `${form.billingCycle === 'annual' ? '365 jours' : '30 jours'} à partir de la création.`}
                  </p>
                </div>
              </>
            )}
            {form.plan === 'trial' && (
              <div className="sm:col-span-2 rounded-2xl border border-[#257C86]/20 bg-[#257C86]/[0.05] px-4 py-3 space-y-2" dir="ltr">
                <div className="flex flex-wrap items-center justify-between gap-3 text-left">
                  <label htmlFor="new-center-trial-days" className="text-xs font-black text-slate-600">Durée de l’essai offert</label>
                  <div className="flex items-center gap-2">
                    <input id="new-center-trial-days" type="number" min="1" max="3650" step="1" inputMode="numeric" value={form.trialDays}
                      onChange={e => setForm(f => ({ ...f, trialDays: e.target.value }))}
                      className="w-20 border-2 border-[#257C86]/20 rounded-xl px-2.5 py-2 text-sm font-black text-slate-800 bg-white focus:border-[#257C86] focus:ring-0 outline-none text-center" />
                    <span className="text-xs font-bold text-slate-500">jours</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-left">
                  <span className="text-xs font-black text-slate-600">Fin de l’essai ({trialDays} jours)</span>
                  <span className="text-sm font-black text-slate-800">{fmtDate(previewEnd)}</span>
                </div>
                <p className="text-[11px] font-semibold text-slate-500 text-left">Le centre d’essai reste gratuit.</p>
              </div>
            )}
          </div>

          {/* Director */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Compte Directeur</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Nom *</label>
                <input required value={form.directorName} onChange={e => setForm(f => ({ ...f, directorName: e.target.value }))}
                  className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Email *</label>
                <input required type="email" value={form.directorEmail} onChange={e => setForm(f => ({ ...f, directorEmail: e.target.value }))}
                  className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition" />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Mot de passe initial *</label>
                <input required type="password" minLength={6} value={form.directorPassword} onChange={e => setForm(f => ({ ...f, directorPassword: e.target.value }))}
                  className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition" />
              </div>
            </div>
          </div>

          {/* Modules : base verrouillée + additions */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Modules activés</p>

            <div className="flex flex-wrap gap-2 mb-3">
              {BASE_MODULE_KEYS.map(key => (
                <span key={key} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-[#257C86] text-white shadow-sm shadow-[#257C86]/25 cursor-default">
                  <Lock className="h-3 w-3" />
                  {MODULE_LABEL(key)}
                  <span className="text-[9px] font-bold bg-white/25 rounded-full px-1.5 py-px uppercase">Base</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 cursor-default">
                <Lock className="h-3 w-3" />
                {MODULE_LABEL(BUNDLED_MODULE_KEY)}
                <span className="text-[9px] font-bold bg-white/25 rounded-full px-1.5 py-px uppercase">Offert</span>
              </span>
            </div>

            {form.plan === 'basic' ? (
              <p className="text-[11px] font-semibold text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                Le plan Basic utilise uniquement les modules de base. Tarif recalculé automatiquement.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ALL_MODULES.filter(m => !isBaseModule(m.key)).map(m => {
                  const on = form.enabledModules.includes(m.key);
                  return (
                    <button key={m.key} type="button" onClick={() => toggle(m.key)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer inline-flex items-center gap-1 ${
                        on
                          ? 'bg-[#257C86] text-white border-[#257C86]'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-[#257C86]/40'
                      }`}>
                      {on && <Check className="h-3 w-3" />}
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] font-semibold text-slate-400 mt-2.5">La base Scolaire + Finance est toujours incluse, avec Jd. Horaires offert — ils ne peuvent pas être retirés.</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-black text-white bg-gradient-to-r from-[#257C86] to-[#1e626b] rounded-xl shadow-lg shadow-[#257C86]/25 hover:shadow-[#257C86]/40 transition cursor-pointer disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Créer le centre
            </button>
          </div>
        </form>
      </motion.div>
      <NoticeDialog notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

// ─── Edit Invoice Modal (statut / paiement / chèque) ────────────────────────
function EditInvoiceModal({ invoice, onClose, onSaved }: { invoice: CenterInvoice; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const inputCls = 'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition';
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
      toast.error('Sélectionnez la méthode de paiement (Espèces ou Chèque).');
      return;
    }
    if (chequeMode && !chequeNumber.trim()) {
      toast.error('Le numéro du chèque est obligatoire.');
      return;
    }
    if (chequeMode && !chequeDate) {
      toast.error('La date du chèque est obligatoire.');
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
      toast.success('Facture mise à jour');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la mise à jour.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-[#257C86]/10 rounded-xl"><Receipt className="h-4 w-4 text-[#257C86]" /></span>
            <h2 className="text-base font-black text-slate-900">Facture {invoice.invoiceNumber}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 mb-4 text-xs font-bold text-slate-600">
          {invoice.centerName} · {invoice.amount.toFixed(2)} TND
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Statut</label>
            <select value={status} onChange={e => setStatus(e.target.value as CenterInvoice['status'])} className={`${inputCls} cursor-pointer`}>
              <option value="pending">En attente</option>
              <option value="paid">Payée</option>
              <option value="overdue">En retard</option>
              <option value="cancelled">Annulée</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Méthode de paiement</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value="">—</option>
              <option value="cash">Espèces</option>
              <option value="cheque">Chèque</option>
            </select>
          </div>

          {chequeMode && (
            <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-3.5 space-y-3">
              <p className="text-[10px] font-bold text-indigo-700 leading-relaxed">
                Chèque reçu : laissez le statut « En attente » — la facture apparaît dans « Chèques en attente » et
                n’est <span className="underline">pas comptée dans les revenus</span> tant que vous ne l’encaissez pas
                (bouton « Encaisser », qui passe la facture en « Payée »).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">N° Chèque</label>
                  <input
                    type="text"
                    value={chequeNumber}
                    onChange={e => setChequeNumber(e.target.value)}
                    placeholder="Ex : 001245"
                    dir="ltr"
                    className={`${inputCls} text-left`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Date du chèque</label>
                  <input
                    type="date"
                    dir="ltr"
                    value={chequeDate}
                    onChange={e => setChequeDate(e.target.value)}
                    className={`${inputCls} cursor-pointer input-date-ltr text-left`}
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-black text-white bg-gradient-to-r from-[#257C86] to-[#1e626b] rounded-xl shadow-md shadow-[#257C86]/25 hover:shadow-lg transition cursor-pointer disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Sauvegarder
            </button>
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
  const inputCls = 'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition';
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
      setEnabledModules([...ALL_MODULE_KEYS]);
    } else if (
      form.plan === 'basic'
      && (enabledModules.length !== BASIC_MODULE_KEYS.length || !BASIC_MODULE_KEYS.every(key => enabledModules.includes(key)))
    ) {
      setEnabledModules([...BASIC_MODULE_KEYS]);
    }
  }, [form.plan]);

  const handleEditPlanChange = (plan: string) => {
    setForm(current => ({ ...current, plan }));
    if (plan === 'pro') setEnabledModules([...ALL_MODULE_KEYS]);
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
          `Plan changé immédiatement. Solde à régler: ${formatTnd(settlement.amount)} ` +
          `(${settlement.paid ? 'période déjà réglée — complément' : 'facture créée'}${settlement.invoiceNumber ? ` ${settlement.invoiceNumber}` : ''}).`
        );
      } else {
        toast.success('Plan changé immédiatement. La fin de l’abonnement ne change pas.');
      }
    } else if (mode === 'scheduled') {
      toast.success(
        outcome?.applyAt
          ? `Changement planifié — il sera appliqué le ${fmtDate(outcome.applyAt)}.`
          : 'Changement planifié — il sera appliqué à la prochaine reconduction.'
      );
    } else if (mode === 'renewal') {
      toast.success(
        outcome?.invoice
          ? `Nouvelle période démarrée. Facture ${outcome.invoice.invoiceNumber} créée (${formatTnd(outcome.invoice.amount)}) — en attente de paiement.`
          : 'Centre mis à jour. Nouvelle période d’abonnement démarrée.'
      );
    } else {
      toast.success('Centre mis à jour');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidCenterPhone(form.phoneNumber)) {
      toast.error('Le téléphone doit contenir exactement 8 chiffres.');
      return;
    }
    if (!form.name.trim()) {
      toast.error('Le nom du centre est obligatoire.');
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
      toast.success('Centre mis à jour');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la mise à jour du centre.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-[#257C86]/10"><Edit className="h-4 w-4 text-[#257C86]" /></span>
            <div>
              <h2 className="text-base font-black text-slate-900">Modifier le centre</h2>
              <p className="text-[11px] font-semibold text-slate-400 truncate max-w-[16rem] sm:max-w-none">{center.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Nom du centre *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Logo du centre</label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#257C86] to-[#1e626b] p-1 shadow-md shadow-[#257C86]/20 ring-1 ring-white/40 overflow-hidden shrink-0">
                  <img src={logoPreview || form.logoUrl || icon} alt="Logo du centre" className="w-full h-full rounded-xl object-cover bg-white" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-100 transition">
                      <ImagePlus className="h-4 w-4 text-[#257C86]" />
                      Choisir une image
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden" onChange={e => handleLogoSelect(e.target.files?.[0])} />
                    </label>
                    {(form.logoUrl || logoFile) && (
                      <button type="button" onClick={handleRemoveLogo} disabled={saving} className="inline-flex items-center gap-2 px-3.5 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-black hover:bg-red-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-400">PNG · JPG · WEBP · SVG · GIF — 2 Mo maximum. Le nouveau logo sera envoyé à ImageKit lors de l’enregistrement.</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Ville</label>
              <input value={form.locationCity} onChange={e => setForm(f => ({ ...f, locationCity: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Téléphone *</label>
              <input required type="tel" inputMode="numeric" maxLength={8} pattern="[0-9]{8}" dir="ltr" value={form.phoneNumber}
                onChange={e => setForm(f => ({ ...f, phoneNumber: normalizePhoneInput(e.target.value) }))}
                className={`${inputCls} text-left`} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Type d’établissement</label>
              <select value={form.centerType} onChange={e => setForm(f => ({ ...f, centerType: e.target.value as 'jardin' | 'formation' | '' }))} className={`${inputCls} cursor-pointer`}>
                <option value="">Non défini</option>
                <option value="jardin">Jardin d’enfant</option>
                <option value="formation">Centre de formation</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Email administrateur</label>
              <input value={center.adminEmail || '—'} readOnly className={`${inputCls} bg-slate-50 text-slate-500 cursor-not-allowed`} />
            </div>
          </div>

          <div className="rounded-2xl bg-[#257C86]/[0.05] border border-[#257C86]/15 px-4 py-3.5">
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              L’abonnement (plan, cycle, tarif, date de fin, modules et factures) ne se gère plus ici :
              utilisez le bouton <span className="text-[#257C86] font-black">« Plans &amp; factures »</span> de la carte du centre.
              Cette modification n’entraînera jamais la création d’une nouvelle facture.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer">Annuler</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 text-sm font-black text-white bg-gradient-to-r from-[#257C86] to-[#1e626b] rounded-xl shadow-lg shadow-[#257C86]/25 hover:shadow-[#257C86]/40 transition cursor-pointer disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enregistrer
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}


// Labels/badges for the per-center plan audit trail (center_plan_history).
const PLAN_HISTORY_LABEL: Record<string, { text: string; cls: string }> = {
  center_created: { text: 'Création', cls: 'bg-slate-100 text-slate-600' },
  plan_set: { text: 'Plan appliqué', cls: 'bg-[#257C86]/10 text-[#257C86]' },
  plan_activated: { text: 'Abonnement activé', cls: 'bg-emerald-100 text-emerald-700' },
  plan_renewed: { text: 'Reconduction', cls: 'bg-sky-100 text-sky-700' },
  plan_settled: { text: 'Régularisation', cls: 'bg-emerald-100 text-emerald-700' },
  plan_scheduled: { text: 'Plan programmé', cls: 'bg-amber-100 text-amber-700' },
  plan_applied: { text: 'Programme appliqué', cls: 'bg-[#257C86]/10 text-[#257C86]' },
  schedule_cancelled: { text: 'Programme annulé', cls: 'bg-slate-100 text-slate-500' },
  plan_removed: { text: 'Abonnement annulé', cls: 'bg-red-100 text-red-700' },
  trial_added: { text: 'Jours offerts', cls: 'bg-violet-100 text-violet-700' },
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
  const fieldCls = 'w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition';
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
      toastRef.current.error(err instanceof Error ? err.message : 'Erreur chargement de l’abonnement');
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
    if (plan === 'pro') setEnabledModules([...ALL_MODULE_KEYS]);
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
      toast.error(err instanceof Error ? err.message : 'Erreur mise à jour du plan');
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
      }, isTrial ? 'Abonnement activé' : 'Abonnement relancé');
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
          ? `Changement programmé pour le ${fmtDate(applyAt)} — la période payée reste inchangée.`
          : 'Changement programmé pour la prochaine reconduction.');
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
            `Régularisation ${formatTnd(settlement.amount)} — ${settlement.paid ? 'complément (période déjà payée)' : 'nouvelle facture, l’ancienne en attente a été annulée'}`
            + `${settlement.invoiceNumber ? ` (${settlement.invoiceNumber})` : ''}.`
          );
        } else {
          toast.success('Plan mis à jour.');
        }
      }
      onSaved();
      await reload();
      setMode('view');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur mise à jour du plan');
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
  }, 'Plan programmé pour la fin de période');

  // Suppression du plan : confirmation → annulation des factures en attente
  // + expiration du centre, puis fermeture du dialog.
  const doRemovePlan = async () => {
    setConfirmRemove(false);
    setSaving(true);
    try {
      await centerPlanActionApi({ action: 'remove-plan', centerId: center.id });
      toast.success('Abonnement supprimé — factures en attente annulées, centre marqué expiré.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression du plan');
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
      toast.error('Indiquez un nombre de jours valide (1 à 3650).');
      return;
    }
    await runAction({
      action: 'add-trial',
      centerId: center.id,
      days: trialDaysNum,
    }, 'Période d’essai ajoutée');
  };

  const planTitle = view ? (PLAN_LABEL[view.center.plan] || view.center.plan || 'Aucun plan') : '—';

  const renderFields = () => (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Plan</label>
          <select
            title="Plan du centre"
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
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Cycle</label>
          <select
            value={draft.billingCycle}
            onChange={e => setDraft(d => ({ ...d, billingCycle: e.target.value as 'monthly' | 'annual' }))}
            className={`${fieldCls} cursor-pointer`}
          >
            <option value="monthly">Mensuel</option>
            <option value="annual">Annuel — 20 % de remise</option>
          </select>
        </div>
        {draft.plan === 'custom' ? (
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Tarif mensuel (TND)</label>
            <input type="number" min="0" step="0.01" value={draft.monthlyPrice}
              onChange={e => setDraft(d => ({ ...d, monthlyPrice: e.target.value }))} className={fieldCls} />
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 flex flex-col justify-center">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tarif {draft.billingCycle === 'annual' ? 'annuel' : 'mensuel'} calculé</span>
            <span className="text-sm font-black text-[#257C86]">
              {formatTnd(automaticPlan ? calculatedTariff : (Number(draft.monthlyPrice) || 0))} · {draft.billingCycle === 'annual' ? 'TND/an' : 'TND/mois'}
            </span>
          </div>
        )}
      </div>

      {/* Modules — sélectionnables pour Growth (Pro = tout, Basic = base) */}
      {draft.plan === 'growth' && (
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Modules à activer</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MODULES.filter(m => !isBaseModule(m.key) && m.key !== BUNDLED_MODULE_KEY).map(module => {
              const selected = enabledModules.includes(module.key);
              return (
                <button key={module.key} type="button" onClick={() => toggleDraftModule(module.key)}
                  className={`text-[10px] font-bold px-2.5 py-1.5 rounded-xl border transition cursor-pointer inline-flex items-center gap-1 ${selected ? 'bg-[#257C86] text-white border-[#257C86]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#257C86]/40'}`}>
                  {selected && <Check className="h-3 w-3" />} {module.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {draft.plan === 'pro' && (
        <p className="text-[10px] font-semibold text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
          Pro : tous les modules sont activés automatiquement.
        </p>
      )}
      {draft.plan === 'basic' && (
        <p className="text-[10px] font-semibold text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[#257C86]" /> Plans &amp; factures
            </h2>
            <p className="text-[11px] font-bold text-slate-400 truncate">{center.name}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer flex-shrink-0">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
          </div>
        ) : !view ? (
          <p className="text-center text-sm font-bold text-slate-400 py-16">Données indisponibles</p>
        ) : (
          <div className="p-5 space-y-4">
            {/* ── Abonnement en cours ── */}
            <div className="rounded-2xl border-2 border-slate-200/70 p-4 bg-slate-50/50">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                  {isTrial ? 'Période d’essai' : 'Abonnement en cours'}
                </p>
                {hasLiveWindow && (
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${windowPaidInvoice ? 'bg-emerald-100 text-emerald-700' : pendingInvoice ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                    {windowPaidInvoice ? 'Fenêtre payée' : pendingInvoice ? 'Fenêtre non payée' : 'Sans facture'}
                  </span>
                )}
                {expiredState && (
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Expiré</span>
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
                      {view.center.billingCycle === 'annual' ? 'Annuel' : 'Mensuel'}
                      {view.center.monthlyPrice > 0 ? ` · ${view.center.monthlyPrice.toFixed(2)} TND` : ''}
                    </span>
                  </div>
                  {expiredState ? (
                    <p className="text-[11px] font-bold text-red-600 mt-1.5">
                      {centerStatus === 'expired' && liveEnd > now
                        ? `Abonnement supprimé le ${fmtDate(now)} — relancez un plan pour facturer à nouveau.`
                        : <>Abonnement expiré{liveEnd > 0 ? ` le ${fmtDate(liveEnd)}` : ''} — relancez un plan pour facturer à nouveau.</>}
                    </p>
                  ) : (
                    <p className="text-[11px] font-semibold text-slate-500 mt-1.5">
                      Fin de l’abonnement : {liveEnd > 0 ? fmtDate(liveEnd) : '—'}
                    </p>
                  )}
                  {!expiredState && pendingInvoice && (
                    <p className="text-[11px] font-bold text-amber-700 mt-1.5">
                      Facture {pendingInvoice.invoiceNumber} —{' '}
                      {pendingInvoice.status === 'overdue' ? 'en retard' : 'en attente'} · {pendingInvoice.amount.toFixed(2)} TND
                    </p>
                  )}
                  {!expiredState && windowPaidInvoice && (
                    <p className="text-[11px] font-bold text-emerald-700 mt-1.5">
                      Facture {windowPaidInvoice.invoiceNumber} payée · {windowPaidInvoice.amount.toFixed(2)} TND
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
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-gradient-to-r from-[#257C86] to-[#1e626b] rounded-xl shadow-md shadow-[#257C86]/25 hover:shadow-lg transition cursor-pointer disabled:opacity-60">
                    <Edit className="h-3.5 w-3.5" /> {isTrial ? 'Choisir un plan et activer' : hasLiveWindow ? 'Modifier le plan' : 'Relancer un abonnement'}
                  </button>
                  <button onClick={() => openForm('schedule')} disabled={saving || isTrial || !hasLiveWindow}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={isTrial ? 'Disponible une fois le centre abonné — le plan programmé s’applique à la fin de la période.' : !hasLiveWindow ? 'Aucune période en cours — relancez d’abord un abonnement.' : 'Appliqué à la fin de la période en cours'}>
                    <CalendarClock className="h-3.5 w-3.5" /> Programmer un plan
                  </button>
                  {(hasLiveWindow || isTrial) && (
                    <button onClick={() => setMode('trial')} disabled={saving}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#257C86] bg-[#257C86]/[0.06] border border-[#257C86]/25 rounded-xl hover:bg-[#257C86]/[0.12] transition cursor-pointer disabled:opacity-40"
                      title="Offrir des jours : au début si l’abonnement ne court pas encore, sinon ajoutés à la fin de la période">
                      <Clock className="h-3.5 w-3.5" /> Ajouter une période d’essai
                    </button>
                  )}
                  {!isTrial && (
                    <button onClick={() => setConfirmRemove(true)} disabled={!hasLiveWindow || saving}
                      className={`flex items-center gap-1.5 ml-auto px-3.5 py-2 text-xs font-bold rounded-xl border transition ${hasLiveWindow ? 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100 cursor-pointer' : 'text-slate-300 bg-slate-50 border-slate-200 cursor-not-allowed'}`}
                      title={hasLiveWindow ? undefined : 'Aucun abonnement actif à supprimer'}>
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer le plan
                    </button>
                  )}
                </div>
                {hasLiveWindow && windowPaidInvoice && (
                  <p className="text-[10px] font-semibold text-slate-400 -mt-2">
                    Période déjà payée : aucune facture payée ne sera modifiée — les jours déjà réglés restent acquis et la différence éventuelle est régularisée au prorata ou programmée.
                  </p>
                )}
              </>
            )}

            {/* ── Formulaire : ajouter une période d'essai ── */}
            {mode === 'trial' && (
              <div className="rounded-2xl border-2 border-[#257C86]/25 bg-[#257C86]/[0.04] p-4 space-y-3" dir="ltr">
                <p className="text-xs font-black text-slate-700">Ajouter une période d’essai offerte</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="plan-manager-trial-days" className="text-xs font-black text-slate-600">Nombre de jours</label>
                  <div className="flex items-center gap-2">
                    <input id="plan-manager-trial-days" type="number" min={1} max={3650} step={1} inputMode="numeric"
                      value={trialDaysInput} onChange={e => setTrialDaysInput(e.target.value)}
                      className="w-24 border-2 border-[#257C86]/20 rounded-xl px-2.5 py-2 text-sm font-black text-slate-800 bg-white focus:border-[#257C86] focus:ring-0 outline-none text-center" />
                    <span className="text-xs font-bold text-slate-500">jours</span>
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                  {isTrial && !hasLiveWindow &&
                    <>L’essai est en cours — il est prolongé de {Math.max(1, trialDaysNum)} jour(s) et la facturation démarrera après.</>
                  }
                  {!isTrial && trialGoesToStart && hasLiveWindow &&
                    <>L’abonnement démarre {windowStartDate > startOfToday ? `le ${fmtDate(windowStartDate)}` : 'aujourd’hui'} — les {Math.max(1, trialDaysNum)} jours sont offerts au DÉBUT : la facture en attente est décalée d’autant et la fin de l’abonnement est reportée au {fmtDate(liveEnd + Math.max(1, trialDaysNum) * DAY_MS)}.</>}
                  {!trialGoesToStart &&
                    <>La période est déjà entamée — les {Math.max(1, trialDaysNum)} jours sont ajoutés à la FIN : nouvelle échéance le {fmtDate(liveEnd + Math.max(1, trialDaysNum) * DAY_MS)} (au lieu du {fmtDate(liveEnd)}). Aucune facture payée n’est modifiée.</>}
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setMode('view')} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer">Annuler</button>
                  <button onClick={submitTrial} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-gradient-to-r from-[#257C86] to-[#1e626b] rounded-xl shadow-md shadow-[#257C86]/25 hover:shadow-lg transition cursor-pointer disabled:opacity-60">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                    Ajouter l’essai ({Math.max(1, trialDaysNum)} j)
                  </button>
                </div>
              </div>
            )}

            {/* ── Formulaire : modifier le plan courant / programmer ── */}
            {(mode === 'edit' || mode === 'schedule') && (
              <div className={`rounded-2xl border-2 p-4 space-y-3 ${mode === 'edit' ? 'border-[#257C86]/20 bg-[#257C86]/[0.04]' : 'border-amber-300/50 bg-amber-50/50'}`}>
                <p className="text-xs font-black text-slate-700">
                  {mode === 'schedule'
                    ? 'Programmer un plan pour la fin de la période en cours'
                    : isTrial
                      ? 'Activer l’abonnement'
                      : !hasLiveWindow
                        ? 'Nouvel abonnement — la période repart d’aujourd’hui'
                        : 'Modifier le plan en cours'}
                </p>
                {renderFields()}

                {/* Mid-period consequence — settlement (difference) vs schedule */}
                {mode === 'edit' && midPeriod && decision.kind !== 'mid_period_same_price' && (
                  <div className="rounded-xl bg-white border border-slate-200 px-3.5 py-3 space-y-2.5">
                    <p className="text-[11px] font-black text-slate-700">
                      Changement en cours de période —{' '}
                      {decision.kind === 'mid_period_increase' ? 'à la hausse' : 'à la baisse'}
                      {decision.kind === 'mid_period_increase' && (
                        <> · {decision.remainingDays} jour{decision.remainingDays > 1 ? 's' : ''} restant{decision.remainingDays > 1 ? 's' : ''} sur la période payée</>
                      )}
                    </p>
                    {settlementRelevant ? (
                      <>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <button type="button" onClick={() => setApplyChoice('settle')}
                            className={`text-left rounded-xl border-2 px-3 py-2.5 transition cursor-pointer ${applyChoice === 'settle' ? 'border-[#257C86] bg-white shadow-md shadow-[#257C86]/10' : 'border-slate-200 bg-white/60 hover:border-[#257C86]/40'}`}>
                            <div className="text-[10px] font-black text-slate-800">Appliquer maintenant</div>
                            <div className="text-[10px] font-semibold text-slate-500 mt-1">Fin d’abonnement inchangée · régularisation au prorata des jours déjà utilisés</div>
                          </button>
                          <button type="button" onClick={() => setApplyChoice('schedule')}
                            className={`text-left rounded-xl border-2 px-3 py-2.5 transition cursor-pointer ${applyChoice === 'schedule' ? 'border-[#257C86] bg-white shadow-md shadow-[#257C86]/10' : 'border-slate-200 bg-white/60 hover:border-[#257C86]/40'}`}>
                            <div className="text-[10px] font-black text-slate-800">Programmer pour {hasLiveWindow ? fmtDate(liveEnd) : 'la reconduction'}</div>
                            <div className="text-[10px] font-semibold text-slate-500 mt-1">Le plan actuel reste appliqué jusqu’à la fin de la période</div>
                          </button>
                        </div>
                        {effectiveApplyChoice === 'settle' && (
                          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                            <p className="text-[10px] font-black text-slate-600 mb-1.5">Facturation actuelle : {formatTnd(decision.oldAmount)} → nouveau : {formatTnd(decision.newAmount)}</p>
                            <div className="grid sm:grid-cols-2 gap-2">
                              <button type="button" onClick={() => setPaymentState('paid')}
                                className={`text-left rounded-xl border-2 px-3 py-2 transition cursor-pointer ${paymentState === 'paid' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-400'}`}>
                                <div className="text-[10px] font-black text-emerald-800">Période déjà payée</div>
                                <div className="text-sm font-black text-emerald-700">+ {formatTnd(decision.paidAmount)}</div>
                                <div className="text-[9px] font-semibold text-slate-500">complément = différence × jours restants</div>
                              </button>
                              <button type="button" onClick={() => setPaymentState('unpaid')}
                                className={`text-left rounded-xl border-2 px-3 py-2 transition cursor-pointer ${paymentState === 'unpaid' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-400'}`}>
                                <div className="text-[10px] font-black text-amber-800">Période pas encore payée</div>
                                <div className="text-sm font-black text-amber-700">{formatTnd(decision.unpaidAmount)}</div>
                                <div className="text-[9px] font-semibold text-slate-500">l’ancienne facture en attente est annulée et remplacée</div>
                              </button>
                            </div>
                            {!windowPaidInvoice && paymentState !== 'unpaid' && (
                              <p className="text-[9px] font-semibold text-slate-500 mt-1.5">
                                Détecté : aucune facture payée ne couvre la période — l’option « pas encore payée » correspond à votre cas.
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[10px] font-semibold text-amber-800 leading-relaxed">
                        La période en cours est déjà payée au tarif actuel : le passage à la baisse ne peut pas être remboursé — il sera appliqué à la fin de la période ({hasLiveWindow ? fmtDate(liveEnd) : 'prochaine reconduction'}), sans remboursement ni jour perdu.
                      </div>
                    )}
                  </div>
                )}

                {mode === 'edit' && !midPeriod && !isTrial && hasLiveWindow && (
                  <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
                    {windowPaidInvoice
                      ? 'La facture payée de la période en cours ne bougera pas.'
                      : pendingInvoice
                        ? `La facture en attente ${pendingInvoice.invoiceNumber} sera remplacée par une nouvelle facture au tarif du plan choisi (aucun double prélèvement).`
                        : 'Une facture « en attente » sera créée pour la période en cours.'}
                  </p>
                )}
                {mode === 'edit' && (isTrial || !hasLiveWindow) && (
                  <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
                    Une nouvelle facture « en attente » sera créée pour la première période — marquez-la payée dans SaaS → Finance quand le client règle.
                  </p>
                )}
                {mode === 'schedule' && (
                  <p className="text-[10px] font-semibold text-amber-800 leading-relaxed">
                    Le plan actuel reste appliqué jusqu’au {hasLiveWindow ? fmtDate(liveEnd) : 'prochain renouvellement'}, puis la bascule est automatique (facture « en attente » générée pour la nouvelle période).
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setMode('view')} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer">Annuler</button>
                  <button onClick={mode === 'schedule' ? submitScheduled : submitPlan} disabled={saving}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white rounded-xl shadow-md transition cursor-pointer disabled:opacity-60 ${mode === 'schedule' ? 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-amber-500/25 hover:shadow-lg' : 'bg-gradient-to-r from-[#257C86] to-[#1e626b] shadow-[#257C86]/25 hover:shadow-lg'}`}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mode === 'schedule' ? <CalendarClock className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    {mode === 'schedule' ? 'Programmer' : isTrial ? 'Activer l’abonnement' : 'Enregistrer le plan'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Plans programmés ── */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2">
                Plans programmés ({view.schedules.length})
              </p>
              {view.schedules.length === 0 ? (
                <p className="text-[11px] font-semibold text-slate-400">Aucun plan programmé.</p>
              ) : (
                <div className="space-y-2">
                  {view.schedules.map(s => (
                    <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                      <CalendarClock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      <span className="text-xs font-black text-slate-800">{PLAN_LABEL[s.plan === 'starter' ? 'basic' : s.plan] || s.plan}</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {s.billingCycle === 'annual' ? 'Annuel' : 'Mensuel'}
                        {s.monthlyPrice ? ` · ${Number(s.monthlyPrice).toFixed(2)} TND` : ''}
                      </span>
                      <span className="ml-auto text-[10px] font-bold text-slate-400">
                        {s.applyAt ? `le ${fmtDate(s.applyAt)}` : 'à la prochaine reconduction'}
                      </span>
                      <button onClick={() => runAction({ action: 'remove-schedule', centerId: center.id, scheduleId: s.id }, 'Plan programmé supprimé')}
                        disabled={saving}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer disabled:opacity-50" title="Supprimer ce plan programmé">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Historique des plans (audit trail, migration 0029) ── */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2">
                Historique des plans ({(view.history || []).length})
              </p>
              {(view.history || []).length === 0 ? (
                <p className="text-[11px] font-semibold text-slate-400">Aucune activité enregistrée.</p>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full" dir="ltr">
                    <thead>
                      <tr className="bg-slate-50 text-left text-[9px] font-black uppercase tracking-wider text-slate-400">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Détails</th>
                        <th className="px-3 py-2 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(view.history || []).map(h => {
                        const meta = PLAN_HISTORY_LABEL[h.action] || { text: h.action, cls: 'bg-slate-100 text-slate-500' };
                        return (
                          <tr key={h.id} className="border-t border-slate-100 align-top">
                            <td className="px-3 py-2 text-[10px] font-bold text-slate-500 whitespace-nowrap">{fmtDate(h.createdAt)}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}>{meta.text}</span>
                            </td>
                            <td className="px-3 py-2 text-[10px] font-semibold text-slate-600">
                              {h.details}{h.invoiceNumber ? ` · ${h.invoiceNumber}` : ''}
                            </td>
                            <td className="px-3 py-2 text-[10px] font-black text-slate-700 whitespace-nowrap text-right">
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
        title="Supprimer ce plan ?"
        message="Le centre passera en « expiré » et toutes ses factures en attente seront annulées. Les factures déjà payées restent comptabilisées. Confirmez-vous ?"
        confirmLabel="Oui, supprimer le plan"
        cancelLabel="Annuler"
        danger
        onConfirm={doRemovePlan}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

// Emplacements connus → libellés français (une valeur inconnue s'affiche telle quelle).
const AD_LOCATION_LABELS: Record<string, string> = {
  landing_page: 'Page d’accueil',
  center_admin: 'Tableau de bord des centres',
  both: 'Accueil + tableaux de bord',
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
const AD_STATUS_META: Record<AdStatus, { label: string; cls: string }> = {
  live: { label: 'En ligne', cls: 'bg-emerald-100 text-emerald-700' },
  draft: { label: 'Brouillon', cls: 'bg-amber-100 text-amber-700' },
  scheduled: { label: 'Programmée', cls: 'bg-sky-100 text-sky-700' },
  paused: { label: 'En pause', cls: 'bg-slate-200 text-slate-500' },
  expired: { label: 'Expirée', cls: 'bg-red-100 text-red-600' },
};
const AD_STATUS_FILTERS: Array<{ value: 'all' | AdStatus; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'live', label: 'En ligne' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'scheduled', label: 'Programmées' },
  { value: 'paused', label: 'En pause' },
  { value: 'expired', label: 'Expirées' },
];

// ─── Advertisement create/edit modal ───────────────────────────────────────
// The platform dashboard's « إعلان جديد » / « تعديل » buttons open this form.
// One upload per file (same ImageKit path as the platform logo); at least one
// image and one center are required — same rules as the backend.
const AD_LOCATION_OPTIONS = [
  { value: 'landing_page', label: 'Page d’accueil (vitrine)' },
  { value: 'center_admin', label: 'Tableau de bord des centres' },
  { value: 'both', label: 'Accueil + tableaux de bord' },
  { value: '__custom__', label: 'Emplacement personnalisé…' },
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
  const fieldCls = 'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition';
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
  const [positions, setPositions] = useState<string[]>(ad?.positions || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const location = locationSel === '__custom__' ? customLocation.trim() : locationSel;
  // Une pub de vitrine ne cible aucun centre ; tableau de bord (+ both) en exigent un.
  const centersRequired = locationSel === 'center_admin' || locationSel === 'both';
  const showCenterPicker = locationSel !== 'landing_page';

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadMultipleImagesApi(Array.from(files));
      setImageUrls(current => [...current, ...urls.filter(Boolean)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec du téléversement des images');
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
    if (!title.trim()) { toast.error('Le titre de l’annonce est requis.'); return; }
    if (!location) { toast.error('Choisissez (ou saisissez) un emplacement.'); return; }
    if (imageUrls.length === 0) { toast.error('Ajoutez au moins une image.'); return; }
    if (centersRequired && centerIds.length === 0) { toast.error('Sélectionnez au moins un centre cible.'); return; }
    if (!startTs || !endTs || endTs < startTs) { toast.error('Dates invalides — la fin doit suivre le début.'); return; }
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
      toast.success(isEdit ? 'Annonce mise à jour.' : 'Annonce créée.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement de l’annonce');
    } finally {
      setSaving(false);
    }
  };

  const togglePill = (on: boolean, set: (v: boolean) => void, labelOn: string, labelOff: string) => (
    <button type="button" onClick={() => set(!on)}
      className={`px-3 py-1.5 rounded-xl text-[11px] font-black border-2 transition cursor-pointer ${on ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-400'}`}>
      {on ? labelOn : labelOff}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-[#257C86]" /> {isEdit ? 'Modifier l’annonce' : 'Nouvelle annonce'}
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer">
            <X className="h-4 w-4 text-slate-500" />
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
                <input value={customLocation} onChange={e => setCustomLocation(e.target.value)} placeholder="ex : factures, cantine…"
                  className={`${fieldCls} mt-2`} />
              )}
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Priorité (petit = affiché en premier)</label>
              <input type="number" min={1} max={9999} value={priority} onChange={e => setPriority(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Début *</label>
              <input type="date" dir="ltr" value={dateStart} onChange={e => setDateStart(e.target.value)} className={`${fieldCls} text-left`} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Fin *</label>
              <input type="date" dir="ltr" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className={`${fieldCls} text-left`} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ad-link" className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Lien cliquable (optionnel)</label>
              <input id="ad-link" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" className={fieldCls} dir="ltr" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {togglePill(isActive, setIsActive, 'Active', 'Inactive')}
            {togglePill(isPublished, setIsPublished, 'Publiée', 'Brouillon')}
            <span className="text-[10px] font-semibold text-slate-400">Une annonce inactive ou brouillon n’apparaît dans aucun carrousel.</span>
          </div>

          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Images * (carrousel, dans l’ordre)</p>
            {imageUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                {imageUrls.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative group aspect-video rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50">
                    <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute top-1 left-1 text-[9px] font-black bg-white/90 text-slate-600 rounded px-1.5 py-0.5">#{i + 1}</span>
                    <button type="button" onClick={() => setImageUrls(cur => cur.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-white/90 text-red-500 hover:bg-red-50 transition cursor-pointer" title="Retirer cette image">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-100 transition">
                <ImagePlus className="h-4 w-4 text-[#257C86]" /> Choisir des images
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              </label>
              {uploading && <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#257C86]" /> Téléversement…</span>}
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <input id="ad-image-url" value={extraImageUrl} onChange={e => setExtraImageUrl(e.target.value)} placeholder="…ou coller une URL d’image"
                  className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:border-[#257C86] outline-none" dir="ltr" />
                <button type="button" disabled={!extraImageUrl.trim()}
                  onClick={() => { setImageUrls(cur => [...cur, extraImageUrl.trim()]); setExtraImageUrl(''); }}
                  className="px-3 py-2 text-xs font-black text-[#257C86] bg-[#257C86]/10 border border-[#257C86]/20 rounded-xl hover:bg-[#257C86]/20 transition cursor-pointer disabled:opacity-40">
                  Ajouter
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
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border-2 transition cursor-pointer ${on ? 'border-[#257C86] bg-[#257C86]/10 text-[#257C86]' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    {on ? '✓ ' : ''}{spec.label} <span className="font-black">· {spec.size}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] font-semibold text-slate-400 mt-1.5">Chaque position cochée affiche la pub dans son format responsive&nbsp;: le <span className="font-black text-slate-500">Rectangle</span> (jusqu’à <span className="font-black text-slate-500">480×400</span>, bien plus grand que l’ancien 300×250) dans le flux des pages, et l’<span className="font-black text-slate-500">Interstitiel</span> en overlay plein écran fermable — sur mobile comme sur desktop, sur la vitrine comme sur les tableaux de bord. Sans position, c’est le carrousel standard de l’emplacement.</p>
          </div>

          {showCenterPicker && <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Centres ciblés{centersRequired ? ' *' : ' (optionnel)'} ({centerIds.length})
            </p>
            {centers.length === 0 ? (
              <p className="text-[11px] font-semibold text-slate-400">Aucun centre sur la plateforme.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-2xl border-2 border-slate-200 divide-y divide-slate-100">
                {centers.map(c => (
                  <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={centerIds.includes(c.id)} onChange={() => toggleCenter(c.id)} className="accent-[#257C86]" />
                    <span className="truncate">{titleCaseName((c as any).name) || c.name}</span>
                    <span className="ml-auto text-[9px] font-black text-slate-400">{c.status}</span>
                  </label>
                ))}
              </div>
            )}
          </div>}
          {!showCenterPicker && (
            <p className="text-[10px] font-semibold text-slate-400">Une publicité de vitrine ne cible aucun centre — elle s’affiche sur la page d’accueil.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer">Annuler</button>
            <button type="submit" disabled={saving || uploading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-gradient-to-r from-[#257C86] to-[#1e626b] rounded-xl shadow-md shadow-[#257C86]/25 hover:shadow-lg transition cursor-pointer disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {isEdit ? 'Enregistrer les modifications' : 'Créer l’annonce'}
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
  // Filters — requests. No 'Tous' and no 'Contacté' tab: the list always
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
      toast.error(err instanceof Error ? err.message : 'Erreur de chargement des publicités');
    } finally {
      setAdsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (page === 'advertisements') {
      loadAdvertisements();
    }
  }, [page, loadAdvertisements]);

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
      toast.error(err instanceof Error ? err.message : 'Erreur chargement données');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Reset filters when switching page
  useEffect(() => {
    setSearch('');
    setCenterTypeFilter('all'); setStatusFilter('all'); setPlanFilter('all');
    setReqTypeFilter('all'); setReqStatusFilter('new');
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
      toast.error(err instanceof Error ? err.message : 'Erreur chargement finances');
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
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
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

  // Print a single invoice in a dedicated, print-ready window.
  const handlePrintInvoice = useCallback((inv: CenterInvoice) => {
    const frDate = (ts?: number | null) => (ts ? new Date(ts).toLocaleDateString('fr-FR') : '—');
    const statusText = inv.status === 'paid' ? 'PAYÉE'
      : inv.status === 'overdue' ? 'EN RETARD'
      : inv.status === 'cancelled' ? 'ANNULÉE' : 'EN ATTENTE';
    const payLine = inv.paymentMethod === 'cheque'
      ? `Chèque${inv.chequeNumber ? ` N° ${inv.chequeNumber}` : ''}${inv.chequeDate ? ` daté du ${frDate(inv.chequeDate)}` : ''}${inv.status !== 'paid' ? ' — en attente d’encaissement' : ''}`
      : inv.paymentMethod === 'cash' ? 'Espèces'
      : '—';
    const w = window.open('', '_blank', 'width=820,height=920');
    if (!w) { toast.error('Autorisez les fenêtres pop-up pour imprimer la facture.'); return; }
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" />
<title>Facture ${inv.invoiceNumber}</title>
<style>
  /* Margin 0 supprime l'en-tête/pied de page du navigateur (date, titre, URL « blank », n° de page). */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: auto; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 40px 24px; background: #fff; }
  .sheet { max-width: 720px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 14px; padding: 36px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #257C86; padding-bottom: 18px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.02em; }
  .muted { color: #64748b; font-size: 12px; }
  .badge { display: inline-block; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; border: 1px solid ${inv.status === 'paid' ? '#059669' : '#d97706'}; color: ${inv.status === 'paid' ? '#059669' : '#d97706'}; }
  .row { display: flex; justify-content: space-between; font-size: 13px; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; }
  .row b { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 22px 0; font-size: 13px; }
  th { text-align: left; background: #f1f5f9; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
  td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
  .total { text-align: right; font-size: 16px; font-weight: 800; margin-top: 10px; }
  .notes { margin-top: 16px; font-size: 12px; color: #475569; background: #f8fafc; border-radius: 8px; padding: 10px 12px; }
  .sign { display: flex; justify-content: flex-end; margin-top: 46px; }
  .signbox { text-align: center; }
  .signspace { height: 46px; }
  .signline { width: 230px; border-bottom: 1px solid #334155; }
  .signcap { font-size: 11px; font-weight: 700; color: #334155; margin-top: 6px; }
  footer { margin-top: 14px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print {
    body { padding: 0; }
    /* Le contenu porte lui-même ses marges → pas de 2e page vide. */
    .sheet { max-width: none; border: none; border-radius: 0; padding: 18mm 16mm; margin: 0; }
    .noprint { display: none !important; }
  }
</style></head><body>
<div class="sheet">
  <div class="head">
    <div><h1>Facture d'abonnement</h1><div class="muted">Plateforme SaaS — gestion de centres</div></div>
    <div style="text-align:right"><div style="font-weight:800;font-size:14px">${inv.invoiceNumber || '—'}</div>
      <div class="muted">Émise le ${frDate(inv.createdAt)}</div>
      <div style="margin-top:8px"><span class="badge">${statusText}</span></div></div>
  </div>
  <div class="row"><span>Centre</span><b>${inv.centerName || '—'}</b></div>
  <div class="row"><span>Période facturée</span><b>${frDate(inv.periodStart)} → ${frDate(inv.periodEnd)}</b></div>
  <div class="row"><span>Mode de paiement</span><b>${payLine}</b></div>
  ${inv.paymentDate ? `<div class="row"><span>Payée le</span><b>${frDate(inv.paymentDate)}</b></div>` : ''}
  <table><thead><tr><th>Désignation</th><th style="text-align:right">Montant</th></tr></thead>
  <tbody><tr><td>Abonnement plateforme SaaS — ${frDate(inv.periodStart)} → ${frDate(inv.periodEnd)}</td>
  <td style="text-align:right;font-weight:700">${inv.amount.toFixed(2)} TND</td></tr></tbody></table>
  <div class="total">Total : ${inv.amount.toFixed(2)} TND</div>
  ${inv.notes ? `<div class="notes"><b>Notes :</b> ${inv.notes}</div>` : ''}
  <div class="sign"><div class="signbox">
    <div class="signspace"></div>
    <div class="signline"></div>
    <div class="signcap">Signature de la plateforme SaaS</div>
  </div></div>
  <footer>Document généré depuis l'espace administrateur SaaS.</footer>
  <div class="noprint" style="text-align:center;margin-top:18px">
    <button onclick="window.print()" style="background:#257C86;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-weight:700;cursor:pointer">🖨 Imprimer</button>
  </div>
</div>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body></html>`);
    w.document.close();
    w.focus();
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
      toast.error(err instanceof Error ? err.message : 'Erreur chargement tarifs');
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
      toast.success(`Année ${nextSchoolYear} ajoutée — tarifs copiés depuis ${prevYear}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur ajout année scolaire');
    } finally {
      setAddingYear(false);
    }
  };

  const savePrices = async () => {
    setSavingPrices(true);
    try {
      await updateModulePricesApi(priceYear, ALL_MODULES.map(m => ({ module_key: m.key, price: Number(priceList[m.key] || 0) })));
      toast.success('Tarifs sauvegardés');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur sauvegarde tarifs');
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
        label: d.toLocaleDateString('fr-TN', { month: 'short' }).replace('.', ''),
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

  const maxRevenue = Math.max(...revenueChart.map(m => m.total), 1);

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
      toast.success(newStatus === 'active' ? 'Centre activé' : 'Centre suspendu');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
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
          `Plan ${planLabelValue} appliqué. Nouvelle période démarrée — facture ${outcome.invoice.invoiceNumber} créée (${formatTnd(outcome.invoice.amount)}), en attente de paiement.`
        );
      } else {
        toast.success(`Plan ${planLabelValue} appliqué`);
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleCancelScheduledPlan = async (c: CenterTenant) => {
    if (!c.scheduledPlan) return;
    try {
      await updateCenterApi(c.id, { cancelScheduledChange: true });
      toast.success('Changement de plan programmé annulé');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleReqStatus = async (req: DemoRequest, status: string) => {
    try {
      await updateDemoRequestApi(req.id, { status });
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: status as DemoRequest['status'] } : r));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleDeleteCenter = async () => {
    if (!deleteCenter) return;
    try {
      await deleteCenterApi(deleteCenter.id);
      toast.success('Centre supprimé');
      setDeleteCenter(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleDeleteRequest = async () => {
    if (!deleteRequest) return;
    try {
      await deleteDemoRequestApi(deleteRequest.id);
      toast.success('Demande supprimée');
      setDeleteRequest(null);
      setRequests(prev => prev.filter(r => r.id !== deleteRequest.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const PAGE_META: Record<PlatformAdminPage, { title: string; sub: string }> = {
    overview: { title: 'Vue d’ensemble', sub: 'Activité de la plateforme en temps réel' },
    centers: { title: 'Centres & Abonnements', sub: `${centers.length} centre${centers.length > 1 ? 's' : ''} · ${activeCenters} actif${activeCenters > 1 ? 's' : ''}` },
    requests: { title: 'Demandes d’essai', sub: `${newRequests} nouvelle${newRequests > 1 ? 's' : ''} demande${newRequests > 1 ? 's' : ''} à traiter` },
    finance: { title: 'Finance SaaS', sub: 'Facturation et revenus de la plateforme' },
    pricing: { title: 'Tarifs & Modules', sub: `Année scolaire ${priceYear}` },
    advertisements: { title: 'Publicité', sub: 'Bannières et carrousels des centres et de la vitrine' },
  };

  const inputCls = 'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-[#257C86] focus:ring-0 outline-none transition';

  return (
    <div className="relative space-y-6" dir="ltr">

      {/* soft wash — same spirit as the landing page */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 h-[280px] w-[760px] rounded-full bg-[#257C86]/[0.06] blur-[110px] pointer-events-none" />

      {/* ─── Header (landing style card) ──────────────────────────── */}
      <div className="relative flex items-center justify-between flex-wrap gap-4 rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-200/70 shadow-lg shadow-slate-900/5 px-5 py-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gradient-to-br from-[#257C86] to-[#1e626b] shadow-lg shadow-[#257C86]/25 flex items-center justify-center flex-shrink-0">
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={page === 'centers' ? 'Rechercher un centre…' : 'Rechercher une demande…'}
                className="w-48 sm:w-56 pl-9 pr-3 py-2.5 text-sm font-semibold bg-white border-2 border-slate-200 rounded-xl focus:border-[#257C86] focus:ring-0 outline-none transition"
              />
            </div>
          )}
          <button onClick={load} className="p-2.5 rounded-xl bg-white border-2 border-slate-200 hover:border-[#257C86]/40 hover:text-[#257C86] text-slate-600 transition cursor-pointer" title="Actualiser">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowNewCenter(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:shadow-lg hover:shadow-[#257C86]/30 text-white text-sm font-black rounded-xl shadow-md shadow-[#257C86]/25 transition cursor-pointer">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nouveau Centre</span>
            <span className="sm:hidden">Centre</span>
          </button>
        </div>
      </div>

      {/* ═══ OVERVIEW PAGE ═══ */}
      {page === 'overview' && (
        <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative space-y-6">

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {[
              { label: 'MRR — Mensuel', value: billingSummary ? `${billingSummary.mrr.toFixed(0)} TND` : '—', icon: TrendingUp, tint: 'bg-emerald-100 text-emerald-600' },
              { label: 'Total Centres', value: centers.length, icon: Building2, tint: 'bg-[#257C86]/10 text-[#257C86]' },
              { label: 'Actifs', value: activeCenters, icon: CheckCircle2, tint: 'bg-emerald-100 text-emerald-600' },
              { label: 'En Essai', value: trialCenters, icon: Clock, tint: 'bg-amber-100 text-amber-600' },
              { label: 'Nouvelles demandes', value: newRequests, icon: FileText, tint: 'bg-blue-100 text-blue-600' },
              { label: 'À encaisser', value: billingSummary ? `${billingSummary.pendingInvoices.toFixed(0)} TND` : '—', icon: Receipt, tint: 'bg-rose-100 text-rose-600' }
            ].map(kpi => (
              <div key={kpi.label} className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/5 hover:-translate-y-0.5 transition-all">
                <div className={`inline-flex p-2.5 rounded-xl mb-3 ${kpi.tint}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
                <p className="text-xl font-black text-slate-900 leading-none tracking-tight">{kpi.value}</p>
                <p className="text-[11px] font-bold text-slate-500 mt-1.5 uppercase tracking-wider">{kpi.label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-5">

            {/* Revenue chart */}
            <div className="lg:col-span-3 rounded-3xl border border-slate-200/70 bg-white p-6 shadow-lg shadow-slate-900/5">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="p-2.5 bg-[#257C86]/10 rounded-xl"><BarChart3 className="h-4 w-4 text-[#257C86]" /></span>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Revenus encaissés</h3>
                    <p className="text-[11px] font-bold text-slate-400">6 derniers mois</p>
                  </div>
                </div>
                {billingSummary && (
                  <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                    {billingSummary.collectedThisYear.toFixed(0)} TND / an
                  </span>
                )}
              </div>

              {financeLoading ? (
                <div className="flex items-center justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-[#257C86]" /></div>
              ) : (
                <div className="flex items-end justify-between gap-3 h-44">
                  {revenueChart.map((m, i) => (
                    <div key={m.key} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <span className="text-[10px] font-black text-slate-500">{m.total > 0 ? m.total.toFixed(0) : ''}</span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(4, (m.total / maxRevenue) * 100)}%` }}
                        transition={{ duration: 0.7, delay: i * 0.08, ease: 'easeOut' }}
                        className={`w-full rounded-xl ${i === revenueChart.length - 1 ? 'bg-gradient-to-t from-[#257C86] to-[#3aa5b0] shadow-lg shadow-[#257C86]/25' : 'bg-[#257C86]/15'}`}
                      />
                      <span className="text-[10px] font-bold text-slate-400 capitalize">{m.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent requests */}
            <div className="lg:col-span-2 rounded-3xl border border-slate-200/70 bg-white p-6 shadow-lg shadow-slate-900/5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <span className="p-2.5 bg-blue-100 rounded-xl"><FileText className="h-4 w-4 text-blue-600" /></span>
                  <h3 className="text-sm font-black text-slate-900">Dernières demandes</h3>
                </div>
                <button onClick={() => onNavigate?.('requests')} className="text-[11px] font-black text-[#257C86] hover:text-[#1e626b] transition inline-flex items-center gap-1 cursor-pointer">
                  Tout voir <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#257C86]" /></div>
              ) : requests.length === 0 ? (
                <p className="text-center py-12 text-sm font-bold text-slate-400">Aucune demande</p>
              ) : (
                <div className="space-y-3">
                  {requests.slice(0, 4).map(r => (
                    <div key={r.id} className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 flex-shrink-0">
                        {titleCaseName(r.fullName).split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-slate-900 truncate">{titleCaseName(r.academyName)}</div>
                        <div className="text-[10px] font-semibold text-slate-400 truncate">
                          {titleCaseName(r.fullName)} · {normalizeCenterType(r.centerType) ? CENTER_TYPE_LABEL[normalizeCenterType(r.centerType)] : fmtDate(r.createdAt)}
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${REQ_STATUS_BADGE[r.status] || REQ_STATUS_BADGE.new}`}>
                        {REQ_STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Trials to watch */}
          <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-lg shadow-slate-900/5">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="p-2.5 bg-amber-100 rounded-xl"><CalendarClock className="h-4 w-4 text-amber-600" /></span>
              <h3 className="text-sm font-black text-slate-900">Essais à surveiller</h3>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#257C86]" /></div>
            ) : centers.filter(c => c.status === 'trial').length === 0 ? (
              <p className="text-center py-10 text-sm font-bold text-slate-400">Aucun centre en essai</p>
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
                        className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 hover:border-[#257C86]/50 hover:bg-[#257C86]/[0.04] p-3.5 text-left transition cursor-pointer">
                        {c.logoUrl ? (
                          <div className="h-11 w-11 rounded-2xl border border-slate-200 bg-white p-0.5 overflow-hidden flex-shrink-0">
                            <img src={c.logoUrl} alt={c.name} className="w-full h-full rounded-xl object-cover" />
                          </div>
                        ) : (
                          <div className="h-11 w-11 rounded-2xl bg-[#257C86]/10 flex items-center justify-center text-[10px] font-black text-[#257C86] flex-shrink-0">
                            {c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-slate-900 truncate">{c.name}</div>
                          <div className="text-[10px] font-semibold text-slate-400">{c.adminEmail || '—'}</div>
                        </div>
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full flex-shrink-0 ${
                          days === null ? 'bg-slate-50 text-slate-400 border border-slate-100'
                            : days <= 3 ? 'bg-[#257C86]/15 text-[#257C86] border border-[#257C86]/25'
                            : days <= 7 ? 'bg-[#257C86]/10 text-[#257C86] border border-[#257C86]/20'
                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                          {days === null ? '—' : days > 0 ? `${days} j` : 'Expiré'}
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
        <motion.div key="centers" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative space-y-4">

          {/* Filters — type / statut / plan */}
          <div ref={listTopRef} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-200/70 shadow-sm px-5 py-4 scroll-mt-24">
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.12em] mb-1.5">Type</div>
              <Segmented<'all' | 'jardin' | 'formation'>
                value={centerTypeFilter}
                onChange={setCenterTypeFilter}
                options={[
                  { key: 'all', label: 'Tous' },
                  { key: 'jardin', label: 'Jardin d’enfant' },
                  { key: 'formation', label: 'Centre de formation' }
                ]}
              />
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.12em] mb-1.5">Statut</div>
              <Segmented<'all' | 'trial' | 'active' | 'suspended' | 'expired'>
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { key: 'all', label: 'Tous' },
                  { key: 'trial', label: 'Essai' },
                  { key: 'active', label: 'Actif' },
                  { key: 'suspended', label: 'Suspendu' },
                  { key: 'expired', label: 'Expiré' }
                ]}
              />
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.12em] mb-1.5">Plan</div>
              <Segmented<'all' | 'basic' | 'growth' | 'pro' | 'custom'>
                value={planFilter}
                onChange={setPlanFilter}
                options={[
                  { key: 'all', label: 'Tous' },
                  { key: 'basic', label: 'Basic' },
                  { key: 'growth', label: 'Growth' },
                  { key: 'pro', label: 'Pro' },
                  { key: 'custom', label: 'Custom' }
                ]}
              />
            </div>
            <span className="ml-auto text-xs font-bold text-slate-400">
              {filteredCenters.length} résultat{filteredCenters.length > 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 rounded-3xl bg-white border border-slate-200/70">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : filteredCenters.length === 0 ? (
            <div className="text-center py-20 rounded-3xl bg-white border border-slate-200/70 text-slate-400">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">{q ? 'Aucun résultat pour cette recherche' : 'Aucun centre'}</p>
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
              <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white rounded-3xl border border-slate-200/70 p-5 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/5 hover:border-[#257C86]/30 transition flex flex-col">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    {c.logoUrl ? (
                      <div className="h-9 w-9 rounded-xl border border-slate-200 bg-white p-0.5 overflow-hidden flex-shrink-0">
                        <img src={c.logoUrl} alt={c.name} className="w-full h-full rounded-lg object-cover" />
                      </div>
                    ) : (
                      <div className="h-9 w-9 rounded-xl bg-[#257C86]/10 flex items-center justify-center text-sm font-black text-[#257C86] flex-shrink-0">
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
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${normalizeCenterType(c.centerType) === 'jardin' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-[#257C86]/10 text-[#257C86] border border-[#257C86]/20'}`}>
                        {CENTER_TYPE_LABEL[normalizeCenterType(c.centerType)]}
                      </span>
                    )}
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_BADGE[c.status] || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${PLAN_BADGE[c.plan] || PLAN_BADGE.starter}`}>{PLAN_LABEL[c.plan] || c.plan}</span>
                  </div>
                </div>

                {/* Trial and subscription lifecycle dates */}
                {c.status === 'trial' && c.trialEndsAt && (
                  <div className={`mt-3.5 flex items-center gap-2 text-xs font-bold rounded-xl px-3.5 py-2.5 border ${
                    (days ?? 0) <= 3
                      ? 'bg-[#257C86]/15 text-[#257C86] border-[#257C86]/25'
                      : (days ?? 0) <= 7
                        ? 'bg-[#257C86]/10 text-[#257C86] border-[#257C86]/20'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    {days !== null && days > 0
                      ? `Période d’essai : encore ${days} jour${days > 1 ? 's' : ''} · fin le ${fmtDate(c.trialEndsAt)}`
                      : `Période d’essai terminée le ${fmtDate(c.trialEndsAt)}`}
                  </div>
                )}
                {c.status !== 'trial' && (c.subscriptionEndsAt || c.trialEndsAt) && (
                  <div className="mt-3.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] font-bold text-slate-600 space-y-1">
                    {c.trialEndsAt && <div>Fin de la période d’essai : {fmtDate(c.trialEndsAt)}</div>}
                    {c.subscriptionEndsAt && (
                      <div className={subscriptionDays !== null && subscriptionDays <= 7 ? 'text-amber-700' : 'text-slate-600'}>
                        Abonnement : début {subscriptionStart ? fmtDate(subscriptionStart) : '—'} · fin {fmtDate(c.subscriptionEndsAt)}
                        {subscriptionDays !== null && subscriptionDays > 0 ? ` · ${subscriptionDays} jours restants` : ' · expiré'}
                      </div>
                    )}
                  </div>
                )}

                {/* Scheduled plan change */}
                {c.scheduledPlan && (
                  <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-[11px] font-black text-amber-800 inline-flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      → {PLAN_LABEL[c.scheduledPlan.plan === 'starter' ? 'basic' : c.scheduledPlan.plan]}
                      <span className="font-semibold text-amber-700">
                        planifié{c.scheduledPlan.applyAt ? ` pour le ${fmtDate(c.scheduledPlan.applyAt)}` : ' (prochaine reconduction)'}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 ml-auto">
                      <button
                        onClick={() => handleApplyScheduledPlan(c)}
                        disabled={!!c.scheduledPlan.applyAt && c.scheduledPlan.applyAt > Date.now() && c.status === 'active'}
                        title="Appliquer maintenant (disponible dès la fin de la période en cours)"
                        className="text-[10px] font-black px-2.5 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Appliquer
                      </button>
                      <button
                        onClick={() => handleCancelScheduledPlan(c)}
                        title="Annuler le changement planifié"
                        className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                )}

                {/* Modules */}
                {mods.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {mods.filter(mk => isBaseModule(mk)).map(mk => (
                      <span key={mk} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#257C86] text-white inline-flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" /> {MODULE_LABEL(mk)}
                      </span>
                    ))}
                    {mods.filter(mk => !isBaseModule(mk)).map(mk => (
                      <span key={mk} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#257C86]/10 text-[#257C86]">
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
                    title="Informations de base du centre">
                    <Edit className="h-3.5 w-3.5" /> Modifier
                  </button>
                  <button onClick={() => handleToggleStatus(c)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
                      c.status === 'suspended'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    }`}>
                    {c.status === 'suspended' ? <><CheckCircle2 className="h-3.5 w-3.5" /> Activer</> : <><PauseCircle className="h-3.5 w-3.5" /> Suspendre</>}
                  </button>
                  <button onClick={() => setPlanCenter(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-[#257C86]/10 text-[#257C86] border border-[#257C86]/20 rounded-xl hover:bg-[#257C86]/20 transition cursor-pointer flex items-center gap-1.5"
                    title="Gérer le plan, les modules, les factures et les changements programmés">
                    <Layers className="h-3.5 w-3.5" /> Plans &amp; factures
                  </button>
                  <button onClick={() => setDeleteCenter(c)}
                    className="ml-auto text-[11px] font-bold px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer flex items-center gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
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
        <motion.div key="requests" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative space-y-4">

          {/* Filters — type / statut */}
          <div ref={listTopRef} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-200/70 shadow-sm px-5 py-4 scroll-mt-24">
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.12em] mb-1.5">Type d’établissement</div>
              <Segmented<'all' | 'jardin' | 'formation'>
                value={reqTypeFilter}
                onChange={setReqTypeFilter}
                options={[
                  { key: 'all', label: 'Tous' },
                  { key: 'jardin', label: 'Jardin d’enfant' },
                  { key: 'formation', label: 'Centre de formation' }
                ]}
              />
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.12em] mb-1.5">Statut</div>
              <Segmented<'new' | 'converted' | 'archived'>
                value={reqStatusFilter}
                onChange={setReqStatusFilter}
                options={[
                  { key: 'new', label: 'Nouveau' },
                  { key: 'converted', label: 'Converti' },
                  { key: 'archived', label: 'Archivé' }
                ]}
              />
            </div>
            <span className="ml-auto text-xs font-bold text-slate-400">
              {filteredRequests.length} résultat{filteredRequests.length > 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 rounded-3xl bg-white border border-slate-200/70">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-20 rounded-3xl bg-white border border-slate-200/70 text-slate-400">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">{q ? 'Aucun résultat pour cette recherche' : 'Aucune demande reçue'}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
              {pagedRequests.map(req => {
            const mods = parseModules(req.requestedModules);
            return (
              <motion.div key={req.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white rounded-3xl border border-slate-200/70 p-5 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/5 hover:border-[#257C86]/30 transition flex flex-col">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    <div className="h-11 w-11 rounded-2xl bg-blue-50 flex items-center justify-center text-sm font-black text-blue-600 flex-shrink-0">
                      {titleCaseName(req.fullName).split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm">{titleCaseName(req.fullName)}</p>
                      <p className="text-xs font-black text-[#257C86]">{titleCaseName(req.academyName)}</p>
                      <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{fmtDate(req.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {normalizeCenterType(req.centerType) && (
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${normalizeCenterType(req.centerType) === 'jardin' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-[#257C86]/10 text-[#257C86] border border-[#257C86]/20'}`}>
                        {CENTER_TYPE_LABEL[normalizeCenterType(req.centerType)]}
                      </span>
                    )}
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${REQ_STATUS_BADGE[req.status] || REQ_STATUS_BADGE.new}`}>
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
                      className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
                      <Mail className="h-3.5 w-3.5" /> {req.email}
                    </a>
                  )}
                  {req.phone && (
                    <a href={`tel:${req.phone}`}
                      className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:underline">
                      <Phone className="h-3.5 w-3.5" /> {req.phone}
                    </a>
                  )}
                </div>

                {req.message && (
                  <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-xl px-3.5 py-2.5 leading-relaxed">{req.message}</p>
                )}

                {/* Requested modules — envoyées avec la demande */}
                {mods.length > 0 && (
                  <div className="mt-3.5">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.12em] mb-2 flex items-center gap-1.5">
                      <GraduationCap className="h-3 w-3" />
                      Modules demandés ({mods.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {mods.map(mk => isBaseModule(mk) ? (
                        <span key={mk} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#257C86] text-white inline-flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5" /> {MODULE_LABEL(mk)}
                        </span>
                      ) : (
                        <span key={mk} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#257C86]/10 text-[#257C86]">
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
                      title="Demande convertie : seule l’archivation est possible."
                      className="text-[11px] font-bold px-3 py-1.5 border-2 border-slate-200 rounded-xl bg-white text-slate-600 focus:border-[#257C86] focus:ring-0 outline-none cursor-pointer">
                      <option value="converted">Converti</option>
                      <option value="archived">Archivé</option>
                    </select>
                  ) : (
                    <select
                      value={req.status === 'contacted' ? 'new' : req.status}
                      onChange={e => handleReqStatus(req, e.target.value)}
                      className="text-[11px] font-bold px-3 py-1.5 border-2 border-slate-200 rounded-xl bg-white focus:border-[#257C86] focus:ring-0 outline-none cursor-pointer">
                      <option value="new">Nouveau</option>
                      <option value="archived">Archivé</option>
                    </select>
                  )}

                  {req.status !== 'converted' ? (
                    <button
                      onClick={() => { setConvertRequest(req); setShowNewCenter(true); }}
                      className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white rounded-xl shadow-md shadow-[#257C86]/25 hover:shadow-lg hover:shadow-[#257C86]/30 transition cursor-pointer">
                      <Building2 className="h-3.5 w-3.5" /> Convertir en Centre
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl"
                      title="Cette demande a déjà été convertie en centre — la conversion n'est possible qu'une seule fois."
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Déjà converti
                    </span>
                  )}

                  <button onClick={() => setDeleteRequest(req)}
                    className="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
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
        <motion.div key="finance" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative space-y-6">
          {financeLoading ? (
            <div className="flex items-center justify-center py-20 rounded-3xl bg-white border border-slate-200/70">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : (
            <>
              {/* KPI cards */}
              {billingSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'MRR (factures payées)', value: `${billingSummary.mrr.toFixed(2)} TND`, icon: TrendingUp, tint: 'bg-emerald-100 text-emerald-600' },
                    { label: 'Encaissé ce mois', value: `${billingSummary.collectedThisMonth.toFixed(2)} TND`, icon: DollarSign, tint: 'bg-blue-100 text-blue-600' },
                    { label: 'Encaissé cette année', value: `${billingSummary.collectedThisYear.toFixed(2)} TND`, icon: BarChart3, tint: 'bg-violet-100 text-violet-600' },
                    { label: 'Factures en attente', value: `${billingSummary.pendingInvoices.toFixed(2)} TND`, icon: AlertCircle, tint: 'bg-amber-100 text-amber-600' }
                  ].map(kpi => (
                    <div key={kpi.label} className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-lg shadow-slate-900/5">
                      <div className={`inline-flex p-2.5 rounded-xl mb-3 ${kpi.tint}`}>
                        <kpi.icon className="h-5 w-5" />
                      </div>
                      <p className="text-xl font-black text-slate-900 tracking-tight">{kpi.value}</p>
                      <p className="text-[11px] font-bold text-slate-500 mt-1 uppercase tracking-wider">{kpi.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Chèques en attente — le revenu n'est compté qu'après encaissement */}
              {pendingCheques.length > 0 && (
                <div className="bg-white rounded-3xl border border-indigo-200/70 p-6 shadow-lg shadow-slate-900/5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2.5">
                      <span className="p-2 bg-indigo-100 rounded-xl"><Receipt className="h-4 w-4 text-indigo-600" /></span>
                      Chèques en attente
                      <span className="text-[11px] font-bold text-slate-400 font-sans">{pendingCheques.length}</span>
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400">
                      Les chèques en attente ne sont <span className="text-indigo-600">pas comptés dans les revenus</span> — encaissez-les pour les comptabiliser.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="pb-3 px-3">Centre</th>
                          <th className="pb-3 px-3">N° Facture</th>
                          <th className="pb-3 px-3">Montant</th>
                          <th className="pb-3 px-3">N° Chèque</th>
                          <th className="pb-3 px-3">Date du chèque</th>
                          <th className="pb-3 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingCheques.map(inv => (
                          <tr key={inv.id} className="hover:bg-indigo-50/40">
                            <td className="py-3 px-3 font-black text-slate-900">{inv.centerName}</td>
                            <td className="py-3 px-3 font-mono text-xs text-slate-500">{inv.invoiceNumber}</td>
                            <td className="py-3 px-3 font-black text-slate-900">{inv.amount.toFixed(2)} TND</td>
                            <td className="py-3 px-3 text-slate-600 text-xs font-bold">{inv.chequeNumber || '—'}</td>
                            <td className="py-3 px-3 text-slate-600 text-xs">{inv.chequeDate ? new Date(inv.chequeDate).toLocaleDateString('fr-TN') : '—'}</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={async () => {
                                    try {
                                      await updateInvoiceApi(inv.id, { status: 'paid' });
                                      toast.success(`Chèque encaissé — facture ${inv.invoiceNumber} payée`);
                                      loadFinanceData();
                                    } catch (err) {
                                      toast.error(err instanceof Error ? err.message : 'Erreur');
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition cursor-pointer"
                                  title="Le chèque est encaissé : la facture devient payée et compte dans les revenus"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Encaisser
                                </button>
                                <button onClick={() => handlePrintInvoice(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="Imprimer la facture">
                                  <Printer className="h-3.5 w-3.5 text-slate-500" />
                                </button>
                                <button onClick={() => setEditInvoice(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="Modifier">
                                  <Edit className="h-3.5 w-3.5 text-slate-500" />
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
              <div className="bg-white rounded-3xl border border-slate-200/70 p-6 shadow-lg shadow-slate-900/5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2.5">
                    <span className="p-2 bg-[#257C86]/10 rounded-xl"><Receipt className="h-4 w-4 text-[#257C86]" /></span>
                    Factures
                    <span className="text-[11px] font-bold text-slate-400 font-sans">{invoiceGroups.length} centre{invoiceGroups.length > 1 ? 's' : ''} · {filteredInvoices.length} facture{filteredInvoices.length > 1 ? 's' : ''}</span>
                  </h3>

                  {/* Filters — centre + statut */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={invoiceSearch}
                        onChange={e => setInvoiceSearch(e.target.value)}
                        placeholder="Filtrer par nom du centre…"
                        className="pl-9 pr-3 py-2 text-xs font-semibold bg-white border-2 border-slate-200 rounded-xl focus:border-[#257C86] focus:ring-0 outline-none transition w-48 sm:w-56"
                      />
                    </div>
                    <select
                      value={invoiceStatusFilter}
                      onChange={e => setInvoiceStatusFilter(e.target.value as 'all' | CenterInvoice['status'])}
                      className="px-3 py-2 text-xs font-bold border-2 border-slate-200 rounded-xl bg-white focus:border-[#257C86] focus:ring-0 outline-none cursor-pointer"
                    >
                      <option value="all">Tous les statuts</option>
                      <option value="pending">En attente</option>
                      <option value="paid">Payée</option>
                      <option value="overdue">En retard</option>
                      <option value="cancelled">Annulée</option>
                    </select>
                    <select
                      value={invoiceMonthFilter}
                      onChange={e => setInvoiceMonthFilter(e.target.value)}
                      className="px-3 py-2 text-xs font-bold border-2 border-slate-200 rounded-xl bg-white focus:border-[#257C86] focus:ring-0 outline-none cursor-pointer capitalize"
                      title="Filtrer par mois de période facturée"
                    >
                      <option value="all">Tous les mois</option>
                      {invoiceMonths.map(key => (
                        <option key={key} value={key}>{monthLabel(key)}</option>
                      ))}
                    </select>
                    {(invoiceSearch || invoiceStatusFilter !== 'all' || invoiceMonthFilter !== 'all') && (
                      <button
                        onClick={() => { setInvoiceSearch(''); setInvoiceStatusFilter('all'); setInvoiceMonthFilter('all'); }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" /> Réinitialiser
                      </button>
                    )}
                  </div>
                </div>

                {invoices.length === 0 ? (
                  <p className="text-center py-12 text-slate-400 text-sm font-bold">Aucune facture</p>
                ) : filteredInvoices.length === 0 ? (
                  <p className="text-center py-12 text-slate-400 text-sm font-bold">Aucune facture ne correspond aux filtres</p>
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
                            className="w-full flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition text-left cursor-pointer border-b border-slate-200/70">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform flex-shrink-0 ${collapsedGroupIds[group.centerId] ? '-rotate-90' : ''}`} />
                              <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#257C86] to-[#1e626b] text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">
                                {group.centerName.split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-900 truncate">{group.centerName}</p>
                                <p className="text-[10px] font-semibold text-slate-400">
                                  {group.invoices.length} facture{group.invoices.length > 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {outstandingTotal > 0 && (
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  Reste à encaisser : {outstandingTotal.toFixed(2)} TND
                                </span>
                              )}
                              {paidTotal > 0 && (
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Payé : {paidTotal.toFixed(2)} TND
                                </span>
                              )}
                            </div>
                          </button>
                          <div className={`overflow-x-auto${collapsedGroupIds[group.centerId] ? ' hidden' : ''}`}>
                            <table className="w-full text-sm text-left">
                              <thead className="text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200 bg-white">
                                <tr>
                                  <th className="py-2.5 px-3">N° Facture</th>
                                  <th className="py-2.5 px-3">Période</th>
                                  <th className="py-2.5 px-3">Montant</th>
                                  <th className="py-2.5 px-3">Paiement</th>
                                  <th className="py-2.5 px-3">Statut</th>
                                  <th className="py-2.5 px-3">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.invoices.map(inv => {
                                  const meta = invoiceStatusMeta(inv);
                                  return (
                                    <tr key={inv.id} className="hover:bg-slate-50/70">
                                      <td className="py-3 px-3 font-mono text-xs text-slate-500">{inv.invoiceNumber}</td>
                                      <td className="py-3 px-3 text-slate-600 text-xs">
                                        {new Date(inv.periodStart).toLocaleDateString('fr-TN')} – {new Date(inv.periodEnd).toLocaleDateString('fr-TN')}
                                      </td>
                                      <td className="py-3 px-3 font-black text-slate-900">{inv.amount.toFixed(2)} TND</td>
                                      <td className="py-3 px-3 text-slate-600 text-xs font-semibold">{paymentMethodLabel(inv.paymentMethod)}</td>
                                      <td className="py-3 px-3">
                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
                                      </td>
                                      <td className="py-3 px-3">
                                        <div className="flex items-center gap-1">
                                          <button onClick={() => handlePrintInvoice(inv)}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="Imprimer la facture">
                                            <Printer className="h-3.5 w-3.5 text-slate-500" />
                                          </button>
                                          <button onClick={() => setEditInvoice(inv)}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="Modifier">
                                            <Edit className="h-3.5 w-3.5 text-slate-500" />
                                          </button>
                                          <button onClick={async () => {
                                            try {
                                              await deleteInvoiceApi(inv.id);
                                              toast.success('Facture supprimée');
                                              loadFinanceData();
                                            } catch (err) {
                                              toast.error(err instanceof Error ? err.message : 'Erreur');
                                            }
                                          }}
                                            className="p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer" title="Supprimer">
                                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
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
        <motion.div key="pricing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative space-y-5">

          {/* Year selector — sélecteur compact : quelle que soit la taille
              de la liste des années, rien ne déborde et tout reste visible. */}
          <div className="rounded-3xl border border-slate-200/70 bg-white p-3 sm:p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex-shrink-0">
                  Année scolaire
                </span>
                <select
                  value={priceYear}
                  onChange={e => setPriceYear(e.target.value)}
                  className="px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:border-[#257C86] focus:ring-0 outline-none cursor-pointer min-w-[140px]"
                >
                  {priceYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <button onClick={addSchoolYear} disabled={addingYear}
                className="ml-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl border-2 border-dashed border-[#257C86]/50 text-[#257C86] text-xs sm:text-sm font-black whitespace-nowrap hover:bg-[#257C86]/5 transition cursor-pointer disabled:opacity-60"
                title={`Crée ${nextSchoolYear} avec les tarifs copiés depuis ${priceYears[priceYears.length - 1] || ''}`}
              >
                {addingYear ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Ajouter l'année scolaire {nextSchoolYear}
              </button>
            </div>
          </div>

          {pricesLoading ? (
            <div className="flex items-center justify-center py-20 rounded-3xl bg-white border border-slate-200/70">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-5">

              {/* Base plan card */}
              <div className="rounded-3xl bg-gradient-to-br from-[#257C86] to-[#1e626b] text-white p-6 shadow-xl shadow-[#257C86]/25 relative overflow-hidden">
                <div className="absolute -top-16 -right-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Lock className="h-3.5 w-3.5 text-white/80" />
                    <span className="text-[10px] font-black text-white/80 uppercase tracking-[0.15em]">Le plan de base</span>
                  </div>
                  <h3 className="text-lg font-black mb-1">Scolaire + Finance</h3>
                  <p className="text-xs text-white/70 font-semibold mb-5">Toujours inclus dans chaque abonnement — avec Jd. Horaires offert, non retirable.</p>
                  <div className="flex items-end gap-2 mb-6">
                    <span className="text-4xl font-black tracking-tight">
                      {(priceList['scolaire'] || 0) + (priceList['finance'] || 0)}
                    </span>
                    <span className="text-xs font-bold text-white/70 pb-1.5">TND/mois</span>
                  </div>
                  <div className="space-y-2.5 text-xs font-bold">
                    <div className="flex items-center justify-between rounded-xl bg-white/10 px-3.5 py-2.5">
                      <span className="flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5" /> Scolaire</span>
                      <span className="font-black">{priceList['scolaire'] ?? '—'} TND</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-white/10 px-3.5 py-2.5">
                      <span className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Finance</span>
                      <span className="font-black">{priceList['finance'] ?? '—'} TND</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-emerald-400/20 border border-emerald-300/30 px-3.5 py-2.5">
                      <span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Jd. Horaires</span>
                      <span className="font-black text-emerald-200">Inclus — offert</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Module price editor */}
              <div className="lg:col-span-2 rounded-3xl border border-slate-200/70 bg-white p-6 shadow-lg shadow-slate-900/5">
                <h3 className="text-sm font-black text-slate-900 mb-1">Prix des modules additionnels</h3>
                <p className="text-xs text-slate-500 font-semibold mb-5">
                  Ces tarifs servent au calcul automatique du prix d’un centre selon ses modules activés — année {priceYear}.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {ALL_MODULES.map(m => {
                    const base = isBaseModule(m.key);
                    return (
                      <div key={m.key}
                        className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${base ? 'border-[#257C86]/30 bg-[#257C86]/[0.05]' : 'border-slate-200 bg-white hover:border-[#257C86]/30 transition'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            {m.label}
                            {m.key === BUNDLED_MODULE_KEY ? (
                              <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px uppercase">Offert</span>
                            ) : base ? (
                              <span className="text-[8px] font-black text-[#257C86] bg-[#257C86]/10 border border-[#257C86]/25 rounded-full px-1.5 py-px uppercase">Base</span>
                            ) : null}
                          </div>
                          <div className="text-[10px] font-semibold text-slate-400">{m.key}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {m.key === BUNDLED_MODULE_KEY ? (
                            <span className="text-sm font-black text-emerald-600 w-20 text-center">Inclus</span>
                          ) : (
                            <input
                              type="number" step="0.5" min="0"
                              value={priceList[m.key] ?? 0}
                              onChange={e => setPriceList(p => ({ ...p, [m.key]: Number(e.target.value) }))}
                              className="w-20 border-2 border-slate-200 rounded-xl px-2.5 py-1.5 text-sm font-black text-right text-slate-800 focus:border-[#257C86] focus:ring-0 outline-none bg-white transition"
                            />
                          )}
                          <span className="text-[10px] font-bold text-slate-400">{m.key === BUNDLED_MODULE_KEY ? 'offert' : 'TND/mois'}</span>
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
            <p className="text-[11px] font-bold text-slate-400">
              Tarifs appliqués à l'année scolaire {priceYear}.
            </p>
            <button onClick={savePrices} disabled={savingPrices || pricesLoading}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:shadow-lg hover:shadow-[#257C86]/30 text-white text-sm font-black rounded-2xl shadow-md shadow-[#257C86]/25 transition cursor-pointer disabled:opacity-60">
              {savingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Sauvegarder les tarifs
            </button>
          </div>
        </motion.div>
      )}

      {/* ─── Advertisements Page ───────────────────────────────────────── */}
      {page === 'advertisements' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-black text-slate-800">Gestion des publicités</h2>
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
                      className={`px-2.5 py-1 rounded-full text-[11px] font-black border transition cursor-pointer ${on ? 'bg-[#257C86] text-white border-[#257C86]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#257C86]/40'}`}>
                      {f.label} <span className={on ? 'text-white/70' : 'text-slate-400'}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadAdvertisements} disabled={adsLoading} title="Actualiser"
                className="p-2 hover:bg-slate-100 rounded-xl transition cursor-pointer">
                <RefreshCw className={`h-5 w-5 text-slate-600 ${adsLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowNewAd(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white text-sm font-black rounded-xl shadow-md hover:shadow-lg transition cursor-pointer">
                <Plus className="h-4 w-4" />
                Nouvelle publicité
              </button>
            </div>
          </div>

          {adsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#257C86]" />
            </div>
          ) : advertisements.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <ImagePlus className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-bold">{advertisements.length === 0 ? 'Aucune publicité' : 'Aucune publicité pour ce filtre'}</p>
              <p className="text-sm">{advertisements.length === 0 ? 'Créez la première bannière de la vitrine ou des tableaux de bord.' : 'Changez de filtre pour voir d’autres statuts.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleAds.slice((adsPage - 1) * PAGE_SIZE, adsPage * PAGE_SIZE).map(ad => (
                <div key={ad.id} className="border-2 border-slate-200 rounded-xl p-4 bg-white hover:border-[#257C86]/30 transition">
                  <div className="aspect-video bg-slate-100 rounded-lg mb-3 overflow-hidden">
                    {ad.imageUrls?.[0] && (
                      <img src={ad.imageUrls[0]} alt={ad.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <h3 className="font-black text-slate-800 mb-2">{ad.title}</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${AD_STATUS_META[adStatusOf(ad)].cls}`}>
                      {AD_STATUS_META[adStatusOf(ad)].label}
                    </span>
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
                      {adLocationLabel(ad.location)}
                    </span>
                    {ad.centerIds?.length > 0 && (
                      <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full">
                        {ad.centerIds.length} centre{ad.centerIds.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {(ad.positions?.length ?? 0) > 0 && (
                      <span className="px-2 py-1 bg-[#257C86]/10 text-[#257C86] text-[10px] font-bold rounded-full"
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
                      <Edit className="h-4 w-4 inline mr-1" />
                      Modifier
                    </button>
                    <button onClick={() => setDeleteAd(ad)} title="Supprimer"
                      className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition cursor-pointer">
                      <Trash2 className="h-4 w-4" />
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
                className="px-3 py-2 border-2 border-slate-200 rounded-lg disabled:opacity-50 hover:border-[#257C86] transition">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-4 py-2 text-sm font-bold text-slate-600">
                {adsPage} / {Math.ceil(visibleAds.length / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setAdsPage(p => Math.min(Math.ceil(visibleAds.length / PAGE_SIZE), p + 1))}
                disabled={adsPage >= Math.ceil(visibleAds.length / PAGE_SIZE)}
                className="px-3 py-2 border-2 border-slate-200 rounded-lg disabled:opacity-50 hover:border-[#257C86] transition">
                <ChevronRight className="h-4 w-4" />
              </button>
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
        {editInvoice && (
          <EditInvoiceModal
            invoice={editInvoice}
            onClose={() => setEditInvoice(null)}
            onSaved={loadFinanceData}
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
        title="Supprimer le centre ?"
        message={`Êtes-vous sûr de vouloir supprimer "${deleteCenter?.name}" ? Cette action est irréversible.`}
        onConfirm={handleDeleteCenter}
        onCancel={() => setDeleteCenter(null)}
      />
      <ConfirmDialog
        open={!!deleteRequest}
        title="Supprimer la demande ?"
        message={`Supprimer la demande de "${titleCaseName(deleteRequest?.fullName)}" ?`}
        onConfirm={handleDeleteRequest}
        onCancel={() => setDeleteRequest(null)}
      />
      <ConfirmDialog
        open={!!deleteAd}
        title="Supprimer cette publicité ?"
        message={`Supprimer « ${deleteAd?.title} » ? Cette action est irréversible.`}
        onConfirm={async () => {
          if (!deleteAd) return;
          try {
            await deleteAdvertisementApi(deleteAd.id);
            toast.success('Publicité supprimée');
            setDeleteAd(null);
            loadAdvertisements();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
          }
        }}
        onCancel={() => setDeleteAd(null)}
      />
    </div>
  );
}
