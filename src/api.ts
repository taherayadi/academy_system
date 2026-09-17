import { CenterSettings, Student, StaffMember, EtudeSlot, ExternalCourse, ExternalCourseSession, MealPlanDay, CenterExpense, TimesheetEntry, ExternalStudentRegister, RevisionSeance, UserAccount, StudentTimeSheet, StudentAttendanceRecord, Formation, CenterTenant, MealForfaitClosure, RenewalRequest, PlanHistoryEntry } from './types';


const API_BASE = '/api';

const SESSION_TOKEN_KEY = 'tc_center_token';


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
    // Session token is no longer available client-side (secure cookie migration).
    // Always returns null in production runtime. Still attempts to read from
    // localStorage ONLY for test suite compatibility in legacy tests.
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}


/**
 * Sets the session token. The token is NOT persisted in localStorage:
 * the server sets an HttpOnly; SameSite=Strict cookie (`tc_center_session`)
 * on `/api/auth/login`, and the browser sends it automatically on every
 * same-origin request (all fetch() calls here use `credentials: 'include'`).
 *
 * Storing the bearer string in localStorage would make it reachable by any
 * XSS on the page. getSessionToken() below still reads localStorage for
 * test compatibility; in production auth is cookie-driven and this returns
 * null for real sessions.
 */
export function setSessionToken(token: string | null): void {
  try {
    if (token) {
      // Server-side: createSession() in _lib.ts sets the HttpOnly cookie.
      // Do NOT persist the raw token client-side.
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
}


/** Builds auth headers (Bearer token + JSON content type as needed). */
function authHeaders(includeJson: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers['Content-Type'] = 'application/json';

  // NOTE: In production getSessionToken() acts as a stub (returns null)
  // because auth relies on HttpOnly cookies sent automatically via
  // credentials: 'include'. This header injection remains for test compat.
  const token = getSessionToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return headers;
}


export interface DatabaseState {
  settings: CenterSettings;
  students: Student[];
  staff: StaffMember[];
  slots: EtudeSlot[];
  courses: ExternalCourse[];
  sessions: ExternalCourseSession[];
  mealPlans: MealPlanDay[];
  expenses: CenterExpense[];
  timesheets: TimesheetEntry[];
  externalStudents: ExternalStudentRegister[];
  revisionSeances: RevisionSeance[];
  studentTimeSheets: StudentTimeSheet[];
  formations: Formation[];
}


/** Generic PUT helper for granular domain endpoints. */
async function putDomain(path: string, body: unknown, defaultErrMsg: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify(body)
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(data.error || defaultErrMsg);
  }
}


/** Generic POST helper for granular domain endpoints. */
async function postDomain(path: string, body: unknown, defaultErrMsg: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify(body)
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(data.error || defaultErrMsg);
  }
}


/** Generic DELETE helper for granular domain endpoints. */
async function deleteDomain(path: string, defaultErrMsg: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(data.error || defaultErrMsg);
  }
}


// ------------------- Atomic Entity Mutators (Concurrent-safe) -------------------

export async function createStudentApi(student: Student): Promise<void> {
  return postDomain('/students', student, 'تعذر إضافة التلميذ.');
}


export async function updateStudentApi(student: Student): Promise<void> {
  return putDomain('/students', student, 'تعذر تعديل بيانات التلميذ.');
}


export async function deleteStudentApi(studentId: string): Promise<void> {
  return deleteDomain(`/students?id=${encodeURIComponent(studentId)}`, 'تعذر حذف التلميذ.');
}


export async function createStaffApi(staff: StaffMember): Promise<void> {
  return postDomain('/staff', staff, 'تعذر إضافة عضو الإطار.');
}


export async function updateStaffApi(staff: StaffMember): Promise<void> {
  return putDomain('/staff', staff, 'تعذر تعديل بيانات عضو الإطار.');
}


export async function deleteStaffApi(staffId: string): Promise<void> {
  return deleteDomain(`/staff?id=${encodeURIComponent(staffId)}`, 'تعذر حذف عضو الإطار.');
}


export async function createExpenseApi(expense: CenterExpense): Promise<void> {
  return postDomain('/expenses', expense, 'تعذر إضافة المصروف.');
}


export async function deleteExpenseApi(expenseId: string): Promise<void> {
  return deleteDomain(`/expenses?id=${encodeURIComponent(expenseId)}`, 'تعذر حذف المصروف.');
}


// ------------------- Granular Domain Mutators -------------------

export async function saveStudents(students: Student[]): Promise<void> {
  return putDomain('/students', students, 'تعذر حفظ بيانات التلاميذ.');
}


export async function saveStaff(staff: StaffMember[]): Promise<void> {
  return putDomain('/staff', staff, 'تعذر حفظ بيانات الإطار التربوي.');
}


export async function saveSlots(slots: EtudeSlot[]): Promise<void> {
  return putDomain('/slots', slots, 'تعذر حفظ بيانات الحصص.');
}


export async function saveCourses(courses: ExternalCourse[]): Promise<void> {
  return putDomain('/courses', courses, 'تعذر حفظ بيانات الدروس الخصوصية.');
}


export async function saveSessions(sessions: ExternalCourseSession[]): Promise<void> {
  return putDomain('/sessions', sessions, 'تعذر حفظ بيانات الجلسات.');
}


export async function saveMealPlans(mealPlans: MealPlanDay[]): Promise<void> {
  return putDomain('/meals', mealPlans, 'تعذر حفظ بيانات الوجبات.');
}


export async function saveExpenses(expenses: CenterExpense[]): Promise<void> {
  return putDomain('/expenses', expenses, 'تعذر حفظ بيانات المصاريف.');
}


export async function saveTimesheets(timesheets: TimesheetEntry[]): Promise<void> {
  return putDomain('/timesheets', timesheets, 'تعذر حفظ بيانات جداول الحضور.');
}


export async function saveExternalStudents(externalStudents: ExternalStudentRegister[]): Promise<void> {
  return putDomain('/external-students', externalStudents, 'تعذر حفظ بيانات التلاميذ الخارجيين.');
}


export async function saveRevisionSeances(revisionSeances: RevisionSeance[]): Promise<void> {
  return putDomain('/revision-seances', revisionSeances, 'تعذر حفظ بيانات حصص المراجعة.');
}


export function saveStudentTimeSheets(sheets: StudentTimeSheet[]): Promise<void> {
  return putDomain('/student-timesheets', sheets, 'تعذر حفظ جداول التوقيت.');
}


/** Save daily student check-in records for jardin centers. */
export function saveStudentAttendanceApi(records: StudentAttendanceRecord[]): Promise<void> {
  return putDomain('/student-attendance', records, 'تعذر حفظ pointage التلاميذ.');
}


/** Fetch daily student check-in records for jardin centers. */
export function fetchStudentAttendanceApi(): Promise<StudentAttendanceRecord[]> {
  return getDomain<StudentAttendanceRecord[]>('/student-attendance', 'تعذر تحميل pointage التلاميذ.');
}


export async function saveFormations(formations: Formation[]): Promise<void> {
  return putDomain('/formations', formations, 'تعذر حفظ بيانات التكوينات.');
}


export async function saveMealForfaitClosures(closures: MealForfaitClosure[]): Promise<void> {
  return putDomain('/meal-forfait-closures', closures, 'تعذر حفظ بيانات إغلاقات الوجبات.');
}


export async function fetchMealForfaitClosures(): Promise<MealForfaitClosure[]> {
  const res = await fetch(`${API_BASE}/meal-forfait-closures`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(data.error || 'تعذر قراءة بيانات إغلاقات الوجبات.');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}


export async function saveSettings(settings: CenterSettings): Promise<void> {
  return putDomain('/settings', settings, 'تعذر حفظ إعدادات المنظومة.');
}


/** Generic GET helper for granular domain endpoints. */
async function getDomain<T>(path: string, defaultErrMsg: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(data.error || defaultErrMsg);
  }
  return res.json();
}


// ------------------- Full Database Boot (Concurrent Domain Load) -------------------

export async function fetchDatabase(): Promise<DatabaseState> {
  const [
    settings,
    students,
    staff,
    slots,
    courses,
    sessions,
    mealPlans,
    expenses,
    timesheets,
    externalStudents,
    revisionSeances,
    studentTimeSheets,
    formations
  ] = await Promise.all([
    getDomain<CenterSettings>('/settings', 'تعذر تحميل إعدادات المنظومة.'),
    getDomain<Student[]>('/students', 'تعذر تحميل بيانات التلاميذ.'),
    getDomain<StaffMember[]>('/staff', 'تعذر تحميل بيانات الإطار التربوي.'),
    getDomain<EtudeSlot[]>('/slots', 'تعذر تحميل بيانات الحصص.'),
    getDomain<ExternalCourse[]>('/courses', 'تعذر تحميل بيانات الدروس الخصوصية.'),
    getDomain<ExternalCourseSession[]>('/sessions', 'تعذر تحميل بيانات الجلسات.'),
    getDomain<MealPlanDay[]>('/meals', 'تعذر تحميل بيانات الوجبات.'),
    getDomain<CenterExpense[]>('/expenses', 'تعذر تحميل بيانات المصاريف.'),
    getDomain<TimesheetEntry[]>('/timesheets', 'تعذر تحميل بيانات جداول الحضور.'),
    getDomain<ExternalStudentRegister[]>('/external-students', 'تعذر تحميل بيانات التلاميذ الخارجيين.'),
    getDomain<RevisionSeance[]>('/revision-seances', 'تعذر تحميل بيانات حصص المراجعة.'),
    getDomain<StudentTimeSheet[]>('/student-timesheets', 'تعذر تحميل جداول التوقيت.'),
    getDomain<Formation[]>('/formations', 'تعذر تحميل بيانات التكوينات.')
  ]);

  return {
    settings,
    students: students || [],
    staff: staff || [],
    slots: slots || [],
    courses: courses || [],
    sessions: sessions || [],
    mealPlans: mealPlans || [],
    expenses: expenses || [],
    timesheets: timesheets || [],
    externalStudents: externalStudents || [],
    revisionSeances: revisionSeances || [],
    studentTimeSheets: studentTimeSheets || [],
    formations: formations || []
  };
}


export async function saveDatabase(state: DatabaseState): Promise<void> {
  return putDomain('/state', state, 'تعذر حفظ نسخة قاعدة البيانات.');
}


// ------------------- Authentication -------------------

export async function loginRequest(email: string, password: string): Promise<{ user: UserAccount; center?: CenterTenant | null }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password })
  });
  const data: { error?: string; user?: UserAccount; token?: string; center?: CenterTenant | null } = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'خطأ في تسجيل الدخول.');
  }
  if (data.token) setSessionToken(data.token);
  return { user: data.user!, center: data.center ?? null };
}


export async function logoutRequest(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: authHeaders(false),
    credentials: 'include'
  });
}


export async function changePasswordRequest(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/password`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ email, currentPassword, newPassword })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'خطأ في تغيير كلمة السر.');
  }
}


/** Upload a logo image to ImageKit (via backend) — returns the CDN URL. */
export async function uploadCenterLogoApi(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/upload-logo`, {
    method: 'POST', headers: authHeaders(false), credentials: 'include', body: fd
  });
  const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || 'تعذر رفع الشعار.');
  return data.url;
}


/** Save (or clear with '') the connected center's logo URL. */
export async function saveCenterLogoApi(logoUrl: string): Promise<void> {
  const res = await fetch(`${API_BASE}/center-logo`, {
    method: 'POST', headers: authHeaders(true), credentials: 'include',
    body: JSON.stringify({ logoUrl })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'تعذر حفظ الشعار.');
}


// ========================================================================
// Public landing — demo request submission
// ========================================================================

/** Submit a trial / demo / info request from the landing page (public). */
export async function submitDemoRequestApi(data: {
  requestType: 'trial' | 'demo' | 'info';
  fullName: string;
  academyName: string;
  email: string;
  phone: string;
  estimatedSize?: string;
  message?: string;
  requestedModules?: string[];
  centerType?: string; // 'jardin' | 'formation'
}): Promise<void> {
  const res = await fetch(`${API_BASE}/demo-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Erreur lors de l\'envoi de la demande.');
}


// ========================================================================
// Center subscription summary
// ========================================================================

/** Fetch all centers (super-admin) or the current center (tenant). */
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


/** Fetch public module prices for the landing page without a session. */
export async function fetchPublicModulePricesApi(year?: string): Promise<Record<string, number>> {
  const params = new URLSearchParams();
  if (year) params.set('year', year);
  const query = params.toString();
  const res = await fetch(`${API_BASE}/public-pricing${query ? `?${query}` : ''}`, {
    credentials: 'same-origin'
  });
  const data: { prices?: Array<{ module_key?: string; price?: number }>; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur chargement des tarifs publics.');
  return (data.prices || []).reduce<Record<string, number>>((prices, row) => {
    if (row.module_key) prices[row.module_key] = Number(row.price) || 0;
    return prices;
  }, {});
}


/** Fetch active advertisements by location and optional centerId (public endpoint). */
export async function fetchActiveAdvertisementsApi(location: string, centerId?: string): Promise<any[]> {
  const params = new URLSearchParams({ location });
  if (centerId) params.set('centerId', centerId);

  const res = await fetch(`${API_BASE}/advertisements/active?${params.toString()}`, {
    credentials: 'same-origin'
  });
  const data: { advertisements?: any[]; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في جلب الإعلانات.');
  return data.advertisements || [];
}




// ─── Demandes de renouvellement (migration 0033) ───────────────────────────

export interface RenewalRequestsPayload {
  requests: RenewalRequest[];
  history: PlanHistoryEntry[];
}


/** Demandes du centre connecté (ou de toutes les demandes pour la plateforme). */
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


export interface CreateRenewalRequestInput {
  kind: 'renewal' | 'upgrade';
  requestedPlan: string;
  requestedModules: string[];
  billingCycle: 'monthly' | 'annual';
  amount: number | null;
  note?: string;
}


/** Dépose une demande de renouvellement / de passage à une offre supérieure. */
export async function createRenewalRequestApi(payload: CreateRenewalRequestInput): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/renewal-requests`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { success?: boolean; id?: string; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في إرسال طلب التجديد.');
  return { success: data.success || false, id: data.id || '' };
}
