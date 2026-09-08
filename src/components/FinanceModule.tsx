import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Plus, 
  Receipt, 
  Filter, 
  Search, 
  Calendar, 
  CheckCircle2, 
  ShieldCheck, 
  PieChart, 
  Layers, 
  Zap, 
  Droplet, 
  PhoneCall, 
  Printer, 
  X,
  Eye
} from 'lucide-react';
import { Student, CenterExpense, PaymentRecord, ACADEMIC_MONTHS, ARABIC_ACADEMIC_MONTHS, AcademicMonth, ExpenseCategory, monthToArabic, ExternalStudentRegister, ExternalCourse, CenterSettings, getFeesForYear, DEFAULT_ACADEMIC_YEARS, RevisionSeance, getCurrentAcademicYear, getCurrentAcademicIndex, EtudeSlot, Formation, MealServiceType, MealForfaitClosure } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import DateField from './DateField';

interface FinanceModuleProps {
  students: Student[];
  expenses: CenterExpense[];
  onUpdateExpenses: (expenses: CenterExpense[]) => void;
  onUpdateStudent?: (student: Student) => void;
  externalStudents?: ExternalStudentRegister[];
  courses?: ExternalCourse[];
  revisions?: RevisionSeance[];
  formations?: Formation[];
  onUpdateFormations?: (formations: Formation[]) => void;
  slots?: EtudeSlot[];
  hideRestrictedModules?: boolean;
  settings?: CenterSettings;
  enabledModules?: string[];
  mealForfaitClosures?: MealForfaitClosure[];
  onUpdateMealForfaitClosures?: (closures: MealForfaitClosure[]) => void;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Télécom',
  'Eau (SONEDE)',
  'Électricité (STEG)',
  'CNSS',
  'Produits d\'hygiène',
  'Fournitures d\'entretien',
  'Frais d\'examen',
  'Assurance',
  'Salaires (Personnel)',
  'الكراء',
  'المحاسبات',
  'Autres'
];

const getServiceOptions = (centerName: string): { value: string; label: string }[] => [
  { value: 'Suivi', label: 'متابعة' },
  { value: 'Inscription Suivi', label: 'تسجيل المتابعة' },
  { value: 'Étude', label: `تأطير ${centerName}` },
  { value: 'Inscription Étude', label: `تسجيل التأطير (${centerName})` },
  { value: 'Cours Particuliers', label: 'دروس خصوصية' },
  { value: 'Revision', label: 'حصة مراجعة' },
  { value: 'Formation', label: 'تكوينات' },
  { value: 'Bibliothèque', label: 'مكتبة' },
  { value: 'Inscription Bibliothèque', label: 'تسجيل المكتبة' },
  { value: 'Repas', label: 'وجبات (Déjeuner)' },
  { value: 'Goûter', label: 'اللمجة (Goûter)' },
  { value: 'Assurance', label: 'تأمين' },
  { value: 'Autres', label: 'أخرى' }
];

// Services hidden for the restricted (limited) account: external courses, revision, formations, meals, assurance
const RESTRICTED_SERVICES = ['Cours Particuliers', 'Revision', 'Formation', 'Repas', 'Assurance'];

const fmt = (n: number) => n.toFixed(3);

const MONTH_TO_NUM: Record<string, number> = {
  'Septembre': 9, 'Octobre': 10, 'Novembre': 11, 'Décembre': 12,
  'Janvier': 1, 'Février': 2, 'Mars': 3, 'Avril': 4, 'Mai': 5,
  'Juin': 6, 'Juillet': 7, 'Août': 8
};

// Meal attendances are stored as YYYY-MM-DD, so a French month name has to be
// translated into a date prefix before it can be matched against them.
// June..December (6..12) belong to the start year, January..May (1..5) to the end year.
function monthFilterToDatePrefix(monthName: string, schoolYear: string): string | null {
  const num = MONTH_TO_NUM[monthName];
  if (!num) return null;
  const [startYear, endYear] = schoolYear.split('/');
  const year = num >= 6 ? startYear : endYear;
  if (!year) return null;
  return `${year}-${String(num).padStart(2, '0')}`;
}

// The "Clôturer le mois" action is usable only once the displayed academic month is over.
function isAcademicMonthFinished(monthName: string, schoolYear: string): boolean {
  const num = MONTH_TO_NUM[monthName];
  if (!num) return false;
  const [startYear, endYear] = schoolYear.split('/').map(Number);
  if (!startYear || !endYear) return false;
  const calYear = num >= 6 ? startYear : endYear;
  // Month is finished when now is at/after the first day of the following month.
  return new Date() >= new Date(calYear, num, 1);
}

// A school year finishes in May (month 5).
// Months 6..12 (June through December) belong to the upcoming school year (e.g. 06/2026..12/2026 -> 2026/2027).
// Months 1..5 (January through May) belong to the active school year (e.g. 01/2027..05/2027 -> 2026/2027).
function expenseInSchoolYear(date: string, schoolYear: string): boolean {
  if (!date || schoolYear === 'all') return true;
  const [y, m] = date.split('-').map(Number);
  const [startYear, endYear] = schoolYear.split('/').map(Number);
  if (!y || !m || !startYear || !endYear) return false;
  if (m >= 6 && m <= 12) return y === startYear;
  if (m >= 1 && m <= 5) return y === endYear;
  return false;
}

export default function FinanceModule({ students, expenses, onUpdateExpenses, onUpdateStudent, externalStudents = [], courses = [], revisions = [], formations = [], onUpdateFormations, slots = [], hideRestrictedModules, settings, enabledModules, mealForfaitClosures = [], onUpdateMealForfaitClosures }: FinanceModuleProps) {

  const toast = useToast();
  const centerName = settings?.centerName || 'المركز';

  // enabledModules: undefined = all enabled (backward compat). Otherwise filter by list.
  const hasModule = (key: string) => !enabledModules || enabledModules.includes(key);

  // Services attached to a SaaS module are hidden from every service list
  // (payment type filter, payment forms...) when the center's plan does not
  // include the module — e.g. no 'Repas' without the Cantine module.
  const SERVICE_MODULE: Record<string, string> = {
    'Étude': 'etude', 'Inscription Étude': 'etude',
    'Cours Particuliers': 'coursParticuliers',
    'Revision': 'revision',
    'Formation': 'formations',
    'Bibliothèque': 'bibliotheque', 'Inscription Bibliothèque': 'bibliotheque',
    'Repas': 'cantine', 'Goûter': 'cantine',
    'Assurance': 'coursParticuliers' // تأمين الدروس الخصوصية (كراس خارجي)
  };
  const serviceOptions = getServiceOptions(centerName).filter(s => {
    const moduleKey = SERVICE_MODULE[s.value];
    return !moduleKey || hasModule(moduleKey);
  });
  const canteenEnabled = hasModule('cantine');
  const coursPartEnabled = hasModule('coursParticuliers');
  const revisionsEnabled = hasModule('revision');
  const formationsEnabled = hasModule('formations');

  const [activeTab, setActiveTab] = useState<'overview' | 'studentLedger' | 'history' | 'annualInscriptions' | 'formations' | 'expenses' | 'externalCours' | 'restaurant' | 'cheques'>('overview');

  const [searchTerm, setSearchTerm] = useState('');
  
  // Year and Month Filters
  const [schoolYearFilter, setSchoolYearFilter] = useState<string>(getCurrentAcademicYear());
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const idx = getCurrentAcademicIndex();
    return idx >= 0 ? ACADEMIC_MONTHS[idx] : 'all';
  });
  const [serviceFilter, setServiceFilter] = useState<string>('all');

  // Custom Academic Years list
  const [customYears, setCustomYears] = useState<string[]>(DEFAULT_ACADEMIC_YEARS);
  const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');

  // Selected Student for payment ledger details
  const [selectedStudentForLedger, setSelectedStudentForLedger] = useState<Student | null>(null);

  // Pagination for payment history
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;

  // Pagination for cheques tab
  const [chequesPageByService, setChequesPageByService] = useState<Record<string, number>>({});
  const chequesPageSize = 10;
  const [chequeSearch, setChequeSearch] = useState('');
  const [chequeDetailModal, setChequeDetailModal] = useState<{ chequeNumber?: string; chequeDate?: string; payments: any[]; totalAmount: number; paid: boolean } | null>(null);

  // Expense modal state
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Électricité (STEG)');
  const [expAmount, setExpAmount] = useState<number>(100);
  const [expDescription, setExpDescription] = useState('');
  const [expReceiptRef, setExpReceiptRef] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);

  // Expense delete confirmation state
  const [expenseToDelete, setExpenseToDelete] = useState<CenterExpense | null>(null);

  // Pagination states (20 items per page for most tabs)
  const pageSize = 20;
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const [expensesPage, setExpensesPage] = useState<number>(1);
  const [extDetailPage, setExtDetailPage] = useState<number>(1);
  const [restoPage, setRestoPage] = useState<number>(1);

  // Meal detail month drill-down
  const [consumedDetailMonth, setConsumedDetailMonth] = useState<AcademicMonth | null>(null);
  // Expanded days in the monthly consumption detail (closed by default)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Aggregate stats based on filters
  const allPayments = students.flatMap(s => (s.payments || []).map(p => ({ 
    ...p, 
    studentName: `${s.firstName} ${s.lastName}`, 
    studentGrade: s.grade,
    studentYear: s.academicYear || getCurrentAcademicYear()
  })));

  // French month name derived from a YYYY-MM-DD date
  const monthFromDate = (dateStr: string): string => {
    if (!dateStr) return 'Annuel';
    const mIdx = Number(dateStr.split('-')[1]) - 1;
    return (['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][mIdx]) || 'Annuel';
  };

  // External-course revenue: monthly payments plus the yearly insurance fee.
  // The center keeps only its share (centerShare); the prof share (teacherShare) is
  // automatically recorded as an expense — same model as revision seances / repas.
  type ExternalPaymentRec = PaymentRecord & { studentName: string; studentGrade: string; studentYear: string; teacherShare: number; centerShare: number };
  const externalPayments: ExternalPaymentRec[] = externalStudents.flatMap(reg => {
    const recs: ExternalPaymentRec[] = [];
    (reg.payments || []).forEach(pay => {
      const course = courses.find(c => c.id === pay.courseId);
      const total = (course?.teacherShare ?? 0) + (course?.centerShare ?? 0);
      const centerShare = total > 0 ? Math.round((pay.amountPaid * (course?.centerShare ?? 0)) / total) : pay.amountPaid;
      recs.push({
        id: pay.id,
        date: pay.date,
        amountPaid: pay.amountPaid,
        totalRequired: pay.amountPaid,
        remainingBalance: 0,
        service: 'Cours Particuliers',
        month: monthFromDate(pay.date),
        paymentType: 'full',
        method: pay.method || 'Espèces',
        receiptNumber: `EXT-${reg.id.slice(-4)}-${(pay.date || '').replace(/-/g, '')}`,
        notes: pay.courseName || 'كورسات خاصة',
        studentName: reg.name,
        studentGrade: reg.grade,
        studentYear: reg.schoolYear || '2026/2027',
        teacherShare: pay.amountPaid - centerShare,
        centerShare
      });
    });
    if (reg.assurancePaid && reg.assuranceAmount > 0) {
      recs.push({
        id: 'asr_' + reg.id,
        date: reg.assuranceDate || reg.createdAt || '',
        amountPaid: reg.assuranceAmount,
        totalRequired: reg.assuranceAmount,
        remainingBalance: 0,
        service: 'Assurance',
        month: 'Annuel',
        paymentType: 'full',
        method: 'Espèces',
        receiptNumber: `ASR-${reg.id.slice(-4)}`,
        notes: 'تأمين مدرسي (Assurance) - كراس خارجي',
        studentName: reg.name,
        studentGrade: reg.grade,
        studentYear: reg.schoolYear || '2026/2027',
        teacherShare: 0,
        centerShare: reg.assuranceAmount
      });
    }
    return recs;
  });

  // Revision seance (حصة مراجعة) revenue: each student who paid the seance = one payment.
  // The center only keeps its own share (centerShare); the prof share (teacherShare) is
  // automatically recorded as an expense (مناب الأستاذ) — same model as repas/traiteur.
  type RevisionPaymentRec = PaymentRecord & { studentName: string; studentGrade: string; studentYear: string; teacherShare: number; centerShare: number };
  const revisionPayments: RevisionPaymentRec[] = revisions.flatMap(rev =>
    (rev.students || []).filter(s => s.paidSeance).map(s => ({
      id: `rev_${rev.id}_${s.studentId}`,
      date: rev.date,
      amountPaid: rev.teacherShare + rev.centerShare,
      totalRequired: rev.teacherShare + rev.centerShare,
      remainingBalance: 0,
      service: 'Revision' as const,
      month: monthFromDate(rev.date),
      paymentType: 'full' as const,
      method: 'Espèces' as const,
      receiptNumber: `REV-${rev.id.slice(-4)}-${s.studentId.slice(-4)}`,
      notes: `حصة مراجعة: ${rev.subject} (${rev.gradeLevel}) - أستاذ: ${rev.teacherName}`,
      studentName: s.studentName,
      studentGrade: rev.gradeLevel,
      studentYear: rev.schoolYear || '2026/2027',
      teacherShare: rev.teacherShare,
      centerShare: rev.centerShare
    }))
  );

  // Formation revenue: each student who paid for a formation
  type FormationPaymentRec = PaymentRecord & { studentName: string; studentGrade: string; studentYear: string; formationName: string };
  const formationPayments: FormationPaymentRec[] = formations.flatMap(form =>
    (form.students || []).filter(s => s.amountPaid > 0).flatMap(s => {
      const isAdvance = s.remainingBalance > 0 && s.amountPaid > 0;
      const paymentDate = (s.paidAt ? s.paidAt.split('T')[0] : '') || (form.startDate || new Date().toISOString().split('T')[0]);
      const isCheque = s.paymentMethod === 'cheque';
      const main: FormationPaymentRec = {
        id: `form_${form.id}_${s.id}`,
        date: paymentDate,
        amountPaid: s.amountPaid,
        totalRequired: s.totalRequired,
        remainingBalance: s.remainingBalance,
        service: 'Formation' as const,
        month: `دورة: ${form.name} (${form.schoolYear || '2026/2027'})`,
        paymentType: isAdvance ? ('advance' as const) : ('full' as const),
        method: isCheque ? ('Chèque' as const) : ('Espèces' as const),
        receiptNumber: `FORM-${form.id.slice(-4)}-${s.id.slice(-4)}`,
        notes: `تكوين: ${form.name}${s.isPack ? ' (باك كامل)' : ` (${s.enrolledMatiereIds?.length || 0} مواد)`}${s.notes ? ` - ${s.notes}` : ''}`,
        discount: s.discount || undefined,
        chequeNumber: s.chequeNumber,
        chequeDate: s.chequeDate,
        chequePaid: isCheque ? (s.chequePaid === true ? true : undefined) : undefined,
        studentName: s.studentName,
        studentGrade: 'تكوين',
        studentYear: form.schoolYear || '2026/2027',
        formationName: form.name
      };
      // If the student quit the formation and was refunded, emit a refund record
      const refundedAmount = s.refundAmount ?? 0;
      const refundRecords: FormationPaymentRec[] = refundedAmount > 0 ? [{
        id: `form_${form.id}_${s.id}_refund`,
        date: (s.refundedAt ? s.refundedAt.split('T')[0] : paymentDate),
        amountPaid: refundedAmount,
        totalRequired: s.totalRequired,
        remainingBalance: s.remainingBalance,
        service: 'Formation' as const,
        month: `دورة: ${form.name} (${form.schoolYear || '2026/2027'})`,
        paymentType: 'full' as const,
        method: isCheque ? ('Chèque' as const) : ('Espèces' as const),
        receiptNumber: `FORM-${form.id.slice(-4)}-${s.id.slice(-4)}-R`,
        notes: `استرجاع: ${form.name}${s.refundReason ? ` - ${s.refundReason}` : ''}`,
        refund: true,
        studentName: s.studentName,
        studentGrade: 'تكوين',
        studentYear: form.schoolYear || '2026/2027',
        formationName: form.name
      }] : [];
      return [main, ...refundRecords];
    })
  );

  const allPaymentsMerged = [...allPayments, ...(hideRestrictedModules ? [] : externalPayments), ...(hideRestrictedModules ? [] : revisionPayments), ...(hideRestrictedModules ? [] : formationPayments)]
    .filter(p => !hideRestrictedModules || (p.service !== 'Repas' && p.service !== 'Cours Particuliers' && p.service !== 'Revision' && p.service !== 'Formation'));

  const paymentYearOf = (p: PaymentRecord) => {
    const m = p.month.match(/\((\d{4}\/\d{4})\)/);
    return m ? m[1] : schoolYearFilter;
  };
  const repasCenterShare = (amountPaid: number, _year: string) => {
    // New model: center keeps the full subscription amount.
    // Traiteur share is calculated separately from actual consumption.
    return amountPaid;
  };
  const grandRepasPayments = allPaymentsMerged.filter(p => p.service === 'Repas');

  const isInHouseKitchen = settings?.mealOperatingMode === 'in_house_kitchen';

  // Calculate traiteur share from actual meal consumption across all students
  // Respects each attendance's snapshotted traiteurPrice so switching modes or fees never distorts past costs
  const calcRepasTraiteurTotal = () => {
    if (!settings) return 0;
    let total = 0;
    for (const s of students) {
      const f = getFeesForYear(settings, s.academicYear || getCurrentAcademicYear());
      const attendances = s.mealAttendances || [];
      const lunchAttendances = attendances.filter(a => a.type === 'subscription' && (!a.service || a.service === 'lunch'));
      for (const a of lunchAttendances) {
        const cost = a.traiteurPrice !== undefined ? a.traiteurPrice : (isInHouseKitchen ? 0 : f.prixPlatTraiteur);
        total += cost;
      }
    }
    return total;
  };
  const grandRepasTraiteurTotal = calcRepasTraiteurTotal();

  // Revision seance: the center keeps only its share (centerShare); the prof share
  // (teacherShare) is an automatic expense, exactly like the repas/traiteur model.
  const grandRevisionPayments = allPaymentsMerged.filter((p): p is RevisionPaymentRec => p.service === 'Revision');

  // External course (كورسات خصوصية): the center keeps only its share; the prof share is an expense.
  const grandExternalPayments = allPaymentsMerged.filter((p): p is ExternalPaymentRec => p.service === 'Cours Particuliers');

  // Case C — "forfait ferme": the center acquires the unconsumed prepaid subscription balance
  // at month closure ONLY (button «Clôturer le mois»), so the amount comes from the persisted
  // closure snapshot — NOT from a live computation anymore. A month that is not closed yet
  // contributes 0. Refunds recorded before the closure net out of the snapshot.
  const calcForfaitAcquis = (opts: { monthFilter: string; schoolYear?: string }) => {
    let total = 0;
    for (const c of mealForfaitClosures || []) {
      if (opts.monthFilter !== 'all' && c.month !== opts.monthFilter) continue;
      if (opts.schoolYear && opts.schoolYear !== 'all' && c.schoolYear !== opts.schoolYear) continue;
      total += (c.items || []).reduce((sum, it) => sum + (it?.amount ?? 0), 0);
    }
    return total;
  };

  // Grand totals across all time/records.
  // Repas payments are NOT counted here: the center only earns its margin
  // (fraisParRepas − prixPlatTraiteur per plate consumed), the rest belongs to the traiteur.
  // The traiteur share is therefore never added to expenses — it is already netted out.
  const repasBenefitAllTime = (() => {
    if (!settings) return 0;
    let totalPlates = 0;
    for (const s of students) {
      totalPlates += (s.mealAttendances || []).filter(a => a.paid).length;
    }
    const f = getFeesForYear(settings, getCurrentAcademicYear());
    return totalPlates * (f.fraisParRepas - f.prixPlatTraiteur) + calcForfaitAcquis({ monthFilter: 'all', schoolYear: 'all' });
  })();
  const grandTotalRevenue = allPaymentsMerged
    .filter(p => p.service !== 'Repas')
    .reduce((sum, p) => {
      const rec = p as any;
      return sum + (rec.centerShare ?? p.amountPaid);
    }, 0) + repasBenefitAllTime;
  const grandTotalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Pending cheque amounts (not yet cashed - should NOT count in revenue until validated)
  const grandPendingChequePayments = allPaymentsMerged.filter(p => p.method === 'Chèque' && p.chequePaid !== true);
  const grandPendingChequeTotal = grandPendingChequePayments.reduce((sum, p) => sum + p.amountPaid, 0);
  // Repas cheques are excluded from the revenue deduction: repas revenue is the fixed
  // center margin (benefit), so the subscription cheque never hits the total revenue.
  const grandPendingChequeRevenueTotal = grandPendingChequePayments
    .filter(p => p.service !== 'Repas' && !p.refund)
    .reduce((sum, p) => sum + p.amountPaid, 0);

  // Revenue excluding pending cheques (only cashed cheques and cash count)
  const grandTotalRevenueNet = grandTotalRevenue - grandPendingChequeRevenueTotal;
  const grandTotalNet = grandTotalRevenueNet - grandTotalExpenses;

  // Full 12 calendar months list with Arabic labels
  const FULL_CALENDAR_MONTHS = [
    { key: 'Septembre', label: 'سبتمبر' },
    { key: 'Octobre', label: 'أكتوبر' },
    { key: 'Novembre', label: 'نوفمبر' },
    { key: 'Décembre', label: 'ديسمبر' },
    { key: 'Janvier', label: 'جانفي' },
    { key: 'Février', label: 'فيفري' },
    { key: 'Mars', label: 'مارس' },
    { key: 'Avril', label: 'أفريل' },
    { key: 'Mai', label: 'ماي' },
    { key: 'Juin', label: 'جوان' },
    { key: 'Juillet', label: 'جويلية' },
    { key: 'Août', label: 'أوت' }
  ];

  // Filtered Payments by Year & Month & Search
  const filteredPayments = allPaymentsMerged.filter(p => {
    const matchesYear = schoolYearFilter === 'all' || p.month.includes(schoolYearFilter) || p.studentYear === schoolYearFilter;
    const matchesMonth = monthFilter === 'all' 
      || (p.date && monthFromDate(p.date) === monthFilter)
      || p.month.toLocaleLowerCase('fr').includes(monthFilter.toLocaleLowerCase('fr')) 
      || (() => {
        const datePrefix = monthFilterToDatePrefix(monthFilter, schoolYearFilter);
        return datePrefix ? p.month.toLowerCase().startsWith(`repas unitaire (${datePrefix}`) : false;
      })();
    const matchesSearch = !searchTerm || p.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || p.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesYear && matchesMonth && matchesSearch;
  });

  // Filtered Expenses by Year & Month & Search
  const filteredExpenses = expenses.filter(e => {
    let matchesYear = schoolYearFilter === 'all' || expenseInSchoolYear(e.date, schoolYearFilter);

    let matchesMonth = true;
    if (monthFilter !== 'all') {
      const mNumMap: Record<string, string> = {
        'Septembre': '09', 'Octobre': '10', 'Novembre': '11', 'Décembre': '12',
        'Janvier': '01', 'Février': '02', 'Mars': '03', 'Avril': '04', 'Mai': '05',
        'Juin': '06', 'Juillet': '07', 'Août': '08'
      };
      const expectedM = mNumMap[monthFilter];
      if (expectedM) {
        matchesMonth = e.date.split('-')[1] === expectedM;
      }
    }

    const matchesSearch = !searchTerm || e.category.toLowerCase().includes(searchTerm.toLowerCase()) || e.description.toLowerCase().includes(searchTerm.toLowerCase()) || e.receiptRef.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesYear && matchesMonth && matchesSearch;
  });

  const filteredStudents = students.filter(st => schoolYearFilter === 'all' || (st.academicYear || getCurrentAcademicYear()) === schoolYearFilter);

  const repasPayments = filteredPayments.filter(p => p.service === 'Repas');
  
  // Traiteur total for filtered period: count consumed plates from filtered students
  // Respects snapshotted traiteurPrice per meal attendance
  const calcFilteredRepasTraiteurTotal = () => {
    if (!settings) return 0;
    let total = 0;
    const datePrefix = monthFilter === 'all' ? null : monthFilterToDatePrefix(monthFilter, schoolYearFilter);
    for (const s of filteredStudents) {
      const f = getFeesForYear(settings, s.academicYear || getCurrentAcademicYear());
      const attendances = (s.mealAttendances || []).filter(a => {
        if (!datePrefix) return true;
        return a.date.startsWith(datePrefix);
      });
      const lunchAttendances = attendances.filter(a => a.type === 'subscription' && (!a.service || a.service === 'lunch'));
      for (const a of lunchAttendances) {
        const cost = a.traiteurPrice !== undefined ? a.traiteurPrice : (isInHouseKitchen ? 0 : f.prixPlatTraiteur);
        total += cost;
      }
    }
    return total;
  };
  const repasTraiteurTotal = calcFilteredRepasTraiteurTotal();

  // Gestion du resto: calculate consumption stats for the filtered period
  const calcRestoStats = () => {
    if (!settings) return { totalSubscriptions: 0, totalPlatesConsumed: 0, traiteurShare: 0, centerBenefice: 0 };
    let totalSubscriptions = 0;
    let totalPlatesConsumed = 0;
    let traiteurShare = 0;
    const datePrefix = monthFilter === 'all' ? null : monthFilterToDatePrefix(monthFilter, schoolYearFilter);
    for (const s of filteredStudents) {
      const f = getFeesForYear(settings, s.academicYear || getCurrentAcademicYear());
      const attendances = (s.mealAttendances || []).filter(a => {
        if (!datePrefix) return true;
        return a.date.startsWith(datePrefix);
      });
      const lunchAttendances = attendances.filter(a => a.type === 'subscription' && (!a.service || a.service === 'lunch'));
      totalPlatesConsumed += lunchAttendances.length;
      for (const a of lunchAttendances) {
        const cost = a.traiteurPrice !== undefined ? a.traiteurPrice : (isInHouseKitchen ? 0 : (f.prixPlatTraiteur ?? 6));
        traiteurShare += cost;
      }
      // Count subscription payments for this student in the filtered period
      const subPayments = (s.payments || []).filter(p =>
        p.service === 'Repas' &&
        !p.refund &&
        (monthFilter === 'all' || p.month.includes(monthFilter)) &&
        (schoolYearFilter === 'all' || p.month.includes(schoolYearFilter) || s.academicYear === schoolYearFilter)
      );
      totalSubscriptions += subPayments.reduce((sum, p) => sum + p.amountPaid, 0);
    }
    const centerBenefice = totalSubscriptions - traiteurShare;
    return { totalSubscriptions, totalPlatesConsumed, traiteurShare, centerBenefice };
  };
  const restoStats = calcRestoStats();

  const revisionPaymentsFiltered = filteredPayments.filter((p): p is RevisionPaymentRec => p.service === 'Revision');
  const revisionCenterTotal = revisionPaymentsFiltered.reduce((s, p) => s + p.centerShare, 0);

  const externalPaymentsFiltered = filteredPayments.filter((p): p is ExternalPaymentRec => p.service === 'Cours Particuliers');
  const externalCenterTotal = externalPaymentsFiltered.reduce((s, p) => s + p.centerShare, 0);

  const totalRevenue = filteredPayments.filter(p => p.service !== 'Repas').reduce((sum, p) => {
    const rec = p as any;
    return sum + (rec.centerShare ?? (p.refund ? -p.amountPaid : p.amountPaid));
  }, 0);
  const totalCollected = filteredPayments.filter(p => p.service !== 'Repas').reduce((sum, p) => {
    return sum + (p.refund ? -p.amountPaid : p.amountPaid);
  }, 0);
  
  const SERVICE_LABELS: Record<string, string> = {
    'Suivi': 'متابعة دراسية',
    'Inscription Suivi': 'تسجيل المتابعة',
    'Étude': `تأطير ${centerName}`,
    'Inscription Étude': `تسجيل التأطير (${centerName})`,
    'Cours Particuliers': 'دروس خصوصية',
    'Revision': 'حصة مراجعة',
    'Formation': 'تكوينات ودورات',
    'Bibliothèque': 'مكتبة',
    'Inscription Bibliothèque': 'تسجيل المكتبة',
    'Repas': 'وجبات',
    'Assurance': 'تأمين',
    'Autres': 'أخرى'
  };

  const paymentServiceLabel = (p: { service: string; month?: string }): string => {
    if (p.service === 'Inscription' || p.service === 'Inscription Suivi') return 'تسجيل متابعة دراسية';
    const base = SERVICE_LABELS[p.service] || p.service;
    return String(p.month || '').startsWith('Annuel') ? (base.startsWith('تسجيل') ? base : `تسجيل ${base}`) : base;
  };

  // Pending cheque amounts for filtered period (not yet cashed)
  const filteredPendingChequePayments = filteredPayments.filter(p => p.method === 'Chèque' && p.chequePaid !== true && !p.refund);
  const filteredPendingChequeTotal = filteredPendingChequePayments.reduce((sum, p) => sum + p.amountPaid, 0);

  // Pending cheques across ALL periods. The cheque tab must always list every unpaid cheque,
  // regardless of the month/school-year filter applied to the rest of the finance module.
  const allPendingChequePayments = allPaymentsMerged.filter(p => p.method === 'Chèque' && p.chequePaid !== true && !p.refund);
  // One cheque may cover several services (several payment records sharing one chequeNumber).
  // Count distinct cheques, not payment records.
  const pendingChequeCount = new Set(allPendingChequePayments.map(p => p.chequeNumber || p.id)).size;
  // Total amount of ALL unpaid cheques, regardless of the current month/school-year filter.
  const allPendingChequeTotal = allPendingChequePayments.reduce((sum, p) => sum + p.amountPaid, 0);
  
  // Revenue excluding pending cheques (only cashed cheques and cash count)
  const totalRevenueExclCheques = totalRevenue - filteredPendingChequePayments.filter(p => p.service !== 'Repas' && !p.refund).reduce((sum, p) => {
    const rec = p as any;
    return sum + (rec.centerShare ?? p.amountPaid);
  }, 0);
  
  // Add center benefit from meals: plates consumed × center margin per plate + forfait acquired
  const filteredRestoCenterBenefit = (() => {
    if (!settings) return 0;
    let totalPlates = 0;
    const datePrefix = monthFilter === 'all' ? null : monthFilterToDatePrefix(monthFilter, schoolYearFilter);
    for (const s of filteredStudents) {
      const attendances = (s.mealAttendances || []).filter(a => {
        if (!datePrefix) return true;
        return a.date.startsWith(datePrefix);
      });
      totalPlates += attendances.filter(a => a.paid).length;
    }
    const f = getFeesForYear(settings, getCurrentAcademicYear());
    const margin = f.fraisParRepas - f.prixPlatTraiteur;
    return totalPlates * margin + calcForfaitAcquis({ monthFilter, schoolYear: schoolYearFilter });
  })();
  const totalRevenueWithResto = totalRevenueExclCheques + filteredRestoCenterBenefit;
  // The traiteur share is NOT added here: filteredRestoCenterBenefit is already the center
  // margin (fraisParRepas − prixPlatTraiteur), so the traiteur cost is netted out once.
  const totalExpensesAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenueWithResto - totalExpensesAmount;

  // --- Metric cards ---
  // Card: Total revenue for the school year (NOT affected by the month filter).
  // Repas contributes only its CENTER share (margin), not the traiteur part.
  const repasBenefitYear = (() => {
    if (!settings) return 0;
    let totalPlates = 0;
    const yearStudents = students.filter(st => schoolYearFilter === 'all' || (st.academicYear || getCurrentAcademicYear()) === schoolYearFilter);
    for (const s of yearStudents) {
      totalPlates += (s.mealAttendances || []).filter(a => a.paid).length;
    }
    const f = getFeesForYear(settings, getCurrentAcademicYear());
    return totalPlates * (f.fraisParRepas - f.prixPlatTraiteur) + calcForfaitAcquis({ monthFilter: 'all', schoolYear: schoolYearFilter });
  })();
  const yearNonRepasPayments = allPaymentsMerged.filter(p =>
    (schoolYearFilter === 'all' || p.month.includes(schoolYearFilter) || p.studentYear === schoolYearFilter) && p.service !== 'Repas'
  );
  const yearPendingChequeTotal = yearNonRepasPayments
    .filter(p => p.method === 'Chèque' && p.chequePaid !== true && !p.refund)
    .reduce((sum, p) => {
      const rec = p as any;
      return sum + (rec.centerShare ?? p.amountPaid);
    }, 0);
  const yearTotalRevenue = yearNonRepasPayments.reduce((sum, p) => {
    const rec = p as any;
    return sum + (rec.centerShare ?? p.amountPaid);
  }, 0) + repasBenefitYear - yearPendingChequeTotal;

  // Annual inscription/subscription payments. Selected only by school year — never by month:
  // the total stays the same whatever the month filter.
  const annualInscriptionPayments = allPaymentsMerged.filter(p => {
    const isAnnual = String(p.month || '').startsWith('Annuel') || String(p.service || '').startsWith('Inscription');
    if (!isAnnual) return false;
    const matchesYear = schoolYearFilter === 'all' || p.month.includes(schoolYearFilter) || p.studentYear === schoolYearFilter;
    const matchesSearch = !searchTerm || p.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || p.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesYear && matchesSearch;
  });
  const annualInscriptionTotal = (() => {
    const gross = annualInscriptionPayments.reduce((sum, p) => {
      const rec = p as any;
      return sum + (rec.centerShare ?? (p.refund ? -p.amountPaid : p.amountPaid));
    }, 0);
    const pendingCheque = annualInscriptionPayments
      .filter(p => p.method === 'Chèque' && p.chequePaid !== true && !p.refund)
      .reduce((sum, p) => {
        const rec = p as any;
        return sum + (rec.centerShare ?? p.amountPaid);
      }, 0);
    return gross - pendingCheque;
  })();

  // Card: Revenue without repas, without gouter, without annual inscriptions, without formations,
  // without pending cheques — filtered by the selected month.
  const revenueSansRepas = (() => {
    const rows = filteredPayments.filter(p =>
      p.service !== 'Repas' &&
      p.service !== 'Goûter' &&
      p.service !== 'Formation' &&
      !String(p.service || '').startsWith('Inscription') &&
      !String(p.month || '').startsWith('Annuel')
    );
    const gross = rows.reduce((s, p) => {
      const rec = p as any;
      return s + (rec.centerShare ?? (p.refund ? -p.amountPaid : p.amountPaid));
    }, 0);
    const pending = rows
      .filter(p => p.method === 'Chèque' && p.chequePaid !== true && !p.refund)
      .reduce((s, p) => {
        const rec = p as any;
        return s + (rec.centerShare ?? p.amountPaid);
      }, 0);
    return gross - pending;
  })();
  // Card: Repas revenue for the selected period — only the CENTER share (margin).
  const repasRevenueFiltered = filteredRestoCenterBenefit;
  // Card: Formation revenue for the selected period.
  const formationRevenueFiltered = filteredPayments
    .filter(p => p.service === 'Formation')
    .reduce((s, p) => {
      const rec = p as any;
      return s + (rec.centerShare ?? (p.refund ? -p.amountPaid : p.amountPaid));
    }, 0);

  // Synthetic traiteur-share expense row, shown in the expenses list (قائمة الفواتير ومصاريف السنتر)
  const traiteurShareExpense: CenterExpense | null = repasTraiteurTotal > 0 ? {
    id: 'traiteur-share-synthetic',
    date: new Date().toISOString().split('T')[0],
    category: 'Autres' as ExpenseCategory,
    amount: repasTraiteurTotal,
    description: 'حصة المطعم الخارجي من الوجبات (Part Traiteur Repas) — تُخصم تلقائياً من إيرادات الوجبات',
    receiptRef: 'PART-TRAITEUR'
  } : null;

  const revenueByService = {
    Suivi: filteredPayments.filter(p => p.service === 'Suivi' || p.service === 'Inscription Suivi').reduce((s, p) => s + p.amountPaid, 0),
    Etude: filteredPayments.filter(p => p.service === 'Étude' || p.service === 'Inscription Étude').reduce((s, p) => s + p.amountPaid, 0),
    CoursParticuliers: externalCenterTotal,
    Revision: revisionCenterTotal,
    Formation: filteredPayments.filter(p => p.service === 'Formation').reduce((s, p) => s + (p.refund ? -p.amountPaid : p.amountPaid), 0),
    Bibliotheque: filteredPayments.filter(p => p.service === 'Bibliothèque' || p.service === 'Inscription Bibliothèque').reduce((s, p) => s + p.amountPaid, 0),
    Gouter: filteredPayments.filter(p => p.service === 'Goûter').reduce((s, p) => s + p.amountPaid, 0),
    Assurance: filteredPayments.filter(p => p.service === 'Assurance').reduce((s, p) => s + p.amountPaid, 0),
    Autres: filteredPayments.filter(p => p.service === 'Autres').reduce((s, p) => s + p.amountPaid, 0),
    Refunds: filteredPayments.filter(p => p.refund).reduce((s, p) => s + p.amountPaid, 0)
  };

  // Calculate overall unpaid rate
  const totalRequiredFromStudents = filteredStudents.length * (hideRestrictedModules ? (250 + 80 + 30) : (250 + 80 + 30 + 150)); // exclude Repas when restricted
  const unpaidTotal = Math.max(0, totalRequiredFromStudents - totalCollected);
  const unpaidRate = Math.min(100, Math.round((unpaidTotal / (totalRequiredFromStudents || 1)) * 100));

  // Unique students: a student copied to another academic year is still the same person,
  // so dedupe records that share the same identity (name + birth date + birth place).
  const uniqueStudentCount = new Set(
    students.map(st =>
      `${(st.firstName || '').trim().toLowerCase()}|${(st.lastName || '').trim().toLowerCase()}|${st.birthDate || ''}|${(st.birthPlace || '').trim().toLowerCase()}`
    )
  ).size;

  const handleAddCustomYear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearInput.trim()) return;
    const formatted = newYearInput.trim();
    if (!customYears.includes(formatted)) {
      setCustomYears([...customYears, formatted]);
    }
    setSchoolYearFilter(formatted);
    setNewYearInput('');
    setIsAddYearModalOpen(false);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expAmount) || 0;
    if (amt <= 0) {
      toast.error('عذراً، المبلغ يجب أن يكون أكبر من صفر!');
      return;
    }
    const newExp: CenterExpense = {
      id: 'exp_' + crypto.randomUUID(),
      date: expDate,
      category: expCategory,
      amount: amt,
      description: expDescription.trim(),
      receiptRef: expReceiptRef.trim() || `FAC-${crypto.randomUUID().toString().slice(-4)}`
    };

    onUpdateExpenses([...expenses, newExp]);
    setIsExpenseModalOpen(false);
    setExpAmount(100);
    setExpDescription('');
    setExpReceiptRef('');
    toast.success('تم تسجيل مصاريف السنتر بنجاح!');
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
           <span className="px-3 py-1 bg-[#257C86]/[0.06] text-[#1e626b] text-xs font-bold rounded-lg border border-[#257C86]/20">
               الميزانية، الإيرادات حسب الموديول، ومصاريف السنتر
             </span>
            <span className="text-xs text-slate-400 font-bold">التقرير المالي والمصروفات</span>
          </div>
           <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
             <DollarSign className="h-6 w-6 text-[#257C86]" />
             الميزانية ومصاريف السنتر
           </h2>
           <p className="text-slate-500 text-xs mt-1">
             جدول إحصائي المداخيل والمصاريف، متابعة فواتير الكهرباء والماء والهاتف والـ CNSS، وسجل المقبوضات الكامل.
           </p>
        </div>

        <button
          onClick={() => setIsExpenseModalOpen(true)}
          className="px-5 py-3 bg-[#257C86] hover:bg-[#1e626b] text-white font-extrabold text-sm rounded-2xl transition shadow-md flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus className="h-5 w-5 text-[#257C86]" />
          إضافة مصاريف / فاتورة جديدة
        </button>
      </div>

      {/* OVERALL METRIC CARDS (ALL-TIME SUMMARY) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 no-print">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-1">
          <span className="text-xs font-bold text-slate-500 block">إجمالي المقبوضات الكلي</span>
          <p className="text-2xl font-black font-mono text-emerald-700">{fmt(grandTotalRevenueNet)} د.ت</p>
          <span className="text-[10px] text-slate-400 font-bold block">المقبوضات الفعلية (نقداً + شيكات محصلة)</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-1">
          <span className="text-xs font-bold text-slate-500 block">شيكات معلقة</span>
          <p className="text-2xl font-black font-mono text-[#257C86]">{fmt(grandPendingChequeTotal)} د.ت</p>
          <span className="text-[10px] text-slate-400 font-bold block">شيكات لم يتم تحصيلها بعد</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-1">
          <span className="text-xs font-bold text-slate-500 block">إجمالي مصاريف السنتر الكلي</span>
          <p className="text-2xl font-black font-mono text-red-600">{fmt(grandTotalExpenses)} د.ت</p>
          <span className="text-[10px] text-slate-400 font-bold block">مجموع كافة الفواتير والمصاريف</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-1">
          <span className="text-xs font-bold text-slate-500 block">الصافي المالي الشامل</span>
          <p className="text-2xl font-black font-mono text-[#257C86]">{fmt(grandTotalNet)} د.ت</p>
          <span className="text-[10px] text-slate-400 font-bold block">الفارق الإجمالي للسنتر</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-1">
          <span className="text-xs font-bold text-slate-500 block">عدد التلاميذ الإجمالي</span>
          <p className="text-2xl font-black font-mono text-slate-900">{uniqueStudentCount} تلميذ</p>
          <span className="text-[10px] text-slate-400 font-bold block">{students.length} ملف تسجيل ({uniqueStudentCount} تلميذ فريد)</span>
        </div>
      </div>

      {/* FILTER BAR: ACADEMIC YEAR & MONTH */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#257C86]" />
            <label className="text-xs font-black text-slate-800">السنة الدراسية:</label>
            <select
              value={schoolYearFilter}
              onChange={(e) => {
                setSchoolYearFilter(e.target.value);
                setLedgerPage(1);
                setHistoryPage(1);
                setExpensesPage(1);
                setChequesPageByService({});
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#257C86] cursor-pointer"
            >
              <option value="all">جميع السنوات</option>
              {customYears.map(yr => (
                <option key={yr} value={yr}>السنة الدراسية {yr}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#257C86]" />
            <label className="text-xs font-black text-slate-800">الشهر:</label>
            <select
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                setLedgerPage(1);
                setHistoryPage(1);
                setExpensesPage(1);
                setChequesPageByService({});
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#257C86] cursor-pointer"
            >
              <option value="all">جميع الأشهر</option>
              {FULL_CALENDAR_MONTHS.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setLedgerPage(1);
              setHistoryPage(1);
              setExpensesPage(1);
            }}
            placeholder="بحث بالتلميذ أو الوصل أو المرجع..."
            className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
          />
        </div>
      </div>

      {/* FILTERED METRIC CARDS (ACCORDING TO SELECTED FILTERS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="bg-gradient-to-br from-[#257C86] to-[#1e626b] p-5 rounded-3xl border border-white/20 shadow-lg shadow-[#257C86]/25 space-y-1">
          <span className="text-xs font-bold text-teal-50 block">الإيرادات الكلية (السنة)</span>
          <p className="text-2xl font-black text-white font-mono">{fmt(yearTotalRevenue)} د.ت</p>
          <span className="text-[10px] text-teal-100/80 font-bold">كل الإيرادات دون فيلتر الشهر</span>
        </div>

        <div className="bg-[#257C86]/[0.05] p-5 rounded-3xl border border-[#257C86]/25 shadow-lg shadow-slate-900/5 space-y-1">
          <span className="text-xs font-bold text-[#1e626b] block">التسجيلات السنوية (كل الفترات)</span>
          <p className="text-2xl font-black text-[#257C86] font-mono">{fmt(annualInscriptionTotal)} د.ت</p>
          <span className="text-[10px] text-[#1e626b] font-bold">تسجيلات سنوية — لا يتأثر بفيلتر الشهر</span>
        </div>

        <div className="bg-emerald-50/60 p-5 rounded-3xl border border-emerald-200/80 shadow-lg shadow-slate-900/5 space-y-1">
          <span className="text-xs font-bold text-emerald-800 block">{canteenEnabled && !hideRestrictedModules ? 'المقبوضات بدون المطعم' : 'المقبوضات'}</span>
          <p className="text-2xl font-black text-emerald-700 font-mono">{fmt(revenueSansRepas)} د.ت</p>
          <span className="text-[10px] text-emerald-600 font-bold">بدون سنوي · بدون شيكات معلقة — حسب الشهر</span>
        </div>

        {canteenEnabled && !hideRestrictedModules && (
          <div className="bg-orange-50/60 p-5 rounded-3xl border border-orange-200/80 shadow-lg shadow-slate-900/5 space-y-1">
            <span className="text-xs font-bold text-orange-800 block">إيرادات المطعم</span>
            <p className="text-2xl font-black text-orange-600 font-mono">{fmt(repasRevenueFiltered)} د.ت</p>
            <span className="text-[10px] text-orange-600 font-bold">حصة السنتر فقط (هامش الوجبات + فورفاي غير مستهلك) — حسب الشهر</span>
          </div>
        )}

        {formationsEnabled && !hideRestrictedModules && (
          <div className="bg-teal-50/60 p-5 rounded-3xl border border-teal-200/80 shadow-lg shadow-slate-900/5 space-y-1">
            <span className="text-xs font-bold text-teal-800 block">التكوينات والدورات</span>
            <p className="text-2xl font-black text-teal-600 font-mono">{fmt(formationRevenueFiltered)} د.ت</p>
            <span className="text-[10px] text-teal-600 font-bold">حسب الشهر</span>
          </div>
        )}

        <div className="bg-[#257C86]/[0.06] p-5 rounded-3xl border border-[#257C86]/25 shadow-lg shadow-slate-900/5 space-y-1">
          <span className="text-xs font-bold text-[#1e626b] block">مبالغ الشيكات القادمة</span>
          <p className="text-2xl font-black text-[#257C86] font-mono">{fmt(allPendingChequeTotal)} د.ت</p>
          <span className="text-[10px] text-[#1e626b] font-bold">كل الشيكات غير المحصلة (كل الفترات)</span>
        </div>

        <div className="bg-red-50/60 p-5 rounded-3xl border border-red-200/80 shadow-lg shadow-slate-900/5 space-y-1">
          <span className="text-xs font-bold text-red-800 block">المصاريف المفلترة</span>
          <p className="text-2xl font-black text-red-600 font-mono">{fmt(totalExpensesAmount)} د.ت</p>
          <span className="text-[10px] text-red-500 font-bold">فواتير الفترة المختارة</span>
        </div>

        <div className="bg-gradient-to-br from-[#257C86] to-[#1e626b] p-5 rounded-3xl border border-white/20 shadow-lg shadow-[#257C86]/25 space-y-1">
          <span className="text-xs font-bold text-teal-50 block">الصافي المالي للفترة</span>
          <p className="text-2xl font-black text-white font-mono">{fmt(netProfit)} د.ت</p>
          <span className="text-[10px] text-teal-100/80 font-bold">الإيرادات حسب الشهر − المصاريف حسب الشهر</span>
        </div>
      </div>

      {/* SUB TABS NAVIGATION */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/70 flex flex-wrap items-center gap-2 no-print">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'overview' ? 'bg-[#257C86] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          📊 لوحة التوزيع والإيرادات
        </button>
        <button
          onClick={() => setActiveTab('studentLedger')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'studentLedger' ? 'bg-[#257C86] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          🎓 بطاقة التلميذ المجمعة
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'history' ? 'bg-[#257C86] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          🧾 سجل الخلاص الكامل
        </button>
        <button
          onClick={() => setActiveTab('annualInscriptions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'annualInscriptions' ? 'bg-[#257C86] text-white' : 'text-slate-600 hover:bg-[#257C86]/10 hover:text-[#1e626b]'
          }`}
        >
          📌 سجل الخلاص السنوي
          {annualInscriptionPayments.length > 0 && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
              activeTab === 'annualInscriptions' ? 'bg-white/20 text-white' : 'bg-[#257C86]/10 text-[#257C86]'
            }`}>{annualInscriptionPayments.length}</span>
          )}
        </button>
        {!hideRestrictedModules && formationsEnabled && (
          <button
            onClick={() => setActiveTab('formations')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
              activeTab === 'formations' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-teal-50 hover:text-teal-800'
            }`}
          >
            🎓 سجل التكوينات
            {formationPayments.length > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                activeTab === 'formations' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'
              }`}>{formationPayments.length}</span>
            )}
          </button>
        )}
        {!hideRestrictedModules && coursPartEnabled && (
          <button
            onClick={() => setActiveTab('externalCours')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
              activeTab === 'externalCours' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-teal-50 hover:text-teal-800'
            }`}
          >
            🎒 الكورسات الخارجية
            {externalStudents.length > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                activeTab === 'externalCours' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'
              }`}>{externalStudents.length}</span>
            )}
          </button>
        )}
        {!hideRestrictedModules && canteenEnabled && (
          <button
            onClick={() => setActiveTab('restaurant')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
              activeTab === 'restaurant' ? 'bg-[#257C86] text-white' : 'text-slate-600 hover:bg-[#257C86]/[0.06] hover:text-[#1e626b]'
            }`}
          >
            🍽️ إدارة المطعم
          </button>
        )}
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'expenses' ? 'bg-[#257C86] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          ⚡ مصاريف السنتر
        </button>
        <button
          onClick={() => setActiveTab('cheques')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
            activeTab === 'cheques' ? 'bg-[#257C86] text-white' : 'text-slate-600 hover:bg-[#257C86]/10 hover:text-[#1e626b]'
          }`}
        >
          📋 التحصيل بالشيكات
          {pendingChequeCount > 0 && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
              activeTab === 'cheques' ? 'bg-white/20 text-white' : 'bg-[#257C86]/10 text-[#257C86]'
            }`}>{pendingChequeCount}</span>
          )}
        </button>
      </div>

      {/* TAB 1: OVERVIEW & BREAKDOWN BY SERVICE */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 no-print">
          
          <div className="bg-white p-6 rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-4">
            <h3 className="font-extrabold text-slate-900 text-sm">مداخيل السنتر حسب الموديول والخدمة</h3>
            
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border flex justify-between font-bold">
                <span className="text-slate-700">1. المتابعة الدراسية:</span>
                <span className="font-mono text-emerald-700 font-black">{fmt(revenueByService.Suivi)} د.ت</span>
              </div>
            {hasModule('etude') && (
              <div className="p-3 bg-slate-50 rounded-2xl border flex justify-between font-bold">
                <span className="text-slate-700">2. دراسات {centerName}:</span>
                <span className="font-mono text-emerald-700 font-black">{fmt(revenueByService.Etude)} د.ت</span>
              </div>
              )}
              {!hideRestrictedModules && coursPartEnabled && (
                <div className="p-3 bg-slate-50 rounded-2xl border flex justify-between font-bold">
                  <span className="text-slate-700">3. مناب السنتر من الكورسات الخاصة:</span>
                  <span className="font-mono text-emerald-700 font-black">{fmt(revenueByService.CoursParticuliers)} د.ت</span>
                </div>
              )}
              {!hideRestrictedModules && revisionsEnabled && (
                <div className="p-3 bg-slate-50 rounded-2xl border flex justify-between font-bold">
                  <span className="text-slate-700">3ب. مناب السنتر من حصص المراجعة:</span>
                  <span className="font-mono text-emerald-700 font-black">{fmt(revenueByService.Revision)} د.ت</span>
                </div>
              )}
              {!hideRestrictedModules && formationsEnabled && (
                <div className="p-3 bg-slate-50 rounded-2xl border flex justify-between font-bold">
                  <span className="text-slate-700">3ج. مداخيل التكوينات والدورات:</span>
                  <span className="font-mono text-emerald-700 font-black">{fmt(revenueByService.Formation)} د.ت</span>
                </div>
              )}
              {hasModule('bibliotheque') && (
              <div className="p-3 bg-slate-50 rounded-2xl border flex justify-between font-bold">
                <span className="text-slate-700">4. اشتراكات المكتبة:</span>
                <span className="font-mono text-emerald-700 font-black">{fmt(revenueByService.Bibliotheque)} د.ت</span>
              </div>
              )}
              {!hideRestrictedModules && canteenEnabled && revenueByService.Gouter > 0 && (
                <div className="p-3 bg-teal-50 rounded-2xl border border-teal-200 flex justify-between font-bold">
                  <span className="text-teal-800">4ب. مداخيل خدمة اللمجة (Goûter):</span>
                  <span className="font-mono text-teal-700 font-black">{fmt(revenueByService.Gouter)} د.ت</span>
                </div>
              )}
              {hasModule('coursParticuliers') && (
              <div className="p-3 bg-slate-50 rounded-2xl border flex justify-between font-bold">
                <span className="text-slate-700">5. رسوم التأمين المدرسي (Assurance):</span>
                <span className="font-mono text-emerald-700 font-black">{fmt(revenueByService.Assurance)} د.ت</span>
              </div>
              )}
              {revenueByService.Refunds !== 0 && (
                <div className="p-3 bg-red-50 rounded-2xl border border-red-200 flex justify-between font-bold">
                  <span className="text-red-700">6. استرجاعات / إرجاعات:</span>
                  <span className="font-mono text-red-700 font-black">{fmt(revenueByService.Refunds)} د.ت</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-4">
            <h3 className="font-extrabold text-slate-900 text-sm">ملخص المصاريف التشغيلية</h3>
            
            <div className="space-y-3 text-xs">
              {!hideRestrictedModules && canteenEnabled && repasTraiteurTotal !== 0 && (

                <div className="p-3 bg-red-50/50 rounded-2xl border border-red-100 flex justify-between font-bold">
                  <span className="text-red-900">• حصة المطعم الخارجي من الوجبات:</span>
                  <span className="font-mono text-red-700 font-black">{fmt(repasTraiteurTotal)} د.ت</span>
                </div>
              )}
              {EXPENSE_CATEGORIES.map(cat => {
                const totalCat = filteredExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
                if (totalCat === 0) return null;

                return (
                  <div key={cat} className="p-3 bg-red-50/50 rounded-2xl border border-red-100 flex justify-between font-bold">
                    <span className="text-red-900">• {cat}:</span>
                    <span className="font-mono text-red-700 font-black">{fmt(totalCat)} د.ت</span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: CONSOLIDATED STUDENT LEDGER (ALL SERVICES SEPT -> MAI) */}
      {activeTab === 'studentLedger' && (() => {
        const ledgerStudents = filteredStudents.filter(st => {
          if (!searchTerm) return true;
          return `${st.firstName} ${st.lastName} ${st.grade}`.toLowerCase().includes(searchTerm.toLowerCase());
        });

        const totalPages = Math.ceil(ledgerStudents.length / pageSize) || 1;
        const currentPage = Math.min(Math.max(1, ledgerPage), totalPages);
        const paginatedLedger = ledgerStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

        return (
          <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5 no-print">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">جدول خلاص الخدمات حسب التلميذ</h3>
                <p className="text-[11px] text-slate-400">إجمالي التلاميذ: {ledgerStudents.length} — عرض 20 تلميذ بكل صفحة</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-4">التلميذ</th>
                    <th className="p-4">السنة الدراسية</th>
                    <th className="p-4">المستوى</th>
                    <th className="p-4">Suivi Scolaire</th>
                    <th className="p-4">Étude {centerName}</th>
                    <th className="p-4">Bibliothèque</th>
                    {!hideRestrictedModules && <th className="p-4">Repas (مطعم)</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedLedger.length === 0 ? (
                    <tr>
                      <td colSpan={hideRestrictedModules ? 6 : 7} className="p-8 text-center text-slate-400">لا توجد بيانات مطابقة لشروط البحث.</td>
                    </tr>
                  ) : (
                    paginatedLedger.map(st => {
                      const hasSuiviPaid = (st.payments || []).some(p => p.service === 'Suivi');
                      const hasTC = (st.payments || []).some(p => p.service === 'Étude' || p.service === 'Inscription Étude');
                      const hasLib = (st.payments || []).some(p => p.service === 'Bibliothèque');
                      const hasMeal = (st.payments || []).some(p => p.service === 'Repas');

                      return (
                        <tr key={st.id} className="hover:bg-slate-50/80 transition font-bold">
                          <td className="p-4 font-black text-slate-900">{st.firstName} {st.lastName}</td>
                          <td className="p-4 font-mono text-slate-500">{st.academicYear || getCurrentAcademicYear()}</td>
                          <td className="p-4 text-slate-500">{st.grade}</td>
                          <td className="p-4">
                            {hasSuiviPaid ? <span className="text-emerald-700">✓ منتظم</span> : <span className="text-red-500">غير مدفوع</span>}
                          </td>
                          <td className="p-4">
                            {hasTC ? <span className="text-emerald-700">✓ منتظم</span> : <span className="text-slate-400">-</span>}
                          </td>
                          <td className="p-4">
                            {hasLib ? <span className="text-emerald-700">✓ منتظم</span> : <span className="text-slate-400">-</span>}
                          </td>
                          {!hideRestrictedModules && (
                            <td className="p-4">
                              {hasMeal ? <span className="text-emerald-700">✓ مشترك</span> : <span className="text-slate-400">-</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setLedgerPage(currentPage - 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  ◀ السابق
                </button>
                <span className="text-slate-600">صفحة {currentPage} من {totalPages} (20 تلميذ / صفحة)</span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setLedgerPage(currentPage + 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  التالي ▶
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB 3: PAYMENT HISTORY */}
      {activeTab === 'history' && (() => {
        const historyServiceOptions = (hideRestrictedModules 
          ? serviceOptions.filter(s => !RESTRICTED_SERVICES.includes(s.value)) 
          : serviceOptions
        ).filter(s => s.value !== 'Repas' && s.value !== 'Goûter' && s.value !== 'Formation' && !s.value.startsWith('Inscription'));

        const historyPayments = (serviceFilter === 'all' ? filteredPayments : filteredPayments.filter(p => p.service === serviceFilter))
          .filter(p => 
            !String(p.month || '').startsWith('Annuel') && 
            !String(p.month || '').startsWith('Repas unitaire') && 
            !String(p.service || '').startsWith('Inscription') &&
            p.service !== 'Formation' &&
            p.service !== 'Repas' &&
            p.service !== 'Goûter'
          );

        const chequeGroups: Record<string, { chequeNumber?: string; chequeDate?: string; chequePaid?: boolean; payments: typeof historyPayments; totalAmount: number; receiptNumbers: string[]; studentNames: string[] }> = {};
        const nonChequePayments: typeof historyPayments = [];
        historyPayments.forEach(p => {
          if (p.method === 'Chèque' && p.chequeNumber) {
            if (!chequeGroups[p.chequeNumber]) chequeGroups[p.chequeNumber] = { chequeNumber: p.chequeNumber, chequeDate: p.chequeDate, chequePaid: p.chequePaid, payments: [], totalAmount: 0, receiptNumbers: [], studentNames: [] };
            chequeGroups[p.chequeNumber].payments.push(p);
            chequeGroups[p.chequeNumber].totalAmount += p.amountPaid;
            chequeGroups[p.chequeNumber].chequePaid = p.chequePaid;
            if (p.receiptNumber && !chequeGroups[p.chequeNumber].receiptNumbers.includes(p.receiptNumber)) chequeGroups[p.chequeNumber].receiptNumbers.push(p.receiptNumber);
            if (p.studentName && !chequeGroups[p.chequeNumber].studentNames.includes(p.studentName)) chequeGroups[p.chequeNumber].studentNames.push(p.studentName);
          } else {
            nonChequePayments.push(p);
          }
        });

        const mergedHistory = [
          ...nonChequePayments.map(p => ({ type: 'single' as const, payment: p })),
          ...Object.values(chequeGroups).map(g => ({ type: 'cheque' as const, group: g }))
        ];

        const totalPages = Math.ceil(mergedHistory.length / pageSize) || 1;
        const currentPage = Math.min(Math.max(1, historyPage), totalPages);
        const paginatedHistory = mergedHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize);

        return (
          <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5 no-print">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">سجل المقبوضات ({mergedHistory.length})</h3>
                <p className="text-[11px] text-slate-400">عرض 20 وصل بكل صفحة</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-black text-slate-800">
                الخدمة المعنية:
                <select
                  value={serviceFilter}
                  onChange={(e) => {
                    setServiceFilter(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#257C86] cursor-pointer"
                >
                  <option value="all">جميع الخدمات</option>
                  {historyServiceOptions.map(svc => (
                    <option key={svc.value} value={svc.value}>{svc.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-4">رقم الوصل</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">التلميذ</th>
                    <th className="p-4">الخدمة المعنية</th>
                    <th className="p-4">الشهر / السنة</th>
                    <th className="p-4">التخفيض</th>
                    <th className="p-4">المبلغ المقبوض</th>
                    <th className="p-4">طريقة الخلاص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">لا توجد وصولات مقبوضات موافقة للتصفية.</td>
                    </tr>
                  ) : (
                    paginatedHistory.map((item) => {
                      if (item.type === 'single') {
                        const p = item.payment;
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition">
                            <td className="p-4 font-mono font-bold text-slate-500">{p.receiptNumber}</td>
                            <td className="p-4 font-mono text-slate-600">{p.date}</td>
                            <td className="p-4 font-black text-slate-900">{p.studentName}</td>
                            <td className="p-4 font-bold text-[#1e626b]">{paymentServiceLabel(p)}</td>
                            <td className="p-4 font-bold text-slate-700">{monthToArabic(p.month)}</td>
                            <td className="p-4">
                              {p.discount ? (
                                <span className="text-[#1e626b] font-black font-mono">{fmt(p.discount)} د.ت</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="p-4 font-mono font-black">
                              {p.refund ? (
                                <span className="text-red-700">-{fmt(Math.abs(p.amountPaid))} د.ت <span className="text-[9px] font-normal">(استرجاع)</span></span>
                              ) : (
                                <span className="text-emerald-700">{fmt(p.amountPaid)} د.ت</span>
                              )}
                            </td>
                            <td className="p-4">
                              <span className="text-slate-600 font-bold">{p.method}</span>
                            </td>
                          </tr>
                        );
                      } else {
                        const g = item.group;
                        return (
                          <tr key={g.chequeNumber} className="hover:bg-[#257C86]/[0.05] transition">
                            <td className="p-4 font-mono font-bold text-slate-500 text-[10px]">{g.receiptNumbers[0]}{g.receiptNumbers.length > 1 ? ` +${g.receiptNumbers.length - 1}` : ''}</td>
                            <td className="p-4 font-mono text-slate-600">{g.chequeDate || '-'}</td>
                            <td className="p-4 font-black text-slate-900 text-[11px]">{g.studentNames.join(', ')}</td>
                            <td className="p-4">
                              <div className="flex flex-wrap gap-1">
                                {Array.from(new Set(g.payments.map(p => paymentServiceLabel(p)))).map(label => (
                                  <span key={label} className="inline-flex px-1.5 py-0.5 bg-[#257C86]/10 text-[#1e626b] rounded-md font-bold text-[9px]">{label}</span>
                                ))}
                              </div>
                            </td>
                            <td className="p-4 font-bold text-slate-700 text-[10px]">
                              {(() => {
                                const distinctServices = new Set(g.payments.map(p => p.service));
                                const distinctMonths = new Set(g.payments.map(p => p.month));
                                if (distinctServices.size === 1) {
                                  return distinctMonths.size === 1
                                    ? monthToArabic(g.payments[0].month)
                                    : `${distinctMonths.size} أشهر`;
                                }
                                return `${distinctServices.size} خدمات`;
                              })()}
                            </td>
                            <td className="p-4"><span className="text-slate-300">—</span></td>
                            <td className="p-4 font-mono font-black text-emerald-700">{fmt(g.totalAmount)} د.ت</td>
                            <td className="p-4">
                              <div className="flex items-center gap-1">
                                {g.chequePaid ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-[10px]">
                                    <CheckCircle2 className="h-3 w-3" />
                                    شيك محصل
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#257C86]/10 text-[#1e626b] rounded-lg font-bold text-[10px]">
                                    <AlertCircle className="h-3 w-3" />
                                    شيك معلق
                                  </span>
                                )}
                                <button
                                  onClick={() => setChequeDetailModal({ chequeNumber: g.chequeNumber, chequeDate: g.chequeDate, payments: g.payments.map(sp => ({ ...sp, studentName: sp.studentName || '' })), totalAmount: g.totalAmount, paid: !!g.chequePaid })}
                                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
                                  title="تفاصيل الشيك"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setHistoryPage(currentPage - 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  ◀ السابق
                </button>
                <span className="text-slate-600">صفحة {currentPage} من {totalPages} (20 وصل / صفحة)</span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setHistoryPage(currentPage + 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  التالي ▶
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB 3bis: ANNUAL INSCRIPTION HISTORY (SUIVI / ÉTUDE / LIBRARY) */}
      {activeTab === 'annualInscriptions' && (() => {
        const annTotalPages = Math.ceil(annualInscriptionPayments.length / pageSize) || 1;
        const annCurrentPage = Math.min(Math.max(1, historyPage), annTotalPages);
        const paginatedAnn = annualInscriptionPayments.slice((annCurrentPage - 1) * pageSize, annCurrentPage * pageSize);

        return (
          <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5 no-print">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">سجل الخلاص السنوي (الاشتراكات والتسجيلات) ({annualInscriptionPayments.length})</h3>
                <p className="text-[11px] text-slate-400">التسجيلات السنوية للسنة الدراسية {schoolYearFilter === 'all' ? '(كل السنوات)' : schoolYearFilter} — لا يتأثر بفيلتر الشهر</p>
              </div>
              <div className="text-left">
                <p className="text-[11px] text-slate-500 font-bold">المجموع السنوي</p>
                <p className="text-xl font-black text-[#257C86] font-mono">{fmt(annualInscriptionTotal)} د.ت</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-4">رقم الوصل</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">التلميذ</th>
                    <th className="p-4">الخدمة المعنية</th>
                    <th className="p-4">الفترة</th>
                    <th className="p-4">التخفيض</th>
                    <th className="p-4">المبلغ المقبوض</th>
                    <th className="p-4">طريقة الخلاص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedAnn.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">لا توجد تسجيلات سنوية موافقة للسنة الدراسية المختارة.</td>
                    </tr>
                  ) : (
                    paginatedAnn.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-4 font-mono font-bold text-slate-500">{p.receiptNumber}</td>
                        <td className="p-4 font-mono text-slate-600">{p.date || '-'}</td>
                        <td className="p-4 font-black text-slate-900">{p.studentName}</td>
                        <td className="p-4 font-bold text-[#1e626b]">{paymentServiceLabel(p)}</td>
                        <td className="p-4 font-bold text-slate-700">{monthToArabic(p.month)}</td>
                        <td className="p-4">
                          {p.discount ? (
                            <span className="text-[#1e626b] font-black font-mono">{fmt(p.discount)} د.ت</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-4 font-mono font-black">
                          {p.refund ? (
                            <span className="text-red-700">-{fmt(Math.abs(p.amountPaid))} د.ت <span className="text-[9px] font-normal">(استرجاع)</span></span>
                          ) : (
                            <span className="text-emerald-700">{fmt(p.amountPaid)} د.ت</span>
                          )}
                        </td>
                        <td className="p-4">
                          {p.method === 'Chèque' ? (
                            <div className="flex items-center gap-1">
                              {p.chequePaid === true ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-[10px]">
                                  <CheckCircle2 className="h-3 w-3" />
                                  شيك محصل
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#257C86]/10 text-[#1e626b] rounded-lg font-bold text-[10px]">
                                  <AlertCircle className="h-3 w-3" />
                                  شيك معلق
                                </span>
                              )}
                              <button
                                onClick={() => setChequeDetailModal({ chequeNumber: p.chequeNumber, chequeDate: p.chequeDate, payments: [{ ...p, studentName: p.studentName || '' }], totalAmount: p.amountPaid, paid: p.chequePaid === true })}
                                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
                                title="تفاصيل الشيك"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-600 font-bold">{p.method}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {annTotalPages > 1 && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
                <button
                  disabled={annCurrentPage <= 1}
                  onClick={() => setHistoryPage(annCurrentPage - 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  ◀ السابق
                </button>
                <span className="text-slate-600">صفحة {annCurrentPage} من {annTotalPages} (20 وصل / صفحة)</span>
                <button
                  disabled={annCurrentPage >= annTotalPages}
                  onClick={() => setHistoryPage(annCurrentPage + 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  التالي ▶
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB 4: FORMATIONS */}
      {activeTab === 'formations' && (() => {
        const formationRecords = formationPayments.filter(p => {
          const yMatch = schoolYearFilter === 'all' || p.month.includes(schoolYearFilter) || p.studentYear === schoolYearFilter;
          const mMatch = monthFilter === 'all' 
            || (p.date && monthFromDate(p.date) === monthFilter)
            || p.month.toLocaleLowerCase('fr').includes(monthFilter.toLocaleLowerCase('fr'));
          const sMatch = !searchTerm || p.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || (p.receiptNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
          return yMatch && mMatch && sMatch;
        });
        const formTotal = formationRecords.reduce((s, p) => {
          const rec = p as any;
          return s + (rec.centerShare ?? (p.refund ? -p.amountPaid : p.amountPaid));
        }, 0);
        const formTotalPages = Math.ceil(formationRecords.length / pageSize) || 1;
        const formCurrentPage = Math.min(Math.max(1, historyPage), formTotalPages);
        const paginatedForm = formationRecords.slice((formCurrentPage - 1) * pageSize, formCurrentPage * pageSize);

        return (
          <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5 no-print">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">سجل الخلاص للتكوينات والدورات ({formationRecords.length})</h3>
                <p className="text-[11px] text-slate-400">مدفوعات التكوينات حسب السنة الدراسية {schoolYearFilter === 'all' ? '(كل السنوات)' : schoolYearFilter} — حسب الشهر {monthFilter === 'all' ? '(كل الأشهر)' : monthFilter}</p>
              </div>
              <div className="text-left">
                <p className="text-[11px] text-slate-500 font-bold">المجموع</p>
                <p className="text-xl font-black text-teal-600 font-mono">{fmt(formTotal)} د.ت</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-4">رقم الوصل</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">التلميذ</th>
                    <th className="p-4">التكوين</th>
                    <th className="p-4">التخفيض</th>
                    <th className="p-4">المبلغ المقبوض</th>
                    <th className="p-4">طريقة الخلاص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedForm.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">لا توجد مدفوعات تكوينات موافقة للفترة المختارة.</td>
                    </tr>
                  ) : (
                    paginatedForm.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-4 font-mono font-bold text-slate-500">{p.receiptNumber}</td>
                        <td className="p-4 font-mono text-slate-600">{p.date || '-'}</td>
                        <td className="p-4 font-black text-slate-900">{p.studentName}</td>
                        <td className="p-4 font-bold text-teal-700">{p.formationName || p.notes || monthToArabic(p.month)}</td>
                        <td className="p-4">
                          {p.discount ? (
                            <span className="text-[#1e626b] font-black font-mono">{fmt(p.discount)} د.ت</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-4 font-mono font-black">
                          {p.refund ? (
                            <span className="text-red-700">-{fmt(Math.abs(p.amountPaid))} د.ت <span className="text-[9px] font-normal">(استرجاع)</span></span>
                          ) : (
                            <span className="text-emerald-700">{fmt(p.amountPaid)} د.ت</span>
                          )}
                        </td>
                        <td className="p-4">
                          {p.method === 'Chèque' ? (
                            <div className="flex items-center gap-1">
                              {p.chequePaid === true ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-[10px]">
                                  <CheckCircle2 className="h-3 w-3" />
                                  شيك محصل
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#257C86]/10 text-[#1e626b] rounded-lg font-bold text-[10px]">
                                  <AlertCircle className="h-3 w-3" />
                                  شيك معلق
                                </span>
                              )}
                              <button
                                onClick={() => setChequeDetailModal({ chequeNumber: p.chequeNumber, chequeDate: p.chequeDate, payments: [{ ...p, studentName: p.studentName || '' }], totalAmount: p.amountPaid, paid: p.chequePaid === true })}
                                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
                                title="تفاصيل الشيك"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-600 font-bold">{p.method}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {formTotalPages > 1 && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
                <button
                  disabled={formCurrentPage <= 1}
                  onClick={() => setHistoryPage(formCurrentPage - 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  ◀ السابق
                </button>
                <span className="text-slate-600">صفحة {formCurrentPage} من {formTotalPages} (20 وصل / صفحة)</span>
                <button
                  disabled={formCurrentPage >= formTotalPages}
                  onClick={() => setHistoryPage(formCurrentPage + 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  التالي ▶
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB 5: EXTERNAL COURSES */}
      {activeTab === 'externalCours' && (() => {
        // Filter external students by year
        const filteredExtStudents = externalStudents.filter(reg => {
          if (schoolYearFilter === 'all') return true;
          return (reg.schoolYear || '2026/2027') === schoolYearFilter;
        }).filter(reg => {
          if (!searchTerm) return true;
          return reg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 (reg.grade || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                 (reg.parentPhone || '').includes(searchTerm);
        });

        const totalAssurance = filteredExtStudents.filter(r => r.assurancePaid).reduce((s, r) => s + r.assuranceAmount, 0);
        const totalCoursePayments = filteredExtStudents.reduce((s, r) => s + (r.payments || []).reduce((ps, p) => ps + p.amountPaid, 0), 0);
        const totalExtRevenue = totalAssurance + totalCoursePayments;
        const assurancePaidCount = filteredExtStudents.filter(r => r.assurancePaid).length;
        const assuranceUnpaidCount = filteredExtStudents.filter(r => !r.assurancePaid).length;

        return (
          <div className="space-y-4 no-print">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-teal-50 p-4 rounded-2xl border border-teal-200 space-y-1">
                <span className="text-[11px] font-bold text-teal-700 block">إجمالي التلاميذ الخارجيين</span>
                <p className="text-xl font-black text-teal-900">{filteredExtStudents.length} تلميذ</p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 space-y-1">
                <span className="text-[11px] font-bold text-emerald-700 block">إجمالي مداخيل الكورسات</span>
                <p className="text-xl font-black text-emerald-800 font-mono">{fmt(totalCoursePayments)} د.ت</p>
              </div>
              <div className="bg-[#257C86]/[0.06] p-4 rounded-2xl border border-[#257C86]/20 space-y-1">
                <span className="text-[11px] font-bold text-[#1e626b] block">إجمالي التأمين المدرسي</span>
                <p className="text-xl font-black text-[#1e626b] font-mono">{fmt(totalAssurance)} د.ت</p>
                <span className="text-[10px] text-[#257C86] font-bold">{assurancePaidCount} مدفوع / {assuranceUnpaidCount} غير مدفوع</span>
              </div>
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 space-y-1">
                <span className="text-[11px] font-bold text-slate-300 block">المجموع الكلي (دروس + تأمين)</span>
                <p className="text-xl font-black text-white font-mono">{fmt(totalExtRevenue)} د.ت</p>
              </div>
            </div>

            {/* Students Table */}
            <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5">
              <div className="p-5 border-b border-slate-100 bg-teal-50/50 flex justify-between items-center">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    🎒 سجل التلاميذ الخارجيين — الكورسات والتأمين
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">{filteredExtStudents.length} تلميذ — السنة الدراسية: {schoolYearFilter === 'all' ? 'جميع السنوات' : schoolYearFilter}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-4">التلميذ الخارجي</th>
                      <th className="p-4">المستوى</th>
                      <th className="p-4">السنة الدراسية</th>
                      <th className="p-4">هاتف الولي</th>
                      <th className="p-4">التأمين المدرسي</th>
                      <th className="p-4">مداخيل الكورسات</th>
                      <th className="p-4">المجموع</th>
                      <th className="p-4">الكورسات المسجل فيها</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExtStudents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-10 text-center text-slate-400 font-bold">
                          لا يوجد تلاميذ خارجيين مسجلين في السنة الدراسية المحددة.
                        </td>
                      </tr>
                    ) : (
                      filteredExtStudents.map(reg => {
                        const coursePaymentsTotal = (reg.payments || []).reduce((s, p) => s + p.amountPaid, 0);
                        const studentTotal = coursePaymentsTotal + (reg.assurancePaid ? reg.assuranceAmount : 0);
                        // Find which courses this student is enrolled in
                        const enrolledCourses = courses.filter(c =>
                          c.enrolledStudents.some(s => s.studentId === reg.id)
                        );
                        return (
                          <tr key={reg.id} className="hover:bg-teal-50/40 transition">
                            <td className="p-4 font-black text-slate-900">{reg.name}</td>
                            <td className="p-4 text-slate-600 font-bold">{reg.grade}</td>
                            <td className="p-4 font-mono text-slate-500">{reg.schoolYear || '—'}</td>
                            <td className="p-4 font-mono text-slate-500" dir="ltr">{reg.parentPhone || '—'}</td>
                            <td className="p-4">
                              {reg.assurancePaid ? (
                                <div className="flex flex-col items-center text-center gap-0.5 bg-emerald-100 text-emerald-700 rounded-lg px-2 py-1 font-black text-[11px] w-fit mx-auto">
                                  <span>✓ مدفوع — {fmt(reg.assuranceAmount)} د.ت</span>
                                  {reg.assuranceDate && (
                                    <span className="text-[9px] font-bold text-emerald-600">{reg.assuranceDate}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-lg font-black text-[11px]">
                                  ✗ غير مدفوع
                                </span>
                              )}
                            </td>
                            <td className="p-4 font-mono font-black text-emerald-700">
                              {fmt(coursePaymentsTotal)} د.ت
                              {(reg.payments || []).length > 0 && (
                                <span className="text-[10px] text-slate-400 font-normal block">{(reg.payments || []).length} دفعة</span>
                              )}
                            </td>
                            <td className="p-4 font-mono font-black text-slate-900">{fmt(studentTotal)} د.ت</td>
                            <td className="p-4">
                              {enrolledCourses.length === 0 ? (
                                <span className="text-slate-400 text-[11px]">—</span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  {enrolledCourses.map(c => (
                                    <span key={c.id} className="block w-fit px-2 py-0.5 bg-teal-100 text-teal-800 rounded-lg text-[10px] font-bold text-center">
                                      {c.subject} — {c.gradeLevel} ({c.schoolYear})
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {filteredExtStudents.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={4} className="p-4 font-black text-slate-700 text-xs">الإجماليات</td>
                        <td className="p-4 font-mono font-black text-[#1e626b] text-xs">{fmt(totalAssurance)} د.ت</td>
                        <td className="p-4 font-mono font-black text-emerald-700 text-xs">{fmt(totalCoursePayments)} د.ت</td>
                        <td className="p-4 font-mono font-black text-slate-900 text-xs">{fmt(totalExtRevenue)} د.ت</td>
                        <td className="p-4"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Assurance unpaid alert */}
              {assuranceUnpaidCount > 0 && (
                <div className="p-4 bg-red-50 border-t border-red-100 flex items-center gap-2 text-xs font-bold text-red-700">
                  <span className="text-base">⚠️</span>
                  {assuranceUnpaidCount} تلميذ لم يدفع التأمين المدرسي السنوي
                </div>
              )}
            </div>

            {/* Per-student payment detail */}
            {filteredExtStudents.some(r => (r.payments || []).length > 0 || r.assurancePaid) && (() => {
              // Build full flat list: course payments + assurance rows
              const allDetailRows: { id: string; date: string; name: string; courseName: string; amount: number; method: string; isAssurance: boolean }[] = [];
              filteredExtStudents.forEach(reg => {
                (reg.payments || [])
                  .filter(p => monthFilter === 'all' || monthFromDate(p.date) === monthFilter)
                  .forEach(p => allDetailRows.push({
                    id: p.id,
                    date: p.date,
                    name: reg.name,
                    courseName: p.courseName || '—',
                    amount: p.amountPaid,
                    method: p.method || 'Espèces',
                    isAssurance: false
                  }));
                if (reg.assurancePaid && reg.assuranceAmount > 0) {
                  allDetailRows.push({
                    id: 'asr_' + reg.id,
                    date: reg.assuranceDate || '',
                    name: reg.name,
                    courseName: 'تأمين مدرسي (Assurance) 🛡️',
                    amount: reg.assuranceAmount,
                    method: 'Espèces',
                    isAssurance: true
                  });
                }
              });

              allDetailRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

              const detailTotalPages = Math.ceil(allDetailRows.length / pageSize) || 1;
              const detailCurrentPage = Math.min(Math.max(1, extDetailPage), detailTotalPages);
              const paginatedDetailRows = allDetailRows.slice((detailCurrentPage - 1) * pageSize, detailCurrentPage * pageSize);

              return (
                <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5">
                  <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">📋 تفاصيل دفعات الكورسات الخارجية</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">إجمالي السجلات: {allDetailRows.length} — عرض 20 دفعة بكل صفحة</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-4">التاريخ</th>
                          <th className="p-4">التلميذ</th>
                          <th className="p-4">الكورس / الخدمة</th>
                          <th className="p-4">المبلغ المقبوض</th>
                          <th className="p-4">طريقة الخلاص</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedDetailRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">لا توجد دفعات موافقة للتصفية المحددة.</td>
                          </tr>
                        ) : (
                          paginatedDetailRows.map(row => (
                            <tr key={row.id} className={`transition ${
                              row.isAssurance ? 'hover:bg-[#257C86]/[0.05] bg-[#257C86]/[0.06]/20' : 'hover:bg-slate-50/70'
                            }`}>
                              <td className="p-4 font-mono text-slate-600">{row.date || '—'}</td>
                              <td className="p-4 font-black text-slate-900">{row.name}</td>
                              <td className={`p-4 font-bold ${row.isAssurance ? 'text-[#1e626b]' : 'text-teal-700'}`}>{row.courseName}</td>
                              <td className={`p-4 font-mono font-black ${row.isAssurance ? 'text-[#1e626b]' : 'text-emerald-700'}`}>{fmt(row.amount)} د.ت</td>
                              <td className="p-4 text-slate-600 font-bold">{row.method}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {detailTotalPages > 1 && (
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
                      <button
                        disabled={detailCurrentPage <= 1}
                        onClick={() => setExtDetailPage(detailCurrentPage - 1)}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer hover:bg-slate-100"
                      >
                        ◀ السابق
                      </button>
                      <span className="text-slate-600">صفحة {detailCurrentPage} من {detailTotalPages} ({allDetailRows.length} دفعة — 20 / صفحة)</span>
                      <button
                        disabled={detailCurrentPage >= detailTotalPages}
                        onClick={() => setExtDetailPage(detailCurrentPage + 1)}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer hover:bg-slate-100"
                      >
                        التالي ▶
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* TAB 5: CENTER EXPENSES */}

      {activeTab === 'expenses' && (() => {
        const displayExpenses = [...(traiteurShareExpense ? [traiteurShareExpense] : []), ...filteredExpenses];
        const sortedExpenses = [...displayExpenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const totalPages = Math.ceil(sortedExpenses.length / pageSize) || 1;
        const currentPage = Math.min(Math.max(1, expensesPage), totalPages);
        const paginatedExpenses = sortedExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

        return (
          <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5 no-print">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">قائمة الفواتير والمصاريف ({sortedExpenses.length})</h3>
                <p className="text-[11px] text-slate-400">عرض 20 مصروف بكل صفحة — المجموع: <span className="font-mono font-black text-red-600">{fmt(totalExpensesAmount)} د.ت</span></p>
              </div>
              <button
                onClick={() => setIsExpenseModalOpen(true)}
                className="px-3 py-1.5 bg-[#257C86] hover:bg-[#1e626b] text-white rounded-xl font-bold text-xs cursor-pointer"
              >
                إضافة فاتورة جديدة
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-4">مرجع الفاتورة</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">الصنف / النوع</th>
                    <th className="p-4">المبلغ</th>
                    <th className="p-4">الوصف والتفاصيل</th>
                    <th className="p-4 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">لا توجد فواتير مطابقة للبحث.</td>
                    </tr>
                  ) : (
                    paginatedExpenses.map(exp => (
                      <tr key={exp.id} className={`transition ${exp.id === 'traiteur-share-synthetic' || exp.id === 'revision-prof-share-synthetic' || exp.id === 'external-prof-share-synthetic' ? 'bg-[#257C86]/[0.05]' : 'hover:bg-slate-50/80'}`}>
                        <td className="p-4 font-mono font-bold text-slate-500">{exp.receiptRef}</td>
                        <td className="p-4 font-mono text-slate-600">{exp.date}</td>
                        <td className="p-4 font-black text-red-700">{exp.id === 'traiteur-share-synthetic' ? 'حصة المطعم' : exp.id === 'revision-prof-share-synthetic' ? 'مناب الأستاذ (مراجعة)' : exp.id === 'external-prof-share-synthetic' ? 'مناب الأستاذ (كورسات)' : exp.category}</td>
                        <td className="p-4 font-mono font-black text-red-600">{fmt(exp.amount)} د.ت</td>
                        <td className="p-4 text-slate-600">{exp.description}</td>
                        <td className="p-4 text-center">
                          {exp.id === 'traiteur-share-synthetic' || exp.id === 'revision-prof-share-synthetic' || exp.id === 'external-prof-share-synthetic' ? (
                            <span className="inline-flex items-center justify-center w-fit mx-auto px-2 py-1 bg-[#257C86]/10 text-[#1e626b] rounded-lg text-[10px] font-black">تحتسب تلقائياً</span>
                          ) : (
                            <button
                              onClick={() => setExpenseToDelete(exp)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition cursor-pointer"
                              title="حذف المصروف"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setExpensesPage(currentPage - 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  ◀ السابق
                </button>
                <span className="text-slate-600">صفحة {currentPage} من {totalPages} (20 مصروف / صفحة)</span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setExpensesPage(currentPage + 1)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  التالي ▶
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ADD EXPENSE MODAL */}
      <AnimatePresence>
        {isExpenseModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8"
            >
              <div className="p-6 bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[#257C86]" />
                  <h3 className="text-lg font-black">تسجيل فاتورة / مصاريف للسنتر</h3>
                </div>

                <button 
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddExpense} className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">نوع المصروف / الفاتورة *</label>
                  <select
                    value={expCategory} onChange={(e) => setExpCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  >
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">المبلغ (د.ت) *</label>
                    <input 
                      type="number" required min="0.01" step="0.01" value={expAmount} onFocus={(e) => e.target.select()} onChange={(e) => setExpAmount(Math.max(0, Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0))}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-sm font-black text-red-600"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">تاريخ المصروف *</label>
                    <DateField 
                      required value={expDate} onChange={(e) => setExpDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">مرجع الفاتورة / الوصل</label>
                  <input 
                    type="text" value={expReceiptRef} onChange={(e) => setExpReceiptRef(e.target.value)}
                    placeholder="مثال: STEG-88741"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">وصف وتفاصيل الفاتورة</label>
                  <textarea 
                    value={expDescription} onChange={(e) => setExpDescription(e.target.value)}
                    placeholder="تفاصيل الفاتورة..."
                    className="w-full p-3 bg-slate-50 border rounded-xl text-xs font-semibold h-20"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsExpenseModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1e626b] text-white font-black text-xs rounded-xl shadow-md cursor-pointer"
                  >
                    تسجيل المصروف
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE EXPENSE CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={!!expenseToDelete}
        title="حذف مصروف السنتر"
        message={
          <>
            هل أنت متأكد من حذف فاتورة المصروف التالية نهائياً؟
            <div className="mt-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
              <p><span className="text-slate-400">المرجع:</span> <strong className="font-mono">{expenseToDelete?.receiptRef}</strong></p>
              <p><span className="text-slate-400">الصنف:</span> <strong className="text-red-700">{expenseToDelete?.category}</strong></p>
              <p><span className="text-slate-400">المبلغ:</span> <strong className="font-mono">{fmt(expenseToDelete?.amount || 0)} د.ت</strong></p>
            </div>
          </>
        }
        confirmLabel="نعم، احذف المصروف"
        onConfirm={() => {
          if (expenseToDelete) {
            onUpdateExpenses(expenses.filter(e => e.id !== expenseToDelete.id));
            toast.success(`تم حذف فاتورة المصروف (${expenseToDelete.receiptRef}) بنجاح!`);
            setExpenseToDelete(null);
          }
        }}
        onCancel={() => setExpenseToDelete(null)}
      />

      {/* TAB 6: RESTAURANT MANAGEMENT */}
      {activeTab === 'restaurant' && (() => {
        // Persisted "forfait ferme" closures. A month contributes a forfait only after it
        // was closed via the «Clôturer le mois» button (end of month) — the amounts below
        // are snapshots, not live computations.
        const closures = mealForfaitClosures || [];
        const activeClosure = (monthFilter !== 'all' && schoolYearFilter !== 'all')
          ? closures.find(c => c.month === monthFilter && c.schoolYear === schoolYearFilter)
          : null;
        const closureAmountForStudent = (studentId: string): number => {
          let total = 0;
          for (const c of closures) {
            if (monthFilter !== 'all' && c.month !== monthFilter) continue;
            if (schoolYearFilter !== 'all' && c.schoolYear !== schoolYearFilter) continue;
            const it = (c.items || []).find(i => i?.studentId === studentId);
            total += it?.amount ?? 0;
          }
          return total;
        };
        // Calculate detailed restaurant stats
        const restoStudents = filteredStudents.map(s => {
          const f = getFeesForYear(settings, s.academicYear || getCurrentAcademicYear());
          const datePrefix = monthFilter === 'all' ? null : monthFilterToDatePrefix(monthFilter, schoolYearFilter);
          const attendances = (s.mealAttendances || []).filter(a => {
            if (!datePrefix) return true;
            return a.date.startsWith(datePrefix);
          });
          const subscriptionMeals = attendances.filter(a => a.type === 'subscription');
          const unitMeals = attendances.filter(a => a.type === 'unit');
          const subPayments = (s.payments || []).filter(p => {
            if (p.service !== 'Repas') return false;
            if (schoolYearFilter !== 'all' && !p.month.includes(schoolYearFilter) && s.academicYear !== schoolYearFilter) return false;
            if (monthFilter === 'all') return true;
            if (p.month.includes(monthFilter)) return true;
            if (datePrefix && p.month.startsWith(`Repas unitaire (${datePrefix}`)) return true;
            return false;
          });
          const grossPaid = subPayments.filter(p => !p.refund).reduce((sum, p) => sum + p.amountPaid, 0);
          const totalRefunded = Math.abs(subPayments.filter(p => p.refund).reduce((sum, p) => sum + p.amountPaid, 0));
          const totalMeals = subscriptionMeals.length + unitMeals.length;
          const isEnrolled = s.mealSubscription?.active === true || s.enrolledServices?.meals === true;
          const monthlySubPayments = subPayments.filter(p => !p.month.includes('Repas unitaire'));
          const latestMonthlyPayment = monthlySubPayments.length > 0
            ? monthlySubPayments[monthlySubPayments.length - 1]
            : null;
          const isCurrentlyActive = isEnrolled;

          // If the latest transaction for this period was a refund (and not repaid), they are 'مسترجع'.
          // If they paid again after refund, the latest transaction is a normal payment, so they are 'مشترك'.
          const isRefunded = monthFilter === 'all'
            ? (!isCurrentlyActive && latestMonthlyPayment?.refund === true)
            : (latestMonthlyPayment?.refund === true);

          const isSubscribed = !isRefunded && (
            (latestMonthlyPayment !== null && !latestMonthlyPayment.refund) ||
            (isCurrentlyActive && grossPaid > totalRefunded)
          );

          const allLunchMeals = attendances.filter(a => (!a.service || a.service === 'lunch'));
          const traiteurPriceOf = (a: typeof allLunchMeals[number]) =>
            a.traiteurPrice !== undefined ? a.traiteurPrice : (isInHouseKitchen ? 0 : f.prixPlatTraiteur);
          // Real cost owed to the traiteur: every plate served, paid or not.
          const studentTraiteurPart = allLunchMeals.reduce((sum, a) => sum + traiteurPriceOf(a), 0);
          // Margin is only earned on plates the student actually paid for.
          const paidLunchMeals = allLunchMeals.filter(a => a.paid);
          const studentPaidMargin = paidLunchMeals.reduce(
            (sum, a) => sum + (f.fraisParRepas - traiteurPriceOf(a)), 0);

          // Case C — prepaid subscription balance the student never consumed. The center only
          // acquires it when the admin clicks «Clôturer le mois»; until then this is an estimate.
          const paidMeals = attendances.filter(a => a.paid).length;
          const unpaidMeals = attendances.length - paidMeals;
          const unpaidSubscriptionMeals = subscriptionMeals.filter(a => !a.paid).length;
          const unpaidUnitMeals = unitMeals.filter(a => !a.paid).length;
          const subForfaitPayments = subPayments.filter(p => !p.month.includes('Repas unitaire'));
          const subGrossPaid = subForfaitPayments.filter(p => !p.refund).reduce((sum, p) => sum + p.amountPaid, 0);
          const subRefunded = Math.abs(subForfaitPayments.filter(p => p.refund).reduce((sum, p) => sum + p.amountPaid, 0));
          const forfaitEstimate = Math.max(0, (subGrossPaid - subRefunded) - subscriptionMeals.length * f.fraisParRepas);
          // Amount actually acquired: comes from the persisted closure snapshot only.
          const forfaitUnused = closureAmountForStudent(s.id);

          return {
            id: s.id,
            name: `${s.firstName} ${s.lastName}`,
            grade: s.grade,
            isEnrolled,
            isSubscribed,
            isRefunded,
            grossPaid,
            totalRefunded,
            unitPrice: f.fraisParRepas,
            traiteurPrice: f.prixPlatTraiteur,
            subscriptionMeals: subscriptionMeals.length,
            unitMeals: unitMeals.length,
            totalMeals,
            paidMeals,
            unpaidMeals,
            unpaidSubscriptionMeals,
            unpaidUnitMeals,
            forfaitEstimate,
            forfaitUnused,
            subNetPaid: Math.max(0, subGrossPaid - subRefunded),
            paidMargin: studentPaidMargin,
            centerPart: studentPaidMargin + forfaitUnused,
            traiteurPart: studentTraiteurPart
          };
        }).filter(s => s.totalMeals > 0 || s.grossPaid > 0);

        const totalSubscriptions = restoStudents.reduce((sum, s) => sum + s.grossPaid, 0);
        const totalRefundedAll = restoStudents.reduce((sum, s) => sum + s.totalRefunded, 0);
        const totalPlatesConsumed = restoStudents.reduce((sum, s) => sum + s.totalMeals, 0);
        const totalSubMeals = restoStudents.reduce((sum, s) => sum + s.subscriptionMeals, 0);
        const totalUnitMeals = restoStudents.reduce((sum, s) => sum + s.unitMeals, 0);
        const totalPaidMeals = restoStudents.reduce((sum, s) => sum + s.paidMeals, 0);
        const totalUnpaidMeals = restoStudents.reduce((sum, s) => sum + s.unpaidMeals, 0);
        const totalUnpaidSubMeals = restoStudents.reduce((sum, s) => sum + s.unpaidSubscriptionMeals, 0);
        const totalUnpaidUnitMeals = restoStudents.reduce((sum, s) => sum + s.unpaidUnitMeals, 0);
        // Estimated forfait if the month were closed right now (preview before closing).
        const totalForfaitEstimate = restoStudents.reduce((sum, s) => sum + s.forfaitEstimate, 0);
        // Forfait actually acquired — snapshot from closed months only.
        const totalForfaitUnused = restoStudents.reduce((sum, s) => sum + s.forfaitUnused, 0);
        const prixPlat = settings?.fees?.fraisParRepas ?? 8;
        const prixTraiteur = isInHouseKitchen ? 0 : (settings?.fees?.prixPlatTraiteur ?? 6);
        const centerMarginPerPlate = isInHouseKitchen ? prixPlat : (prixPlat - prixTraiteur);
        const traiteurCost = restoStudents.reduce((sum, s) => sum + s.traiteurPart, 0);
        // Margin on paid plates + forfait acquired from closed months. Unpaid plates earn nothing.
        const totalPaidMargin = restoStudents.reduce((sum, s) => sum + s.paidMargin, 0);
        const centerBenefit = totalPaidMargin + totalForfaitUnused;

        const totalRestoPages = Math.ceil(restoStudents.length / pageSize) || 1;
        const currentRestoPage = Math.min(Math.max(1, restoPage), totalRestoPages);
        const paginatedResto = restoStudents.slice((currentRestoPage - 1) * pageSize, currentRestoPage * pageSize);

        return (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-center">
                <div className="text-[10px] font-bold text-emerald-700 mb-1">إجمالي الاشتراكات</div>
                <div className="font-mono text-lg font-black text-emerald-900">{fmt(totalSubscriptions)} د.ت</div>
                {totalRefundedAll > 0 && (
                  <div className="text-[9px] text-red-600 mt-1 font-bold">استرجاع: -{fmt(totalRefundedAll)} د.ت</div>
                )}
              </div>
              <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-center">
                <div className="text-[10px] font-bold text-emerald-700 mb-1">إجمالي الوجبات المستهلكة</div>
                <div className="font-mono text-lg font-black text-emerald-900">{totalPlatesConsumed}</div>
                <div className="text-[9px] text-emerald-600 mt-1">اشتراكي: {totalSubMeals} | وحدات: {totalUnitMeals}</div>
              </div>
              <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-100 text-center">
                <div className="text-[10px] font-bold text-amber-700 mb-1">وجبات غير مدفوعة</div>
                <div className="font-mono text-lg font-black text-amber-900">{totalUnpaidMeals}</div>
                <div className="text-[9px] text-amber-600 mt-1">
                  {totalUnpaidMeals > 0
                    ? `اشتراكي: ${totalUnpaidSubMeals} | وحدات: ${totalUnpaidUnitMeals}`
                    : 'كل الوجبات مدفوعة'}
                </div>
              </div>
              <div className="p-5 bg-red-50/50 rounded-2xl border border-red-100 text-center">
                <div className="text-[10px] font-bold text-red-700 mb-1">حصة الـ Traiteur</div>
                <div className="font-mono text-lg font-black text-red-900">{traiteurCost > 0 ? `${fmt(traiteurCost)} د.ت` : '0.000 د.ت'}</div>
                <div className="text-[9px] text-red-600 mt-1">{traiteurCost > 0 ? `${totalPlatesConsumed} وجبة` : (isInHouseKitchen ? 'مطبخ داخلي بدون وسيط' : 'لا توجد مصاريف traiteur')}</div>
              </div>
              <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-center">
                <div className="text-[10px] font-bold text-emerald-700 mb-1">ربح السنتر من الوجبات</div>
                <div className="font-mono text-lg font-black text-emerald-900">{fmt(centerBenefit)} د.ت</div>
                <div className="text-[9px] text-emerald-600 mt-1">
                  {totalPaidMeals} وجبة مدفوعة = {fmt(totalPaidMargin)} د.ت
                  {totalForfaitUnused > 0 && ` + فرفي ${fmt(totalForfaitUnused)} د.ت`}
                </div>
              </div>
            </div>

            {/* Case C — «Forfait ferme»: unconsumed prepaid balance becomes center profit on closure */}
            <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-white p-4 rounded-2xl border border-amber-200/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="text-xl">🔒</span>
                <div>
                  <h4 className="font-extrabold text-amber-950 text-sm">الفرفي المكتسب (Forfait ferme)</h4>
                  <p className="text-[11px] text-amber-700 font-medium max-w-xl">
                    الرصيد المدفوع مسبقاً ولم يُستهلك يصبح ربحاً للسنتر <strong>فقط</strong> بعد إغلاق الشهر.
                    الإغلاق يُسجّل لقطة ثابتة لا تتغيّر بعد ذلك.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 block font-bold">تقدير غير مكتسب</span>
                  <span className="font-mono font-black text-slate-800 text-sm">{fmt(totalForfaitEstimate)} د.ت</span>
                </div>
                <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-emerald-200 text-center">
                  <span className="text-[10px] text-emerald-600 block font-bold">مكتسب فعلياً</span>
                  <span className="font-mono font-black text-emerald-900 text-sm">{fmt(totalForfaitUnused)} د.ت</span>
                </div>
                {monthFilter !== 'all' && schoolYearFilter !== 'all' && (
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      disabled={!!activeClosure || !isAcademicMonthFinished(monthFilter, schoolYearFilter) || !onUpdateMealForfaitClosures}
                      onClick={() => {
                        if (!onUpdateMealForfaitClosures) return;
                        const items = restoStudents
                          .filter(s => s.forfaitEstimate > 0)
                          .map(s => ({
                            studentId: s.id,
                            studentName: s.name,
                            netPaid: s.subNetPaid,
                            consumedSubscriptionMeals: s.subscriptionMeals,
                            fraisParRepas: s.unitPrice,
                            amount: s.forfaitEstimate
                          }));
                        const next: MealForfaitClosure = {
                          id: `mfc_${crypto.randomUUID()}`,
                          month: monthFilter,
                          schoolYear: schoolYearFilter,
                          createdAt: new Date().toISOString(),
                          items
                        };
                        // Replace any prior closure for the same month/year rather than stacking.
                        const existing = closures.filter(c => !(c.month === monthFilter && c.schoolYear === schoolYearFilter));
                        onUpdateMealForfaitClosures([...existing, next]);
                        toast.success(`تم إغلاق شهر ${monthFilter} — الفرفي المكتسب: ${fmt(items.reduce((sum, i) => sum + i.amount, 0))} د.ت`);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-black bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {activeClosure ? 'الشهر مقفل ✓' : `إغلاق شهر ${monthFilter}`}
                    </button>
                    {!activeClosure && !isAcademicMonthFinished(monthFilter, schoolYearFilter) && (
                      <span className="text-[9px] text-amber-600 font-bold">الزر يتفعّل عند نهاية الشهر</span>
                    )}
                    {activeClosure && (
                      <span className="text-[9px] text-slate-500 font-bold">
                        {new Date(activeClosure.createdAt).toLocaleDateString('fr-FR')} — {activeClosure.items?.length ?? 0} تلميذ
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Pricing Info */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/70 flex flex-wrap items-center gap-6 text-xs font-bold">
              <span className="text-slate-500">سعر الوجبة:</span>
              <span className="font-mono text-emerald-700">{fmt(prixPlat)} د.ت</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">حصة الـ Traiteur:</span>
              <span className="font-mono text-red-700">{fmt(prixTraiteur)} د.ت</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">ربح السنتر للوجبة:</span>
              <span className="font-mono text-emerald-700">{fmt(centerMarginPerPlate)} د.ت</span>
            </div>

            {/* Goûter Summary in Tab 6 */}
            {(() => {
              // Attendance dates are ISO (YYYY-MM-DD); monthFilter is a French month name,
              // so it must be resolved to a calendar prefix before comparing.
              const gouterPrefix = monthFilter === 'all' ? null : monthFilterToDatePrefix(monthFilter, schoolYearFilter);
              const countGouter = (service: MealServiceType) => filteredStudents.reduce(
                (sum, s) => sum + (s.mealAttendances || []).filter(a => {
                  if (gouterPrefix && !a.date.startsWith(gouterPrefix)) return false;
                  return a.service === service;
                }).length, 0);
              const gouterPaymentsTotal = filteredPayments.filter(p => p.service === 'Goûter').reduce((s, p) => s + p.amountPaid, 0);
              const gouterMatinCount = countGouter('gouter_matin');
              const gouterSoirCount = countGouter('gouter_apres_midi');
              const gouterSubscribersCount = filteredStudents.filter(s => s.enrolledServices?.gouterMatin || s.enrolledServices?.gouterSoir || s.enrolledServices?.gouterBoth).length;

              return (
                <div className="bg-gradient-to-r from-teal-50 via-pink-50 to-white p-4 rounded-2xl border border-teal-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🍪</span>
                    <div>
                      <h4 className="font-extrabold text-teal-950">مداخيل واستهلاك خدمة اللمجة (Goûter)</h4>
                      <p className="text-[11px] text-teal-700 font-medium">مجموع التلاميذ المشتركين في اللمجة: <strong>{gouterSubscribersCount}</strong> تلميذ</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-teal-200 text-center">
                      <span className="text-[10px] text-teal-600 block font-bold">مداخيل اللمجة</span>
                      <span className="font-mono font-black text-teal-900 text-sm">{fmt(gouterPaymentsTotal)} د.ت</span>
                    </div>
                    <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-emerald-200 text-center">
                      <span className="text-[10px] text-emerald-600 block font-bold">لمجة الصباح 🥐</span>
                      <span className="font-mono font-black text-emerald-900 text-sm">{gouterMatinCount}</span>
                    </div>
                    <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-teal-200 text-center">
                      <span className="text-[10px] text-teal-600 block font-bold">لمجة المساء 🍪</span>
                      <span className="font-mono font-black text-teal-900 text-sm">{gouterSoirCount}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Students Table */}
            <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">تفاصيل استهلاك التلاميذ ({restoStudents.length} تلميذ)</h3>
                  <p className="text-[11px] text-slate-400">عرض 20 تلميذ بكل صفحة</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">التلميذ</th>
                      <th className="p-3">المستوى</th>
                      <th className="p-3">النوع</th>
                      <th className="p-3 text-center">اشتراكي</th>
                      <th className="p-3 text-center">وحدات</th>
                      <th className="p-3 text-center">المجموع</th>
                      <th className="p-3 text-center text-amber-700">غير مدفوعة</th>
                      <th className="p-3 text-center text-emerald-700">المدفوع</th>
                      <th className="p-3 text-center text-red-600">المسترجع</th>
                      <th className="p-3 text-center text-amber-800">الفرفي</th>
                      <th className="p-3 text-center text-emerald-700">حصة السنتر</th>
                      <th className="p-3 text-center text-red-700">حصة الـ Traiteur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedResto.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="p-8 text-center text-slate-400 font-bold">لا تلاميذ في هذه الفترة</td>
                      </tr>
                    ) : (
                      paginatedResto.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-bold text-slate-800">{s.name}</td>
                          <td className="p-3 text-slate-600">{s.grade}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                              s.isRefunded ? 'bg-orange-100 text-orange-700' : s.isSubscribed ? 'bg-emerald-100 text-emerald-700' : s.isEnrolled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {s.isRefunded ? 'مسترجع' : s.isSubscribed ? 'مشترك' : s.isEnrolled ? 'لم يدفع الإشتراك' : 'وجبة منفردة'}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700">{s.subscriptionMeals}</td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700">{s.unitMeals}</td>
                          <td className="p-3 text-center font-mono font-black text-slate-900">{s.totalMeals}</td>
                          <td className="p-3 text-center font-mono font-bold text-amber-700">{s.unpaidMeals > 0 ? s.unpaidMeals : '—'}</td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700">{fmt(s.grossPaid)} د.ت</td>
                          <td className="p-3 text-center font-mono font-bold text-red-600">{s.totalRefunded > 0 ? `-${fmt(s.totalRefunded)} د.ت` : '—'}</td>
                          <td className="p-3 text-center font-mono font-bold">
                            {s.forfaitUnused > 0 ? (
                              <span className="text-emerald-700">{fmt(s.forfaitUnused)} د.ت</span>
                            ) : s.forfaitEstimate > 0 ? (
                              <span className="text-slate-400" title="تقدير — يصبح مكتسباً بعد إغلاق الشهر">({fmt(s.forfaitEstimate)})</span>
                            ) : '—'}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700">{fmt(s.centerPart)} د.ت</td>
                          <td className="p-3 text-center font-mono font-bold text-red-700">{fmt(s.traiteurPart)} د.ت</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {totalRestoPages > 1 && (
                <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-400">صفحة {currentRestoPage} / {totalRestoPages}</span>
                  <div className="flex gap-2">
                    <button disabled={currentRestoPage <= 1} onClick={() => setRestoPage(p => Math.max(1, p - 1))} className="px-3 py-1 bg-slate-100 rounded-lg disabled:opacity-40 cursor-pointer">السابق</button>
                    <button disabled={currentRestoPage >= totalRestoPages} onClick={() => setRestoPage(p => Math.min(totalRestoPages, p + 1))} className="px-3 py-1 bg-slate-100 rounded-lg disabled:opacity-40 cursor-pointer">التالي</button>
                  </div>
                </div>
              )}
            </div>

            {/* Monthly Meals Consumed Breakdown */}
            <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">إجمالي الوجبات المستهلكة في كل شهر</h3>
                  <p className="text-[11px] text-slate-500 mt-1">يُحتسب لكل شهر الوجبات المستهلكة بالاشتراك الشهري أو بالوجبة المنفردة</p>
                </div>
                <div className="bg-emerald-100 border border-emerald-200 rounded-2xl px-4 py-2 text-center">
                  <span className="text-[10px] font-bold text-emerald-700 block">الإجمالي الكلي</span>
                  <span className="font-mono font-black text-emerald-800 text-lg">{totalPlatesConsumed} وجبة</span>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {ACADEMIC_MONTHS.map(month => {
                    const [startYear, endYear] = schoolYearFilter.split('/');
                    const mNum: Record<AcademicMonth, number> = { 'Septembre': 9, 'Octobre': 10, 'Novembre': 11, 'Décembre': 12, 'Janvier': 1, 'Février': 2, 'Mars': 3, 'Avril': 4, 'Mai': 5 };
                    const num = mNum[month] ?? 9;
                    const year = num >= 9 ? startYear : endYear;
                    const prefix = `${year}-${String(num).padStart(2, '0')}`;
                    const count = filteredStudents.reduce((sum, st) => sum + (st.mealAttendances || []).filter(a => a.date.startsWith(prefix)).length, 0);
                    return (
                      <button
                        key={month}
                        type="button"
                        onClick={() => setConsumedDetailMonth(month === consumedDetailMonth ? null : month)}
                        className={`rounded-2xl border p-3 text-center transition cursor-pointer ${consumedDetailMonth === month ? 'bg-emerald-100 border-emerald-400 shadow-sm' : 'border-slate-200 bg-slate-50/60 hover:border-emerald-300 hover:bg-emerald-50'}`}
                      >
                        <p className="text-[10px] font-bold text-slate-500">{ARABIC_ACADEMIC_MONTHS[month]} ({month})</p>
                        <p className="font-mono font-black text-slate-900 text-xl mt-1">{count}</p>
                        <p className="text-[10px] font-bold text-emerald-700">وجبة مستهلكة</p>
                      </button>
                    );
                  })}
                </div>

                {consumedDetailMonth && (() => {
                  const [startYear, endYear] = schoolYearFilter.split('/');
                  const mNum: Record<AcademicMonth, number> = { 'Septembre': 9, 'Octobre': 10, 'Novembre': 11, 'Décembre': 12, 'Janvier': 1, 'Février': 2, 'Mars': 3, 'Avril': 4, 'Mai': 5 };
                  const num = mNum[consumedDetailMonth] ?? 9;
                  const year = num >= 9 ? startYear : endYear;
                  const prefix = `${year}-${String(num).padStart(2, '0')}`;
                  const rows: Array<{ date: string; studentName: string; grade: string; type: 'subscription' | 'unit'; service: MealServiceType; paid: boolean; isEnrolled: boolean }> = [];
                  filteredStudents.forEach(st => {
                    const enrolled = st.mealSubscription?.active === true || st.enrolledServices?.meals === true;
                    (st.mealAttendances || []).forEach(a => {
                      if (a.date.startsWith(prefix)) {
                        rows.push({ date: a.date, studentName: `${st.firstName} ${st.lastName}`, grade: st.grade, type: a.type, service: a.service || 'lunch', paid: !!a.paid, isEnrolled: enrolled });
                      }
                    });
                  });
                  const sorted = rows.sort((a, b) => a.date.localeCompare(b.date));

                  return (
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                        <h4 className="font-black text-sm text-slate-900">
                          تفاصيل الوجبات المستهلكة في شهر {ARABIC_ACADEMIC_MONTHS[consumedDetailMonth]} ({consumedDetailMonth})
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-black">{sorted.length} وجبة / لمجة</span>
                          <button
                            type="button"
                            onClick={() => { setConsumedDetailMonth(null); setExpandedDays(new Set()); }}
                            className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold cursor-pointer"
                          >
                            إغلاق
                          </button>
                        </div>
                      </div>
                      {sorted.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 font-bold text-xs rounded-2xl border border-slate-200">لا توجد وجبات مستهلكة في هذا الشهر.</div>
                      ) : (() => {
                        const grouped: Record<string, typeof sorted> = {};
                        sorted.forEach(r => {
                          if (!grouped[r.date]) grouped[r.date] = [];
                          grouped[r.date].push(r);
                        });
                        const days = Object.keys(grouped).sort();
                        return (
                          <div className="space-y-2">
                            {days.map(day => {
                              const isOpen = expandedDays.has(day);
                              const dayRows = grouped[day];
                              const paidCount = dayRows.filter(r => r.paid).length;
                              return (
                                <div key={day} className="border border-slate-200 rounded-2xl overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = new Set(expandedDays);
                                      if (next.has(day)) next.delete(day); else next.add(day);
                                      setExpandedDays(next);
                                    }}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition cursor-pointer text-right"
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className={`text-[10px] font-bold transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                                      <span className="text-xs font-black text-slate-800">{day}</span>
                                      <span className="text-[10px] font-bold text-slate-400">({dayRows.length} وجبة / لمجة)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-emerald-600">{paidCount} مدفوعة</span>
                                      {dayRows.filter(r => !r.paid && r.isEnrolled).length > 0 && <span className="text-[10px] font-bold text-amber-600">{dayRows.filter(r => !r.paid && r.isEnrolled).length} لم يدفعو الإشتراك</span>}
                                      {dayRows.filter(r => !r.paid && !r.isEnrolled).length > 0 && <span className="text-[10px] font-bold text-red-500">{dayRows.filter(r => !r.paid && !r.isEnrolled).length} غير مدفوعة</span>}
                                    </div>
                                  </button>
                                  {isOpen && (
                                    <div className="border-t border-slate-200">
                                      <table className="w-full text-right text-xs">
                                        <thead className="bg-slate-100/60 text-slate-600 font-bold">
                                          <tr>
                                            <th className="p-2.5">التلميذ</th>
                                            <th className="p-2.5">المستوى</th>
                                            <th className="p-2.5">النوع والتصنيف</th>
                                            <th className="p-2.5">الحالة</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {dayRows.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50/80 transition">
                                              <td className="p-2.5 font-black text-slate-900">{row.studentName}</td>
                                              <td className="p-2.5 text-slate-500">{row.grade}</td>
                                              <td className="p-2.5">
                                                {row.service === 'gouter_matin' ? (
                                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold">
                                                    {row.type === 'subscription' ? 'لمجة الصباح (اشتراك)' : 'لمجة الصباح (منفردة)'}
                                                  </span>
                                                ) : row.service === 'gouter_apres_midi' ? (
                                                  <span className="px-2 py-0.5 bg-teal-100 text-teal-800 rounded-lg text-[10px] font-bold">
                                                    {row.type === 'subscription' ? 'لمجة المساء (اشتراك)' : 'لمجة المساء (منفردة)'}
                                                  </span>
                                                ) : (
                                                  <span className="px-2 py-0.5 bg-[#257C86]/10 text-[#1e626b] rounded-lg text-[10px] font-bold">
                                                    {row.type === 'subscription' ? 'وجبة غداء (اشتراك)' : 'وجبة غداء (منفردة)'}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="p-2.5 font-bold">
                                                {row.paid ? <span className="text-emerald-700">مدفوع</span> : row.isEnrolled ? <span className="text-amber-600">لم يدفع الإشتراك</span> : <span className="text-red-600">غير مدفوع</span>}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* TAB 7: CHEQUE PAYMENT VALIDATION */}
      {activeTab === 'cheques' && (() => {
        const pendingCheques = allPendingChequePayments.map(p => {
          const student = students.find(s => 
            s.payments?.some(sp => sp.id === p.id)
          );
          return {
            ...p,
            studentName: p.studentName || student?.firstName + ' ' + student?.lastName || 'غير معروف',
            service: p.service,
            studentId: student?.id
          };
        });

        const pendingFiltered = chequeSearch.trim()
          ? pendingCheques.filter(p => (p.chequeNumber || '').toLowerCase().includes(chequeSearch.trim().toLowerCase()))
          : pendingCheques;

        const chequesGrouped = pendingFiltered.reduce((acc, p) => {
          const key = p.chequeNumber || p.id;
          if (!acc[key]) acc[key] = { chequeNumber: p.chequeNumber, chequeDate: p.chequeDate, payments: [] as typeof pendingCheques, totalAmount: 0 };
          acc[key].payments.push(p);
          acc[key].totalAmount += p.amountPaid;
          return acc;
        }, {} as Record<string, { chequeNumber?: string; chequeDate?: string; payments: typeof pendingCheques; totalAmount: number }>);

        const groupedCheques = Object.values(chequesGrouped);
        const totalPendingCheques = pendingCheques.reduce((sum, p) => sum + p.amountPaid, 0);

        const handleValidateChequeGroup = (cheque: typeof groupedCheques[0]) => {
          const paymentIds = new Set(cheque.payments.map(p => p.id));
          const studentUpdates = new Map<string, Student>();
          cheque.payments.forEach(p => {
            if (!p.studentId || !onUpdateStudent) return;
            if (!studentUpdates.has(p.studentId)) {
              const student = students.find(s => s.id === p.studentId);
              if (student) studentUpdates.set(p.studentId, student);
            }
          });
          studentUpdates.forEach((student, studentId) => {
            const updatedPayments = (student.payments || []).map(sp => {
              if (paymentIds.has(sp.id)) return { ...sp, chequePaid: true };
              return sp;
            });
            onUpdateStudent({ ...student, payments: updatedPayments });
          });

          // Also validate formation students if any payment is from Formation
          if (formations && onUpdateFormations) {
            let formationChanged = false;
            const updatedFormations = formations.map(f => {
              const updatedStudents = (f.students || []).map(st => {
                const formPayId = `form_${f.id}_${st.id}`;
                if (paymentIds.has(formPayId) || (st.chequeNumber && st.chequeNumber === cheque.chequeNumber)) {
                  formationChanged = true;
                  return { ...st, chequePaid: true };
                }
                return st;
              });
              return { ...f, students: updatedStudents };
            });
            if (formationChanged) {
              onUpdateFormations(updatedFormations);
            }
          }

          toast.success(`تم تحصيل الشيك ${cheque.chequeNumber || ''} بنجاح - الإجمالي: ${fmt(cheque.totalAmount)} د.ت`);
        };

        return (
          <div className="bg-white rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-[#257C86]/[0.06] to-white border-b border-[#257C86]/25">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-[#1e626b] flex items-center gap-2">
                    <span className="text-2xl">📋</span>
                    تحصيل الشيكات
                  </h3>
                  <p className="text-xs text-[#257C86] mt-1">قائمة الشيكات المعلقة - اضغط "تم التحصيل" عند استلام المبلغ</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-[#1e626b] font-bold">المبلغ الإجمالي المعلق</p>
                  <p className="text-2xl font-black text-[#1e626b] font-mono">{fmt(totalPendingCheques)} د.ت</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="بحث برقم الشيك..."
                    value={chequeSearch}
                    onChange={(e) => { setChequeSearch(e.target.value); setChequesPageByService({}); }}
                    className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-white focus:outline-none focus:border-[#257C86] transition"
                  />
                </div>
              </div>
            </div>

            <div className="p-5">
              {groupedCheques.length === 0 ? (
                <div className="p-8 rounded-3xl border border-dashed border-slate-300 text-center">
                  <p className="text-sm font-bold text-slate-400">لا توجد شيكات معلقة</p>
                  <p className="text-xs text-slate-400 mt-1">جميع الشيكات تم تحصيلها أو لا توجد مدفوعات بالشيكات</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedCheques.map((cheque, idx) => (
                    <div key={cheque.chequeNumber || idx} className="border border-[#257C86]/20 rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 bg-[#257C86]/10/50 border-b border-[#257C86]/20 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-black text-[#1e626b] text-sm">شيك رقم: <span className="font-mono">{cheque.chequeNumber || 'بدون رقم'}</span></p>
                            <p className="text-xs text-[#257C86]">{cheque.chequeDate || ''} — {cheque.payments.length} خدمة — الإجمالي: {fmt(cheque.totalAmount)} د.ت</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleValidateChequeGroup(cheque)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-sm cursor-pointer flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          تم التحصيل
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="p-3 text-right font-bold text-slate-600">التلميذ</th>
                              <th className="p-3 text-center font-bold text-slate-600">الخدمة</th>
                              <th className="p-3 text-center font-bold text-slate-600">المبلغ</th>
                              <th className="p-3 text-center font-bold text-slate-600">الشهر</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/70">
                            {cheque.payments.map((p) => (
                              <tr key={p.id} className="hover:bg-[#257C86]/[0.05] transition">
                                <td className="p-3 font-bold text-slate-900">{p.studentName}</td>
                                <td className="p-3 text-center">
                                  <span className="inline-flex px-2 py-1 bg-[#257C86]/10 text-[#1e626b] rounded-lg font-bold text-[10px]">{paymentServiceLabel(p)}</span>
                                </td>
                                <td className="p-3 text-center font-mono font-bold text-[#257C86]">{fmt(p.amountPaid)} د.ت</td>
                                <td className="p-3 text-center text-slate-600 font-bold">{monthToArabic(p.month)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* CHEQUE DETAIL MODAL */}
      <AnimatePresence>
        {chequeDetailModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setChequeDetailModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 bg-gradient-to-r from-[#257C86]/[0.06] to-white border-b border-[#257C86]/20 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-[#1e626b]">تفاصيل الشيك</h3>
                  <p className="text-xs text-[#257C86] mt-1">رقم الشيك: <span className="font-mono">{chequeDetailModal.chequeNumber || 'بدون رقم'}</span></p>
                </div>
                <button onClick={() => setChequeDetailModal(null)} className="p-2 hover:bg-white/60 rounded-xl cursor-pointer"><X className="h-5 w-5 text-slate-600" /></button>
              </div>
              <div className="p-5 overflow-y-auto max-h-[65vh]">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400">رقم الشيك</p>
                    <p className="text-sm font-mono font-black text-[#1e626b]">{chequeDetailModal.chequeNumber || 'بدون رقم'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400">تاريخ الشيك</p>
                    <p className="text-sm font-mono font-black text-[#1e626b]">{chequeDetailModal.chequeDate || '-'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400">الحالة</p>
                    <p className={`text-sm font-black ${chequeDetailModal.paid ? 'text-emerald-700' : 'text-amber-700'}`}>{chequeDetailModal.paid ? 'شيك محصل' : 'شيك معلق'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400">المبلغ الإجمالي</p>
                    <p className="text-sm font-mono font-black text-[#257C86]">{fmt(chequeDetailModal.totalAmount)} د.ت</p>
                  </div>
                </div>
                <h4 className="font-black text-[#1e626b] text-sm mb-2">الخدمات المشمولة ({chequeDetailModal.payments.length})</h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="p-2.5 text-right font-bold text-slate-600">التلميذ</th>
                      <th className="p-2.5 text-center font-bold text-slate-600">الخدمة</th>
                      <th className="p-2.5 text-center font-bold text-slate-600">رقم الوصل</th>
                      <th className="p-2.5 text-center font-bold text-slate-600">المبلغ</th>
                      <th className="p-2.5 text-center font-bold text-slate-600">الشهر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {chequeDetailModal.payments.map((p: any) => (
                      <tr key={p.id} className="hover:bg-[#257C86]/[0.05]">
                        <td className="p-2.5 font-bold text-slate-900">{p.studentName}</td>
                        <td className="p-2.5 text-center">
                          <span className="inline-flex px-2 py-0.5 bg-[#257C86]/10 text-[#1e626b] rounded-md font-bold text-[10px]">{paymentServiceLabel(p)}</span>
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-500 text-[10px]">{p.receiptNumber || '-'}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-[#257C86]">{fmt(p.amountPaid)} د.ت</td>
                        <td className="p-2.5 text-center text-slate-600 font-bold">{monthToArabic(p.month)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
