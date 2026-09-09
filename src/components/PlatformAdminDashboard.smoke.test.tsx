import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import PlatformAdminDashboard from './PlatformAdminDashboard';

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
