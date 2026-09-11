import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PlatformAdminDashboard from './PlatformAdminDashboard';
import type { CenterInvoice } from '../api';

// Every API surface used by the dashboard is mocked; the finance fetches are
// counted to detect the self-triggering fetch-loop regression.
vi.mock('../api', () => ({
  fetchCentersApi: vi.fn().mockResolvedValue([]),
  createCenterApi: vi.fn().mockResolvedValue({ centerId: 'x' }),
  updateCenterApi: vi.fn().mockResolvedValue({ planChange: {} }),
  deleteCenterApi: vi.fn().mockResolvedValue({}),
  uploadPlatformLogoApi: vi.fn().mockResolvedValue(''),
  fetchDemoRequestsApi: vi.fn().mockResolvedValue([]),
  updateDemoRequestApi: vi.fn().mockResolvedValue({}),
  deleteDemoRequestApi: vi.fn().mockResolvedValue({}),
  fetchPlatformBillingApi: vi.fn().mockResolvedValue({
    summary: {
      mrr: 0, collectedThisMonth: 0, collectedThisYear: 0, pendingInvoices: 0,
      overdueInvoices: 0, activeCount: 0, suspendedCount: 0, expiredCount: 0,
      endingSoonCount: 0, overdueCount: 0,
    },
  }),
  fetchInvoicesApi: vi.fn().mockResolvedValue([]),
  createInvoiceApi: vi.fn().mockResolvedValue({}),
  updateInvoiceApi: vi.fn().mockResolvedValue({}),
  deleteInvoiceApi: vi.fn().mockResolvedValue({}),
  fetchModulePricesApi: vi.fn().mockResolvedValue([]),
  updateModulePricesApi: vi.fn().mockResolvedValue({}),
  fetchCenterPlansApi: vi.fn().mockResolvedValue({
    center: {
      id: 'c1', name: 'Jardin Test', status: 'trial', plan: 'starter', billingCycle: 'monthly',
      monthlyPrice: 0, subscriptionEndsAt: null, trialEndsAt: Date.now() + 5 * 86400000, enabledModules: [],
    },
    invoices: [], schedules: [],
  }),
  centerPlanActionApi: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  fetchAdvertisementsApi: vi.fn().mockResolvedValue([]),
  createAdvertisementApi: vi.fn().mockResolvedValue({ success: true, id: 'ADV_1' }),
  updateAdvertisementApi: vi.fn().mockResolvedValue({ success: true }),
  fetchRenewalRequestsApi: vi.fn().mockResolvedValue({ requests: [], history: [] }),
  decideRenewalRequestApi: vi.fn().mockResolvedValue({ success: true }),
  deleteAdvertisementApi: vi.fn().mockResolvedValue({ success: true }),
  uploadMultipleImagesApi: vi.fn().mockResolvedValue([]),
}));

import * as api from '../api';

beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } root = null; rootMargin = ''; thresholds = []; }
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as any).IntersectionObserver = IO;
  (globalThis as any).ResizeObserver = RO;
  window.scrollTo = () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
});

const settle = () => new Promise(resolve => setTimeout(resolve, 300));

describe('PlatformAdminDashboard — Finance data loading', () => {
  it('loads platform billing + invoices exactly once when opening the Finance tab (no fetch loop)', async () => {
    const { rerender } = render(<PlatformAdminDashboard page="finance" onNavigate={() => {}} />);

    await waitFor(() => expect(api.fetchPlatformBillingApi).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.fetchInvoicesApi).toHaveBeenCalledTimes(1));

    // If the loading/summary state re-triggered the effect, more calls would
    // keep arriving — wait and confirm the counts stay at exactly one.
    await settle();
    expect(api.fetchPlatformBillingApi).toHaveBeenCalledTimes(1);
    expect(api.fetchInvoicesApi).toHaveBeenCalledTimes(1);

    // Leaving and re-entering the tab reloads once (fresh invoices appear).
    rerender(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await settle();
    rerender(<PlatformAdminDashboard page="finance" onNavigate={() => {}} />);
    await waitFor(() => expect(api.fetchPlatformBillingApi).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.fetchInvoicesApi).toHaveBeenCalledTimes(2));
    await settle();
    expect(api.fetchPlatformBillingApi).toHaveBeenCalledTimes(2);
    expect(api.fetchInvoicesApi).toHaveBeenCalledTimes(2);
  });

  it('does not re-fetch finance while already sitting on the Finance tab', async () => {
    render(<PlatformAdminDashboard page="finance" onNavigate={() => {}} />);
    await waitFor(() => expect(api.fetchInvoicesApi).toHaveBeenCalledTimes(1));
    await settle();
    expect(api.fetchInvoicesApi).toHaveBeenCalledTimes(1);
  });
});

describe('PlatformAdminDashboard — Finance content (grouped invoices + cheques)', () => {
  const invoices: CenterInvoice[] = [
    {
      id: 'c1-inv-pending', centerId: 'c1', centerName: 'Jardin Alya', invoiceNumber: 'INV-2026-0001',
      periodStart: Date.now() - 5 * 86400000, periodEnd: Date.now() + 25 * 86400000,
      amount: 90, status: 'pending', paymentMethod: 'cheque', chequeNumber: 'CHQ-001', chequeDate: Date.now(),
      notes: '', createdAt: Date.now(),
    },
    {
      id: 'c2-inv-paid', centerId: 'c2', centerName: 'Centre Horizon', invoiceNumber: 'INV-2026-0002',
      periodStart: Date.now() - 5 * 86400000, periodEnd: Date.now() + 25 * 86400000,
      amount: 45, status: 'paid', paymentMethod: 'cash', paymentDate: Date.now(),
      notes: '', createdAt: Date.now(),
    },
  ];

  beforeEach(() => {
    (api.fetchInvoicesApi as ReturnType<typeof vi.fn>).mockResolvedValue(invoices);
  });

  it('groups invoices under their center, shows the pending-cheque table, and no manual invoice creation', async () => {
    render(<PlatformAdminDashboard page="finance" onNavigate={() => {}} />);

    await waitFor(() => expect(screen.getByText('Chèques en attente')).toBeTruthy());
    expect(screen.getByText('CHQ-001')).toBeTruthy();
    expect(screen.getAllByText(/Encaisser/).length).toBeGreaterThan(0);

    // Center group headers + their invoices are rendered
    await waitFor(() => expect(screen.getAllByText('Jardin Alya').length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText('Centre Horizon').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('INV-2026-0001').length).toBeGreaterThanOrEqual(1); // cheque table + center group
    expect(screen.getAllByText('INV-2026-0002').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Chèque en attente').length).toBeGreaterThanOrEqual(1);

    // Manual invoice creation and the Tarifs Modules shortcut are gone
    expect(screen.queryByText('Nouvelle Facture')).toBeNull();
    expect(screen.queryByText('Tarifs Modules')).toBeNull();
  });

  it('groups start expanded, collapse on header click, and print opens a printable window', async () => {
    render(<PlatformAdminDashboard page="finance" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('INV-2026-0002').length).toBeGreaterThanOrEqual(1));

    // Expanded by default: the invoice table of the centre is not hidden.
    const row = screen.getAllByText('INV-2026-0002')[0].closest('tr')!;
    const tableWrap = row.closest('div')!;
    expect(tableWrap.className).not.toContain('hidden');

    // Clicking the centre header collapses the group.
    fireEvent.click(screen.getByRole('button', { name: /Centre Horizon/ }));
    await waitFor(() => expect(tableWrap.className).toContain('hidden'));
    fireEvent.click(screen.getByRole('button', { name: /Centre Horizon/ }));
    await waitFor(() => expect(tableWrap.className).not.toContain('hidden'));

    // Print: window.open is mocked; the printed HTML contains the invoice.
    const written: string[] = [];
    const fakeWin = {
      document: { write: (html: string) => written.push(html), close: () => {} },
      focus: () => {},
      print: () => {},
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWin as any);
    const printBtn = row.querySelector('button[title="Imprimer la facture"]') as HTMLElement;
    fireEvent.click(printBtn);
    expect(openSpy).toHaveBeenCalled();
    const html = written.join('');
    expect(html).toContain('INV-2026-0002');
    expect(html).toContain('Centre Horizon');
    // Browser header/footer (date, title, « blank », page number) suppressed + signature block.
    expect(html).toContain('@page');
    expect(html).toContain('margin: 0');
    expect(html).toContain('Signature de la plateforme SaaS');
    openSpy.mockRestore();
  });

  it('filters grouped invoices by month', async () => {
    (api.fetchInvoicesApi as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'a1', centerId: 'ca', centerName: 'Centre Été', invoiceNumber: 'INV-JUL',
        periodStart: new Date(2026, 6, 3).getTime(), periodEnd: new Date(2026, 6, 31).getTime(),
        amount: 10, status: 'paid', paymentMethod: 'cash', paymentDate: new Date(2026, 6, 5).getTime(),
        notes: '', createdAt: Date.now(),
      },
      {
        id: 'b1', centerId: 'cb', centerName: 'Centre Rentré', invoiceNumber: 'INV-SEP',
        periodStart: new Date(2026, 8, 2).getTime(), periodEnd: new Date(2026, 9, 1).getTime(),
        amount: 20, status: 'paid', paymentMethod: 'cash', paymentDate: new Date(2026, 8, 2).getTime(),
        notes: '', createdAt: Date.now(),
      },
    ]);
    render(<PlatformAdminDashboard page="finance" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('Centre Été').length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText('Centre Rentré').length).toBeGreaterThanOrEqual(1);

    const monthSelect = screen.getByTitle('Filtrer par mois de période facturée') as unknown as HTMLSelectElement;
    expect(Array.from(monthSelect.options).map(o => o.value)).toEqual(expect.arrayContaining(['all', '2026-07', '2026-09']));

    fireEvent.change(monthSelect, { target: { value: '2026-09' } });
    await waitFor(() => expect(screen.queryByText('Centre Été')).toBeNull());
    expect(screen.getAllByText('Centre Rentré').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('INV-SEP').length).toBeGreaterThanOrEqual(1);
  });

  it('paginates the centre groups 10 per page', async () => {
    const many: CenterInvoice[] = Array.from({ length: 12 }, (_, i) => ({
      id: `id-${i}`, centerId: `c-${i}`, centerName: `Centre ${String(i + 1).padStart(2, '0')}`,
      invoiceNumber: `INV-GRP-${i}`, periodStart: Date.now() - 2 * 86400000, periodEnd: Date.now() + 28 * 86400000,
      amount: 30, status: 'paid' as const, paymentMethod: 'cash' as const, paymentDate: Date.now(),
      notes: '', createdAt: Date.now(),
    }));
    (api.fetchInvoicesApi as ReturnType<typeof vi.fn>).mockResolvedValueOnce(many);
    render(<PlatformAdminDashboard page="finance" onNavigate={() => {}} />);

    // Page 1 → 10 of the 12 centres, with the pagination range.
    await waitFor(() => expect(screen.getByText('1–10 sur 12')).toBeTruthy());
    expect(screen.getAllByText('Centre 01').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Centre 11')).toBeNull();
    expect(screen.queryByText('Centre 12')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(screen.getByText('11–12 sur 12')).toBeTruthy());
    expect(screen.getAllByText('Centre 11').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Centre 12').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Centre 01')).toBeNull();
  });
});

describe('PlatformAdminDashboard — Pricing page (school years)', () => {
  // Mirrors currentSchoolYear(): September-based. Years derived from "today" so
  // the test is stable over time (DB holds exactly the current + next year).
  const d = new Date();
  const base = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  const YEAR_CUR = `${base}/${base + 1}`;
  const YEAR_NEXT = `${base + 1}/${base + 2}`;
  const YEAR_ADDED = `${base + 2}/${base + 3}`;

  it('lists the years of the database and adds the next school year with copied prices', async () => {
    // Stateful store mimicking the module_prices upsert semantics.
    const store: Array<{ id: string; school_year: string; module_key: string; price: number; created_at: number }> = [
      { id: 'p1', school_year: YEAR_CUR, module_key: 'scolaire', price: 45, created_at: 0 },
      { id: 'p2', school_year: YEAR_CUR, module_key: 'etude', price: 10, created_at: 0 },
      { id: 'p3', school_year: YEAR_NEXT, module_key: 'scolaire', price: 50, created_at: 0 },
      { id: 'p4', school_year: YEAR_NEXT, module_key: 'etude', price: 12, created_at: 0 },
    ];
    (api.fetchModulePricesApi as ReturnType<typeof vi.fn>).mockImplementation(async (year?: string) =>
      (year ? store.filter(r => r.school_year === year) : store.slice())
    );
    (api.updateModulePricesApi as ReturnType<typeof vi.fn>).mockImplementation(async (year: string, prices: Array<{ module_key: string; price: number }>) => {
      prices.forEach(p => {
        const hit = store.find(r => r.school_year === year && r.module_key === p.module_key);
        if (hit) hit.price = p.price;
        else store.push({ id: `${year}-${p.module_key}`, school_year: year, module_key: p.module_key, price: p.price, created_at: 0 });
      });
    });

    render(<PlatformAdminDashboard page="pricing" onNavigate={() => {}} />);

    // Compact selector: the two stored years are options of one select
    // (no long pill row to clip or overflow, whatever the count).
    const yearSelect = () => screen.getByRole('combobox') as unknown as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(yearSelect().options).map(o => o.value))
        .toEqual(expect.arrayContaining([YEAR_CUR, YEAR_NEXT]))
    );

    // Add-the-next-year button (the year right after the latest stored one).
    const addBtn = screen.getByRole('button', { name: new RegExp(`Ajouter l'année scolaire ${YEAR_ADDED.replace('/', '\\/')}`) });
    fireEvent.click(addBtn);

    // Persists the copied prices (50 for scolaire from the latest year) for the new year…
    await waitFor(() => expect(api.updateModulePricesApi).toHaveBeenCalledWith(YEAR_ADDED, expect.arrayContaining([
      { module_key: 'scolaire', price: 50 },
      { module_key: 'etude', price: 12 },
      { module_key: 'studentTimeSheets', price: 0 }, // Jd. Horaires toujours offert
    ])));
    // …and the new year is selected in the dropdown.
    await waitFor(() => expect(yearSelect().value).toBe(YEAR_ADDED));
  });
});

describe('PlatformAdminDashboard — New center free-days card', () => {
  it('paid plans get a trial-styled free-days card (no yellow « Jours offerts » block)', async () => {
    (api.fetchCentersApi as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Nouveau Centre/ }));

    // Default plan is the trial — its card shows the trial input.
    expect(screen.getByText('Durée de l’essai offert')).toBeTruthy();

    // Switching to Basic must show the SAME component shape for free days.
    const planSelect = Array.from(document.querySelectorAll('select'))
      .find(s => Array.from(s.options).some(o => o.value === 'trial') && Array.from(s.options).some(o => o.value === 'growth'))!;
    fireEvent.change(planSelect, { target: { value: 'basic' } });

    expect(screen.getByText('Durée de l’essai avant l’abonnement')).toBeTruthy();
    expect(screen.queryByText('Jours offerts')).toBeNull();
    expect(screen.queryByText(/sans changer le plan/)).toBeNull();
    // The date row mirrors « Fin de l'essai » from the trial card.
    expect(screen.getByText(/Début de l’abonnement \(0 jour\)/)).toBeTruthy();
    expect(planSelect.parentElement!.parentElement!.querySelector('#new-center-offer-days')).toBeTruthy();
  });
});

describe('PlatformAdminDashboard — Plan manager (Plans & factures)', () => {
  const activeCenter = {
    id: 'c1', name: 'Centre Alpha', slug: 'alpha', status: 'active', plan: 'starter',
    monthlyPrice: 75, billingCycle: 'monthly', trialEndsAt: null,
    subscriptionEndsAt: Date.now() + 20 * 86400000, enabledModules: ['scolaire', 'finance'],
    studentCount: 3, adminEmail: 'a@a.tn', phoneNumber: '11111111', locationCity: 'Tunis',
    centerType: 'jardin', mealOperatingMode: 'external_traiteur', logoUrl: '', createdAt: Date.now(),
  };
  const plansView = {
    center: {
      id: 'c1', name: 'Centre Alpha', status: 'active', plan: 'starter', billingCycle: 'monthly',
      monthlyPrice: 75, subscriptionEndsAt: Date.now() + 20 * 86400000, trialEndsAt: null, enabledModules: [],
    },
    invoices: [{
      id: 'i1', centerId: 'c1', centerName: 'Centre Alpha', invoiceNumber: 'INV-PEND',
      periodStart: Date.now() - 10 * 86400000, periodEnd: Date.now() + 20 * 86400000,
      amount: 75, status: 'pending', notes: '', createdAt: Date.now(),
    }],
    schedules: [],
  };

  beforeEach(() => {
    (api.fetchCentersApi as ReturnType<typeof vi.fn>).mockResolvedValue([activeCenter]);
    (api.fetchCenterPlansApi as ReturnType<typeof vi.fn>).mockResolvedValue(plansView);
  });

  it('the edit-center modal only keeps basic info — no plan fields, no invoice side effects', async () => {
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^Modifier/ }));
    await waitFor(() => expect(screen.getByText('Nom du centre *')).toBeTruthy());
    expect(screen.queryByLabelText('Plan')).toBeNull();
    expect(screen.queryByText('Cycle de facturation')).toBeNull();
    expect(screen.queryByText('Modules activés')).toBeNull();
    // The modal points to the plan manager instead.
    expect(screen.getByText(/« Plans & factures »/)).toBeTruthy();

    // Saving identity fields never sends plan fields.
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.updateCenterApi).toHaveBeenCalled());
    const payload = (api.updateCenterApi as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.plan).toBeUndefined();
    expect(payload.billingCycle).toBeUndefined();
    expect(payload.autoCalculatePrice).toBeUndefined();
  });

  it('plan manager: mid-period increase shows the prorated settlement and submits via the plan-change engine', async () => {
    // Growth = scolaire 40 + finance 40 → 80/mois > the center's stored 75: hausse.
    (api.fetchModulePricesApi as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { module_key: 'scolaire', price: 40 },
      { module_key: 'finance', price: 40 },
    ]);
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Plans & factures/ }));
    await waitFor(() => expect(screen.getByText(/INV-PEND/)).toBeTruthy());
    expect(screen.getByText('Fenêtre non payée')).toBeTruthy();

    // Growth with priced modules (80/mois) beats the stored 75 → hausse.
    fireEvent.click(screen.getByRole('button', { name: /Modifier le plan/ }));
    // Growth = modules selectable, tariff computed live.
    fireEvent.change(screen.getByTitle('Plan du centre'), { target: { value: 'growth' } });
    expect(screen.getByText('Modules à activer')).toBeTruthy();

    // Price increase while the (unpaid) window runs → settlement panel.
    await waitFor(() => expect(screen.getByText(/Changement en cours de période/)).toBeTruthy());
    expect(screen.getByText(/Période pas encore payée/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le plan/ }));
    await waitFor(() => expect(api.updateCenterApi).toHaveBeenCalledWith('c1', expect.objectContaining({
      plan: 'growth',
      autoCalculatePrice: true,
      settlementPolicy: 'unpaid',
    })));
    // The manager never calls the simple set-plan action for a live window.
    expect(api.centerPlanActionApi).not.toHaveBeenCalled();
    // The center list is refreshed after the plan action.
    const centersCalls = (api.fetchCentersApi as ReturnType<typeof vi.fn>).mock.calls;
    expect(centersCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('plan manager: a paid invoice covering the subscription (even future-starting) is shown as paid, not « Sans facture »', async () => {
    const DAY = 86400000;
    (api.fetchCenterPlansApi as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      center: {
        id: 'c1', name: 'Centre Alpha', status: 'active', plan: 'starter', billingCycle: 'monthly',
        monthlyPrice: 30, subscriptionEndsAt: Date.now() + 30 * DAY, trialEndsAt: null,
        enabledModules: ['scolaire', 'finance', 'studentTimeSheets'],
      },
      // Activation during the trial → the paid window starts in 2 days.
      invoices: [{
        id: 'i2', centerId: 'c1', centerName: 'Centre Alpha', invoiceNumber: 'INV-FUT',
        periodStart: Date.now() + 2 * DAY, periodEnd: Date.now() + 32 * DAY,
        amount: 30, status: 'paid', paymentDate: Date.now(), notes: '', createdAt: Date.now(),
      }],
      schedules: [],
    });
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Plans & factures/ }));

    await waitFor(() => expect(screen.getByText('Fenêtre payée')).toBeTruthy());
    expect(screen.queryByText('Sans facture')).toBeNull();
    expect(screen.getByText(/INV-FUT.* payée · 30\.00 TND/)).toBeTruthy();
  });

  it('plan manager: add trial period submits the days and lands back on the view', async () => {
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Plans & factures/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Supprimer le plan/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Ajouter une période d.essai/ }));
    fireEvent.change(screen.getByLabelText('Nombre de jours'), { target: { value: '7' } });
    // Window started 10 days ago → the offer is appended at the END.
    expect(screen.getByText(/ajoutés à la FIN/)).toBeTruthy();
    expect(screen.getByText(/nouvelle échéance le/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Ajouter l.essai \(7 j\)/ }));
    await waitFor(() => expect(api.centerPlanActionApi).toHaveBeenCalledWith({
      action: 'add-trial', centerId: 'c1', days: 7,
    }));
    // After saving, the form closes and the manager reloads.
    await waitFor(() => expect(screen.queryByLabelText('Nombre de jours')).toBeNull());
    expect(screen.getByRole('button', { name: /Supprimer le plan/ })).toBeTruthy();
  });

  it('plan manager: remove-plan asks for confirmation, expires the center and closes the dialog', async () => {
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Plans & factures/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Supprimer le plan/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Supprimer le plan/ }));
    // Custom confirmation dialog first.
    expect(screen.getByText('Supprimer ce plan ?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Oui, supprimer le plan' }));

    await waitFor(() => expect(api.centerPlanActionApi).toHaveBeenCalledWith({ action: 'remove-plan', centerId: 'c1' }));
    // After confirming, the whole Plans & factures dialog dismisses itself.
    await waitFor(() => expect(screen.queryByText('Supprimer le plan')).toBeNull());
    expect(screen.queryByText('Supprimer ce plan ?')).toBeNull();
  });

  it('plan manager: an expired center shows « Expiré » instead of « Sans facture », delete disabled', async () => {
    const DAY = 86400000;
    (api.fetchCenterPlansApi as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      center: {
        id: 'c1', name: 'Centre Alpha', status: 'expired', plan: 'starter', billingCycle: 'monthly',
        monthlyPrice: 75, subscriptionEndsAt: Date.now() - 5 * DAY, trialEndsAt: null, enabledModules: [],
      },
      invoices: [], schedules: [],
    });
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Plans & factures/ }));

    await waitFor(() => expect(screen.getByText(/Abonnement expiré le/)).toBeTruthy());
    expect(screen.queryByText('Sans facture')).toBeNull();
    // No trial offer without a live subscription; relaunch first.
    expect(screen.queryByRole('button', { name: /Ajouter une période d.essai/ })).toBeNull();
    const del = screen.getByRole('button', { name: /Supprimer le plan/ }) as unknown as HTMLButtonElement;
    expect(del.disabled).toBe(true);
  });

  it('center cards: « Modules » became the single Plans & factures entry', async () => {
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());

    // The Modules shortcut is gone — and there is exactly ONE plan button.
    expect(screen.queryByRole('button', { name: 'Modules' })).toBeNull();
    const planBtns = screen.getAllByRole('button', { name: /Plans & factures/ });
    expect(planBtns).toHaveLength(1);

    // It opens the plan manager (same functionality as before, new look).
    fireEvent.click(planBtns[0]);
    await waitFor(() => expect(api.fetchCenterPlansApi).toHaveBeenCalledWith('c1'));
  });

  it('plan manager: a center expired mid-window (plan just removed) blocks delete and relaunches via set-plan', async () => {
    const DAY = 86400000;
    (api.fetchCenterPlansApi as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      center: {
        id: 'c1', name: 'Centre Alpha', status: 'expired', plan: 'starter', billingCycle: 'monthly',
        monthlyPrice: 75, subscriptionEndsAt: Date.now() + 10 * DAY, trialEndsAt: null, enabledModules: [],
      },
      invoices: [{
        id: 'i9', centerId: 'c1', centerName: 'Centre Alpha', invoiceNumber: 'INV-LATE',
        periodStart: Date.now() - 3 * DAY, periodEnd: Date.now() + 10 * DAY,
        amount: 75, status: 'pending', notes: '', createdAt: Date.now(),
      }],
      schedules: [],
    });
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Plans & factures/ }));

    // The removal keeps the old future end date — 'expired' must win.
    await waitFor(() => expect(screen.getByText(/Abonnement supprimé le/)).toBeTruthy());
    expect(screen.queryByText('Fenêtre non payée')).toBeNull();
    expect(screen.queryByText('Fenêtre payée')).toBeNull();
    expect(screen.queryByRole('button', { name: /Ajouter une période d.essai/ })).toBeNull();
    expect((screen.getByRole('button', { name: /Supprimer le plan/ }) as unknown as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Programmer un plan/ }) as unknown as HTMLButtonElement).disabled).toBe(true);

    // Relaunching must go through set-plan (which re-activates), never the
    // mid-period engine (which would leave the center expired).
    fireEvent.click(screen.getByRole('button', { name: /Relancer un abonnement/ }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le plan/ }));
    await waitFor(() => expect(api.centerPlanActionApi).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'set-plan', centerId: 'c1' })
    ));
    expect(api.updateCenterApi).not.toHaveBeenCalled();
  });

  it('plan manager: the per-center plan history table renders audit entries', async () => {
    const DAY = 86400000;
    (api.fetchCenterPlansApi as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...plansView,
      history: [
        { id: 'h1', action: 'plan_removed', details: 'Abonnement supprimé — factures en attente annulées.', amount: null, invoiceNumber: null, createdAt: Date.now() },
        { id: 'h2', action: 'plan_set', details: 'Plan Growth (mensuel) appliqué', amount: 80, invoiceNumber: 'INV-2026-AB12', createdAt: Date.now() - 2 * DAY },
      ],
    });
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Plans & factures/ }));

    await waitFor(() => expect(screen.getByText(/Historique des plans \(2\)/)).toBeTruthy());
    expect(screen.getByText('Abonnement annulé')).toBeTruthy();
    expect(screen.getByText('Plan appliqué')).toBeTruthy();
    expect(screen.getByText(/INV-2026-AB12/)).toBeTruthy();
  });
});

describe('PlatformAdminDashboard — Center cards', () => {
  it('a trial card no longer shows the amber « +14 jours d’essai » shortcut (handled in Plans & factures)', async () => {
    (api.fetchCentersApi as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{
      id: 'ct', name: 'Centre Beta', slug: 'beta', status: 'trial', plan: 'starter',
      monthlyPrice: 0, billingCycle: 'monthly', trialEndsAt: Date.now() + 5 * 86400000,
      subscriptionEndsAt: null, enabledModules: [], studentCount: 2,
      adminEmail: 'b@b.tn', phoneNumber: '22222222', locationCity: 'Sousse',
      centerType: 'jardin', mealOperatingMode: 'external_traiteur', logoUrl: '', createdAt: Date.now(),
    }]);
    render(<PlatformAdminDashboard page="centers" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Centre Beta')).toBeTruthy());

    expect(screen.queryByRole('button', { name: /jours d.essai/ })).toBeNull();
    expect(screen.queryByText('+14')).toBeNull();
  });
});


describe('PlatformAdminDashboard — Demo requests tab', () => {
  const reqNew = {
    id: 'r1', requestType: 'demo' as const, fullName: 'Aya Ben', academyName: 'alpha center',
    email: 'alpha@test.tn', phone: '11111111', centerType: 'jardin', status: 'new' as const,
    createdAt: Date.now(),
  };
  const reqConverted = {
    id: 'r2', requestType: 'trial' as const, fullName: 'Zied Kac', academyName: 'zeta center',
    email: 'zeta@test.tn', phone: '22222222', centerType: 'formation', status: 'converted' as const,
    createdAt: Date.now(),
  };
  const reqContacted = {
    id: 'r3', requestType: 'demo' as const, fullName: 'Old Rec', academyName: 'iota center',
    email: 'iota@test.tn', phone: '33333333', centerType: 'jardin', status: 'contacted' as const,
    createdAt: Date.now(),
  };

  beforeEach(() => {
    (api.fetchDemoRequestsApi as ReturnType<typeof vi.fn>).mockResolvedValue([reqNew, reqConverted, reqContacted]);
  });

  it('starts on the New filter, has no "Tous" and no "Contacté" tab (legacy contacted stays visible under New)', async () => {
    render(<PlatformAdminDashboard page="requests" onNavigate={() => {}} />);

    await waitFor(() => expect(screen.getByText('alpha@test.tn')).toBeTruthy());
    expect(screen.getByText('iota@test.tn')).toBeTruthy(); // contacted shows in the New bucket
    // Converted request is hidden until its status tab is selected.
    expect(screen.queryByText('zeta@test.tn')).toBeNull();
    // The only « Tous » left on the page is the establishment-type filter.
    expect(screen.getAllByRole('button', { name: 'Tous' })).toHaveLength(1);
    // The « Contacté » filter no longer exists at all.
    expect(screen.queryByRole('button', { name: 'Contacté' })).toBeNull();
  });

  it('converted requests can only be archived — never converted again', async () => {
    render(<PlatformAdminDashboard page="requests" onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Converti' }));

    await waitFor(() => expect(screen.getByText('zeta@test.tn')).toBeTruthy());
    expect(screen.queryByText('Convertir en Centre')).toBeNull();
    expect(screen.getByText('Déjà converti')).toBeTruthy();

    // The locked select offers exactly two values: the current status and Archivé.
    const sel = screen.getByTitle('Demande convertie : seule l’archivation est possible.') as unknown as HTMLSelectElement;
    expect(Array.from(sel.options).map(o => o.value)).toEqual(['converted', 'archived']);

    fireEvent.change(sel, { target: { value: 'archived' } });
    await waitFor(() => expect(api.updateDemoRequestApi).toHaveBeenCalledWith('r2', { status: 'archived' }));
  });

  it('a still-open request keeps its convert action (new and legacy contacted)', async () => {
    render(<PlatformAdminDashboard page="requests" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('alpha@test.tn')).toBeTruthy());
    // Both the new request and the legacy contacted one (shown under New).
    expect(screen.getAllByText('Convertir en Centre')).toHaveLength(2);
  });
});

describe('PlatformAdminDashboard — Advertisements page', () => {
  const alphaCenter = {
    id: 'c1', name: 'Centre Alpha', slug: 'alpha', status: 'active', plan: 'starter',
    monthlyPrice: 75, billingCycle: 'monthly', trialEndsAt: null,
    subscriptionEndsAt: Date.now() + 20 * 86400000, enabledModules: [],
    studentCount: 3, adminEmail: 'a@a.tn', phoneNumber: '11111111', locationCity: 'Tunis',
    centerType: 'jardin', mealOperatingMode: 'external_traiteur', logoUrl: '', createdAt: Date.now(),
  };

  it('opens without crashing — PAGE_META has the advertisements entry (was: undefined.title)', async () => {
    render(<PlatformAdminDashboard page="advertisements" onNavigate={() => {}} />);
    await waitFor(() => expect(api.fetchAdvertisementsApi).toHaveBeenCalled());
    expect(screen.getByText('Publicité')).toBeTruthy();
    expect(screen.getByText('Aucune publicité')).toBeTruthy();
    expect(screen.getByText('Gestion des publicités')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nouvelle publicité/ })).toBeTruthy();
  });

  it('« إعلان جديد » opens the form; submitting creates the advertisement', async () => {
    (api.fetchCentersApi as ReturnType<typeof vi.fn>).mockResolvedValue([alphaCenter]);
    render(<PlatformAdminDashboard page="advertisements" onNavigate={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Nouvelle publicité/ }));
    await waitFor(() => expect(screen.getByText('Nouvelle annonce')).toBeTruthy());

    // Landing page: the center picker is not even shown.
    expect(screen.queryByText(/Centres ciblés/)).toBeNull();

    fireEvent.change(document.getElementById('ad-title') as HTMLInputElement, { target: { value: 'Promo rentrée' } });
    fireEvent.change(document.getElementById('ad-image-url') as HTMLInputElement, { target: { value: 'https://cdn.test/a.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    fireEvent.click(screen.getByRole('button', { name: /Créer l.annonce/ }));

    await waitFor(() => expect(api.createAdvertisementApi).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Promo rentrée',
      location: 'landing_page',
      imageUrls: ['https://cdn.test/a.jpg'],
      centerIds: [],
      isActive: true,
      isPublished: false,
    })));
    await waitFor(() => expect(screen.queryByText('Nouvelle annonce')).toBeNull());
    // List is refreshed after create
    expect((api.fetchAdvertisementsApi as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('cards show French status/location labels and the status filter narrows the list', async () => {
    const now = Date.now();
    const DAY = 86400000;
    (api.fetchAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'a1', title: 'Rentrée', dateStart: now - 2 * DAY, dateEnd: now + 5 * DAY, location: 'landing_page', imageUrls: ['https://cdn.test/1.jpg'], linkUrl: '', priority: 10, isActive: true, isPublished: true, centerIds: [], createdAt: now, updatedAt: now },
      { id: 'a2', title: 'Noël', dateStart: now - 30 * DAY, dateEnd: now - 2 * DAY, location: 'center_admin', imageUrls: ['https://cdn.test/2.jpg'], linkUrl: '', priority: 20, isActive: true, isPublished: true, centerIds: ['c1'], createdAt: now, updatedAt: now },
    ]);
    render(<PlatformAdminDashboard page="advertisements" onNavigate={() => {}} />);

    await waitFor(() => expect(screen.getByText('Rentrée')).toBeTruthy());
    expect(screen.getAllByText('En ligne')).toHaveLength(2); // pastille du filtre + badge de la carte
    expect(screen.getByText('Expirée')).toBeTruthy();        // statut du second
    expect(screen.getByText('Page d’accueil')).toBeTruthy(); // jamais la clé brute
    expect(screen.queryByText('landing_page')).toBeNull();
    expect(screen.getByText('Tableau de bord des centres')).toBeTruthy();

    // Filtre : une seule carte restante.
    fireEvent.click(screen.getByRole('button', { name: /Expirées/ }));
    await waitFor(() => expect(screen.queryByText('Rentrée')).toBeNull());
    expect(screen.getByText('Noël')).toBeTruthy();
    // Et le compteur « Toutes » reflète la liste complète.
    expect(screen.getByRole('button', { name: /Toutes \(2\)/ })).toBeTruthy();
  });

  it('modal: centers required for « Tableau de bord », optional for « both »+custom, never for landing', async () => {
    (api.fetchAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.fetchCentersApi as ReturnType<typeof vi.fn>).mockResolvedValue([alphaCenter]);
    render(<PlatformAdminDashboard page="advertisements" onNavigate={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Nouvelle publicité/ }));
    await waitFor(() => expect(screen.getByText('Nouvelle annonce')).toBeTruthy());

    const loc = () => document.getElementById('ad-location') as unknown as HTMLSelectElement;
    expect(Array.from(loc().options).map(o => o.value)).toEqual(
      expect.arrayContaining(['landing_page', 'center_admin', 'both', '__custom__'])
    );

    // → tableau de bord : le sélecteur apparaît et la validation exige un centre.
    fireEvent.change(loc(), { target: { value: 'center_admin' } });
    expect(screen.getByText(/Centres ciblés \* \(0\)/)).toBeTruthy();
    fireEvent.change(document.getElementById('ad-title') as HTMLInputElement, { target: { value: 'X' } });
    fireEvent.change(document.getElementById('ad-image-url') as HTMLInputElement, { target: { value: 'https://cdn.test/x.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    fireEvent.click(screen.getByRole('button', { name: /Créer l.annonce/ }));
    expect(api.createAdvertisementApi).not.toHaveBeenCalled();

    // un centre coché → OK, et « both » garde le sélecteur
    fireEvent.click(screen.getByRole('checkbox', { name: /Centre Alpha/ }));
    fireEvent.change(loc(), { target: { value: 'both' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer l.annonce/ }));
    await waitFor(() => expect(api.createAdvertisementApi).toHaveBeenCalledWith(expect.objectContaining({
      location: 'both',
      centerIds: ['c1'],
    })));
  });

  it('modal: LTR date fields and multi-select display positions', async () => {
    (api.fetchAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.fetchCentersApi as ReturnType<typeof vi.fn>).mockResolvedValue([alphaCenter]);
    render(<PlatformAdminDashboard page="advertisements" onNavigate={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Nouvelle publicité/ }));
    await waitFor(() => expect(screen.getByText('Nouvelle annonce')).toBeTruthy());

    // Dates never render RTL.
    const dates = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    expect(dates.length).toBeGreaterThanOrEqual(2);
    for (const d of dates) { expect(d.getAttribute('dir')).toBe('ltr'); expect(d.className).toContain('text-left'); }

    // Les deux formats responsives sont proposés.
    const rect = screen.getByRole('button', { name: /^Rectangle/ });
    const interstitial = screen.getByRole('button', { name: /Interstitiel/ });
    expect(rect).toBeTruthy();
    expect(interstitial).toBeTruthy();
    fireEvent.click(rect);
    fireEvent.click(interstitial);

    fireEvent.change(document.getElementById('ad-title') as HTMLInputElement, { target: { value: 'Soldes' } });
    fireEvent.change(document.getElementById('ad-image-url') as HTMLInputElement, { target: { value: 'https://cdn.test/s.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    fireEvent.click(screen.getByRole('button', { name: /Créer l.annonce/ }));

    await waitFor(() => expect(api.createAdvertisementApi).toHaveBeenCalledWith(expect.objectContaining({
      positions: ['rectangle', 'interstitial'],
    })));
  });

  it('modal: the centre picker filters by centre name (case/accent insensitive)', async () => {
    const betaCenter = { ...alphaCenter, id: 'c2', name: 'École Beta', slug: 'beta' };
    const gammaCenter = { ...alphaCenter, id: 'c3', name: 'Institut Gamma', slug: 'gamma' };
    (api.fetchAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.fetchCentersApi as ReturnType<typeof vi.fn>).mockResolvedValue([alphaCenter, betaCenter, gammaCenter]);
    render(<PlatformAdminDashboard page="advertisements" onNavigate={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Nouvelle publicité/ }));
    await waitFor(() => expect(screen.getByText('Nouvelle annonce')).toBeTruthy());

    const loc = () => document.getElementById('ad-location') as unknown as HTMLSelectElement;
    const search = () => document.getElementById('ad-center-search') as HTMLInputElement;
    fireEvent.change(loc(), { target: { value: 'both' } });

    // Les trois centres sont listés.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Centre Alpha/ })).toBeTruthy());
    expect(screen.getByRole('checkbox', { name: /École Beta/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Institut Gamma/ })).toBeTruthy();

    // « ecole », sans accent ni majuscule, trouve « École Beta ».
    fireEvent.change(search(), { target: { value: 'ecole' } });
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Centre Alpha/ })).toBeNull());
    expect(screen.queryByRole('checkbox', { name: /Institut Gamma/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /École Beta/ })).toBeTruthy();
    expect(screen.getByText(/1 centre sur 3/)).toBeTruthy();

    // Aucun résultat → message explicite plutôt qu'une liste vide.
    fireEvent.change(search(), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByText(/Aucun centre ne correspond/)).toBeTruthy());

    // Le filtre se remet à vide et la sélection filtrée part bien à l'API.
    fireEvent.change(search(), { target: { value: 'ecole' } });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /École Beta/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('checkbox', { name: /École Beta/ }));

    fireEvent.change(document.getElementById('ad-title') as HTMLInputElement, { target: { value: 'Campagne Beta' } });
    fireEvent.change(document.getElementById('ad-image-url') as HTMLInputElement, { target: { value: 'https://cdn.test/b.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    fireEvent.click(screen.getByRole('button', { name: /Créer l.annonce/ }));
    await waitFor(() => expect(api.createAdvertisementApi).toHaveBeenCalledWith(expect.objectContaining({
      centerIds: ['c2'],
    })));
  });

  it('edit reuses the form prefilled and PATCHes the advertisement', async () => {
    const ad = {
      id: 'ADV_9', title: 'Cantine', dateStart: Date.now(), dateEnd: Date.now() + 10 * 86400000,
      location: 'center_admin', imageUrls: ['https://cdn.test/b.jpg'], linkUrl: '', priority: 50,
      isActive: true, isPublished: true, centerIds: ['c1'], createdAt: Date.now(), updatedAt: Date.now(),
    };
    (api.fetchAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([ad]);
    (api.fetchCentersApi as ReturnType<typeof vi.fn>).mockResolvedValue([alphaCenter]);
    render(<PlatformAdminDashboard page="advertisements" onNavigate={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    await waitFor(() => expect(screen.getByText('Modifier l’annonce')).toBeTruthy());
    expect((document.getElementById('ad-title') as HTMLInputElement).value).toBe('Cantine');
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les modifications/ }));
    await waitFor(() => expect(api.updateAdvertisementApi).toHaveBeenCalledWith('ADV_9', expect.objectContaining({
      title: 'Cantine', location: 'center_admin', isPublished: true,
    })));
  });
});

describe('PlatformAdminDashboard — Renewal requests page', () => {
  const pendingRequest = {
    id: 'r1', centerId: 'c1', centerName: 'Centre Alpha', kind: 'upgrade',
    currentPlan: 'starter', currentStatus: 'trial', currentModules: ['scolaire'], requestedPlan: 'growth',
    requestedModules: ['scolaire', 'finance', 'etude'], billingCycle: 'monthly',
    amount: 165, status: 'pending', effectiveAt: Date.now(), note: 'On passe à Growth',
    decisionNote: '', decidedBy: '', decidedAt: null,
    createdAt: Date.now() - 86400000, updatedAt: Date.now(),
  };

  it('lists the requests and lets the platform accept one', async () => {
    (api.fetchRenewalRequestsApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      requests: [pendingRequest], history: [],
    });
    render(<PlatformAdminDashboard page="renewals" onNavigate={() => {}} />);

    await waitFor(() => expect(screen.getByText('Centre Alpha')).toBeTruthy());
    expect(screen.getByText('En attente')).toBeTruthy();
    expect(screen.getByText(/On passe à Growth/)).toBeTruthy();
    // « Essai · Basic → Growth »
    expect(screen.getByText(/Essai/)).toBeTruthy();
    expect(screen.getByText('Basic')).toBeTruthy();
    expect(screen.getByText('Growth')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Accepter/ }));

    await waitFor(() => expect(api.decideRenewalRequestApi).toHaveBeenCalledWith('r1', 'approved', ''));
  });

  it('shows an empty state when no center has asked yet', async () => {
    (api.fetchRenewalRequestsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ requests: [], history: [] });
    render(<PlatformAdminDashboard page="renewals" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText('Aucune demande')).toBeTruthy());
  });
});
