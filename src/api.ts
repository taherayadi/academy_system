import { CenterSettings, Student, StudentUpdate, StaffMember, EtudeSlot, ExternalCourse, ExternalCourseSession, MealPlanDay, CenterExpense, TimesheetEntry, ExternalStudentRegister, RevisionSeance, RevisionSeanceStudent, UserAccount, StudentTimeSheet, StudentAttendanceRecord, Formation, FormationStudent, FormationSeance, CenterTenant, MealForfaitClosure, RenewalRequest, PlanHistoryEntry, SchoolEvent, EventParticipant, Activity, SkillEvaluation, Skill, PaymentRecord, LeaveRequest, StaffAdvance, StaffRequestStatus, PaySlip, MealAttendanceInput, MealAttendanceKey, MealEnrollmentUpdate, StudentServiceEnrollment, StudentServiceEnrollmentInput, StudentServiceEnrollmentPatch } from './types';


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
  events: SchoolEvent[];
  activities: Activity[];
  skills: Skill[];
  skillEvaluations: SkillEvaluation[];
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
  await postDomainJson(path, body, defaultErrMsg);
}

/** POST helper returning the JSON response (used when the server assigns an id). */
async function postDomainJson<T>(path: string, body: unknown, defaultErrMsg: string): Promise<T> {
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
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
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


export async function updateStudentApi(student: StudentUpdate): Promise<void> {
  // Les données enfants ont leurs endpoints dédiés. On ne les envoie jamais
  // dans un PUT de profil, même si un appelant legacy fournit l'élève complet.
  const { payments: _payments, mealAttendances: _mealAttendances, suiviNotes: _suiviNotes, ...profile } = student;
  return putDomain('/students', profile, 'تعذر تعديل بيانات التلميذ.');
}


export async function deleteStudentApi(studentId: string): Promise<void> {
  return deleteDomain(`/students?id=${encodeURIComponent(studentId)}`, 'تعذر حذف التلميذ.');
}

/**
 * Ajoute UN paiement d'un élève existant — sans renvoyer l'élève complet.
 * Endpoint dédié POST /api/payments (l'ancien flux réécrivait toutes les
 * tables enfants via PUT /api/students pour un simple paiement).
 */
export async function createPaymentApi(payment: PaymentRecord & { studentId: string }): Promise<void> {
  return postDomain('/payments', payment, 'تعذر إضافة الدفعة.');
}

/** Supprime un paiement par id — sans toucher à l'élève. */
export async function deletePaymentApi(paymentId: string): Promise<void> {
  return deleteDomain(`/payments?id=${encodeURIComponent(paymentId)}`, 'تعذر حذف الدفعة.');
}

/** Mise à jour partielle d'un paiement (encaissement de chèque : { id, chequePaid }). */
export async function updatePaymentApi(patch: { id: string; chequePaid?: boolean; chequeNumber?: string; chequeDate?: string; notes?: string }): Promise<void> {
  return putDomain('/payments', patch, 'تعذر تعديل الدفعة.');
}

/**
 * Encaissement du chèque d'UN participant d'UNE activité — endpoint dédié
 * /api/event-cheque. Les participants d'activité ne sont pas des lignes
 * `payments` (leur paiement vit dans le JSON de l'événement) : on cible donc
 * (eventId, participantId) au lieu d'envoyer toute la liste des événements.
 */
export async function updateEventChequeApi(patch: { eventId: string; participantId: string; chequePaid?: boolean; chequeNumber?: string; chequeDate?: string }): Promise<void> {
  return putDomain('/event-cheque', patch, 'تعذر تحديث حالة الشيك.');
}

/**
 * Matières du centre : liste depuis /api/subjects (id UUID + nom), seedée
 * automatiquement au login si le centre n'en a aucune. Plus de liste codée
 * en dur.
 */
export interface SubjectRef { id: string; name: string }

export async function fetchSubjectsApi(): Promise<SubjectRef[]> {
  const data = await getDomain<{ subjects: SubjectRef[] }>('/subjects', 'تعذر تحميل المواد.');
  return data.subjects || [];
}

/** Ajoute UNE matière — POST /api/subjects, id UUID serveur. */
export async function createSubjectApi(name: string): Promise<SubjectRef> {
  const res = await fetch(`${API_BASE}/subjects`, {
    method: 'POST',
    headers: authHeaders(true),
    credentials: 'include',
    body: JSON.stringify({ name })
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data: { ok?: boolean; id?: string; name?: string; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'تعذر إضافة المادة.');
  return { id: data.id || '', name: data.name || name };
}

/**
 * Enregistre UNE note de suivi — endpoint dédié /api/suivi-notes. Le client
 * n'envoie que la note (l'élève n'est plus renvoyé entier via PUT /api/students).
 * L'id est un UUID généré côté serveur, donc aucun conflit entre centres.
 */
export async function saveSuiviNoteApi(note: { studentId: string; schoolYear: string; trimester: number; subject: string; devoir1?: number | null; devoir2?: number | null; synthese?: number | null }): Promise<void> {
  return postDomain('/suivi-notes', note, 'تعذر حفظ النقطة.');
}

/** Supprime une note de suivi par id (retourné par GET /api/suivi-notes). */
export async function deleteSuiviNoteApi(noteId: string): Promise<void> {
  return deleteDomain(`/suivi-notes?id=${encodeURIComponent(noteId)}`, 'تعذر حذف النقطة.');
}

/** Notes de suivi du centre (ou d'un élève si studentId est fourni). */
export async function fetchSuiviNotesApi(studentId?: string): Promise<Record<string, any>[]> {
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  const data = await getDomain<{ notes: Record<string, any>[] }>(`/suivi-notes${qs}`, 'تعذر تحميل النقط.');
  return data.notes || [];
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


export async function createStaffLeaveRequestApi(staffId: string, leaveRequest: LeaveRequest): Promise<void> {
  return postDomain('/staff-leave-requests', { staffId, leaveRequest }, 'تعذر حفظ طلب الإجازة.');
}


export async function updateStaffLeaveRequestStatusApi(staffId: string, requestId: string, status: StaffRequestStatus): Promise<void> {
  return putDomain('/staff-leave-requests', { staffId, requestId, status }, 'تعذر تحديث طلب الإجازة.');
}


export async function createStaffAdvanceApi(staffId: string, advance: StaffAdvance): Promise<void> {
  return postDomain('/staff-advances', { staffId, advance }, 'تعذر حفظ طلب السلفة.');
}


export async function updateStaffAdvanceStatusApi(staffId: string, advanceId: string, status: StaffRequestStatus): Promise<void> {
  return putDomain('/staff-advances', { staffId, advanceId, status }, 'تعذر تحديث طلب السلفة.');
}


export async function createStaffPayslipApi(staffId: string, payslip: PaySlip): Promise<void> {
  return postDomain('/staff-payslips', { staffId, payslip }, 'تعذر حفظ بطاقة الأجر.');
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


/** Adds ONE séance (POST /api/slots) without rewriting the whole slots domain. */
export async function createSlotApi(slot: EtudeSlot): Promise<void> {
  return postDomain('/slots', slot, 'تعذر حفظ الحصة.');
}


/** Deletes ONE séance (DELETE /api/slots?id=) without rewriting the whole slots domain. */
export async function deleteSlotApi(slotId: string): Promise<void> {
  return deleteDomain(`/slots?id=${encodeURIComponent(slotId)}`, 'تعذر حذف الحصة.');
}


export async function saveCourses(courses: ExternalCourse[]): Promise<void> {
  return putDomain('/courses', courses, 'تعذر حفظ بيانات الدروس الخصوصية.');
}


/** Adds ONE external course (POST /api/courses) without rewriting the whole courses domain. */
export async function createCourseApi(course: ExternalCourse): Promise<void> {
  return postDomain('/courses', course, 'تعذر حفظ الدرس.');
}


/** Removes ONE student from ONE external course without rewriting the domain. */
export async function removeCourseStudentApi(courseId: string, studentId: string): Promise<void> {
  return deleteDomain(`/courses?courseId=${encodeURIComponent(courseId)}&studentId=${encodeURIComponent(studentId)}`, 'تعذر حذف التلميذ من الدرس.');
}


/** Deletes ONE external course (cascades its sessions/enrollments) without rewriting the domain. */
export async function deleteCourseApi(courseId: string): Promise<void> {
  return deleteDomain(`/courses?id=${encodeURIComponent(courseId)}`, 'تعذر حذف الدرس.');
}


export async function saveSessions(sessions: ExternalCourseSession[]): Promise<void> {
  return putDomain('/sessions', sessions, 'تعذر حفظ بيانات الجلسات.');
}


export async function saveMealPlans(mealPlans: MealPlanDay[]): Promise<void> {
  return putDomain('/meals', mealPlans, 'تعذر حفظ بيانات الوجبات.');
}


/**
 * Pointage repas granulaire — POST crée UNE ligne, PUT la met à jour
 * (status + paid_payment_id, sans suppression), DELETE l'annule.
 * Plus de PUT /api/students pour un simple pointage.
 */
export async function createMealAttendanceApi(attendance: MealAttendanceInput): Promise<void> {
  return postDomain('/meal-attendances', attendance, 'تعذر تسجيل الوجبة.');
}

export async function updateMealAttendanceApi(attendance: MealAttendanceInput): Promise<void> {
  return putDomain('/meal-attendances', attendance, 'تعذر تحديث تسجيل الوجبة.');
}

export async function deleteMealAttendanceApi(key: MealAttendanceKey): Promise<void> {
  const params = new URLSearchParams({ studentId: key.studentId, date: key.date, service: key.service });
  return deleteDomain(`/meal-attendances?${params.toString()}`, 'تعذر إلغاء تسجيل الوجبة.');
}


/** Inscription/désinscription repas & goûter — sans PUT élève. */
export async function updateMealEnrollmentApi(update: MealEnrollmentUpdate | MealEnrollmentUpdate[]): Promise<void> {
  return putDomain('/meal-enrollments', update, 'تعذر حفظ inscription المطعم.');
}


/**
 * CRUD des lignes `student_service_enrollments` : une inscription = un
 * service + une année + une période de validité (`valid_from` / `valid_to`).
 *   GET    /api/student-service-enrollments?studentId=&serviceKey=&schoolYear=
 *   POST   création (id serveur si absent)
 *   PUT    mise à jour partielle
 *   DELETE ?id= suppression
 */
export async function fetchStudentServiceEnrollmentsApi(filter?: {
  studentId?: string; serviceKey?: string; schoolYear?: string;
}): Promise<StudentServiceEnrollment[]> {
  const params = new URLSearchParams();
  if (filter?.studentId) params.set('studentId', filter.studentId);
  if (filter?.serviceKey) params.set('serviceKey', filter.serviceKey);
  if (filter?.schoolYear) params.set('schoolYear', filter.schoolYear);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const rows = await getDomain<any[]>(`/student-service-enrollments${suffix}`, 'تعذر تحميل تسجيلات الخدمات.');
  return (rows || []).map(r => ({
    id: r.id,
    studentId: r.student_id ?? r.studentId,
    serviceKey: r.service_key ?? r.serviceKey,
    schoolYear: r.school_year ?? r.schoolYear,
    billingMode: r.billing_mode ?? r.billingMode,
    monthlyPrice: r.monthly_price ?? r.monthlyPrice ?? null,
    annualPrice: r.annual_price ?? r.annualPrice ?? null,
    unitPrice: r.unit_price ?? r.unitPrice ?? null,
    validFrom: r.valid_from ?? r.validFrom,
    validTo: r.valid_to ?? r.validTo ?? null
  }));
}

export async function createStudentServiceEnrollmentApi(input: StudentServiceEnrollmentInput): Promise<string | undefined> {
  const data = await postDomainJson<{ id?: string }>('/student-service-enrollments', input, 'تعذر إنشاء تسجيل الخدمة.');
  return data?.id;
}

export async function updateStudentServiceEnrollmentApi(patch: StudentServiceEnrollmentPatch): Promise<void> {
  return putDomain('/student-service-enrollments', patch, 'تعذر تحديث تسجيل الخدمة.');
}

export async function deleteStudentServiceEnrollmentApi(id: string): Promise<void> {
  return deleteDomain(`/student-service-enrollments?id=${encodeURIComponent(id)}`, 'تعذر حذف تسجيل الخدمة.');
}


/** « مسح كل بيانات المطعم » en une seule opération serveur. */
export async function resetMealDataApi(): Promise<void> {
  return postDomain('/meal-reset', {}, 'تعذر مسح بيانات المطعم.');
}


export async function saveExpenses(expenses: CenterExpense[]): Promise<void> {
  return putDomain('/expenses', expenses, 'تعذر حفظ بيانات المصاريف.');
}


export async function saveTimesheets(timesheets: TimesheetEntry[]): Promise<void> {
  return putDomain('/timesheets', timesheets, 'تعذر حفظ بيانات جداول الحضور.');
}


/** Upsert d'UN pointage (marquage présent/absent d'un créneau) — le client
 *  n'envoie que la ligne touchée, pas tout le domaine. */
export async function upsertTimesheetApi(entry: TimesheetEntry): Promise<void> {
  return postDomain('/timesheets', entry, 'تعذر حفظ سجل الحضور.');
}

/** Met à jour UN pointage existant (PUT /api/timesheets, corps = objet). */
export async function updateTimesheetApi(entry: TimesheetEntry): Promise<void> {
  return putDomain('/timesheets', entry, 'تعذر تحديث سجل الحضور.');
}

/** Supprime UN pointage (DELETE /api/timesheets) par id. */
export async function deleteTimesheetApi(entry: Pick<TimesheetEntry, 'id'>): Promise<void> {
  return deleteDomain(`/timesheets?id=${encodeURIComponent(entry.id)}`, 'تعذر حذف سجل الحضور.');
}


export async function saveExternalStudents(externalStudents: ExternalStudentRegister[]): Promise<void> {
  return putDomain('/external-students', externalStudents, 'تعذر حفظ بيانات التلاميذ الخارجيين.');
}


export async function saveRevisionSeances(revisionSeances: RevisionSeance[]): Promise<void> {
  return putDomain('/revision-seances', revisionSeances, 'تعذر حفظ بيانات حصص المراجعة.');
}


/** Creates ONE revision seance (and its students) without rewriting the domain. */
export async function createRevisionSeanceApi(seance: RevisionSeance): Promise<void> {
  return postDomain('/revision-seances', seance, 'تعذر إضافة حصة المراجعة.');
}


/** Upserts ONE revision seance (pointage / édition) without rewriting the domain. */
export async function updateRevisionSeanceApi(seance: RevisionSeance): Promise<void> {
  return putDomain('/revision-seances', seance, 'تعذر حفظ حصة المراجعة.');
}


/** Deletes ONE revision seance (and its students/payments) without rewriting the domain. */
export async function deleteRevisionSeanceApi(seanceId: string): Promise<void> {
  return deleteDomain(`/revision-seances?id=${encodeURIComponent(seanceId)}`, 'تعذر حذف حصة المراجعة.');
}


/** Adds ONE student to an existing revision seance without rewriting the domain. */
export async function addRevisionStudentApi(seanceId: string, student: RevisionSeanceStudent): Promise<void> {
  return postDomain('/revision-students', { seanceId, student }, 'تعذر إضافة التلميذ إلى حصة المراجعة.');
}


/** Removes ONE student from ONE revision seance without rewriting the domain. */
export async function removeRevisionStudentApi(seanceId: string, studentId: string): Promise<void> {
  return deleteDomain(`/revision-students?seanceId=${encodeURIComponent(seanceId)}&studentId=${encodeURIComponent(studentId)}`, 'تعذر حذف التلميذ من حصة المراجعة.');
}


export function saveStudentTimeSheets(sheets: StudentTimeSheet[]): Promise<void> {
  return putDomain('/student-timesheets', sheets, 'تعذر حفظ جداول التوقيت.');
}


/** Deletes ONE timetable (student_years.time_sheet_id → NULL cascades) without rewriting the domain. */
export function deleteStudentTimeSheetApi(timeSheetId: string): Promise<void> {
  return deleteDomain(`/student-timesheets?id=${encodeURIComponent(timeSheetId)}`, 'تعذر حذف جدول التوقيت.');
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


/** Adds ONE تكوين (POST /api/formations) without rewriting the whole formations domain. */
export async function createFormationApi(formation: Formation): Promise<void> {
  return postDomain('/formations', formation, 'تعذر حفظ التكوين.');
}


/** Deletes ONE تكوين (DELETE /api/formations?id=) without rewriting the whole formations domain. */
export async function deleteFormationApi(formationId: string): Promise<void> {
  return deleteDomain(`/formations?id=${encodeURIComponent(formationId)}`, 'تعذر حذف التكوين.');
}


/** Adds ONE student to an existing formation (POST /api/formation-students). */
export async function addFormationStudentApi(formationId: string, student: FormationStudent): Promise<void> {
  return postDomain('/formation-students', { formationId, student }, 'تعذر تسجيل التلميذ في التكوين.');
}


/** Removes ONE student from ONE formation (DELETE /api/formation-students?...) without rewriting the domain. */
export async function removeFormationStudentApi(formationId: string, studentId: string): Promise<void> {
  return deleteDomain(`/formation-students?formationId=${encodeURIComponent(formationId)}&studentId=${encodeURIComponent(studentId)}`, 'تعذر حذف التلميذ من التكوين.');
}


/** Replaces ONLY the weekly schedule of ONE formation (PUT /api/formation-schedule). */
export async function saveFormationScheduleApi(formationId: string, schedule: FormationSeance[]): Promise<void> {
  return putDomain('/formation-schedule', { formationId, schedule }, 'تعذر حفظ جدول الحصص.');
}


// ─── Événements & Sorties ───────────────────────────────────────────────────

export async function saveEventsApi(events: SchoolEvent[]): Promise<void> {
  return putDomain('/events', events, 'تعذر حفظ بيانات الفعاليات.');
}

/**
 * Crée / met à jour UNE SEULE activité (POST) — jamais la liste complète.
 * Idempotent : re-POST du même id réécrit cette activité et rien d'autre.
 */
export async function createEventApi(event: SchoolEvent): Promise<void> {
  return postDomain('/events', event, 'تعذر حفظ الفعالية.');
}

/** Supprime UNE activité ciblée — jamais la liste complète. */
export async function deleteEventApi(eventId: string): Promise<void> {
  return deleteDomain(`/events?id=${encodeURIComponent(eventId)}`, 'تعذر حذف الفعالية.');
}

/**
 * Ajoute / met à jour UN participant d'UNE activité : ne réécrit que la ligne
 * `events` ciblée, jamais toute la liste des événements.
 */
export async function addEventParticipantApi(eventId: string, participant: EventParticipant): Promise<void> {
  return postDomain('/event-participants', { eventId, participant }, 'تعذر حفظ بيانات المشارك.');
}

/** Supprime UN participant d'UNE activité — jamais la liste complète. */
export async function deleteEventParticipantApi(eventId: string, participantId: string): Promise<void> {
  return deleteDomain(`/event-participants?eventId=${encodeURIComponent(eventId)}&participantId=${encodeURIComponent(participantId)}`, 'تعذر حذف المشارك.');
}


export async function fetchEventsApi(): Promise<SchoolEvent[]> {
  const res = await fetch(`${API_BASE}/events`, {
    headers: authHeaders(false),
    credentials: 'include'
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data = await res.json().catch(() => ([]));
  if (!res.ok) {
    const errObj = (data && typeof data === 'object' && 'error' in data) ? (data as { error?: string }) : {};
    throw new Error(errObj.error || 'تعذر تحميل بيانات الفعاليات.');
  }
  return Array.isArray(data) ? data : [];
}


// ─── Activités & Planning / Compétences & Skills ───────────────────────

export async function saveActivities(activities: Activity[]): Promise<void> {
  return putDomain('/activities', activities, 'تعذر حفظ بيانات الأنشطة.');
}

/**
 * Crée / met à jour UNE SEULE activité (POST) — jamais la liste complète du
 * planning. Idempotent : re-POST du même id réécrit cette activité et rien
 * d'autre.
 */
export async function createActivityApi(activity: Activity): Promise<void> {
  return postDomain('/activities', activity, 'تعذر حفظ النشاط.');
}

/** Supprime UNE activité ciblée — jamais la liste complète. */
export async function deleteActivityApi(activityId: string): Promise<void> {
  return deleteDomain(`/activities?id=${encodeURIComponent(activityId)}`, 'تعذر حذف النشاط.');
}


export async function fetchActivitiesApi(): Promise<Activity[]> {
  return getDomain<Activity[]>('/activities', 'تعذر تحميل بيانات الأنشطة.');
}


export async function saveSkills(doc: { catalog: Skill[]; evaluations: SkillEvaluation[] }): Promise<void> {
  return putDomain('/skills', doc, 'تعذر حفظ بيانات المهارات.');
}

/**
 * Crée / met à jour UNE SEULE compétence (POST) — jamais le document complet.
 * Idempotent : re-POST du même id réécrit cette compétence et rien d'autre.
 */
export async function createSkillApi(skill: Skill): Promise<void> {
  return postDomain('/skills', skill, 'تعذر حفظ المهارة.');
}

/** Supprime UNE compétence ciblée (+ ses évaluations) — jamais le document complet. */
export async function deleteSkillApi(skillId: string): Promise<void> {
  return deleteDomain(`/skills?id=${encodeURIComponent(skillId)}`, 'تعذر حذف المهارة.');
}

/**
 * Ajoute / met à jour UNE SEULE évaluation (POST) — jamais le document complet.
 * Règle latest-save-wins côté serveur : une évaluation par couple (élève, compétence).
 */
export async function addSkillEvaluationApi(evaluation: SkillEvaluation): Promise<void> {
  return postDomain('/skill-evaluations', evaluation, 'تعذر حفظ التقييم.');
}


export async function fetchSkillsApi(): Promise<{ catalog: Skill[]; evaluations: SkillEvaluation[] }> {
  return getDomain<{ catalog: Skill[]; evaluations: SkillEvaluation[] }>('/skills', 'تعذر تحميل بيانات المهارات.');
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

// Établissements du centre (id + nom), issus de la table etablissements
// (scope center_id dérivé de la session côté serveur).
export interface EtablissementRef {
  id: string;
  name: string;
}

export async function fetchEtablissementsApi(): Promise<EtablissementRef[]> {
  return getDomain<EtablissementRef[]>('/etablissements', 'تعذر تحميل قائمة المؤسسات.');
}


// ─── Student years (table student_years) — mutations ciblées ──────────
// L'élève n'est PAS renvoyé entier : on ne poste que la ligne
// { studentId, schoolYear, … } à créer/modifier (comme /api/payments).
export interface StudentYearRef {
  studentId: string;
  schoolYear: string;
  grade?: string;
  etablissementId?: string;
  etablissementName?: string;
  timeSheetId?: string;
}

export async function fetchStudentYearsApi(): Promise<StudentYearRef[]> {
  return getDomain<StudentYearRef[]>('/student-years', 'تعذر تحميل سنوات التلاميذ.');
}

/** Insère ou met à jour la ligne (studentId, schoolYear) — champs partiels acceptés. */
export async function upsertStudentYearApi(input: StudentYearRef): Promise<void> {
  return postDomain('/student-years', input, 'تعذر حفظ سنة التلميذ.');
}

/** Mise à jour partielle d'une ligne existante (404 si absente). */
export async function updateStudentYearApi(input: StudentYearRef): Promise<void> {
  return putDomain('/student-years', input, 'تعذر تعديل سنة التلميذ.');
}

export async function deleteStudentYearApi(studentId: string, schoolYear: string): Promise<void> {
  return deleteDomain(`/student-years?studentId=${encodeURIComponent(studentId)}&schoolYear=${encodeURIComponent(schoolYear)}`, 'تعذر حذف سنة التلميذ.');
}

/** Retire l'élève de l'assignation d'un emploi du temps (grade/établissement préservés) sans réécrire le domaine. */
export async function unassignStudentYearApi(studentId: string, schoolYear: string): Promise<void> {
  return deleteDomain(`/student-years?studentId=${encodeURIComponent(studentId)}&schoolYear=${encodeURIComponent(schoolYear)}&timeSheetId=`, 'تعذر إلغاء إسناد جدول التوقيت.');
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
    formations,
    events,
    activities,
    skills
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
    getDomain<Formation[]>('/formations', 'تعذر تحميل بيانات التكوينات.'),
    fetchEventsApi(),
    getDomain<Activity[]>('/activities', 'تعذر تحميل بيانات الأنشطة.'),
    getDomain<{ catalog: Skill[]; evaluations: SkillEvaluation[] }>('/skills', 'تعذر تحميل بيانات المهارات.')
  ]);

  return {
    settings,
    activities: activities || [],
    skills: skills?.catalog || [],
    skillEvaluations: skills?.evaluations || [],
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
    formations: formations || [],
    events: events || []
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


/**
 * Catalogue public (modules, types de centre, compatibilité) chargé à
 * l'EXÉCUTION depuis /api/catalog — tables `modules`, `center_types` et
 * `center_type_modules`. Aucune session requise.
 */
export interface CatalogPayload {
  modules: Array<{
    key: string;
    label: string;
    labelAr: string;
    isBasic: boolean;
    isUnbilled: boolean;
    isHidden: boolean;
    icon: string;
    description: string;
    features: string[];
  }>;
  centerTypes: Array<{ key: string; label: string; labelAr: string; hint: string; hintAr: string }>;
  centerTypeModules: Array<{ centerType: string; moduleKey: string }>;
}

/** Fetch the public catalog without a session. */
export async function fetchCatalogApi(): Promise<CatalogPayload> {
  const res = await fetch(`${API_BASE}/catalog`, {
    credentials: 'same-origin'
  });
  const data: Partial<CatalogPayload> & { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur chargement du catalogue.');
  return {
    modules: data.modules || [],
    centerTypes: data.centerTypes || [],
    centerTypeModules: data.centerTypeModules || []
  };
}


// ─── Annonces actives : déduplication + cache TTL court ────────────────────
// Trois surfaces (2 carrousels + interstitiel) demandent la même liste pour un
// même couple (location, centerId), et le StrictMode de React double chaque
// effet en dev. Un cache module réduit tout ça à UNE requête réseau par
// fenêtre. Les annonces sont rédigées dans la console plateforme et changent
// rarement : un TTL court est sûr. Les échecs ne sont jamais mis en cache —
// le montage suivant retente.
const ADS_CACHE_TTL_MS = 60_000;
let adsCache: { key: string; data: any[]; expiresAt: number } | null = null;
const adsInFlight = new Map<string, Promise<any[]>>();

/** Test-only : vide le cache/dedup des annonces entre les tests. */
export function __resetActiveAdsCacheForTests(): void {
  adsCache = null;
  adsInFlight.clear();
}

/** Fetch active advertisements by location and optional centerId (public endpoint). */
export async function fetchActiveAdvertisementsApi(location: string, centerId?: string): Promise<any[]> {
  const key = `${location}|${centerId || ''}`;
  if (adsCache && adsCache.key === key && Date.now() < adsCache.expiresAt) {
    return adsCache.data;
  }
  const pending = adsInFlight.get(key);
  if (pending) return pending;

  const params = new URLSearchParams({ location });
  if (centerId) params.set('centerId', centerId);

  const request = (async () => {
    const res = await fetch(`${API_BASE}/advertisements/active?${params.toString()}`, {
      credentials: 'same-origin'
    });
    const data: { advertisements?: any[]; error?: string } = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'خطأ في جلب الإعلانات.');
    const ads = data.advertisements || [];
    adsCache = { key, data: ads, expiresAt: Date.now() + ADS_CACHE_TTL_MS };
    return ads;
  })().finally(() => {
    adsInFlight.delete(key);
  });

  adsInFlight.set(key, request);
  return request;
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
