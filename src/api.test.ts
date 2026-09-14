import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UnauthorizedError,
  getSessionToken,
  setSessionToken,
  loginRequest,
  logoutRequest,
  changePasswordRequest,
  fetchSessionUserApi,
  fetchCentersApi,
  createCenterApi,
  updateCenterApi,
  deleteCenterApi,
  fetchDemoRequestsApi,
  updateDemoRequestApi,
  deleteDemoRequestApi,
  fetchPlatformBillingApi,
  fetchInvoicesApi,
  createInvoiceApi,
  updateInvoiceApi,
  deleteInvoiceApi,
  fetchModulePricesApi,
  updateModulePricesApi,
  fetchCenterPlansApi,
  centerPlanActionApi,
  fetchAdvertisementsApi,
  createAdvertisementApi,
  updateAdvertisementApi,
  deleteAdvertisementApi,
  fetchRenewalRequestsApi,
  decideRenewalRequestApi,
  uploadPlatformLogoApi,
} from './api';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// UnauthorizedError
// ---------------------------------------------------------------------------
describe('UnauthorizedError', () => {
  it('has correct name and message', () => {
    const err = new UnauthorizedError();
    expect(err.name).toBe('UnauthorizedError');
    expect(err.message).toContain('صلاحية الجلسة');
  });

  it('is an instance of Error', () => {
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Bearer-token compatibility namespace — MUST differ from the center app's
// tc_token so both consoles can coexist in one browser without sharing
// credentials.
// ---------------------------------------------------------------------------
describe('session token namespace', () => {
  it('stores the platform token under tc_platform_token', () => {
    setSessionToken('tok-1');
    expect(localStorage.getItem('tc_platform_token')).toBe('tok-1');
    expect(localStorage.getItem('tc_token')).toBeNull(); // center-app key
    expect(getSessionToken()).toBe('tok-1');
  });

  it('removes the token with null', () => {
    setSessionToken('tok-1');
    setSessionToken(null);
    expect(localStorage.getItem('tc_platform_token')).toBeNull();
    expect(getSessionToken()).toBeNull();
  });

  it('sends the bearer header when a token exists', async () => {
    setSessionToken('tok-9');
    mockFetch.mockResolvedValue(jsonResponse({ centers: [] }));
    await fetchCentersApi();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer tok-9');
  });

  it('omits the bearer header when no token exists', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ centers: [] }));
    await fetchCentersApi();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Auth flows
// ---------------------------------------------------------------------------
describe('loginRequest', () => {
  it('POSTs credentials with cookies included and stores the token', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      token: 'srv-token',
      user: { email: 'sa@p.tn', name: 'SA', role: 'platform_super_admin', description: '' },
    }));
    const { user } = await loginRequest('SA@p.tn ', '  secret '); // passthrough — the server trims
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(opts.method).toBe('POST');
    expect(opts.credentials).toBe('include');
    expect(JSON.parse(opts.body)).toEqual({ email: 'SA@p.tn ', password: '  secret ' });
    expect(user.role).toBe('platform_super_admin');
    expect(localStorage.getItem('tc_platform_token')).toBe('srv-token');
  });

  it('surfaces the server error (401 also for center accounts)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'كلمة السر غير صحيحة' }, 401));
    await expect(loginRequest('boss@center.tn', 'pw')).rejects.toThrow('كلمة السر غير صحيحة');
    expect(localStorage.getItem('tc_platform_token')).toBeNull();
  });
});

describe('logoutRequest', () => {
  it('POSTs /api/auth/logout', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    await logoutRequest();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/logout');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });
});

describe('changePasswordRequest', () => {
  it('sends only current/new passwords (identity comes from the session)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true, sessionsRevoked: true }));
    await changePasswordRequest('old', 'new-strong-1');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/auth/password');
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ currentPassword: 'old', newPassword: 'new-strong-1' });
    expect(body.email).toBeUndefined();
  });

  it('throws UnauthorizedError on 401', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    await expect(changePasswordRequest('a', 'b')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('fetchSessionUserApi', () => {
  it('returns null on 401 (boot must not crash)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    await expect(fetchSessionUserApi()).resolves.toBeNull();
  });

  it('returns the user on 200', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ user: { email: 'a@b.c', role: 'platform_super_admin' } }));
    const res = await fetchSessionUserApi();
    expect(res?.user.role).toBe('platform_super_admin');
  });
});

// ---------------------------------------------------------------------------
// Platform routes — every call must hit /api/… on the SAME origin
// ---------------------------------------------------------------------------
describe('platform route mapping', () => {
  const cases: Array<{ label: string; call: () => Promise<any>; url: string; method?: string }> = [
    { label: 'fetchCentersApi', call: () => fetchCentersApi(), url: '/api/centers' },
    {
      label: 'createCenterApi',
      call: () => createCenterApi({ name: 'C', plan: 'starter', enabledModules: [], directorName: 'D', directorEmail: 'd@x.tn', directorPassword: 'p' }),
      url: '/api/centers',
      method: 'POST',
    },
    { label: 'updateCenterApi', call: () => updateCenterApi('c1', { status: 'suspended' }), url: '/api/centers', method: 'PATCH' },
    { label: 'deleteCenterApi', call: () => deleteCenterApi('c1'), url: '/api/centers?id=c1', method: 'DELETE' },
    { label: 'fetchDemoRequestsApi', call: () => fetchDemoRequestsApi(), url: '/api/demo-requests' },
    { label: 'updateDemoRequestApi', call: () => updateDemoRequestApi('r1', { status: 'contacted' }), url: '/api/demo-requests', method: 'PATCH' },
    { label: 'deleteDemoRequestApi', call: () => deleteDemoRequestApi('r1'), url: '/api/demo-requests?id=r1', method: 'DELETE' },
    { label: 'fetchPlatformBillingApi', call: () => fetchPlatformBillingApi(), url: '/api/platform-billing?mode=summary' },
    { label: 'fetchInvoicesApi', call: () => fetchInvoicesApi({ status: 'pending' }), url: '/api/platform-billing?mode=invoices&status=pending' },
    { label: 'createInvoiceApi', call: () => createInvoiceApi({ centerId: 'c1', amount: 10, periodStart: 1, periodEnd: 2 }), url: '/api/platform-billing', method: 'POST' },
    { label: 'updateInvoiceApi', call: () => updateInvoiceApi('i1', { status: 'paid' }), url: '/api/platform-billing', method: 'PATCH' },
    { label: 'deleteInvoiceApi', call: () => deleteInvoiceApi('i1'), url: '/api/platform-billing?id=i1', method: 'DELETE' },
    { label: 'fetchModulePricesApi', call: () => fetchModulePricesApi(), url: '/api/platform-billing?mode=module-prices' },
    { label: 'updateModulePricesApi', call: () => updateModulePricesApi('2025/2026', []), url: '/api/platform-billing', method: 'POST' },
    { label: 'fetchCenterPlansApi', call: () => fetchCenterPlansApi('c1'), url: '/api/center-plans?centerId=c1' },
    { label: 'centerPlanActionApi', call: () => centerPlanActionApi({ action: 'add-trial', centerId: 'c1', days: 7 }), url: '/api/center-plans', method: 'POST' },
    { label: 'fetchAdvertisementsApi', call: () => fetchAdvertisementsApi(), url: '/api/platform-advertisements' },
    { label: 'createAdvertisementApi', call: () => createAdvertisementApi({ title: 'x' }), url: '/api/platform-advertisements', method: 'POST' },
    { label: 'updateAdvertisementApi', call: () => updateAdvertisementApi('a1', { title: 'y' }), url: '/api/platform-advertisements', method: 'PATCH' },
    { label: 'deleteAdvertisementApi', call: () => deleteAdvertisementApi('a1'), url: '/api/platform-advertisements?id=a1', method: 'DELETE' },
    { label: 'fetchRenewalRequestsApi', call: () => fetchRenewalRequestsApi(), url: '/api/renewal-requests' },
    { label: 'decideRenewalRequestApi', call: () => decideRenewalRequestApi('r1', 'approved'), url: '/api/renewal-requests', method: 'PATCH' },
    { label: 'uploadPlatformLogoApi', call: () => uploadPlatformLogoApi(new File(['x'], 'a.png')), url: '/api/platform-upload-logo', method: 'POST' },
  ];

  it.each(cases)('$label → $url', async ({ call, url, method }) => {
    mockFetch.mockResolvedValue(jsonResponse({ centers: [], requests: [], invoices: [], advertisements: [], prices: [], history: [], success: true, url: 'u', centerId: 'c', invoiceId: 'i', invoiceNumber: 'n' }));
    await call();
    const [calledUrl, opts] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe(url);
    if (method) expect(opts.method).toBe(method);
    expect(calledUrl).toMatch(/^\/api\//); // same-origin only
  });

  it('throws UnauthorizedError on 401 for protected fetches', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    await expect(fetchCentersApi()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(fetchRenewalRequestsApi()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(fetchInvoicesApi()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

// ---------------------------------------------------------------------------
// The removed center surface MUST NOT come back through the client either:
// these exports no longer exist in the SaaS API module.
// ---------------------------------------------------------------------------
describe('center-only API surface removed', () => {
  it('api module exports no center functions', async () => {
    const api = await import('./api');
    for (const gone of [
      'saveStudents', 'saveStaff', 'saveSlots', 'saveCourses', 'saveSessions',
      'saveMealPlans', 'saveExpenses', 'saveTimesheets', 'saveExternalStudents',
      'saveRevisionSeances', 'saveStudentTimeSheets', 'saveFormations',
      'saveMealForfaitClosures', 'saveSettings', 'fetchDatabase', 'saveDatabase',
      'createStudentApi', 'updateStudentApi', 'deleteStudentApi',
      'createStaffApi', 'updateStaffApi', 'deleteStaffApi',
      'createExpenseApi', 'deleteExpenseApi',
      'fetchStudentAttendanceApi', 'saveStudentAttendanceApi',
      'fetchMealForfaitClosures', 'saveMealForfaitClosures',
      'submitDemoRequestApi', 'createRenewalRequestApi',
      'fetchPublicModulePricesApi', 'fetchActiveAdvertisementsApi',
      'uploadCenterLogoApi', 'saveCenterLogoApi',
      'fetchPlatformStudentsApi',
    ]) {
      expect((api as any)[gone]).toBeUndefined();
    }
  });
});
