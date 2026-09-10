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
    const del = screen.getByRole('button', { name: /Supprimer le plan/ }) as unknown as HTMLButtonElement;
    expect(del.disabled).toBe(true);
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
