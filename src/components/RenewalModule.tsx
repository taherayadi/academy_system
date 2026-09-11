import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  RefreshCw, CheckCircle2, XCircle, Clock, History, Send, Loader2,
  ArrowUpCircle, Wallet, CalendarClock, Package, Info
} from 'lucide-react';
import { fetchPublicModulePricesApi, fetchRenewalRequestsApi, createRenewalRequestApi } from '../api';
import type { CenterTenant, PlanHistoryEntry, RenewalRequest } from '../types';
import {
  ADDON_MODULES, BASE_MODULES, PLAN_TIERS, ANNUAL_DISCOUNT, isPlanUpgrade,
  derivePlanFromModules, modulesForPlan, modulesPrice, planLabel, totalForCycle
} from '../utils/pricing';
import { daysUntil, formatDate, relativeDays } from '../utils/dates';
import { useToast } from './Toast';

const STATUS_META: Record<string, { label: string; labelAr: string; cls: string; icon: any }> = {
  pending: { label: 'En attente', labelAr: 'قيد المعالجة', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  approved: { label: 'Acceptée', labelAr: 'مقبولة', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  rejected: { label: 'Refusée', labelAr: 'مرفوضة', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
};

const STATUS_ORDER: Record<string, string> = { trial: 'Essai', active: 'Actif', suspended: 'Suspendu', expired: 'Expiré' };

/** Libellés lisibles de l'historique des plans (jamais la clé technique brute). */
const HISTORY_LABELS: Record<string, string> = {
  center_created: 'Création du centre',
  plan_set: 'Plan défini',
  plan_applied: 'Plan appliqué',
  plan_scheduled: 'Plan programmé',
  schedule_cancelled: 'Programmation annulée',
  plan_settled: 'Facture réglée',
  plan_removed: 'Plan retiré',
  trial_added: 'Jours d’essai ajoutés',
  renewal_approved: 'Renouvellement accepté',
  renewal_upgrade: 'Changement d’offre accepté',
};
const historyLabel = (action: string) => HISTORY_LABELS[action] || action.replace(/_/g, ' ');

/**
 * Module « Renouvellement » du centre :
 *   1. l'offre actuelle et le temps restant ;
 *   2. le simulateur de plan (même catalogue et mêmes prix que la vitrine) ;
 *   3. l'envoi d'une demande de renouvellement ou de passage à l'offre
 *      supérieure (Basic → Growth → Pro) ;
 *   4. l'historique de ses demandes et celui de ses plans.
 */
export default function RenewalModule({ center }: { center?: CenterTenant | null }) {
  const toast = useToast();

  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricingLoading, setPricingLoading] = useState(true);
  const [requests, setRequests] = useState<RenewalRequest[]>([]);
  const [history, setHistory] = useState<PlanHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const currentPlan = String(center?.plan || 'starter');
  const [cycle, setCycle] = useState<'monthly' | 'annual'>(
    String(center?.billingCycle) === 'annual' ? 'annual' : 'monthly'
  );
  const [selected, setSelected] = useState<string[]>(() => {
    const current = (center?.enabledModules as string[] | undefined) || [];
    return current.length > 0 ? current : modulesForPlan(currentPlan);
  });
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // useToast() renvoie un nouvel objet à chaque rendu lorsqu'aucun
  // ToastProvider ne l'entoure : on passe par une ref pour garder `load`
  // stable, sinon l'effet de chargement se relancerait en boucle.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRenewalRequestsApi();
      setRequests(data.requests || []);
      setHistory(data.history || []);
    } catch (err) {
      toastRef.current.error(err instanceof Error ? err.message : 'خطأ في جلب الطلبات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetchPublicModulePricesApi()
      .then(p => setPrices(p || {}))
      .catch(() => setPrices({}))
      .finally(() => setPricingLoading(false));
  }, [load]);

  const renewalDate = center?.status === 'trial' ? center?.trialEndsAt : center?.subscriptionEndsAt;
  const daysLeft = daysUntil(renewalDate);
  const pricesReady = Object.keys(prices).length > 0;

  const monthly = useMemo(() => modulesPrice(selected, prices), [selected, prices]);
  // L'offre se déduit des modules cochés : base seule → Basic, un module de
  // plus → Growth, tous les modules → Pro.
  const tier = useMemo(() => derivePlanFromModules(selected), [selected]);
  // Règlement annuel : 12 mois moins 20 %.
  const total = totalForCycle(monthly, cycle);

  const isUpgrade = isPlanUpgrade(currentPlan, tier);
  const now = Date.now();
  const currentEnd = Number(center?.subscriptionEndsAt) || 0;
  const effectiveAt = isUpgrade ? now : (currentEnd > now ? currentEnd : now);

  const toggleModule = (key: string) =>
    setSelected(cur => (cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]));

  // Choisir une offre charge son préréglage ; l'offre affichée est ensuite
  // recalculée à partir des modules réellement cochés.
  const chooseTier = (key: string) => setSelected(modulesForPlan(key));

  const submit = async () => {
    setSubmitting(true);
    try {
      await createRenewalRequestApi({
        kind: isUpgrade ? 'upgrade' : 'renewal',
        requestedPlan: tier,
        requestedModules: selected,
        billingCycle: cycle,
        amount: pricesReady ? total : null,
        note: note.trim() || undefined,
      });
      toast.success(
        isUpgrade
          ? 'Demande de changement d’offre envoyée.'
          : 'Demande de renouvellement envoyée.'
      );
      setNote('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de l’envoi de la demande.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* ─── En-tête ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#257C86] to-[#1e626b] p-6 text-white shadow-lg shadow-[#257C86]/25">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <RefreshCw className="h-5 w-5" />
              Renouvellement
              <span className="text-sm font-bold opacity-80">التجديد</span>
            </h2>
            <p className="mt-1 text-xs font-semibold text-white/80">
              Consultez votre offre, simulez la suite et envoyez votre demande à la plateforme.
            </p>
          </div>
          <div className="rounded-2xl bg-white/15 px-4 py-2 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Offre actuelle</p>
            <p className="text-base font-black">{planLabel(currentPlan)}</p>
          </div>
        </div>
      </div>

      {/* ─── Offre actuelle + temps restant ───────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
            <Wallet className="h-3.5 w-3.5" /> Offre actuelle
          </p>
          <p className="mt-2 text-xl font-black text-slate-900">{planLabel(currentPlan)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {STATUS_ORDER[String(center?.status || '')] || '—'}
            {center?.billingCycle ? ` · ${center.billingCycle === 'annual' ? 'annuel' : 'mensuel'}` : ''}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
            <CalendarClock className="h-3.5 w-3.5" /> Temps restant
          </p>
          <p className="mt-2 text-xl font-black text-slate-900">
            {daysLeft === null ? '—' : daysLeft < 0 ? 'Échu' : `${daysLeft} jour${daysLeft > 1 ? 's' : ''}`}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Échéance : {formatDate(renewalDate)}</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
            <Package className="h-3.5 w-3.5" /> Modules actifs
          </p>
          <p className="mt-2 text-xl font-black text-slate-900">
            {((center?.enabledModules as string[] | undefined) || []).length}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">sur {BASE_MODULES.length + ADDON_MODULES.length} disponibles</p>
        </div>
      </div>

      {/* ─── Simulateur ──────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Simulateur de plan</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Choisissez une offre, ajustez les modules et le cycle : le tarif se met à jour immédiatement.
        </p>

        {/* Offres */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PLAN_TIERS.map(t => {
            const active = tier === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => chooseTier(t.key)}
                className={`cursor-pointer rounded-2xl border-2 p-4 text-right transition ${
                  active ? 'border-[#257C86] bg-[#257C86]/5' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-900">{t.label}</span>
                  {isPlanUpgrade(currentPlan, t.key) && (
                    <ArrowUpCircle className="h-4 w-4 text-[#257C86]" aria-label="Offre supérieure" />
                  )}
                </div>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400" dir="rtl">{t.labelAr}</p>
                <p className="mt-2 text-[11px] font-semibold leading-snug text-slate-500">{t.hint}</p>
              </button>
            );
          })}
        </div>

        {/* Cycle */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Cycle</span>
          {(['monthly', 'annual'] as const).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-[11px] font-black transition ${
                cycle === c ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {c === 'monthly' ? 'Mensuel' : 'Annuel'}
            </button>
          ))}
        </div>

        {/* Modules */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {BASE_MODULES.map(m => (
            <div key={m.key} className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <input type="checkbox" checked disabled className="accent-[#257C86]" />
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{m.label}</span>
              <span className="shrink-0 text-[10px] font-black text-slate-400">Inclus</span>
            </div>
          ))}
          {ADDON_MODULES.map(m => {
            const on = selected.includes(m.key);
            return (
              <label
                key={m.key}
                className={`flex cursor-pointer items-center gap-2.5 rounded-2xl border-2 px-3 py-2 transition ${
                  on ? 'border-[#257C86] bg-[#257C86]/5' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleModule(m.key)}
                  className="accent-[#257C86]"
                />
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{m.label}</span>
                <span className="shrink-0 text-[10px] font-black text-[#257C86]">
                  {pricesReady ? `+${prices[m.key] ?? 0} TND` : pricingLoading ? '…' : '—'}
                </span>
              </label>
            );
          })}
        </div>

        {/* Total + envoi */}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-slate-50 p-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total simulé</p>
            <p className="text-2xl font-black text-[#257C86]">
              {pricesReady ? `${total} TND` : pricingLoading ? '…' : '—'}
              <span className="mr-1 text-xs font-bold text-slate-400">
                {cycle === 'annual' ? '/ an' : '/ mois'}
              </span>
            </p>
            {cycle === 'annual' && pricesReady && monthly > 0 && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span className="line-through">{monthly * 12} TND</span>
                <span className="rounded-full bg-[#257C86]/10 px-1.5 py-0.5 text-[10px] font-black text-[#257C86]">
                  −{Math.round(ANNUAL_DISCOUNT * 100)} %
                </span>
                soit {Math.round(total / 12)} TND/mois
              </p>
            )}
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              {isUpgrade
                ? 'Passage à une offre supérieure — appliqué dès l’acceptation.'
                : `Renouvellement — appliqué le ${formatDate(effectiveAt)}.`}
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:max-w-sm">
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Remarque pour la plateforme (optionnel)"
              className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-[#257C86]"
            />
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#257C86] to-[#1e626b] px-4 py-2.5 text-xs font-black text-white shadow-md shadow-[#257C86]/25 transition hover:shadow-lg disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isUpgrade ? 'Demander le changement d’offre' : 'Demander le renouvellement'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Mes demandes ────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <History className="h-4 w-4 text-[#257C86]" />
          Mes demandes de renouvellement
          <span className="text-xs font-bold text-slate-400">طلباتي</span>
        </h3>

        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#257C86]" /> Chargement…
          </p>
        ) : requests.length === 0 ? (
          <p className="mt-4 text-xs font-semibold text-slate-400">Aucune demande pour le moment.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {requests.map(r => {
              const meta = STATUS_META[r.status] || STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-3"
                >
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${meta.cls}`}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                    <span dir="rtl" className="font-bold opacity-75">{meta.labelAr}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-800">
                      {r.kind === 'upgrade' ? 'Changement d’offre' : 'Renouvellement'} · {planLabel(r.requestedPlan)}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      {r.requestedModules.length} module{r.requestedModules.length > 1 ? 's' : ''} ·{' '}
                      {r.billingCycle === 'annual' ? 'annuel' : 'mensuel'}
                      {r.amount !== null ? ` · ${r.amount} TND` : ''} · {relativeDays(r.createdAt)}
                    </p>
                    {r.decisionNote && (
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">Réponse : {r.decisionNote}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-slate-400">{formatDate(r.createdAt)}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Historique des plans ────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Info className="h-4 w-4 text-[#257C86]" />
          Historique de mes plans
          <span className="text-xs font-bold text-slate-400">سجل الاشتراكات</span>
        </h3>
        {history.length === 0 ? (
          <p className="mt-4 text-xs font-semibold text-slate-400">Aucun historique pour le moment.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {history.map(h => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                <span className="text-xs font-black text-slate-700">{historyLabel(h.action)}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-500">{h.details}</span>
                {h.amount !== null && (
                  <span className="shrink-0 text-[10px] font-black text-[#257C86]">{h.amount} TND</span>
                )}
                <span className="shrink-0 text-[10px] font-bold text-slate-400">{relativeDays(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
