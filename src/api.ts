import {
  CenterSettings, Student, StaffMember, EtudeSlot,
  ExternalCourse, ExternalCourseSession, MealPlanDay, CenterExpense,
  TimesheetEntry, ExternalStudentRegister, RevisionSeance, UserAccount,
  StudentTimeSheet, Formation, CenterTenant, DemoRequest
} from './types';

const API_BASE = '/api';
const SESSION_TOKEN_KEY = 'tc_token';

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

export async function saveFormations(formations: Formation[]): Promise<void> {
  return putDomain('/formations', formations, 'تعذر حفظ بيانات التكوينات.');
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

// ========================================================================
// SaaS Platform API – Demo Requests
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
}): Promise<void> {
  const res = await fetch(`${API_BASE}/demo-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Erreur lors de l\'envoi de la demande.');
}

/** Fetch all demo/trial requests (super-admin only). */
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

/** Update status / notes of a demo request (super-admin). */
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

/** Delete a demo request (super-admin). */
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

/** Create a new center with its director account (super-admin). */
export async function createCenterApi(payload: {
  name: string;
  slug?: string;
  phoneNumber?: string;
  locationCity?: string;
  plan: string;
  enabledModules: string[];
  directorName: string;
  directorEmail: string;
  directorPassword: string;
  convertFromRequestId?: string;
}): Promise<{ centerId: string }> {
  const res = await fetch(`${API_BASE}/centers`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { centerId?: string; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur lors de la création du centre.');
  return { centerId: data.centerId! };
}

/** Update center properties (super-admin): status, plan, modules, trial dates, etc. */
export async function updateCenterApi(
  id: string,
  payload: {
    status?: string;
    plan?: string;
    enabledModules?: string[];
    trialEndsAt?: number | null;
    subscriptionEndsAt?: number | null;
    extendTrialDays?: number;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/centers`, {
    method: 'PATCH',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ id, ...payload })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur lors de la mise à jour du centre.');
}

/** Delete a center (super-admin). Cannot delete the default center. */
export async function deleteCenterApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/centers?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('Erreur lors de la suppression du centre.');
}

