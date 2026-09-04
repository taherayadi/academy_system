import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, Building2, Users, Clock, AlertTriangle,
  CheckCircle2, PauseCircle, XCircle, Plus, RefreshCw,
  ChevronDown, Mail, Phone, FileText, Loader2,
  CalendarClock, Layers, Trash2, Edit3, Send, Check, X
} from 'lucide-react';
import {
  fetchCentersApi, createCenterApi, updateCenterApi, deleteCenterApi,
  fetchDemoRequestsApi, updateDemoRequestApi, deleteDemoRequestApi
} from '../api';
import { CenterTenant, DemoRequest, ModuleKey } from '../types';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';

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

const STATUS_BADGE: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-red-100 text-red-800',
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

function daysLeft(ts?: number | null): number | null {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / 86400000);
}

function fmtDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-TN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── New Center Modal ──────────────────────────────────────────────────────
interface NewCenterModalProps {
  initialData?: Partial<DemoRequest>;
  convertRequestId?: string;
  onClose: () => void;
  onCreated: () => void;
}

function NewCenterModal({ initialData, convertRequestId, onClose, onCreated }: NewCenterModalProps) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: initialData?.academyName || '',
    slug: '',
    phoneNumber: initialData?.phone || '',
    locationCity: '',
    plan: 'trial' as string,
    directorName: initialData?.fullName || '',
    directorEmail: initialData?.email || '',
    directorPassword: '',
    enabledModules: ALL_MODULES.map(m => m.key) as string[],
  });

  const toggle = (key: string) => {
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
      await createCenterApi({
        ...form,
        convertFromRequestId: convertRequestId
      });
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
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
            <h2 className="text-base font-black text-slate-900">Nouveau Centre</h2>
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
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#257C86]/30">
                <option value="trial">Essai (14 j)</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
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

          {/* Modules */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Modules activés</p>
            <div className="flex flex-wrap gap-2">
              {ALL_MODULES.map(m => (
                <button key={m.key} type="button" onClick={() => toggle(m.key)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                    form.enabledModules.includes(m.key)
                      ? 'bg-[#257C86] text-white border-[#257C86]'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-[#257C86]/40'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
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
  const [enabled, setEnabled] = useState<string[]>(center.enabledModules as string[]);

  const toggle = (key: string) => setEnabled(prev =>
    prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
  );

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
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
        <div className="flex flex-wrap gap-2 mb-6">
          {ALL_MODULES.map(m => (
            <button key={m.key} onClick={() => toggle(m.key)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                enabled.includes(m.key)
                  ? 'bg-[#257C86] text-white border-[#257C86]'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-[#257C86]/40'
              }`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl cursor-pointer">Annuler</button>
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
export default function PlatformAdminDashboard() {
  const toast = useToast();
  const [tab, setTab] = useState<'centers' | 'requests'>('centers');
  const [centers, setCenters] = useState<CenterTenant[]>([]);
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNewCenter, setShowNewCenter] = useState(false);
  const [convertRequest, setConvertRequest] = useState<DemoRequest | null>(null);
  const [editModulesCenter, setEditModulesCenter] = useState<CenterTenant | null>(null);
  const [deleteCenter, setDeleteCenter] = useState<CenterTenant | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DemoRequest | null>(null);

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

  // KPI
  const totalStudents = centers.reduce((s, c) => s + (c.studentCount || 0), 0);
  const activeCenters = centers.filter(c => c.status === 'active').length;
  const trialCenters = centers.filter(c => c.status === 'trial').length;
  const newRequests = requests.filter(r => r.status === 'new').length;

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

  return (
    <div className="space-y-6" dir="ltr">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="p-2.5 bg-[#257C86]/10 rounded-2xl"><ShieldCheck className="h-6 w-6 text-[#257C86]" /></span>
          <div>
            <h1 className="text-xl font-black text-slate-900">Platform Admin</h1>
            <p className="text-xs text-slate-500 font-medium">SaaS Console — Gestion des centres & demandes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition cursor-pointer" title="Actualiser">
            <RefreshCw className={`h-4 w-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowNewCenter(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#257C86] hover:bg-[#1e626b] text-white text-sm font-bold rounded-xl transition cursor-pointer">
            <Plus className="h-4 w-4" />
            Nouveau Centre
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Centres', value: centers.length, icon: Building2, color: 'bg-slate-50 border-slate-200' },
          { label: 'Actifs', value: activeCenters, icon: CheckCircle2, color: 'bg-emerald-50 border-emerald-200' },
          { label: 'En Essai', value: trialCenters, icon: Clock, color: 'bg-amber-50 border-amber-200' },
          { label: 'Élèves Total', value: totalStudents, icon: Users, color: 'bg-blue-50 border-blue-200' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-2xl border p-4 ${kpi.color}`}>
            <kpi.icon className="h-5 w-5 text-slate-400 mb-2" />
            <p className="text-2xl font-black text-slate-900">{kpi.value}</p>
            <p className="text-xs font-bold text-slate-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {([['centers', 'Centres & Abonnements'], ['requests', `Demandes d'Essai${newRequests > 0 ? ` (${newRequests})` : ''}`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-5 py-2 text-sm font-bold rounded-xl transition cursor-pointer ${
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Centers Tab */}
      {tab === 'centers' && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : centers.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">Aucun centre</p>
            </div>
          ) : centers.map(c => {
            const days = daysLeft(c.trialEndsAt);
            return (
              <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="p-2 bg-[#257C86]/10 rounded-xl"><Building2 className="h-5 w-5 text-[#257C86]" /></span>
                    <div>
                      <p className="font-black text-slate-900 text-sm">{c.name}</p>
                      <p className="text-xs text-slate-500 font-medium">{c.adminEmail || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_BADGE[c.status] || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 capitalize">{c.plan}</span>
                    {c.studentCount !== undefined && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                        {c.studentCount} élèves
                      </span>
                    )}
                  </div>
                </div>

                {/* Trial countdown */}
                {c.status === 'trial' && days !== null && (
                  <div className={`mt-3 flex items-center gap-2 text-xs font-bold rounded-xl px-3 py-2 ${
                    days <= 3 ? 'bg-red-50 text-red-700' : days <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
                  }`}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    {days > 0 ? `Essai expire dans ${days} jour${days > 1 ? 's' : ''} (${fmtDate(c.trialEndsAt)})` : 'Essai expiré'}
                  </div>
                )}

                {/* Enabled modules */}
                {Array.isArray(c.enabledModules) && c.enabledModules.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(c.enabledModules as string[]).map(mk => {
                      const found = ALL_MODULES.find(m => m.key === mk);
                      return (
                        <span key={mk} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#257C86]/10 text-[#257C86]">
                          {found?.label || mk}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3">
                  <button onClick={() => handleExtendTrial(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition cursor-pointer flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" /> +14 jours essai
                  </button>
                  <button onClick={() => handleToggleStatus(c)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1 ${
                      c.status === 'suspended'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                    }`}>
                    {c.status === 'suspended' ? <><CheckCircle2 className="h-3.5 w-3.5" /> Activer</> : <><PauseCircle className="h-3.5 w-3.5" /> Suspendre</>}
                  </button>
                  <button onClick={() => setEditModulesCenter(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-[#257C86]/10 text-[#257C86] border border-[#257C86]/20 rounded-xl hover:bg-[#257C86]/20 transition cursor-pointer flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" /> Modules
                  </button>
                  <button onClick={() => setDeleteCenter(c)}
                    className="ml-auto text-[11px] font-bold px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Requests Tab */}
      {tab === 'requests' && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#257C86]" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">Aucune demande reçue</p>
            </div>
          ) : requests.map(req => (
            <motion.div key={req.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-black text-slate-900 text-sm">{req.fullName}</p>
                  <p className="text-xs font-bold text-[#257C86]">{req.academyName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{fmtDate(req.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${REQ_STATUS_BADGE[req.status] || 'bg-slate-100 text-slate-600'}`}>
                    {REQ_STATUS_LABEL[req.status] || req.status}
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">
                    {req.requestType}
                  </span>
                  {req.estimatedSize && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
                      {req.estimatedSize}
                    </span>
                  )}
                </div>
              </div>

              {/* Contact links */}
              <div className="mt-2 flex items-center gap-3">
                {req.email && (
                  <a href={`mailto:${req.email}`}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline">
                    <Mail className="h-3.5 w-3.5" /> {req.email}
                  </a>
                )}
                {req.phone && (
                  <a href={`tel:${req.phone}`}
                    className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline">
                    <Phone className="h-3.5 w-3.5" /> {req.phone}
                  </a>
                )}
              </div>

              {req.message && (
                <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">{req.message}</p>
              )}

              {/* Actions */}
              <div className="mt-3 flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3">
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
                  className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition cursor-pointer">
                  <Building2 className="h-3.5 w-3.5" /> Convertir en Centre
                </button>

                <button onClick={() => setDeleteRequest(req)}
                  className="ml-auto flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer">
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modals */}
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
