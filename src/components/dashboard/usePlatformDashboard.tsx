import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchCentersApi, updateCenterApi, deleteCenterApi, fetchDemoRequestsApi, updateDemoRequestApi, deleteDemoRequestApi, fetchPlatformBillingApi, fetchInvoicesApi, fetchModulePricesApi, updateModulePricesApi, CenterInvoice, ModulePrice, PlatformBillingSummary, fetchAdvertisementsApi, deleteAdvertisementApi, fetchRenewalRequestsApi, decideRenewalRequestApi } from '../../api';
import { CenterTenant, DemoRequest, PlatformAdvertisement, RenewalRequest } from '../../types';
import { openInvoicePrintWindow } from '../../utils/invoicePrint';
import { useToast } from '../Toast';
import { useLiveSync, LIVE_SYNC_INTERVAL_MS } from '../../hooks/useLiveSync';
import { usePubNubSync } from '../../hooks/usePubNubSync';
import { arPlural } from '../../utils/format';
import { currentSchoolYear, adStatusOf, ALL_MODULES, BUNDLED_MODULE_KEY, normalizeCenterType, PAGE_SIZE, PLAN_LABEL, formatTnd } from './constants';
import type { CenterTypeFilter } from './constants';
import type { AdStatus, PlatformAdminPage, PlatformAdminDashboardProps } from './constants';

/** Undo window for deferred destructive commits (ms). Tests may shrink it. */
export let UNDO_WINDOW_MS = 6000;
export const setUndoWindowMs = (ms: number) => { UNDO_WINDOW_MS = ms; };

export function usePlatformDashboard({ page, onNavigate }: PlatformAdminDashboardProps) {
  const toast = useToast();
  /** Defer a destructive commit behind an undo toast; run it when the window lapses. */
  const scheduleWithUndo = useCallback((message: string, run: () => Promise<void> | void) => {
    let cancelled = false;
    const seconds = Math.max(1, Math.round(UNDO_WINDOW_MS / 1000));
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        await run();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'خطأ');
      }
    }, UNDO_WINDOW_MS);
    toast.warning(`${message} — التنفيذ خلال ${seconds} ثوانٍ.`, {
      duration: UNDO_WINDOW_MS + 500,
      action: {
        label: 'تراجع',
        onClick: () => { cancelled = true; clearTimeout(timer); toast.info('تم التراجع — لم يتغير شيء.'); },
      },
    });
  }, [toast]);
  const [centers, setCenters] = useState<CenterTenant[]>([]);
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Filters — centers
  const [centerTypeFilter, setCenterTypeFilter] = useState<CenterTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'trial' | 'active' | 'suspended' | 'expired'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | 'basic' | 'growth' | 'pro' | 'custom'>('all');
  // Filters — requests. No 'Tous' and no 'تم الاتصال' tab: the list always
  // starts on Nouveau (legacy 'contacted' requests stay visible there, so
  // none get lost), then Converti / Archivé.
  const [reqTypeFilter, setReqTypeFilter] = useState<CenterTypeFilter>('all');
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
    if (page === 'renewals' || page === 'overview') {
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
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([fetchCentersApi(), fetchDemoRequestsApi()]);
      setCenters(c);
      setRequests(r);
      setSyncFailed(false);
      setLastSync(Date.now());
    } catch (err) {
      setSyncFailed(true);
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
  /** Bulk approve/reject of renewal requests — one confirmation, then an undo
   *  window before anything is applied. */
  const bulkDecideRenewals = useCallback((ids: string[], decision: 'approved' | 'rejected') => {
    scheduleWithUndo(
      decision === 'approved' ? `سيُقبل ${ids.length} طلبًا ويُطبَّق` : `سيُرفض ${ids.length} طلبًا`,
      async () => {
        let done = 0;
        for (const id of ids) {
          try {
            await decideRenewalRequestApi(id, decision);
            done++;
          } catch { /* counted as failure; reported in the summary toast */ }
        }
        if (done === ids.length) {
          toast.success(decision === 'approved'
            ? `تم قبول ${arPlural(done, 'طلب', 'طلبان', 'طلبات', 'طلب')} وتطبيقه.`
            : `تم رفض ${arPlural(done, 'طلب', 'طلبان', 'طلبات', 'طلب')}.`);
        } else {
          toast.error(`عولج ${done} من ${ids.length} — أعد المحاولة للبقية.`);
        }
        await onRenewalDecided();
      },
    );
  }, [onRenewalDecided, toast, scheduleWithUndo]);
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
  const [invoiceMonthFilter, setInvoiceMonthFilter] = useState<'all' | string>('all');
 // 'YYYY-MM' | 'all'
  const [invoiceCentersPage, setInvoiceCentersPage] = useState(1);
  const INVOICE_GROUPS_PAGE_SIZE = 10;
 // 10 centres par page
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
    const target = deleteCenter;
    setDeleteCenter(null);
    scheduleWithUndo(`سيُحذف «${target.name}» نهائيًا`, async () => {
      await deleteCenterApi(target.id);
      toast.success('تم حذف المركز');
      load();
    });
  };
  const handleDeleteRequest = async () => {
    if (!deleteRequest) return;
    const target = deleteRequest;
    setDeleteRequest(null);
    scheduleWithUndo('سيُحذف هذا الطلب نهائيًا', async () => {
      await deleteDemoRequestApi(target.id);
      toast.success('تم حذف الطلب');
      setRequests(prev => prev.filter(r => r.id !== target.id));
    });
  };
  const handleDeleteAd = async () => {
    if (!deleteAd) return;
    const target = deleteAd;
    setDeleteAd(null);
    scheduleWithUndo(`سيُحذف إعلان «${target.title}»`, async () => {
      await deleteAdvertisementApi(target.id);
      toast.success('تم حذف الإعلان');
      loadAdvertisements();
    });
  };
  const PAGE_META: Record<PlatformAdminPage, { title: string; sub: string }> = {
    overview: { title: 'نظرة عامة', sub: 'نشاط المنصة في الوقت الفعلي' },
    centers: { title: 'المراكز والاشتراكات', sub: `${arPlural(centers.length, 'مركز', 'مركزان', 'مراكز', 'مركزًا')} · ${arPlural(activeCenters, 'نشط', 'نشطان', 'أنشطة', 'نشطًا')}` },
    requests: { title: 'طلبات التجربة', sub: `${arPlural(newRequests, 'طلب جديد', 'طلبان جديدان', 'طلبات جديدة', 'طلبًا جديدًا')} قيد المعالجة` },
    finance: { title: 'المالية (SaaS)', sub: 'الفوترة وإيرادات المنصة' },
    pricing: { title: 'التعريفات والوحدات', sub: `السنة الدراسية ${priceYear}` },
    advertisements: { title: 'الإعلانات', sub: 'البانرات وشرائط العرض للمراكز والواجهة' },
    renewals: { title: 'طلبات التجديد', sub: 'تجديدات المراكز وتغييرات الباقات' },
  };
  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition';

  return {
    page,
    onNavigate,
    lastSync,
    syncFailed,
    bulkDecideRenewals,
    toast,
    centers,
    setCenters,
    requests,
    setRequests,
    loading,
    setLoading,
    search,
    setSearch,
    centerTypeFilter,
    setCenterTypeFilter,
    statusFilter,
    setStatusFilter,
    planFilter,
    setPlanFilter,
    reqTypeFilter,
    setReqTypeFilter,
    reqStatusFilter,
    setReqStatusFilter,
    centersPage,
    setCentersPage,
    requestsPage,
    setRequestsPage,
    listTopRef,
    showNewCenter,
    setShowNewCenter,
    convertRequest,
    setConvertRequest,
    editCenter,
    setEditCenter,
    planCenter,
    setPlanCenter,
    deleteCenter,
    setDeleteCenter,
    deleteRequest,
    setDeleteRequest,
    billingSummary,
    setBillingSummary,
    invoices,
    setInvoices,
    financeLoading,
    setFinanceLoading,
    editInvoice,
    setEditInvoice,
    priceYear,
    setPriceYear,
    priceList,
    setPriceList,
    pricesLoading,
    setPricesLoading,
    savingPrices,
    setSavingPrices,
    knownYears,
    setKnownYears,
    addingYear,
    setAddingYear,
    advertisements,
    setAdvertisements,
    renewalRequests,
    setRenewalRequests,
    renewalsLoading,
    setRenewalsLoading,
    reviewRenewal,
    setReviewRenewal,
    renewalKindFilter,
    setRenewalKindFilter,
    renewalStatusFilter,
    setRenewalStatusFilter,
    adsLoading,
    setAdsLoading,
    adsPage,
    setAdsPage,
    adsStatusFilter,
    setAdsStatusFilter,
    showNewAd,
    setShowNewAd,
    editAd,
    setEditAd,
    deleteAd,
    setDeleteAd,
    loadAdvertisements,
    loadRenewals,
    filteredRenewals,
    visibleAds,
    load,
    onRenewalDecided,
    renewalRequestsRef,
    syncLivePlatform,
    platformRealtime,
    financePageRef,
    financeLoadingRef,
    billingSummaryRef,
    loadFinanceData,
    invoiceSearch,
    setInvoiceSearch,
    invoiceStatusFilter,
    setInvoiceStatusFilter,
    invoiceMonthFilter,
    setInvoiceMonthFilter,
    invoiceCentersPage,
    setInvoiceCentersPage,
    INVOICE_GROUPS_PAGE_SIZE,
    collapsedGroupIds,
    setCollapsedGroupIds,
    invoiceMonths,
    monthLabel,
    filteredInvoices,
    pendingCheques,
    handlePrintInvoice,
    invoiceGroups,
    invoiceGroupsTotalPages,
    safeInvoiceGroupsPage,
    pagedInvoiceGroups,
    loadPrices,
    loadPriceYears,
    priceYears,
    nextSchoolYear,
    addSchoolYear,
    savePrices,
    activeCenters,
    trialCenters,
    newRequests,
    revenueChart,
    q,
    filteredCenters,
    filteredRequests,
    centersTotalPages,
    safeCentersPage,
    pagedCenters,
    requestsTotalPages,
    safeRequestsPage,
    pagedRequests,
    handleToggleStatus,
    handleApplyScheduledPlan,
    handleCancelScheduledPlan,
    handleReqStatus,
    handleDeleteCenter,
    handleDeleteAd,
    scheduleWithUndo,
    handleDeleteRequest,
    PAGE_META,
    inputCls,
  };
}

export type DashboardApi = ReturnType<typeof usePlatformDashboard>;
