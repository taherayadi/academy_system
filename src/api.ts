/**
 * SaaS platform administration — API client.
 *
 * Every call targets the SAME ORIGIN under /api (served by this Pages
 * deployment's Functions); there is no cross-app call into the center
 * application. Session compatibility tokens are kept in a platform-only
 * localStorage namespace (`tc_platform_token`) and are only ever validated
 * against `platform_sessions` on the server — the center application uses
 * `tc_user`/`tc_token` + `tc_session` and the `sessions` table. The two apps
 * never read each other's credentials.
 */
import { UserAccount, CenterTenant, DemoRequest, RenewalRequest, PlanHistoryEntry } from './types';

const API_BASE = '/api';
const SESSION_TOKEN_KEY = 'tc_platform_token';

// Sentinel error thrown when the server returns 401 (session expired/missing).
// Caught by App.tsx to force the user back to the login screen.
export class UnauthorizedError extends Error {
  constructor() {
    super('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.');
    this.name = 'UnauthorizedError';
  }
}

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
    else localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Builds auth headers (Bearer token + JSON content type as needed). */
function authHeaders(includeJson: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  const token = getSessionToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// Platform auth
// ---------------------------------------------------------------------------

/**
 * Platform-console login. The server answers 401 for BOTH wrong credentials
 * and center accounts (admin / super_admin / restricted_admin) — only
 * platform_super_admin obtains a session; the response carries the token for
 * the localStorage/Bearer path and the HttpOnly `tc_platform_session` cookie
 * is set by the server.
 */
export async function loginRequest(email: string, password: string): Promise<{ user: UserAccount; passwordUpgraded?: boolean }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password })
  });
  const data: { error?: string; user?: UserAccount; token?: string; passwordUpgraded?: boolean } = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'خطأ في تسجيل الدخول.');
  }
  if (data.token) setSessionToken(data.token);
  return {
    user: data.user!,
    ...(data.passwordUpgraded ? { passwordUpgraded: true } : {})
  };
}

export async function logoutRequest(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: authHeaders(false),
    credentials: 'include'
  });
}

/** Self-service password change (session identity; other sessions are revoked). */
export async function changePasswordRequest(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/password`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'خطأ في تغيير كلمة السر.');
  }
}

/** Resolve the platform session from the cookie/token (boot check). */
export async function fetchSessionUserApi(): Promise<{ user: UserAccount } | null> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) return null;
  const data: { user?: UserAccount; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في جلب بيانات المستخدم.');
  return data.user ? { user: data.user } : null;
}

/** Upload a logo selected by the platform admin before creating a center. */
export async function uploadPlatformLogoApi(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/platform-upload-logo`, {
    method: 'POST', headers: authHeaders(false), credentials: 'include', body: fd
  });
  const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || 'تعذر رفع الشعار.');
  return data.url;
}

// ========================================================================
// SaaS Platform API – Demo Requests (management only; public submission
// belongs to the center application's landing page)
// ========================================================================

/** Fetch all demo/trial requests (platform admin). */
export async function fetchDemoRequestsApi(): Promise<DemoRequest[]> {
  const res = await fetch(`${API_BASE}/demo-requests`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { requests?: DemoRequest[]; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur lors de la récupération des demandes.');
  return data.requests || [];
}

/** Update status / notes of a demo request (platform admin). */
export async function updateDemoRequestApi(
  id: string,
  payload: { status?: string; notes?: string }
): Promise<void> {
  const res = await fetch(`${API_BASE}/demo-requests`, {
    method: 'PATCH',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ id, ...payload })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur lors de la mise à jour.');
}

/** Delete a demo request (platform admin). */
export async function deleteDemoRequestApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/demo-requests?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('Erreur lors de la suppression.');
}

// ========================================================================
// SaaS Platform API – Centers
// ========================================================================

/** Fetch all centers with subscription + billing metadata (platform admin). */
export async function fetchCentersApi(): Promise<CenterTenant[]> {
  const res = await fetch(`${API_BASE}/centers`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { centers?: CenterTenant[]; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur lors de la récupération des centres.');
  return data.centers || [];
}

/** Create a new center with its director account (platform admin). */
export async function createCenterApi(payload: {
  name: string;
  logoUrl?: string;
  phoneNumber?: string;
  locationCity?: string;
  plan: string;
  enabledModules: string[];
  centerType?: string;
  billingCycle?: 'monthly' | 'annual';
  monthlyPrice?: number | string | null;
  trialDays?: number | string;
  offerDays?: number | string;
  directorName: string;
  directorEmail: string;
  directorPassword: string;
  convertFromRequestId?: string;
}): Promise<{ centerId: string; invoice?: { invoiceNumber: string; amount: number } | null }> {
  const res = await fetch(`${API_BASE}/centers`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    // The backend expects adminName / adminEmail / adminPassword — map the
    // director* fields so the director account is created correctly.
    body: JSON.stringify({
      ...payload,
      logoUrl: payload.logoUrl,
      adminName: payload.directorName,
      adminEmail: payload.directorEmail,
      adminPassword: payload.directorPassword
    })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { centerId?: string; error?: string; code?: string } = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Erreur lors de la création du centre.') as Error & { code?: string };
    (err as Error & { code?: string }).code = data.code;
    throw err;
  }
  return { centerId: data.centerId! };
}

/** Outcome of a plan change, echoed by the backend so the UI can explain it. */
export interface PlanChangeOutcome {
  mode: string;
  applyAt?: number | null;
  newSubscriptionEndsAt?: number | null;
  settlement?: {
    amount: number;
    paid: boolean;
    remainingDays: number;
    invoiceNumber?: string;
    invoiceId?: string;
    cancelledOld?: boolean;
    skipped?: boolean;
  } | null;
  scheduledPlan?: { plan: string; billingCycle: string; enabledModules: string[] } | null;
  /** Pending invoice automatically created for a new/renewed subscription window. */
  invoice?: { invoiceNumber: string; amount: number } | null;
}

/**
 * Update center properties (platform admin): identity, status (suspend /
 * reactivate), plan, modules, trial dates, scheduled plan changes, prorated
 * settlements and the center-admin password reset (`newAdminPassword`).
 *
 * Response carries `planChange` so the platform admin UI can explain what the
 * system did (invoice created / change scheduled / period extended…).
 */
export async function updateCenterApi(
  id: string,
  payload: {
    name?: string;
    logoUrl?: string;
    phoneNumber?: string;
    locationCity?: string;
    centerType?: string;
    status?: string;
    plan?: string;
    enabledModules?: string[];
    trialEndsAt?: number | null;
    subscriptionEndsAt?: number | null;
    billingCycle?: 'monthly' | 'annual';
    monthlyPrice?: number | null;
    autoCalculatePrice?: boolean;
    autoCalculateSubscription?: boolean;
    addOfferDays?: number;
    extendTrialDays?: number;
    adminEmail?: string;
    newAdminPassword?: string;
    /** Store a plan change to apply at the end of the current period. */
    scheduleChange?: {
      plan: string;
      billingCycle?: 'monthly' | 'annual';
      enabledModules?: string[];
      monthlyPrice?: number | null;
    };
    /** Cancel the pending scheduled plan change of this center. */
    cancelScheduledChange?: boolean;
    /** Force-apply the pending scheduled plan change now. */
    applyScheduledPlan?: boolean;
    /** How to settle an immediate mid-period price increase. */
    settlementPolicy?: 'auto' | 'paid' | 'unpaid';
  }
): Promise<{ planChange?: PlanChangeOutcome }> {
  const res = await fetch(`${API_BASE}/centers`, {
    method: 'PATCH',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ id, ...payload })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { error?: string; planChange?: PlanChangeOutcome } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur lors de la mise à jour du centre.');
  return data;
}

/** Delete a center (platform admin). Cannot delete the default center. */
export async function deleteCenterApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/centers?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('Erreur lors de la suppression du centre.');
}

// ─── Platform Billing API ─────────────────────────────────────────────────

export interface PlatformBillingSummary {
  mrr: number;
  collectedThisMonth: number;
  collectedThisYear: number;
  pendingInvoices: number;
  overdueInvoices: number;
  activeCount: number;
  suspendedCount: number;
  expiredCount: number;
  endingSoonCount: number;
  overdueCount: number;
}

export interface CenterInvoice {
  id: string;
  centerId: string;
  centerName: string;
  invoiceNumber: string;
  periodStart: number;
  periodEnd: number;
  amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paymentMethod?: string | null;
  paymentDate?: number | null;
  chequeNumber?: string | null;
  chequeDate?: number | null;
  notes: string;
  createdAt: number;
}

export interface ModulePrice {
  id: string;
  school_year: string;
  module_key: string;
  price: number;
  created_at: number;
}

// ─── Per-center plan manager (Plans & factures) ────────────────────────────

export interface CenterPlanSchedule {
  id: string;
  plan: string;
  billingCycle: 'monthly' | 'annual';
  monthlyPrice: number | null;
  applyAt: number | null;
  notes: string;
  createdAt: number;
}

export interface CenterPlanHistoryEntry {
  id: string;
  action: string;
  details: string;
  amount: number | null;
  invoiceNumber: string | null;
  createdAt: number;
}

export interface CenterPlansView {
  center: {
    id: string;
    name: string;
    status: string;
    plan: string;
    billingCycle: 'monthly' | 'annual';
    monthlyPrice: number;
    subscriptionEndsAt: number | null;
    trialEndsAt: number | null;
    enabledModules: string[];
  };
  invoices: CenterInvoice[];
  schedules: CenterPlanSchedule[];
  /** Audit trail (migration 0029) — empty when not yet applied. */
  history?: CenterPlanHistoryEntry[];
}

export interface CenterPlanActionResult {
  success?: boolean;
  mode?: 'scheduled' | 'replaced' | 'activated' | 'plan_removed' | 'schedule_cancelled' | 'trial_added';
  placement?: 'start' | 'end';
  days?: number;
  message?: string;
  applyAt?: number | null;
  amount?: number;
  subscriptionEndsAt?: number;
  invoice?: { invoiceNumber: string; amount: number } | null;
}

/** Load the plan manager view for a center (current plan + invoices + schedules). */
export async function fetchCenterPlansApi(centerId: string): Promise<CenterPlansView> {
  const res = await fetch(`${API_BASE}/center-plans?centerId=${encodeURIComponent(centerId)}`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur chargement des abonnements.');
  return data as CenterPlansView;
}

/** Run a plan action (set-plan / remove-plan / remove-schedule / add-trial). */
export async function centerPlanActionApi(payload: {
  action: 'set-plan' | 'remove-plan' | 'remove-schedule' | 'add-trial';
  centerId: string;
  plan?: string;
  billingCycle?: 'monthly' | 'annual';
  enabledModules?: string[];
  monthlyPrice?: number | null;
  mode?: 'scheduled';
  scheduleId?: string;
  days?: number;
}): Promise<CenterPlanActionResult> {
  const res = await fetch(`${API_BASE}/center-plans`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur lors de la mise à jour du plan.');
  return data as CenterPlanActionResult;
}

/** Fetch platform billing summary (MRR, collected revenue, pending invoices). */
export async function fetchPlatformBillingApi(): Promise<{
  summary: PlatformBillingSummary;
  centersByStatus: {
    endingSoon: Array<{ id: string; name: string; subscriptionEndsAt: number }>;
    overdue: Array<{ id: string; name: string; subscriptionEndsAt: number }>;
  };
}> {
  const res = await fetch(`${API_BASE}/platform-billing?mode=summary`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur chargement données financières.');
  return data;
}

/** Fetch invoices. */
export async function fetchInvoicesApi(filters?: { centerId?: string; status?: string; limit?: number }): Promise<CenterInvoice[]> {
  const params = new URLSearchParams({ mode: 'invoices' });
  if (filters?.centerId) params.set('centerId', filters.centerId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));

  const res = await fetch(`${API_BASE}/platform-billing?${params.toString()}`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { invoices?: CenterInvoice[]; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur chargement factures.');
  return data.invoices || [];
}

/** Create a new invoice. */
export async function createInvoiceApi(payload: {
  centerId: string;
  amount: number;
  periodStart: number;
  periodEnd: number;
  notes?: string;
}): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const res = await fetch(`${API_BASE}/platform-billing`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ action: 'create-invoice', ...payload })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur création facture.');
  return data;
}

/** Update an invoice (status / payment method / cheque details / notes). */
export async function updateInvoiceApi(id: string, payload: Partial<{
  status: string;
  amount: number;
  paymentMethod: string | null;
  paymentDate: number | null;
  chequeNumber: string | null;
  chequeDate: number | null;
  notes: string;
  periodStart: number;
  periodEnd: number;
}>): Promise<void> {
  const res = await fetch(`${API_BASE}/platform-billing`, {
    method: 'PATCH',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ id, ...payload })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur mise à jour facture.');
}

/** Delete an invoice. */
export async function deleteInvoiceApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/platform-billing?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('Erreur suppression facture.');
}

/** Fetch module prices for a school year. */
export async function fetchModulePricesApi(year?: string): Promise<ModulePrice[]> {
  const params = new URLSearchParams({ mode: 'module-prices' });
  if (year) params.set('year', year);

  const res = await fetch(`${API_BASE}/platform-billing?${params.toString()}`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { prices?: ModulePrice[]; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur chargement tarifs modules.');
  return data.prices || [];
}

/** Update module prices for a school year. */
export async function updateModulePricesApi(year: string, prices: Array<{ module_key: string; price: number }>): Promise<void> {
  const res = await fetch(`${API_BASE}/platform-billing`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ action: 'update-module-prices', year, prices })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur mise à jour tarifs.');
}

// ========================================================================
// Platform Advertisements API (management; ad RENDERING happens in the
// center app + landing page, which live in the other repository)
// ========================================================================

/** Upload multiple images for advertisements (sequential uploads). */
export async function uploadMultipleImagesApi(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const url = await uploadPlatformLogoApi(file);
    urls.push(url);
  }
  return urls;
}

/** Fetch all advertisements with center assignments (platform admin only). */
export async function fetchAdvertisementsApi(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/platform-advertisements`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { advertisements?: any[]; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في جلب الإعلانات.');
  return data.advertisements || [];
}

/** Create new advertisement. */
export async function createAdvertisementApi(payload: any): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/platform-advertisements`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { success?: boolean; id?: string; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في إنشاء الإعلان.');
  return { success: data.success || false, id: data.id || '' };
}

/** Update advertisement. */
export async function updateAdvertisementApi(id: string, payload: any): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/platform-advertisements`, {
    method: 'PATCH',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ id, ...payload })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { success?: boolean; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في تحديث الإعلان.');
  return { success: data.success || false };
}

/** Delete advertisement. */
export async function deleteAdvertisementApi(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/platform-advertisements?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { success?: boolean; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في حذف الإعلان.');
  return { success: data.success || false };
}

// ─── Demandes de renouvellement (migration 0033) — revue plateforme ─────────

export interface RenewalRequestsPayload {
  requests: RenewalRequest[];
  history: PlanHistoryEntry[];
}

/** Toutes les demandes de renouvellement des centres (revue plateforme). */
export async function fetchRenewalRequestsApi(centerId?: string): Promise<RenewalRequestsPayload> {
  const params = new URLSearchParams();
  if (centerId) params.set('centerId', centerId);
  const query = params.toString();
  const res = await fetch(`${API_BASE}/renewal-requests${query ? `?${query}` : ''}`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data = await res.json().catch(() => ({})) as RenewalRequestsPayload & { error?: string };
  if (!res.ok) throw new Error(data.error || 'خطأ في جلب طلبات التجديد.');
  return { requests: data.requests || [], history: data.history || [] };
}

/** Accepter ou refuser une demande — réservé à la plateforme.
 * `skipApply` : le plan a déjà été appliqué via le moteur « Plans & factures »
 * (modal « Examiner et appliquer ») — ne fait qu'enregistrer la décision. */
export async function decideRenewalRequestApi(
  id: string,
  status: 'approved' | 'rejected',
  decisionNote = '',
  opts?: { skipApply?: boolean }
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/renewal-requests`, {
    method: 'PATCH',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ id, status, decisionNote, ...(opts?.skipApply ? { skipApply: true } : {}) })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { success?: boolean; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في معالجة طلب التجديد.');
  return { success: data.success || false };
}
