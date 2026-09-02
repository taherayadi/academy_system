export interface UserAccount {
  email: string;
  name: string;
  role: 'super_admin' | 'restricted_admin';
  description: string;
}

export interface CenterFeeSet {
  fraisAnnuelSuivi: number;
  fraisMensuelSuivi: number;
  fraisAnnuelBibliotheque: number;
  fraisMensuelBibliotheque: number;
  fraisAbonnementRepas: number;
  fraisParRepas: number;
  prixPlatTraiteur: number;
  fraisAnnuelEtude: number;
  fraisMensuelEtude: number;
  fraisAssuranceCoursExternes: number;
}

export interface CenterSettings {
  centerName: string;
  phoneNumber: string;
  locationCity: string;
  geminiApiKey?: string;
  fees: CenterFeeSet;
  // Per-school-year fee overrides: key = "2025/2026" ...
  feesByYear: Record<string, CenterFeeSet>;
  // Shared list of matières (subjects) used across the whole app (Suivi notes, staff, cours)
  subjects?: string[];
  // Shared list of known etablissements (schools/establishments)
  etablissements?: string[];
}

export const initialCenterFeeSet: CenterFeeSet = {
  fraisAnnuelSuivi: 150,
  fraisMensuelSuivi: 250,
  fraisAnnuelBibliotheque: 20,
  fraisMensuelBibliotheque: 30,
  fraisAbonnementRepas: 150,
  fraisParRepas: 8,
  prixPlatTraiteur: 6,
  fraisAnnuelEtude: 100,
  fraisMensuelEtude: 180,
  fraisAssuranceCoursExternes: 50
};

// Default fees applied at student creation time
export const initialStudentFeeSet: CenterFeeSet = {
  fraisAnnuelSuivi: 150,
  fraisMensuelSuivi: 250,
  fraisAnnuelBibliotheque: 20,
  fraisMensuelBibliotheque: 30,
  fraisAbonnementRepas: 150,
  fraisParRepas: 8,
  prixPlatTraiteur: 6,
  fraisAnnuelEtude: 100,
  fraisMensuelEtude: 180,
  fraisAssuranceCoursExternes: 50
};

// Shared default list of matières used across the whole app (Suivi notes devoirs, staff enseignant, cours)
export const APP_SUBJECTS = [
  'الرياضيات (Mathématiques)',
  'الفيزياء والكيمياء (Physique-Chimie)',
  'علوم الحياة والأرض (SVT)',
  'اللغة العربية (Arabe)',
  'اللغة الفرنسية (Français)',
  'اللغة الإنجليزية (Anglais)',
  'الإعلامية (Informatique)',
  'الفلسفة (Philosophie)',
  'التاريخ والجغرافيا (Histoire-Géo)',
  'الإقتصاد والتصرف (Économie-Gestion)'
];

export const initialCenterSettings: CenterSettings = {
  centerName: 'المركز',
  phoneNumber: '+216 71 000 000',
  locationCity: 'Sfax / تونس',
  fees: initialStudentFeeSet,
  feesByYear: {
    '2022/2023': initialStudentFeeSet,
    '2023/2024': initialStudentFeeSet,
    '2024/2025': initialStudentFeeSet,
    '2025/2026': initialStudentFeeSet,
    '2026/2027': initialStudentFeeSet,
    '2027/2028': initialStudentFeeSet,
    '2028/2029': initialStudentFeeSet
  },
  subjects: APP_SUBJECTS
};

// Fixed academic year list shown in every year combobox (3 years before and after the current one)
export const DEFAULT_ACADEMIC_YEARS = [
  '2022/2023', '2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'
];

export function normalizeFeeSet(raw: any, fallback?: Partial<CenterFeeSet> | null): CenterFeeSet {
  const fb = fallback || {};
  if (!raw || typeof raw !== 'object') {
    return {
      fraisAnnuelSuivi: Number(fb.fraisAnnuelSuivi) || 0,
      fraisMensuelSuivi: Number(fb.fraisMensuelSuivi) || 0,
      fraisAnnuelBibliotheque: Number(fb.fraisAnnuelBibliotheque) || 0,
      fraisMensuelBibliotheque: Number(fb.fraisMensuelBibliotheque) || 0,
      fraisAbonnementRepas: Number(fb.fraisAbonnementRepas) || 0,
      fraisParRepas: Number(fb.fraisParRepas) || 0,
      prixPlatTraiteur: fb.prixPlatTraiteur != null ? Number(fb.prixPlatTraiteur) : 6,
      fraisAnnuelEtude: Number(fb.fraisAnnuelEtude) || 0,
      fraisMensuelEtude: Number(fb.fraisMensuelEtude) || 0,
      fraisAssuranceCoursExternes: Number(fb.fraisAssuranceCoursExternes) || 0
    };
  }

  const getNum = (camelKey: string, snakeKey: string, altKey?: string, defaultVal = 0): number => {
    if (raw[camelKey] != null && raw[camelKey] !== '') return Number(raw[camelKey]) || 0;
    if (raw[snakeKey] != null && raw[snakeKey] !== '') return Number(raw[snakeKey]) || 0;
    if (altKey && raw[altKey] != null && raw[altKey] !== '') return Number(raw[altKey]) || 0;
    return defaultVal;
  };

  return {
    fraisAnnuelSuivi: getNum('fraisAnnuelSuivi', 'frais_annuel_suivi', 'suiviAnnualFee', Number(fb.fraisAnnuelSuivi) || 0),
    fraisMensuelSuivi: getNum('fraisMensuelSuivi', 'frais_mensuel_suivi', 'suiviMonthlyFee', Number(fb.fraisMensuelSuivi) || 0),
    fraisAnnuelBibliotheque: getNum('fraisAnnuelBibliotheque', 'frais_annuel_bibliotheque', 'libraryAnnualFee', Number(fb.fraisAnnuelBibliotheque) || 0),
    fraisMensuelBibliotheque: getNum('fraisMensuelBibliotheque', 'frais_mensuel_bibliotheque', 'libraryMonthlyFee', Number(fb.fraisMensuelBibliotheque) || 0),
    fraisAbonnementRepas: getNum('fraisAbonnementRepas', 'frais_abonnement_repas', 'mealMonthlyPrice', Number(fb.fraisAbonnementRepas) || 0),
    fraisParRepas: getNum('fraisParRepas', 'frais_par_repas', 'mealUnitPrice', Number(fb.fraisParRepas) || 0),
    prixPlatTraiteur: raw.prixPlatTraiteur != null ? Number(raw.prixPlatTraiteur) : (raw.prix_plat_traiteur != null ? Number(raw.prix_plat_traiteur) : (fb.prixPlatTraiteur != null ? Number(fb.prixPlatTraiteur) : 6)),
    fraisAnnuelEtude: getNum('fraisAnnuelEtude', 'frais_annuel_etude', undefined, Number(fb.fraisAnnuelEtude) || 0),
    fraisMensuelEtude: getNum('fraisMensuelEtude', 'frais_mensuel_etude', undefined, Number(fb.fraisMensuelEtude) || 0),
    fraisAssuranceCoursExternes: getNum('fraisAssuranceCoursExternes', 'frais_assurance_cours_externes', 'assuranceFee', Number(fb.fraisAssuranceCoursExternes) || 0)
  };
}

export function normalizeSettings(raw: any, topLevelFees?: any, topLevelFeesByYear?: any): CenterSettings {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  
  let rawBaseFees = src.fees || topLevelFees;
  if (!rawBaseFees || typeof rawBaseFees !== 'object') {
    if (src.fraisAnnuelSuivi != null || src.frais_annuel_suivi != null || src.fraisMensuelSuivi != null) {
      rawBaseFees = src;
    }
  }

  const baseFees = normalizeFeeSet(rawBaseFees, null);

  const rawByYear = (src.feesByYear && typeof src.feesByYear === 'object' && !Array.isArray(src.feesByYear))
    ? src.feesByYear
    : (topLevelFeesByYear && typeof topLevelFeesByYear === 'object' && !Array.isArray(topLevelFeesByYear))
      ? topLevelFeesByYear
      : {};

  const feesByYear: Record<string, CenterFeeSet> = {};

  for (const [year, yFees] of Object.entries(rawByYear)) {
    if (year && typeof yFees === 'object' && yFees !== null) {
      feesByYear[year] = normalizeFeeSet(yFees, baseFees);
    }
  }

  DEFAULT_ACADEMIC_YEARS.forEach(yr => {
    if (!feesByYear[yr]) {
      feesByYear[yr] = { ...baseFees };
    }
  });

  const subjects: string[] = Array.isArray(src.subjects) && src.subjects.length > 0
    ? (Array.from(new Set(src.subjects.map((s: any) => String(s).trim()).filter(Boolean))) as string[])
    : [...APP_SUBJECTS];

  return {
centerName: src.centerName || src.center_name || 'المركز',
    phoneNumber: src.phoneNumber || src.phone_number || '',
    locationCity: src.locationCity || src.location_city || '',
    geminiApiKey: src.geminiApiKey || src.gemini_api_key || '',
    fees: baseFees,
    feesByYear,
    subjects
  };
}

// Returns the fees to apply for a given academic year
export function getFeesForYear(settings: CenterSettings | null | undefined, year: string): CenterFeeSet {
  if (!settings) {
    return {
      fraisAnnuelSuivi: 0,
      fraisMensuelSuivi: 0,
      fraisAnnuelBibliotheque: 0,
      fraisMensuelBibliotheque: 0,
      fraisAbonnementRepas: 0,
      fraisParRepas: 0,
      prixPlatTraiteur: 6,
      fraisAnnuelEtude: 0,
      fraisMensuelEtude: 0,
      fraisAssuranceCoursExternes: 0
    };
  }
  const raw = (settings.feesByYear && settings.feesByYear[year]) || settings.fees;
  return normalizeFeeSet(raw, settings.fees);
}

export type ServiceType = 'suivi' | 'etude' | 'externalCourse' | 'library' | 'meals';

export type PaymentStatus = 'paid' | 'advance' | 'unpaid';

export const ACADEMIC_MONTHS = [
  'Septembre', 'Octobre', 'Novembre', 'Décembre', 
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai'
] as const;

export type AcademicMonth = typeof ACADEMIC_MONTHS[number];

export const ARABIC_MONTHS: Record<string, string> = {
  'Septembre': 'سبتمبر',
  'Octobre': 'أكتوبر',
  'Novembre': 'نوفمبر',
  'Décembre': 'ديسمبر',
  'Janvier': 'جانفي',
  'Février': 'فيفري',
  'Mars': 'مارس',
  'Avril': 'أفريل',
  'Mai': 'ماي',
  'Juin': 'جوان',
  'Juillet': 'جويلية',
  'Août': 'أوت'
};

export const ARABIC_ACADEMIC_MONTHS: Record<AcademicMonth, string> = {
  'Septembre': 'سبتمبر',
  'Octobre': 'أكتوبر',
  'Novembre': 'نوفمبر',
  'Décembre': 'ديسمبر',
  'Janvier': 'جانفي',
  'Février': 'فيفري',
  'Mars': 'مارس',
  'Avril': 'أفريل',
  'Mai': 'ماي'
};

// Arabic month names indexed by JS Date month number (0 = January ... 11 = December)
export const MONTH_BY_CALENDAR_INDEX: string[] = [
  'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
  'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export function monthToArabic(monthStr: string): string {
  const match = Object.keys(ARABIC_MONTHS).find(key => monthStr.includes(key));
  if (!match) return monthStr;
  return monthStr.replace(match, ARABIC_MONTHS[match]);
}

// Map a real JS month index (0=January) to an academic index (0=Septembre ... 8=Mai).
// Returns -1 when the real month is outside the academic calendar (Juin/Juillet/Août).
export function getCurrentAcademicIndex(): number {
  const real = new Date().getMonth();
  const map: Record<number, number> = {
    8: 0, 9: 1, 10: 2, 11: 3, 0: 4, 1: 5, 2: 6, 3: 7, 4: 8
  };
  return map[real] ?? -1;
}

// Current academic year label (e.g. '2026/2027') based on today's date.
// A new academic year starts in July, so August 2026 -> '2026/2027'.
export function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

export interface ParentInfo {
  name: string;
  birthDate: string;
  profession: string;
  address: string;
  phoneFixed: string;
  phoneMobile: string;
  email: string;
  extraPhones?: string[];
}

export interface Sibling {
  id: string;
  name: string;
  age: number;
  grade: string;
}

export interface AuthorizedPerson {
  id: string;
  name: string;
  phone: string;
  relation: string;
}

export interface AcademicHistoryEntry {
  school: string;
  grade: string;
}

export interface PaymentRecord {
  id: string;
  date: string;
  amountPaid: number;
  totalRequired: number;
  remainingBalance: number;
  service: 'Suivi' | 'Inscription Suivi' | 'Étude' | 'Inscription Étude' | 'Cours Particuliers' | 'Revision' | 'Formation' | 'Bibliothèque' | 'Inscription Bibliothèque' | 'Repas' | 'Assurance' | 'Autres';
  month: string; // e.g. "Octobre"
  paymentType: 'full' | 'advance' | 'balance'; // Payé / Avance (acompte) / Solde
  method: 'Espèces' | 'Chèque' | 'Virement';
  chequeNumber?: string;
  chequeDate?: string;
  chequePaid?: boolean; // true when the cheque has been cashed/received
  receiptNumber: string;
  notes?: string;
  discount?: number;  // discount granted on this month/registration fee (حسم / تخفيض)
  refund?: boolean;       // true when this record is a refund (remboursement)
  refundOf?: string;      // id of the original payment being refunded
}

/** Stored payment.service must stay generic and independent of the center name. */
export function normalizePaymentService(service: unknown, month?: unknown): PaymentRecord['service'] | string {
  const legacyService = String(service ?? '').replace(/\s+/g, ' ').trim();
  const isAnnual = String(month ?? '').startsWith('Annuel');
  if (legacyService === 'Inscription') return 'Inscription Suivi';
  if (legacyService === 'Bibliothèque' && isAnnual) return 'Inscription Bibliothèque';
  return legacyService;
}

export interface MealSubscription {
  mode: 'subscription' | 'unit';
  monthlyPrice: number; // ex: 150 DT
  unitPrice: number;    // ex: 8 DT
  prepaidMeals: number; // ex: 18 repas
  consumedMealsCount: number; // ex: 5 repas
  active: boolean;
}

/** One meal served to a student on a specific date. */
export interface MealAttendance {
  date: string;
  /** A monthly subscriber or a student paying for a single dish. */
  type: 'subscription' | 'unit';
  paid: boolean;
  paidAt?: string;
}

export interface StudentRegistration {
  date: string;
  location: string;
  signedElectronically: boolean;
  signatureName?: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  grade: string; // Level e.g. "Collège 8ème", "Lycée 2ème Science", etc.
  
  // Academic Year
  academicYear?: string; // e.g. "2025/2026"
  etablissement?: string; // School / establishment name
  
  // MODULE 1 Legal Guardians
  mother: ParentInfo;
  father: ParentInfo;
  parentalSituation: 'mariés' | 'séparés_garde_mere' | 'séparés_garde_pere' | 'séparés_garde_alternee';
  parentalComments?: string;
  
  // Family & Authorizations
  siblings: Sibling[];
  authorizedPersons: AuthorizedPerson[];
  allergies: string;
  
  // 3 Last Academic Years
  academicHistory: {
    nMinus1: AcademicHistoryEntry;
    nMinus2: AcademicHistoryEntry;
    nMinus3: AcademicHistoryEntry;
  };
  
  registration: StudentRegistration;
  
  // Service Enrolments
  enrolledServices: {
    suivi: boolean;
    etude: boolean;
    library: boolean;
    meals: boolean;
  };
  
  // MODULE 2: Suivi Fees
  suiviFees: {
    annualRegistrationFee: number; // ex: 150 DT
    monthlyFee: number;            // ex: 250 DT
  };
  
  // MODULE 3: Étude / tutoring fees
  etudeFees: {
    annualRegistrationFee: number; // ex: 50 DT
    monthlyFee: number;            // ex: 80 DT
  };

  // MODULE 5: Library Fees
  libraryFees: {
    annualRegistrationFee: number; // ex: 20 DT
    monthlyFee: number;            // ex: 30 DT
  };

  // MODULE 6: Meals Config
  mealSubscription: MealSubscription;
  mealAttendances?: MealAttendance[];
  
  // Ledger Payments
  payments: PaymentRecord[];
  
  // MODULE 7: Suivi Scolaire - notes per trimester per subject
  suiviNotes?: SuiviNotes[];

  // TimeSheet reference
  timeSheetId?: string;
}

export interface SuiviSubjectGrade {
  devoir1?: number;  // devoir de contrôle n°1
  devoir2?: number;  // devoir de contrôle n°2 (Mathématiques uniquement)
  synthese?: number; // devoir de synthèse
}

export interface SuiviTrimester {
  trimester: 1 | 2 | 3;
  subjects: Record<string, SuiviSubjectGrade>; // subject name (e.g. "Mathématiques") -> grades
}

export interface SuiviNotes {
  schoolYear: string;
  trimesters: SuiviTrimester[];
}

// Backwards-compatible alias kept for any existing imports
export const SUIVI_SUBJECTS = APP_SUBJECTS;

// Returns the shared subject list used everywhere (from settings or default)
export function getAppSubjects(settings?: CenterSettings): string[] {
  return settings?.subjects?.length ? settings.subjects : APP_SUBJECTS;
}

// Helper to detect the Mathématiques subject no matter its label format
export function isMathSubject(subject: string): boolean {
  const s = subject.toLowerCase();
  return s === 'mathématiques' || s.includes('رياضيات') || s.includes('mathématiques');
}

export type StaffRole = 'enseignant' | 'encadrant' | 'administration' | 'agent_entretien' | 'cuisinier' | 'chauffeur_bus' | 'autre';

export type StaffRequestStatus = 'en_attente' | 'approuve' | 'refuse';

export interface LeaveRequest {
  id: string;
  staffId: string;
  startDate: string;
  endDate: string;
  reason: string;
  type: 'Maladie' | 'Annuel' | 'Exceptionnel';
  status: StaffRequestStatus;
}

export interface StaffAdvance {
  id: string;
  staffId: string;
  amount: number;
  date: string;        // تاريخ الطلب
  reason: string;
  status: StaffRequestStatus;
}

export interface PaySlip {
  id: string;
  staffId: string;
  month: string;
  baseSalary: number;
  bonus: number;
  bonusReason: string;
  cnssDeduction: number;
  absenceDeductions: number;
  /** Total of approved advances deducted from this month's salary */
  advanceDeducted: number;
  netSalary: number;
  issueDate: string;
  // Attendance & hours summary for the month
  daysPresent?: number;
  daysAbsent?: number;
  daysRetard?: number;
  extraHours?: number;
  // Extra hours pay (automatic: extraHours * rate)
  extraHourRate?: number;
  extraHoursAmount?: number;
}

export interface StaffPayment {
  id: string;
  month: string;
  amountPaid: number;
  bonus?: number;
  deduction?: number;
  netSalary: number;
  date: string;
  receiptNumber: string;
  notes?: string;
}

export interface StaffScheduleSlot {
  day: string;      // 'Lundi' | 'Mardi' | ... | 'Samedi'
  slots: string[];  // e.g. ['08:00 - 12:00', '14:00 - 18:00']
}

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  cin: string;
  cnssNumber: string; // Numéro CNSS
  subjects: string[]; // Matières enseignées
  salary: number;     // Salaire fixe ou tarif
  type: 'salarié' | 'externe'; // Salarié du centre ou externe
  phone: string;
  role: StaffRole;
  contractStartDate: string;
  contractType?: 'CDI' | 'CDD' | 'Vacation';
  email?: string;
  address?: string;
  baseSalary?: number;
  cnssAmount?: number;
  hourlyRate?: number;
  hireDate?: string;
  leaveRequests?: LeaveRequest[];
  advances?: StaffAdvance[];       // طلبات السلف (Demande avance)
  payments?: StaffPayment[];
  payslips?: PaySlip[];
  schedule?: StaffScheduleSlot[]; // Emploi du temps hebdomadaire
}

export interface TimesheetEntry {
  id: string;
  staffId: string;
  date: string;
  slotTime?: string; // ex: "08:00 - 10:00"
  status: 'present' | 'absent' | 'retard' | 'conge';
  leaveReason?: string;
  leaveStatus?: 'en_attente' | 'approuvé' | 'refusé';
  notes?: string;
  hoursWorked?: number; // normal work hours for the day
  extraHours?: number;  // supplementary hours (heures supplémentaires)
}

export const ETUDE_TIME_SLOTS = [
  '08:00 - 10:00',
  '10:00 - 12:00',
  '14:00 - 16:00',
  '16:00 - 18:00',
  '18:00 - 20:00'
] as const;

export type TimeSlot = typeof ETUDE_TIME_SLOTS[number];

export const ETUDE_DAYS = [
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
] as const;

export type EtudeDay = typeof ETUDE_DAYS[number];

export interface EtudeSlot {
  id: string;
  day: EtudeDay;
  startTime: string; // e.g. "08:30"
  endTime: string;   // e.g. "10:30"
  gradeLevel: string; // Level target
  teacherId: string;  // Staff ID
  enrolledStudentIds: string[];
  isExtra?: boolean; // Seance outside the teacher's weekly schedule → counted as additional hours
}

// Tunisian school levels (Primaire 1ère → 6ème, Collège 7ème → 9ème, Lycée 1ère → Bac)
export const EXTERNAL_GRADE_LEVELS: { level: string; branches: string[] }[] = [
  { level: 'Primaire 1ère Année', branches: [] },
  { level: 'Primaire 2ème Année', branches: [] },
  { level: 'Primaire 3ème Année', branches: [] },
  { level: 'Primaire 4ème Année', branches: [] },
  { level: 'Primaire 5ème Année', branches: [] },
  { level: 'Primaire 6ème Année', branches: [] },
  { level: 'Collège 7ème Année', branches: [] },
  { level: 'Collège 8ème Année', branches: [] },
  { level: 'Collège 9ème Année', branches: [] },
  { level: 'Lycée 1ère Année', branches: [] },
  { level: 'Lycée 2ème Année', branches: [] },
  { level: 'Lycée 3ème Année', branches: [] },
  { level: 'Baccalauréat', branches: [] }
];

// Shared subject list used in course (1 matière/course) and enseignant selection
export const COURSE_SUBJECTS = APP_SUBJECTS;

// Build a grade list ("Primaire 1ère", ..., "Baccalauréat") for dropdowns — same labels as student fiche
export function buildExternalGradeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  EXTERNAL_GRADE_LEVELS.forEach(({ level }) => {
    options.push({ value: level, label: level.replace(' Année', '') });
  });
  return options;
}

export const EXTERNAL_GRADE_OPTIONS = buildExternalGradeOptions();

// ─── Student TimeSheet ────────────────────────────────────────────────

export const TIMESHEET_DAYS = ['الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;
export type TimesheetDay = typeof TIMESHEET_DAYS[number];

export interface TimeSheetSlot {
  id?: string;
  day: TimesheetDay;
  startTime: string; // "08:00"
  endTime: string;   // "12:00"
}

export interface StudentTimeSheet {
  id: string;
  schoolYear: string;
  establishmentName: string;
  gradeLevel: string;
  branch?: string;
  className?: string;
  weeklySchedule: TimeSheetSlot[];
  createdAt: string;
  updatedAt: string;
}

export const TIMESHEET_GRADES_NO_BRANCH = [
  'Primaire 1ère', 'Primaire 2ème', 'Primaire 3ème', 'Primaire 4ème', 'Primaire 5ème', 'Primaire 6ème',
  'Collège 7ème', 'Collège 8ème', 'Collège 9ème', 'Lycée 1ère'
];

export const TIMESHEET_GRADES_2EME_BRANCHES = [
  'Lettres (آداب)',
  'Sciences (علوم)',
  'Économie et Services (إقتصاد وخدمات)',
  'Technologies de l\'Informatique (تكنولوجيا المعلومات)',
];

export const TIMESHEET_GRADES_3EME_BAC_BRANCHES = [
  'Lettres (آداب)',
  'Mathématiques (رياضيات)',
  'Sciences Expérimentales (علوم تجريبية)',
  'Sciences Techniques (علوم تقنية)',
  'Sciences de l\'Informatique (علوم الحاسوب)',
  'Économie et Gestion (إقتصاد وتصرف)',
  'Sport (رياضة)',
];

export function getTimesheetBranches(grade: string): string[] {
  if (TIMESHEET_GRADES_NO_BRANCH.some(g => grade.includes(g))) return [];
  if (grade.includes('Primaire') || grade.includes('Collège')) return [];
  if (grade.includes('2ème') || grade.includes('2eme')) return TIMESHEET_GRADES_2EME_BRANCHES;
  if (grade.includes('3ème') || grade.includes('3eme') || grade.includes('Bac')) return TIMESHEET_GRADES_3EME_BAC_BRANCHES;
  return [];
}

export function getTimeSlotsForDay(schedule: TimeSheetSlot[], day: TimesheetDay): TimeSheetSlot[] {
  return schedule.filter(s => s.day === day);
}

export interface ExternalCourseStudent {
  studentId: string;
  studentName: string;
  parentPhone: string;
  isExternal?: boolean;        // true when not a registered center student
  assurancePaid?: boolean;     // assurance scolaire paid for the year
  assuranceAmount?: number;    // ex: 50 DT
  assuranceDate?: string;
  enrolledAt?: string;         // date of enrollment in course
}

// Global register of external (hors-liste) students shared across all courses
export interface ExternalRegistrationRecord {
  id: string;
  studentId: string;
  courseId: string;
  courseName: string;   // subject + grade for display
  schoolYear: string;
  amountPaid: number;
  date: string;
  method: 'Espèces' | 'Chèque' | 'Virement';
  notes?: string;
}

export interface ExternalAttendanceRecord {
  id: string;
  studentId: string;
  courseId: string;
  courseName: string;   // subject (grade) for display
  date: string;
  status: 'present' | 'absent';
}

export interface ExternalStudentRegister {
  id: string;
  name: string;
  parentPhone: string;
  grade: string;
  schoolYear?: string; // ex: "2026/2027" — registration year
  assurancePaid: boolean;
  assuranceAmount: number;
  assuranceDate?: string;
  payments: ExternalRegistrationRecord[];
  attendance: ExternalAttendanceRecord[];
  createdAt: string;
}

export interface ExternalCourse {
  id: string;
  schoolYear: string;  // ex: "2026/2027"
  trimester: string; // ex: "Trimestre 1"
  gradeLevel: string; // ex: "Lycée 3ème Math"
  subject: string;    // ex: "Mathématiques"
  teacherName: string;
  teacherPhone: string;
  monthlyFee: number;  // ex: 80 DT
  teacherShare: number; // ex: 70 DT
  centerShare: number;  // ex: 10 DT
  enrolledStudents: ExternalCourseStudent[];
}

// Per-seance status for an enrolled student in a given session
export type SeanceStudentStatus = 'present' | 'absent' | 'paie_mois' | 'paie_seance';

export interface ExternalCourseSession {
  id: string;
  courseId: string;
  date: string;
  presentStudentIds: string[];
  oneTimeStudents: { id: string; name: string; parentPhone: string; paidUnit: boolean }[];
  monthPaidMap: Record<string, boolean>; // studentId -> isCurrentMonthPaid
  // Optional per-seance status per student (advanced pointage). Falls back to presentStudentIds + monthPaidMap when empty.
  seanceStatusMap?: Record<string, SeanceStudentStatus>;
  // Per-student amount actually collected (paie_mois), keyed by studentId
  seanceAmountMap?: Record<string, number>;
  periodName?: string; // e.g. "الثلاثي الأول" or month label for the session
}

export interface MealPlanDay {
  id: string;
  day: 'Lundi' | 'Mardi' | 'Mercredi' | 'Jeudi' | 'Vendredi';
  date: string;
  dishName: string;
  description: string;
  attendees: {
    studentId: string;
    isOneTime: boolean;
    paidUnit: boolean;
  }[];
}

// A single "seance de revision" (one-time revision session with an external teacher).
// Unlike a course, it has no monthly fee / cycles / assurance — just 1 session.
export interface RevisionSeanceStudent {
  studentId: string;
  studentName: string;
  parentPhone: string;
  paidSeance: boolean;  // did this student pay for the revision seance
  present: boolean;     // attendance status
}

export interface RevisionSeance {
  id: string;
  schoolYear: string;   // ex: "2026/2027"
  trimester: string;    // ex: "Trimestre 1"
  gradeLevel: string;   // ex: "Baccalauréat"
  subject: string;      // ex: "Mathématiques"
  teacherName: string;
  teacherPhone: string;
  date: string;         // seance date
  teacherShare: number;
  centerShare: number;
  students: RevisionSeanceStudent[];
}

export interface FormationMatiere {
  id: string;
  subject: string;
}

export interface FormationStudent {
  id: string;
  studentName: string;
  parentPhone: string;
  isPack: boolean;
  enrolledMatiereIds: string[];
  amountPaid: number;
  totalRequired: number;
  remainingBalance: number;
  paymentMethod: 'espece' | 'cheque';
  chequeNumber?: string;
  chequeDate?: string;
  chequePaid?: boolean;
  discount: number;
  isAdvance: boolean;
  paidAt?: string;
  notes?: string;
  enrolledAt: string;
  // Refund (student quit the formation after paying)
  refundAmount?: number;
  refundedAt?: string;
  refundReason?: string;
}

export interface Formation {
  id: string;
  name: string;
  schoolYear: string;
  startDate: string;
  endDate: string;
  packPrice: number;
  matieres: FormationMatiere[];
  students: FormationStudent[];
  createdAt: string;
  // Target grade (المستوى الدراسي) and branch (الشعبة, only for grades > 2ème)
  grade?: string;
  branch?: string;
  // Weekly schedule of training sessions (seances), generated/edited via Gemini aide
  schedule?: FormationSeance[];
}

export interface FormationSeance {
  id: string;
  day: string;          // e.g. الأثنين
  startTime: string;    // e.g. 09:00
  endTime: string;      // e.g. 11:00
  matiere: string;      // subject name
  description?: string;
  // IDs of the students attending this seance. A student cannot attend two
  // overlapping seances on the same day.
  students?: string[];
}

export type StaffPayslip = PaySlip;

export type ExpenseCategory = 
  | 'Télécom' 
  | 'Eau (SONEDE)' 
  | 'Électricité (STEG)' 
  | 'CNSS' 
  | 'Produits d\'hygiène' 
  | 'Fournitures d\'entretien' 
  | 'Frais d\'examen' 
  | 'Assurance' 
  | 'Salaires (Personnel)' 
  | 'الكراء' 
  | 'المحاسبات' 
  | 'Autres';

export interface CenterExpense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  receiptRef: string;
}

/**
 * Generate the next sequential receipt number for a given prefix.
 * Scans all student payments across all students to find the highest
 * existing number for `prefix` and returns `prefix` + (max + 1), zero-padded to 3 digits.
 *
 * Example: generateReceiptNumber(students, 'REC-') → 'REC-001' (first ever)
 *          generateReceiptNumber(students, 'REM-') → 'REM-003'
 */
export function generateReceiptNumber(students: Student[], prefix: string): string {
  let max = 0;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}(\\d+)$`);
  for (const s of students) {
    for (const p of s.payments || []) {
      const match = p.receiptNumber.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
