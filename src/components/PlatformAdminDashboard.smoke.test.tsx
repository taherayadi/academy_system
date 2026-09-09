import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
