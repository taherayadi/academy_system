import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2, Clock,
  CheckCircle2, PauseCircle, Plus, RefreshCw,
  CalendarClock, Layers, Trash2, Check, X, Loader2, Upload,
  Mail, Phone, FileText, DollarSign, TrendingUp, AlertCircle,
  Receipt, Edit, BarChart3, Lock, Search, GraduationCap, ArrowRight,
  ChevronLeft, ChevronRight, ImagePlus
} from 'lucide-react';
import {
  fetchCentersApi, createCenterApi, updateCenterApi, deleteCenterApi,
  uploadPlatformLogoApi,
  fetchDemoRequestsApi, updateDemoRequestApi, deleteDemoRequestApi,
  fetchPlatformBillingApi, fetchInvoicesApi, createInvoiceApi, updateInvoiceApi, deleteInvoiceApi,
  fetchModulePricesApi, updateModulePricesApi, CenterInvoice, ModulePrice, PlatformBillingSummary, PlanChangeOutcome
} from '../api';
import { CenterTenant, DemoRequest, ModuleKey } from '../types';
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

export type PlatformAdminPage = 'overview' | 'centers' | 'requests' | 'finance' | 'pricing';

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

function Pagination({ page, totalPages, total, onChange }: {
  page: number; totalPages: number; total: number; onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-200/70 shadow-sm px-5 py-3">
      <span className="text-xs font-bold text-slate-400">
        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} sur {total}
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

// ─── New / Convert Center Modal ────────────────────────────────────────────
interface NewCenterModalProps {
  initialData?: Partial<DemoRequest>;
  convertRequestId?: string;
  onClose: () => void;
  onCreated: () => void;
}

function NewCenterModal({ initialData, convertRequestId, onClose, onCreated }: NewCenterModalProps) {
  const toast = useToast();
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
      toast.error(err instanceof Error ? err.message : 'Erreur création centre');
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
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Jours offerts</label>
                  <input type="number" min="0" max="3650" step="1" inputMode="numeric" value={form.offerDays}
                    onChange={e => setForm(f => ({ ...f, offerDays: e.target.value }))}
                    className="w-full border-2 border-amber-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-amber-50 focus:border-amber-400 focus:ring-0 outline-none transition"
                    aria-describedby="new-center-offer-days-hint" />
                  <p id="new-center-offer-days-hint" className="text-[10px] font-semibold text-amber-700 mt-1">Avant le début de l’abonnement, sans changer le plan.</p>
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
                  {previewOfferEnd && (
                    <div className="flex items-center justify-between gap-3 text-left">
                      <span className="text-xs font-black text-amber-700">Fin de l’offre / début abonnement</span>
                      <span className="text-sm font-black text-slate-800">{fmtDate(previewOfferEnd)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 text-left">
                    <span className="text-xs font-black text-slate-600">Fin d’abonnement calculée</span>
                    <span className="text-sm font-black text-slate-800">{fmtDate(previewEnd)}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 text-left">
                    {offerDays > 0
                      ? `${offerDays} jour${offerDays > 1 ? 's' : ''} offert${offerDays > 1 ? 's' : ''}, puis ${form.billingCycle === 'annual' ? '365 jours' : '30 jours'} d’abonnement.`
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
    </div>
  );
}

// ─── Edit Modules Modal ────────────────────────────────────────────────────
function EditModulesModal({ center, onClose, onSaved }: { center: CenterTenant; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [modulePrices, setModulePrices] = useState<Record<string, number>>({});
  const [enabled, setEnabled] = useState<string[]>(() =>
    center.plan === 'pro'
      ? [...ALL_MODULE_KEYS]
      : center.plan === 'starter'
        ? [...BASIC_MODULE_KEYS]
        : normalizeCenterModules(center.enabledModules as string[] || [])
  );

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

  const displayedPlan = center.plan === 'starter' ? 'basic' : center.plan;
  const basicPlan = displayedPlan === 'basic';
  const calculatedTariff = center.status === 'trial'
    ? 0
    : calculatePlanTariff(displayedPlan, center.billingCycle || 'monthly', enabled, modulePrices, center.monthlyPrice || 0);

  const toggle = (key: string) => {
    if (isBaseModule(key)) return;
    setEnabled(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateCenterApi(center.id, {
        enabledModules: enabled,
        autoCalculatePrice: true,
        // Mid-period module additions are settled automatically by the backend.
        settlementPolicy: 'auto'
      });
      const outcome = res.planChange;
      if (outcome?.mode === 'mid_period_increase') {
        const settlement = outcome.settlement;
        if (settlement && !settlement.skipped && settlement.amount > 0) {
          toast.success(
            `Modules mis à jour. Solde à régler: ${formatTnd(settlement.amount)} ` +
            `(${settlement.paid ? 'période déjà réglée — complément' : 'facture créée'}${settlement.invoiceNumber ? ` ${settlement.invoiceNumber}` : ''}).`
          );
        } else {
          toast.success('Modules mis à jour. Fin d’abonnement inchangée.');
        }
      } else if (outcome?.mode === 'scheduled') {
        toast.success(`Modules mis à jour — retrait appliqué le ${fmtDate(outcome.applyAt)} (fin de la période en cours).`);
      } else {
        toast.success('Modules mis à jour');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-[#257C86]/10 rounded-xl"><Layers className="h-4 w-4 text-[#257C86]" /></span>
            <h2 className="font-black text-slate-900 text-base">Modules — {center.name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl cursor-pointer"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {BASE_MODULE_KEYS.map(key => (
            <span key={key} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-[#257C86] text-white cursor-default">
              <Lock className="h-3 w-3" />
              {MODULE_LABEL(key)}
              <span className="text-[9px] font-bold bg-white/25 rounded-full px-1.5 py-px uppercase">Base</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-600 text-white cursor-default">
            <Lock className="h-3 w-3" />
            {MODULE_LABEL(BUNDLED_MODULE_KEY)}
            <span className="text-[9px] font-bold bg-white/25 rounded-full px-1.5 py-px uppercase">Offert</span>
          </span>
        </div>

        {basicPlan ? (
          <p className="text-[11px] font-semibold text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 mb-4">
            Le plan Basic utilise uniquement les modules de base.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {ALL_MODULES.filter(m => !isBaseModule(m.key)).map(m => {
              const on = enabled.includes(m.key);
              return (
                <button key={m.key} onClick={() => toggle(m.key)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer inline-flex items-center gap-1 ${
                    on ? 'bg-[#257C86] text-white border-[#257C86]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#257C86]/40'
                  }`}>
                  {on && <Check className="h-3 w-3" />}
                  {m.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-2xl border border-[#257C86]/20 bg-[#257C86]/[0.05] px-4 py-3 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black text-slate-600">Tarif après sélection</span>
            <span className="text-base font-black text-[#257C86]">
              {center.status === 'trial' ? 'Gratuit' : center.plan === 'custom' ? `${formatTnd(center.monthlyPrice || 0)} · négocié` : formatTnd(calculatedTariff)}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 mt-1">
            {center.status === 'trial' ? 'Le centre d’essai reste gratuit.' : center.billingCycle === 'annual' ? 'Cycle annuel : total mensuel × 12 avec 20 % de remise.' : 'Cycle mensuel : total des modules sélectionnés.'}
            {' '}La fin d’abonnement actuelle ne change pas lors d’une modification des modules.
          </p>
          {center.status === 'active' && center.subscriptionEndsAt && center.subscriptionEndsAt > Date.now() && (
            <p className="text-[10px] font-semibold text-[#257C86] mt-1.5 leading-relaxed">
              En cours de période : un ajout de module génère une facture de solde proratisée ; un retrait est appliqué automatiquement à la fin de la période ({fmtDate(center.subscriptionEndsAt)}).
            </p>
          )}
        </div>
        <p className="text-[11px] font-semibold text-slate-400 mb-5">La base Scolaire + Finance est toujours incluse, avec Jd. Horaires offert.</p>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl cursor-pointer hover:bg-slate-200 transition">Annuler</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-black text-white bg-gradient-to-r from-[#257C86] to-[#1e626b] rounded-xl shadow-lg shadow-[#257C86]/25 hover:shadow-[#257C86]/40 cursor-pointer disabled:opacity-60">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Sauvegarder
          </button>
        </div>
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

    setSaving(true);
    try {
      const logoUrl = logoFile ? await uploadPlatformLogoApi(logoFile) : form.logoUrl;
      const monthlyPrice = Number(form.monthlyPrice);
      const identityPayload = {
        name: form.name.trim(),
        logoUrl,
        phoneNumber: form.phoneNumber.trim(),
        locationCity: form.locationCity.trim(),
        centerType: form.centerType,
      };

      // ── Scheduled change (keep the running period untouched) ─────────────
      if (effectiveApplyChoice === 'schedule' && midPeriod) {
        const outcome = await updateCenterApi(center.id, {
          ...identityPayload,
          scheduleChange: {
            plan: form.plan,
            billingCycle: center.billingCycle || 'monthly',
            enabledModules,
            ...(form.plan === 'custom' ? { monthlyPrice: Number.isFinite(monthlyPrice) ? monthlyPrice : null } : {}),
          },
        });
        planChangeToast(outcome.planChange);
        onSaved();
        onClose();
        return;
      }

      // ── Immediate change (live plan switch) ──────────────────────────────
      const outcome = await updateCenterApi(center.id, {
        ...identityPayload,
        trialEndsAt: centerDateTimestamp(form.trialEndsAt),
        plan: form.plan,
        status: form.status,
        billingCycle: form.billingCycle,
        enabledModules,
        ...(form.plan === 'custom' ? { monthlyPrice: Number.isFinite(monthlyPrice) ? monthlyPrice : 0 } : {}),
        autoCalculatePrice: true,
        autoCalculateSubscription: shouldExtendSubscription,
        ...(settlementRelevant && !scheduleOnly
          ? { settlementPolicy: paymentState }
          : {}),
      });
      planChangeToast(outcome.planChange);
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

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Abonnement</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Plan</label>
                <select value={form.plan} onChange={e => handleEditPlanChange(e.target.value)} className={`${inputCls} cursor-pointer`}>
                  <option value="basic">Basic</option>
                  <option value="growth">Growth</option>
                  <option value="pro">Pro</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Statut</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as CenterTenant['status'] }))} className={`${inputCls} cursor-pointer`}>
                  <option value="trial">Essai</option>
                  <option value="active">Actif</option>
                  <option value="suspended">Suspendu</option>
                  <option value="expired">Expiré</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Cycle de facturation</label>
                <select value={form.billingCycle} onChange={e => setForm(f => ({ ...f, billingCycle: e.target.value as 'monthly' | 'annual' }))} className={`${inputCls} cursor-pointer`}>
                  <option value="monthly">Mensuel</option>
                  <option value="annual">Annuel — 20 % de remise</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Tarif {form.billingCycle === 'annual' ? 'annuel' : 'mensuel'} (TND)</label>
                {automaticPlan ? (
                  <input type="text" value={calculatedTariff.toFixed(2)} readOnly aria-readonly="true" className={`${inputCls} bg-slate-50 text-[#257C86] cursor-not-allowed`} />
                ) : (
                  <input type="number" min="0" step="0.01" value={form.monthlyPrice} onChange={e => setForm(f => ({ ...f, monthlyPrice: e.target.value }))} className={inputCls} />
                )}
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Fin de l’essai</label>
                <input type="date" dir="ltr" value={form.trialEndsAt} onChange={e => setForm(f => ({ ...f, trialEndsAt: e.target.value }))} className={`${inputCls} cursor-pointer input-date-ltr text-left`} />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Fin de l’abonnement calculée</label>
                <input type="date" dir="ltr" value={displayedEnd ? centerDateInputValue(displayedEnd) : ''} readOnly aria-readonly="true"
                  className={`${inputCls} bg-slate-50 text-slate-700 cursor-not-allowed input-date-ltr text-left`} />
                {midPeriod && (
                  <p className={`text-[10px] font-semibold mt-1 ${scheduleOnly || effectiveApplyChoice === 'schedule' ? 'text-amber-700' : 'text-[#257C86]'}`}>
                    {scheduleOnly || effectiveApplyChoice === 'schedule'
                      ? `Inchangée. Changement programmé pour le ${fmtDate(center.subscriptionEndsAt)}.`
                      : `Inchangée. Changement immédiat — régularisation au prorata de la période en cours.`}
                  </p>
                )}
                {!midPeriod && shouldExtendSubscription && form.status !== 'trial' && (
                  <p className="text-[10px] font-semibold text-[#257C86] mt-1">Sera prolongée de {form.billingCycle === 'annual' ? '365 jours' : '30 jours'} à l’enregistrement.</p>
                )}
                {startsAfterTrial && (
                  <p className="text-[10px] font-semibold text-amber-700 mt-1">
                    La période d’essai se termine le {fmtDate(previewTrialEnd)}. L’abonnement commencera à cette date.
                  </p>
                )}
              </div>
            </div>

            {/* Plan change consequence (mid-period switches) */}
            {showPlanChangePanel && (
              <div className="mt-4 rounded-2xl border-2 border-[#257C86]/20 bg-[#257C86]/[0.04] p-4">
                <p className="text-xs font-black text-slate-700 mb-3 flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-[#257C86]" />
                  Changement {decision.kind === 'mid_period_decrease' ? 'à la baisse' : 'de plan'} en cours de période
                </p>

                {scheduleOnly ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-[11px] font-semibold text-amber-800 leading-relaxed">
                    Le centre a déjà payé sa période en cours au tarif actuel ({formatTnd(decision.oldAmount)} → {formatTnd(decision.newAmount)}). Le passage à la
                    baisse sera appliqué automatiquement le <strong>{fmtDate(center.subscriptionEndsAt)}</strong> — sans remboursement ni modification de la date
                    de fin actuelle.
                  </div>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 gap-2 mb-2.5">
                      <button type="button" onClick={() => setApplyChoice('settle')}
                        className={`text-left rounded-xl border-2 px-3.5 py-3 transition cursor-pointer ${applyChoice === 'settle' ? 'border-[#257C86] bg-white shadow-md shadow-[#257C86]/10' : 'border-slate-200 bg-white/60 hover:border-[#257C86]/40'}`}>
                        <div className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full border-2 ${applyChoice === 'settle' ? 'border-[#257C86] bg-[#257C86]' : 'border-slate-300'}`} />
                          Appliquer maintenant
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500 mt-1.5 leading-relaxed">
                          Les modules Growth/Pro sont activés immédiatement. La fin d’abonnement ({fmtDate(center.subscriptionEndsAt)}) ne bouge pas.
                        </div>
                      </button>
                      <button type="button" onClick={() => setApplyChoice('schedule')}
                        className={`text-left rounded-xl border-2 px-3.5 py-3 transition cursor-pointer ${applyChoice === 'schedule' ? 'border-[#257C86] bg-white shadow-md shadow-[#257C86]/10' : 'border-slate-200 bg-white/60 hover:border-[#257C86]/40'}`}>
                        <div className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full border-2 ${applyChoice === 'schedule' ? 'border-[#257C86] bg-[#257C86]' : 'border-slate-300'}`} />
                          Programmer pour le {fmtDate(center.subscriptionEndsAt)}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500 mt-1.5 leading-relaxed">
                          Le centre reste au plan actuel jusqu’à la fin de sa période, puis bascule automatiquement.
                        </div>
                      </button>
                    </div>

                    {applyChoice === 'settle' && settlementRelevant && (
                      <div className="rounded-xl bg-white border border-slate-200 px-3.5 py-3 space-y-2">
                        <p className="text-[11px] font-black text-slate-700">
                          Régularisation à facturer — {decision.remainingDays} jour{decision.remainingDays > 1 ? 's' : ''} restant{decision.remainingDays > 1 ? 's' : ''} ·{' '}
                          {formatTnd(decision.newAmount)} / {center.billingCycle === 'annual' ? 'an' : 'mois'} au lieu de {formatTnd(decision.oldAmount)}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <button type="button" onClick={() => setPaymentState('paid')}
                            className={`text-left rounded-xl border-2 px-3.5 py-2.5 transition cursor-pointer ${paymentState === 'paid' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-400'}`}>
                            <div className="text-[10px] font-black text-emerald-800">Période déjà payée</div>
                            <div className="text-sm font-black text-emerald-700 mt-0.5">+ {formatTnd(decision.paidAmount)}</div>
                            <div className="text-[10px] font-semibold text-slate-500 mt-0.5">complément (différence × jours restants)</div>
                          </button>
                          <button type="button" onClick={() => setPaymentState('unpaid')}
                            className={`text-left rounded-xl border-2 px-3.5 py-2.5 transition cursor-pointer ${paymentState === 'unpaid' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-400'}`}>
                            <div className="text-[10px] font-black text-amber-800">Période pas encore payée</div>
                            <div className="text-sm font-black text-amber-700 mt-0.5">{formatTnd(decision.unpaidAmount)}</div>
                            <div className="text-[10px] font-semibold text-slate-500 mt-0.5">nouvelle facture — l’ancienne en attente sera annulée</div>
                          </button>
                        </div>
                        {!windowPaid && paymentState === 'unpaid' && (
                          <p className="text-[10px] font-semibold text-slate-500">
                            Détecté : aucune facture payée pour la fenêtre actuelle — l’option « pas encore payée » est présélectionnée.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.15em]">Modules activés</p>
              {form.plan === 'pro' && <span className="text-[10px] font-black text-[#257C86]">Tous les modules sélectionnés pour Pro</span>}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {BASE_MODULE_KEYS.map(key => (
                <span key={key} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-[#257C86] text-white cursor-default">
                  <Lock className="h-3 w-3" /> {MODULE_LABEL(key)} <span className="text-[9px] font-bold bg-white/25 rounded-full px-1.5 py-px uppercase">Base</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-600 text-white cursor-default">
                <Lock className="h-3 w-3" /> {MODULE_LABEL(BUNDLED_MODULE_KEY)} <span className="text-[9px] font-bold bg-white/25 rounded-full px-1.5 py-px uppercase">Offert</span>
              </span>
            </div>
            {form.plan === 'basic' ? (
              <p className="text-[11px] font-semibold text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                Le plan Basic utilise uniquement les modules de base. Tarif recalculé automatiquement.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ALL_MODULES.filter(module => !isBaseModule(module.key)).map(module => {
                  const selected = enabledModules.includes(module.key);
                  return (
                    <button key={module.key} type="button" onClick={() => toggleEditModule(module.key)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer inline-flex items-center gap-1 ${
                        selected ? 'bg-[#257C86] text-white border-[#257C86]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#257C86]/40'
                      }`}>
                      {selected && <Check className="h-3 w-3" />}
                      {module.label}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] font-semibold text-slate-400 mt-2.5">Scolaire, Finance et Jd. Horaires sont obligatoires. La modification des modules ou du plan recalcule le tarif sans prolonger la date d’abonnement. En cours de période : hausse régularisée au prorata, baisse programmée à la fin de la période.</p>
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
  // Filters — requests
  const [reqTypeFilter, setReqTypeFilter] = useState<'all' | 'jardin' | 'formation'>('all');
  const [reqStatusFilter, setReqStatusFilter] = useState<'all' | 'new' | 'contacted' | 'converted' | 'archived'>('all');
  const [centersPage, setCentersPage] = useState(1);
  const [requestsPage, setRequestsPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);

  const [showNewCenter, setShowNewCenter] = useState(false);
  const [convertRequest, setConvertRequest] = useState<DemoRequest | null>(null);
  const [editCenter, setEditCenter] = useState<CenterTenant | null>(null);
  const [editModulesCenter, setEditModulesCenter] = useState<CenterTenant | null>(null);
  const [deleteCenter, setDeleteCenter] = useState<CenterTenant | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DemoRequest | null>(null);

  // Finance data
  const [billingSummary, setBillingSummary] = useState<PlatformBillingSummary | null>(null);
  const [invoices, setInvoices] = useState<CenterInvoice[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState<CenterInvoice | null>(null);

  // Module prices (Tarifs page)
  const [priceYear, setPriceYear] = useState(currentSchoolYear());
  const [priceList, setPriceList] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);

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
    setReqTypeFilter('all'); setReqStatusFilter('all');
    setInvoiceSearch(''); setInvoiceStatusFilter('all');
    setCentersPage(1); setRequestsPage(1);
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

  // ── Invoice filters (center name + status) ──
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | CenterInvoice['status']>('all');
  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter(inv =>
      (invoiceStatusFilter === 'all' || inv.status === invoiceStatusFilter)
      && (!q || inv.centerName.toLowerCase().includes(q))
    );
  }, [invoices, invoiceSearch, invoiceStatusFilter]);

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

  useEffect(() => {
    if (page === 'pricing') loadPrices(priceYear);
  }, [page, priceYear, loadPrices]);

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
    if (reqStatusFilter !== 'all' && r.status !== reqStatusFilter) return false;
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
  const handleAddOfferDays = async (c: CenterTenant) => {
    try {
      await updateCenterApi(c.id, { addOfferDays: 14 });
      toast.success('+14 jours d’essai ajoutés à la période initiale');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

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
                    className="text-[11px] font-bold px-3 py-1.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5">
                    <Edit className="h-3.5 w-3.5" /> Modifier
                  </button>
                  <button onClick={() => handleAddOfferDays(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition cursor-pointer flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" /> +14 jours d’essai
                  </button>
                  <button onClick={() => handleToggleStatus(c)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
                      c.status === 'suspended'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    }`}>
                    {c.status === 'suspended' ? <><CheckCircle2 className="h-3.5 w-3.5" /> Activer</> : <><PauseCircle className="h-3.5 w-3.5" /> Suspendre</>}
                  </button>
                  <button onClick={() => setEditModulesCenter(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-[#257C86]/10 text-[#257C86] border border-[#257C86]/20 rounded-xl hover:bg-[#257C86]/20 transition cursor-pointer flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> Modules
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
              <Segmented<'all' | 'new' | 'contacted' | 'converted' | 'archived'>
                value={reqStatusFilter}
                onChange={setReqStatusFilter}
                options={[
                  { key: 'all', label: 'Tous' },
                  { key: 'new', label: 'Nouveau' },
                  { key: 'contacted', label: 'Contacté' },
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
                  <select
                    value={req.status}
                    onChange={e => handleReqStatus(req, e.target.value)}
                    className="text-[11px] font-bold px-3 py-1.5 border-2 border-slate-200 rounded-xl bg-white focus:border-[#257C86] focus:ring-0 outline-none cursor-pointer">
                    <option value="new">Nouveau</option>
                    <option value="contacted">Contacté</option>
                    <option value="converted">Converti</option>
                    <option value="archived">Archivé</option>
                  </select>

                  <button
                    onClick={() => { setConvertRequest(req); setShowNewCenter(true); }}
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white rounded-xl shadow-md shadow-[#257C86]/25 hover:shadow-lg hover:shadow-[#257C86]/30 transition cursor-pointer">
                    <Building2 className="h-3.5 w-3.5" /> Convertir en Centre
                  </button>

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
                    { label: 'MRR (Revenue Mensuel)', value: `${billingSummary.mrr.toFixed(2)} TND`, icon: TrendingUp, tint: 'bg-emerald-100 text-emerald-600' },
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

              {/* Actions */}
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => setShowInvoiceModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:shadow-lg hover:shadow-[#257C86]/30 text-white text-sm font-black rounded-xl shadow-md shadow-[#257C86]/25 transition cursor-pointer">
                  <Plus className="h-4 w-4" />
                  Nouvelle Facture
                </button>
                <button onClick={() => onNavigate?.('pricing')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-200 hover:border-[#257C86]/40 hover:text-[#257C86] text-slate-600 text-sm font-bold rounded-xl transition cursor-pointer">
                  <Layers className="h-4 w-4" />
                  Tarifs Modules
                </button>
              </div>

              {/* Invoices */}
              <div className="bg-white rounded-3xl border border-slate-200/70 p-6 shadow-lg shadow-slate-900/5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2.5">
                    <span className="p-2 bg-[#257C86]/10 rounded-xl"><Receipt className="h-4 w-4 text-[#257C86]" /></span>
                    Factures
                    <span className="text-[11px] font-bold text-slate-400 font-sans">{filteredInvoices.length} affichée{filteredInvoices.length > 1 ? 's' : ''}</span>
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
                    {(invoiceSearch || invoiceStatusFilter !== 'all') && (
                      <button
                        onClick={() => { setInvoiceSearch(''); setInvoiceStatusFilter('all'); }}
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="pb-3 px-3">N° Facture</th>
                          <th className="pb-3 px-3">Centre</th>
                          <th className="pb-3 px-3">Période</th>
                          <th className="pb-3 px-3">Montant</th>
                          <th className="pb-3 px-3">Statut</th>
                          <th className="pb-3 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredInvoices.map(inv => {
                          const statusColors: Record<string, string> = {
                            pending: 'bg-amber-100 text-amber-800',
                            paid: 'bg-emerald-100 text-emerald-800',
                            overdue: 'bg-red-100 text-red-700',
                            cancelled: 'bg-slate-100 text-slate-600'
                          };
                          const statusLabels: Record<string, string> = {
                            pending: 'En attente', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée'
                          };
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/70">
                              <td className="py-3 px-3 font-mono text-xs text-slate-500">{inv.invoiceNumber}</td>
                              <td className="py-3 px-3 font-black text-slate-900">{inv.centerName}</td>
                              <td className="py-3 px-3 text-slate-600 text-xs">
                                {new Date(inv.periodStart).toLocaleDateString('fr')} – {new Date(inv.periodEnd).toLocaleDateString('fr')}
                              </td>
                              <td className="py-3 px-3 font-black text-slate-900">{inv.amount.toFixed(2)} TND</td>
                              <td className="py-3 px-3">
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${statusColors[inv.status]}`}>
                                  {statusLabels[inv.status] || inv.status}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-1">
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
                )}
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* ═══ PRICING PAGE (Tarifs & Modules) ═══ */}
      {page === 'pricing' && (
        <motion.div key="pricing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative space-y-5">

          {/* Year selector */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="inline-flex items-center p-1.5 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
              {[0, 1].map(offset => {
                const y = new Date().getFullYear();
                const base = new Date().getMonth() >= 8 ? y : y - 1;
                const year = `${base + offset}/${base + offset + 1}`;
                const active = priceYear === year;
                return (
                  <button key={year} onClick={() => setPriceYear(year)}
                    className={`px-5 py-2 rounded-xl text-sm font-black transition cursor-pointer ${active ? 'bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white shadow-md shadow-[#257C86]/25' : 'text-slate-500 hover:text-slate-800'}`}>
                    {year}
                  </button>
                );
              })}
            </div>
            <button onClick={savePrices} disabled={savingPrices || pricesLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:shadow-lg hover:shadow-[#257C86]/30 text-white text-sm font-black rounded-xl shadow-md shadow-[#257C86]/25 transition cursor-pointer disabled:opacity-60">
              {savingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Sauvegarder les tarifs
            </button>
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
        {editModulesCenter && (
          <EditModulesModal
            center={editModulesCenter}
            onClose={() => setEditModulesCenter(null)}
            onSaved={load}
          />
        )}
        {showInvoiceModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvoiceModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <h2 className="text-base font-black text-slate-900 mb-5">Nouvelle Facture</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                try {
                  await createInvoiceApi({
                    centerId: data.get('centerId') as string,
                    amount: Number(data.get('amount')),
                    periodStart: new Date(data.get('periodStart') as string).getTime(),
                    periodEnd: new Date(data.get('periodEnd') as string).getTime(),
                    notes: data.get('notes') as string
                  });
                  toast.success('Facture créée');
                  setShowInvoiceModal(false);
                  loadFinanceData();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Erreur');
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Centre</label>
                  <select name="centerId" required className={inputCls}>
                    {centers.filter(c => c.status !== 'trial').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Montant (TND)</label>
                  <input type="number" name="amount" step="0.01" required className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Début période</label>
                    <input type="date" name="periodStart" required className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Fin période</label>
                    <input type="date" name="periodEnd" required className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
                  <textarea name="notes" rows={2} className={inputCls}></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowInvoiceModal(false)} className="px-4 py-2.5 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer">Annuler</button>
                  <button type="submit" className="px-4 py-2.5 text-sm font-black text-white bg-gradient-to-r from-[#257C86] to-[#1e626b] rounded-xl shadow-md shadow-[#257C86]/25 hover:shadow-lg transition cursor-pointer">Créer</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {editInvoice && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditInvoice(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <h2 className="text-base font-black text-slate-900 mb-5">Modifier Facture {editInvoice.invoiceNumber}</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                try {
                  await updateInvoiceApi(editInvoice.id, {
                    status: data.get('status') as CenterInvoice['status'],
                    paymentMethod: data.get('paymentMethod') as string,
                    notes: data.get('notes') as string
                  });
                  toast.success('Facture mise à jour');
                  setEditInvoice(null);
                  loadFinanceData();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Erreur');
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Statut</label>
                  <select name="status" defaultValue={editInvoice.status} className={inputCls}>
                    <option value="pending">En attente</option>
                    <option value="paid">Payée</option>
                    <option value="overdue">En retard</option>
                    <option value="cancelled">Annulée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Méthode paiement</label>
                  <input type="text" name="paymentMethod" defaultValue={editInvoice.paymentMethod || ''} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
                  <textarea name="notes" rows={2} defaultValue={editInvoice.notes} className={inputCls}></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setEditInvoice(null)} className="px-4 py-2.5 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer">Annuler</button>
                  <button type="submit" className="px-4 py-2.5 text-sm font-black text-white bg-gradient-to-r from-[#257C86] to-[#1e626b] rounded-xl shadow-md shadow-[#257C86]/25 hover:shadow-lg transition cursor-pointer">Sauvegarder</button>
                </div>
              </form>
            </motion.div>
          </div>
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
    </div>
  );
}
