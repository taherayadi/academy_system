import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, Building2, Clock,
  CheckCircle2, PauseCircle, Plus, RefreshCw,
  CalendarClock, Layers, Trash2, Check, X, Loader2,
  Mail, Phone, FileText, DollarSign, TrendingUp, AlertCircle,
  Receipt, Edit, BarChart3, Lock, Search, GraduationCap, ArrowRight
} from 'lucide-react';
import {
  fetchCentersApi, createCenterApi, updateCenterApi, deleteCenterApi,
  fetchDemoRequestsApi, updateDemoRequestApi, deleteDemoRequestApi,
  fetchPlatformBillingApi, fetchInvoicesApi, createInvoiceApi, updateInvoiceApi, deleteInvoiceApi,
  fetchModulePricesApi, updateModulePricesApi, CenterInvoice, ModulePrice, PlatformBillingSummary
} from '../api';
import { CenterTenant, DemoRequest, ModuleKey } from '../types';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';

// ─── Constants ─────────────────────────────────────────────────────────────
// Base plan: Scolaire + Finance (priced) + Jd. Horaires (bundled, no tarif)
const BASE_MODULE_KEYS = ['scolaire', 'finance'];
const BUNDLED_MODULE_KEY = 'studentTimeSheets'; // Jd. Horaires — offert avec la base, sans tarif

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

const MODULE_LABEL = (key: string) => ALL_MODULES.find(m => m.key === key)?.label || key;
const isBaseModule = (key: string) =>
  (BASE_MODULE_KEYS as string[]).includes(key) || key === BUNDLED_MODULE_KEY;

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

const STATUS_BADGE: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-600',
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

// The UI now offers Essai / Basic / Custom. "Basic" is stored as 'starter'
// (the DB CHECK constraint only allows starter/growth/pro/custom).
const PLAN_LABEL: Record<string, string> = {
  starter: 'Basic',
  basic: 'Basic',
  growth: 'Growth',
  pro: 'Pro',
  custom: 'Custom'
};

const CENTER_TYPE_LABEL: Record<string, string> = {
  jardin: 'Jardin d’enfant',
  formation: 'Centre de formation'
};

function daysLeft(ts?: number | null): number | null {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / 86400000);
}

function fmtDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-TN', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const [form, setForm] = useState(() => {
    // Base toujours incluse + modules demandés lors d'une conversion
    const requested = parseModules(initialData?.requestedModules);
    const enabled = Array.from(new Set<string>([...BASE_MODULE_KEYS, ...(requested.length ? requested : ALL_MODULES.map(m => m.key))]));
    return {
      name: initialData?.academyName || '',
      slug: '',
      phoneNumber: initialData?.phone || '',
      locationCity: '',
      plan: 'trial' as string,
      directorName: initialData?.fullName || '',
      directorEmail: initialData?.email || '',
      directorPassword: '',
      enabledModules: enabled,
    };
  });

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
    setSaving(true);
    try {
      await createCenterApi({ ...form, convertFromRequestId: convertRequestId });
      toast.success('Centre créé avec succès !');
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-[#257C86]/10 rounded-xl"><Building2 className="h-5 w-5 text-[#257C86]" /></span>
            <div>
              <h2 className="text-base font-black text-slate-900">{convertRequestId ? 'Convertir en centre' : 'Nouveau Centre'}</h2>
              {convertRequestId && <p className="text-[11px] font-bold text-[#257C86]">Modules demandés présélectionnés</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Centre info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Nom du centre *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#257C86]/30" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Slug (URL)</label>
              <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="ex: smart-kids-sfax"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#257C86]/30" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Ville</label>
              <input value={form.locationCity} onChange={e => setForm(f => ({ ...f, locationCity: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#257C86]/30" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Téléphone</label>
              <input value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#257C86]/30" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Plan *</label>
              <select required value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#257C86]/30 cursor-pointer">
                <option value="trial">Essai (14 j)</option>
                <option value="basic">Basic</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {/* Director */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Compte Directeur</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Nom *</label>
                <input required value={form.directorName} onChange={e => setForm(f => ({ ...f, directorName: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#257C86]/30" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Email *</label>
                <input required type="email" value={form.directorEmail} onChange={e => setForm(f => ({ ...f, directorEmail: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#257C86]/30" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1">Mot de passe initial *</label>
                <input required type="password" minLength={6} value={form.directorPassword} onChange={e => setForm(f => ({ ...f, directorPassword: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#257C86]/30" />
              </div>
            </div>
          </div>

          {/* Modules : base verrouillée + additions */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Modules activés</p>

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
            <p className="text-[11px] font-semibold text-slate-400 mt-2.5">La base Scolaire + Finance est toujours incluse, avec Jd. Horaires offert — ils ne peuvent pas être retirés.</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#257C86] rounded-xl hover:bg-[#1e626b] transition cursor-pointer disabled:opacity-60">
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
  const [enabled, setEnabled] = useState<string[]>(() =>
    Array.from(new Set<string>([...BASE_MODULE_KEYS, ...(center.enabledModules as string[] || [])]))
  );

  const toggle = (key: string) => {
    if (isBaseModule(key)) return;
    setEnabled(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCenterApi(center.id, { enabledModules: enabled });
      toast.success('Modules mis à jour');
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-slate-900 text-base">Modules – {center.name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer"><X className="h-4 w-4" /></button>
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

        <p className="text-[11px] font-semibold text-slate-400 mb-5">La base Scolaire + Finance est toujours incluse.</p>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl cursor-pointer hover:bg-slate-200 transition">Annuler</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#257C86] rounded-xl hover:bg-[#1e626b] cursor-pointer disabled:opacity-60">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Sauvegarder
          </button>
        </div>
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

  const [showNewCenter, setShowNewCenter] = useState(false);
  const [convertRequest, setConvertRequest] = useState<DemoRequest | null>(null);
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

  const loadFinanceData = useCallback(async () => {
    setFinanceLoading(true);
    try {
      const [summary, invoiceList] = await Promise.all([
        fetchPlatformBillingApi(),
        fetchInvoicesApi({ limit: 50 })
      ]);
      setBillingSummary(summary.summary);
      setInvoices(invoiceList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur chargement finances');
    } finally {
      setFinanceLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if ((page === 'overview' || page === 'finance') && !billingSummary && !financeLoading) {
      loadFinanceData();
    }
  }, [page, billingSummary, financeLoading, loadFinanceData]);

  const loadPrices = useCallback(async (year: string) => {
    setPricesLoading(true);
    try {
      const prices = await fetchModulePricesApi(year);
      const map: Record<string, number> = {};
      ALL_MODULES.forEach(m => { map[m.key] = 15; });
      (prices || []).forEach((p: ModulePrice) => { map[p.module_key] = p.price; });
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

  // Filtered lists (search)
  const q = search.trim().toLowerCase();
  const filteredCenters = q
    ? centers.filter(c => `${c.name} ${c.adminEmail || ''} ${c.locationCity || ''}`.toLowerCase().includes(q))
    : centers;
  const filteredRequests = q
    ? requests.filter(r => `${r.fullName} ${r.academyName} ${r.email}`.toLowerCase().includes(q))
    : requests;

  // ── Handlers ──
  const handleExtendTrial = async (c: CenterTenant) => {
    try {
      await updateCenterApi(c.id, { extendTrialDays: 14 });
      toast.success('+14 jours ajoutés');
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

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#257C86]/30 focus:border-[#257C86]/50 transition';

  return (
    <div className="space-y-6" dir="ltr">

      {/* ─── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="p-2.5 bg-[#257C86]/10 rounded-2xl"><ShieldCheck className="h-6 w-6 text-[#257C86]" /></span>
          <div>
            <h1 className="text-xl font-black text-slate-900">{PAGE_META[page].title}</h1>
            <p className="text-xs text-slate-500 font-semibold">{PAGE_META[page].sub}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(page === 'centers' || page === 'requests') && (
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={page === 'centers' ? 'Rechercher un centre…' : 'Rechercher une demande…'}
                className="w-56 lg:w-64 pl-9 pr-3 py-2.5 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#257C86]/30 focus:border-[#257C86]/50 transition"
              />
            </div>
          )}
          <button onClick={load} className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition cursor-pointer" title="Actualiser">
            <RefreshCw className={`h-4 w-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowNewCenter(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#257C86] hover:bg-[#1e626b] text-white text-sm font-bold rounded-xl transition cursor-pointer">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nouveau Centre</span>
            <span className="sm:hidden">Centre</span>
          </button>
        </div>
      </div>

      {/* ═══ OVERVIEW PAGE ═══ */}
      {page === 'overview' && (
        <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {[
              { label: 'MRR — Mensuel', value: billingSummary ? `${billingSummary.mrr.toFixed(0)} TND` : '—', icon: TrendingUp, color: 'bg-emerald-50 border-emerald-200' },
              { label: 'Total Centres', value: centers.length, icon: Building2, color: 'bg-slate-50 border-slate-200' },
              { label: 'Actifs', value: activeCenters, icon: CheckCircle2, color: 'bg-emerald-50 border-emerald-200' },
              { label: 'En Essai', value: trialCenters, icon: Clock, color: 'bg-amber-50 border-amber-200' },
              { label: 'Nouvelles demandes', value: newRequests, icon: FileText, color: 'bg-blue-50 border-blue-200' },
              { label: 'À encaisser', value: billingSummary ? `${billingSummary.pendingInvoices.toFixed(0)} TND` : '—', icon: Receipt, color: 'bg-rose-50 border-rose-200' }
            ].map(kpi => (
              <div key={kpi.label} className={`rounded-2xl border p-4 ${kpi.color}`}>
                <kpi.icon className="h-5 w-5 text-slate-400 mb-2" />
                <p className="text-xl font-black text-slate-900 leading-none">{kpi.value}</p>
                <p className="text-xs font-bold text-slate-500 mt-1.5">{kpi.label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-5">

            {/* Revenue chart */}
            <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 bg-[#257C86]/10 rounded-xl"><BarChart3 className="h-4 w-4 text-[#257C86]" /></span>
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
                        className={`w-full rounded-xl ${i === revenueChart.length - 1 ? 'bg-gradient-to-t from-[#257C86] to-[#3aa5b0] shadow-md shadow-[#257C86]/25' : 'bg-slate-200'}`}
                      />
                      <span className="text-[10px] font-bold text-slate-400 capitalize">{m.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent requests */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 bg-blue-50 rounded-xl"><FileText className="h-4 w-4 text-blue-600" /></span>
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
                        {r.fullName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-slate-900 truncate">{r.academyName}</div>
                        <div className="text-[10px] font-semibold text-slate-400 truncate">{r.fullName} · {fmtDate(r.createdAt)}</div>
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="p-2 bg-amber-50 rounded-xl"><CalendarClock className="h-4 w-4 text-amber-600" /></span>
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
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 hover:border-[#257C86]/40 hover:bg-[#257C86]/5 p-3.5 text-left transition cursor-pointer">
                        <div className="h-9 w-9 rounded-xl bg-[#257C86]/10 flex items-center justify-center text-[10px] font-black text-[#257C86] flex-shrink-0">
                          {c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-slate-900 truncate">{c.name}</div>
                          <div className="text-[10px] font-semibold text-slate-400">{c.adminEmail || '—'}</div>
                        </div>
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full flex-shrink-0 ${
                          days === null ? 'bg-slate-100 text-slate-500'
                            : days <= 3 ? 'bg-red-50 text-red-600 border border-red-200'
                            : days <= 7 ? 'bg-amber-50 text-amber-700 border border-amber-200'
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
        <motion.div key="centers" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : filteredCenters.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">{q ? 'Aucun résultat pour cette recherche' : 'Aucun centre'}</p>
            </div>
          ) : filteredCenters.map(c => {
            const days = daysLeft(c.trialEndsAt);
            const mods = (c.enabledModules as string[]) || [];
            return (
              <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    <div className="h-11 w-11 rounded-2xl bg-[#257C86]/10 flex items-center justify-center text-sm font-black text-[#257C86] flex-shrink-0">
                      {c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm">{c.name}</p>
                      <p className="text-xs text-slate-500 font-semibold">{c.adminEmail || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_BADGE[c.status] || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">{PLAN_LABEL[c.plan] || c.plan}</span>
                  </div>
                </div>

                {/* Trial countdown */}
                {c.status === 'trial' && days !== null && (
                  <div className={`mt-3.5 flex items-center gap-2 text-xs font-bold rounded-xl px-3.5 py-2.5 ${
                    days <= 3 ? 'bg-red-50 text-red-700' : days <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
                  }`}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    {days > 0 ? `Essai expire dans ${days} jour${days > 1 ? 's' : ''} (${fmtDate(c.trialEndsAt)})` : 'Essai expiré'}
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
                <div className="mt-4 flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3.5">
                  <button onClick={() => handleExtendTrial(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition cursor-pointer flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" /> +14 jours essai
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
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ═══ REQUESTS PAGE ═══ */}
      {page === 'requests' && (
        <motion.div key="requests" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">{q ? 'Aucun résultat pour cette recherche' : 'Aucune demande reçue'}</p>
            </div>
          ) : filteredRequests.map(req => {
            const mods = parseModules(req.requestedModules);
            return (
              <motion.div key={req.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    <div className="h-11 w-11 rounded-2xl bg-blue-50 flex items-center justify-center text-sm font-black text-blue-600 flex-shrink-0">
                      {req.fullName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm">{req.fullName}</p>
                      <p className="text-xs font-black text-[#257C86]">{req.academyName}</p>
                      <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{fmtDate(req.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${REQ_STATUS_BADGE[req.status] || REQ_STATUS_BADGE.new}`}>
                      {REQ_STATUS_LABEL[req.status] || req.status}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      {REQ_TYPE_LABEL[req.requestType] || req.requestType}
                    </span>
                    {req.centerType && (
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${req.centerType === 'jardin' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                        {CENTER_TYPE_LABEL[req.centerType] || req.centerType}
                      </span>
                    )}
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
                <div className="mt-4 flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3.5">
                  <select
                    value={req.status}
                    onChange={e => handleReqStatus(req, e.target.value)}
                    className="text-[11px] font-bold px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#257C86]/30 cursor-pointer">
                    <option value="new">Nouveau</option>
                    <option value="contacted">Contacté</option>
                    <option value="converted">Converti</option>
                    <option value="archived">Archivé</option>
                  </select>

                  <button
                    onClick={() => { setConvertRequest(req); setShowNewCenter(true); }}
                    className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition cursor-pointer">
                    <Building2 className="h-3.5 w-3.5" /> Convertir en Centre
                  </button>

                  <button onClick={() => setDeleteRequest(req)}
                    className="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ═══ FINANCE PAGE ═══ */}
      {page === 'finance' && (
        <motion.div key="finance" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {financeLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : (
            <>
              {/* KPI cards */}
              {billingSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <TrendingUp className="h-5 w-5 text-emerald-600 mb-2" />
                    <p className="text-2xl font-black text-slate-900">{billingSummary.mrr.toFixed(2)} TND</p>
                    <p className="text-xs font-bold text-emerald-700 mt-0.5">MRR (Revenue Mensuel)</p>
                  </div>
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <DollarSign className="h-5 w-5 text-blue-600 mb-2" />
                    <p className="text-2xl font-black text-slate-900">{billingSummary.collectedThisMonth.toFixed(2)} TND</p>
                    <p className="text-xs font-bold text-blue-700 mt-0.5">Encaissé ce mois</p>
                  </div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                    <BarChart3 className="h-5 w-5 text-violet-600 mb-2" />
                    <p className="text-2xl font-black text-slate-900">{billingSummary.collectedThisYear.toFixed(2)} TND</p>
                    <p className="text-xs font-bold text-violet-700 mt-0.5">Encaissé cette année</p>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <AlertCircle className="h-5 w-5 text-amber-600 mb-2" />
                    <p className="text-2xl font-black text-slate-900">{billingSummary.pendingInvoices.toFixed(2)} TND</p>
                    <p className="text-xs font-bold text-amber-700 mt-0.5">Factures en attente</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => setShowInvoiceModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#257C86] hover:bg-[#1e626b] text-white text-sm font-bold rounded-xl transition cursor-pointer">
                  <Plus className="h-4 w-4" />
                  Nouvelle Facture
                </button>
                <button onClick={() => onNavigate?.('pricing')}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-[#257C86]/40 hover:text-[#257C86] text-slate-600 text-sm font-bold rounded-xl transition cursor-pointer">
                  <Layers className="h-4 w-4" />
                  Tarifs Modules
                </button>
              </div>

              {/* Invoices */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-[#257C86]" />
                  Factures Récentes
                </h3>
                {invoices.length === 0 ? (
                  <p className="text-center py-12 text-slate-400 text-sm font-bold">Aucune facture</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs font-bold text-slate-600 border-b border-slate-200">
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
                        {invoices.map(inv => {
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
                            <tr key={inv.id} className="hover:bg-slate-50">
                              <td className="py-3 px-3 font-mono text-xs">{inv.invoiceNumber}</td>
                              <td className="py-3 px-3 font-black text-slate-900">{inv.centerName}</td>
                              <td className="py-3 px-3 text-slate-600 text-xs">
                                {new Date(inv.periodStart).toLocaleDateString('fr')} – {new Date(inv.periodEnd).toLocaleDateString('fr')}
                              </td>
                              <td className="py-3 px-3 font-black text-slate-900">{inv.amount.toFixed(2)} TND</td>
                              <td className="py-3 px-3">
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusColors[inv.status]}`}>
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
        <motion.div key="pricing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

          {/* Year selector */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="inline-flex items-center p-1.5 bg-white border border-slate-200 rounded-2xl">
              {[0, 1].map(offset => {
                const y = new Date().getFullYear();
                const base = new Date().getMonth() >= 8 ? y : y - 1;
                const year = `${base + offset}/${base + offset + 1}`;
                const active = priceYear === year;
                return (
                  <button key={year} onClick={() => setPriceYear(year)}
                    className={`px-5 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${active ? 'bg-[#257C86] text-white shadow-md shadow-[#257C86]/25' : 'text-slate-500 hover:text-slate-800'}`}>
                    {year}
                  </button>
                );
              })}
            </div>
            <button onClick={savePrices} disabled={savingPrices || pricesLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#257C86] hover:bg-[#1e626b] text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-60">
              {savingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Sauvegarder les tarifs
            </button>
          </div>

          {pricesLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-5">

              {/* Base plan card */}
              <div className="rounded-2xl bg-gradient-to-br from-[#257C86] to-[#1e626b] text-white p-6 shadow-xl shadow-[#257C86]/25 relative overflow-hidden">
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
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                <h3 className="text-sm font-black text-slate-900 mb-1">Prix des modules additionnels</h3>
                <p className="text-xs text-slate-500 font-semibold mb-5">
                  Ces tarifs servent au calcul automatique du prix d’un centre selon ses modules activés — année {priceYear}.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {ALL_MODULES.map(m => {
                    const base = isBaseModule(m.key);
                    return (
                      <div key={m.key}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${base ? 'border-[#257C86]/30 bg-[#257C86]/[0.05]' : 'border-slate-200 bg-white'}`}>
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
                          <input
                            type="number" step="0.5" min="0"
                            value={priceList[m.key] ?? 0}
                            onChange={e => setPriceList(p => ({ ...p, [m.key]: Number(e.target.value) }))}
                            className="w-20 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm font-black text-right text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#257C86]/30 focus:border-[#257C86]/50 bg-white"
                          />
                          <span className="text-[10px] font-bold text-slate-400">TND/mois</span>
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
        {editModulesCenter && (
          <EditModulesModal
            center={editModulesCenter}
            onClose={() => setEditModulesCenter(null)}
            onSaved={load}
          />
        )}
        {showInvoiceModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvoiceModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <h2 className="text-base font-black text-slate-900 mb-4">Nouvelle Facture</h2>
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
                  <label className="block text-xs font-bold text-slate-600 mb-1">Centre</label>
                  <select name="centerId" required className={inputCls}>
                    {centers.filter(c => c.status !== 'trial').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Montant (TND)</label>
                  <input type="number" name="amount" step="0.01" required className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Début période</label>
                    <input type="date" name="periodStart" required className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Fin période</label>
                    <input type="date" name="periodEnd" required className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Notes</label>
                  <textarea name="notes" rows={2} className={inputCls}></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowInvoiceModal(false)} className="px-4 py-2 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer">Annuler</button>
                  <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-[#257C86] rounded-xl hover:bg-[#1e626b] transition cursor-pointer">Créer</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {editInvoice && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditInvoice(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <h2 className="text-base font-black text-slate-900 mb-4">Modifier Facture {editInvoice.invoiceNumber}</h2>
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
                  <label className="block text-xs font-bold text-slate-600 mb-1">Statut</label>
                  <select name="status" defaultValue={editInvoice.status} className={inputCls}>
                    <option value="pending">En attente</option>
                    <option value="paid">Payée</option>
                    <option value="overdue">En retard</option>
                    <option value="cancelled">Annulée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Méthode paiement</label>
                  <input type="text" name="paymentMethod" defaultValue={editInvoice.paymentMethod || ''} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Notes</label>
                  <textarea name="notes" rows={2} defaultValue={editInvoice.notes} className={inputCls}></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setEditInvoice(null)} className="px-4 py-2 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer">Annuler</button>
                  <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-[#257C86] rounded-xl hover:bg-[#1e626b] transition cursor-pointer">Sauvegarder</button>
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
        message={`Supprimer la demande de "${deleteRequest?.fullName}" ?`}
        onConfirm={handleDeleteRequest}
        onCancel={() => setDeleteRequest(null)}
      />
    </div>
  );
}
