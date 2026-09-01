import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GraduationCap, 
  Search, 
  CreditCard, 
  CheckCircle2,
  Filter, 
  Clock, 
  Plus, 
  Printer, 
  X,
  UserPlus,
  FileCheck,
  Calendar,
  Undo2,
  NotebookPen,
  Save,
  Star,
  TrendingUp,
  TrendingDown,
  Trash2,
  Users,
  Edit3,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { Student, StudentTimeSheet, PaymentRecord, ACADEMIC_MONTHS, ARABIC_ACADEMIC_MONTHS, AcademicMonth,
           getCurrentAcademicIndex, monthToArabic, CenterSettings, getFeesForYear, SuiviNotes, SuiviSubjectGrade,
           isMathSubject, getAppSubjects, DEFAULT_ACADEMIC_YEARS, generateReceiptNumber, getCurrentAcademicYear } from '../types';
import { useToast } from './Toast';
import DateField from './DateField';
import TimeSheetViewDialog from './TimeSheetViewDialog';

interface SuiviScolaireModuleProps {
  students: Student[];
  onUpdateStudent: (student: Student) => void;
  onUpdateStudents: (students: Student[]) => void;
  studentTimeSheets: StudentTimeSheet[];
  settings?: CenterSettings;
  onUpdateSettings?: (newSettings: CenterSettings) => void;
}

// Academic months (Sept -> Mai) mapped to their index
const ACADEMIC_INDEX: Record<AcademicMonth, number> = {
  'Septembre': 0, 'Octobre': 1, 'Novembre': 2, 'Décembre': 3,
  'Janvier': 4, 'Février': 5, 'Mars': 6, 'Avril': 7, 'Mai': 8
};

// Get subjects map for a student/year/trimester (empty object when nothing exists)
function getTrimesterSubjects(student: Student | null, year: string, trimester: 1 | 2 | 3): Record<string, SuiviSubjectGrade> {
  if (!student) return {};
  const set = student.suiviNotes?.find(n => n.schoolYear === year);
  return set?.trimesters.find(t => t.trimester === trimester)?.subjects || {};
}

// Build a new suiviNotes array with the updated subjects for the given trimester
function upsertNotes(student: Student, year: string, trimester: 1 | 2 | 3, subjects: Record<string, SuiviSubjectGrade>): SuiviNotes[] {
  const existing = student.suiviNotes || [];
  const yearSet = existing.find(n => n.schoolYear === year);
  let newSets: SuiviNotes[];

  if (!yearSet) {
    newSets = [...existing, { schoolYear: year, trimesters: [{ trimester, subjects }] }];
  } else {
    newSets = existing.map(n => {
      if (n.schoolYear !== year) return n;
      const otherTrimesters = n.trimesters.filter(t => t.trimester !== trimester);
      return { ...n, trimesters: [...otherTrimesters, { trimester, subjects }] };
    });
  }
  return newSets;
}

export default function SuiviScolaireModule({ students, onUpdateStudent, onUpdateStudents, studentTimeSheets, settings, onUpdateSettings }: SuiviScolaireModuleProps) {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [schoolYear, setSchoolYear] = useState<string>(getCurrentAcademicYear());
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [customYears, setCustomYears] = useState<string[]>(DEFAULT_ACADEMIC_YEARS);
  const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');

  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState<Student | null>(null);
  const [printingReceipt, setPrintingReceipt] = useState<{ student: Student; payment: PaymentRecord } | null>(null);

  // Enroll student modal state
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [enrollSearch, setEnrollSearch] = useState('');

  // Refund modal state
  const [refundStudent, setRefundStudent] = useState<Student | null>(null);
  const [refundMonths, setRefundMonths] = useState<Record<string, boolean>>({});
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  // Notes (devoirs) modal state
  const [notesStudent, setNotesStudent] = useState<Student | null>(null);

  // Read-only timesheet view state
  const [viewTimeSheetStudent, setViewTimeSheetStudent] = useState<Student | null>(null);
  const [notesTrimester, setNotesTrimester] = useState<1 | 2 | 3>(1);
  const [newNotesSubject, setNewNotesSubject] = useState('');

  // Shared subject list (from settings so it stays in sync across the app)
  const appSubjects = getAppSubjects(settings);

  const handleAddNotesSubject = () => {
    if (!newNotesSubject.trim() || !onUpdateSettings || !settings) return;
    const sub = newNotesSubject.trim();
    if (!appSubjects.includes(sub)) {
      onUpdateSettings({ ...settings, subjects: [...appSubjects, sub] });
    }
    setNewNotesSubject('');
  };

  // New Payment Modal Form States
  const [paymentServiceTarget, setPaymentServiceTarget] = useState<'Suivi' | 'Inscription'>('Suivi');
  const [paymentMonth, setPaymentMonth] = useState<string>('Octobre');
  const [amountPaid, setAmountPaid] = useState<number>(250);
  const [totalRequired, setTotalRequired] = useState<number>(250);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<'full' | 'advance' | 'balance'>('full');
  const [paymentMethod, setPaymentMethod] = useState<'Espèces' | 'Chèque'>('Espèces');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddCustomYear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearInput.trim()) return;
    const formatted = newYearInput.trim();
    if (!customYears.includes(formatted)) {
      setCustomYears([...customYears, formatted]);
    }
    setSchoolYear(formatted);
    setNewYearInput('');
    setIsAddYearModalOpen(false);
  };

  const [currentPage, setCurrentPage] = useState<number>(1);

  // Filter students enrolled in Suivi by year
  const suiviStudents = students.filter(st => {
    const isEnrolled = st.enrolledServices?.suivi !== false;
    const studentYear = st.academicYear || getCurrentAcademicYear();
    const matchesYear = schoolYear === 'all' || studentYear === schoolYear;
    const matchesGrade = gradeFilter === 'all' || st.grade === gradeFilter;
    const name = `${st.firstName} ${st.lastName} ${st.grade}`.toLowerCase();
    return isEnrolled && matchesYear && matchesGrade && name.includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(suiviStudents.length / 20) || 1;
  const paginatedStudents = suiviStudents.slice((currentPage - 1) * 20, currentPage * 20);

  // Filter students NOT enrolled in Suivi by year
  const nonEnrolledStudents = students.filter(st => {
    const isNotEnrolled = st.enrolledServices?.suivi === false;
    const studentYear = st.academicYear || getCurrentAcademicYear();
    const matchesYear = schoolYear === 'all' || studentYear === schoolYear;
    const matchesGrade = gradeFilter === 'all' || st.grade === gradeFilter;
    return isNotEnrolled && matchesYear && matchesGrade;
  });

  // Calculate stats for a given month
  // Resolve the CURRENT monthly/registration fees from settings (fallback to stored student fees)
  const currentFees = (st: Student) => {
    const y = st.academicYear || schoolYear;
    if (settings) {
      const f = getFeesForYear(settings, y);
      return {
        annualRegistrationFee: f.fraisAnnuelSuivi,
        monthlyFee: f.fraisMensuelSuivi
      };
    }
    return {
      annualRegistrationFee: st.suiviFees?.annualRegistrationFee || 150,
      monthlyFee: st.suiviFees?.monthlyFee || 250
    };
  };

  const getStudentMonthStatus = (st: Student, month: AcademicMonth): { 
    status: 'paid' | 'advance' | 'unpaid'; 
    paidAmount: number; 
    remaining: number;
    discount: number;
    paymentRecord?: PaymentRecord;
  } => {
    const monthPayments = (st.payments || []).filter(p => p.service === 'Suivi' && p.month.includes(month) && p.month.includes(schoolYear));
    const discount = monthPayments.reduce((m, p) => Math.max(m, p.discount || 0), 0);
    const required = Math.max(0, currentFees(st).monthlyFee - discount);
    if (monthPayments.length === 0) {
      return { status: 'unpaid', paidAmount: 0, remaining: required, discount };
    }

    const totalPaid = monthPayments.reduce((sum, p) => sum + p.amountPaid, 0);
    const lastPayment = monthPayments[monthPayments.length - 1];

    if (totalPaid >= required) {
      return { status: 'paid', paidAmount: totalPaid, remaining: 0, discount, paymentRecord: lastPayment };
    } else {
      return { status: 'advance', paidAmount: totalPaid, remaining: Math.max(0, required - totalPaid), discount, paymentRecord: lastPayment };
    }
  };

  const getStudentInscriptionStatus = (st: Student) => {
    const payments = (st.payments || []).filter(p =>
      p.service === 'Inscription' && p.month === `Annuel (${schoolYear})`
    );
    const discount = payments.reduce((m, p) => Math.max(m, p.discount || 0), 0);
    const required = Math.max(0, currentFees(st).annualRegistrationFee - discount);
    const paidAmount = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    const paymentRecord = payments[payments.length - 1];
    return {
      status: paidAmount >= required ? 'paid' as const : paidAmount > 0 ? 'advance' as const : 'unpaid' as const,
      paidAmount,
      remaining: Math.max(0, required - paidAmount),
      discount,
      paymentRecord
    };
  };

  const handleOpenPayment = (st: Student, month: AcademicMonth) => {
    const monthStatus = getStudentMonthStatus(st, month);
    
    // If ALREADY PAID, do NOT open pay modal again — trigger receipt print directly!
    if (monthStatus.status === 'paid' && monthStatus.paymentRecord) {
      setPrintingReceipt({ student: st, payment: monthStatus.paymentRecord });
      return;
    }

    setSelectedStudentForPayment(st);
    setPaymentServiceTarget('Suivi');
    setPaymentMonth(month);

    // Use the CURRENT fee defined in settings for this academic year
    const fullFee = currentFees(st).monthlyFee;
    const storedDiscount = monthStatus.discount || 0;
    setDiscount(storedDiscount);

    if (monthStatus.status === 'advance') {
      setAmountPaid(monthStatus.remaining);
      setTotalRequired(fullFee);
      setPaymentType('balance');
      setPaymentMethod('Espèces');
      setChequeNumber('');
      setChequeDate(new Date().toISOString().split('T')[0]);
      setNotes(`تكملة خلاص باقي شهر ${month} (السنة ${schoolYear})`);
    } else {
      setAmountPaid(fullFee - storedDiscount);
      setTotalRequired(fullFee);
      setPaymentType('full');
      setPaymentMethod('Espèces');
      setChequeNumber('');
      setChequeDate(new Date().toISOString().split('T')[0]);
      setNotes(`خلاص رسوم شهر ${month} (السنة ${schoolYear})`);
    }
  };

  const handleOpenInscriptionPayment = (st: Student) => {
    const paymentStatus = getStudentInscriptionStatus(st);
    if (paymentStatus.status === 'paid' && paymentStatus.paymentRecord) {
      setPrintingReceipt({ student: st, payment: paymentStatus.paymentRecord });
      return;
    }
    setSelectedStudentForPayment(st);
    setPaymentServiceTarget('Inscription');
    setPaymentMonth(`Annuel (${schoolYear})`);
    // Use the CURRENT fee defined in settings for this academic year
    const fee = currentFees(st).annualRegistrationFee;
    const storedDiscount = paymentStatus.discount || 0;
    setDiscount(storedDiscount);
    setAmountPaid(paymentStatus.status === 'advance' ? paymentStatus.remaining : fee - storedDiscount);
    setTotalRequired(fee);
    setPaymentType(paymentStatus.status === 'advance' ? 'balance' : 'full');
    setPaymentMethod('Espèces');
    setChequeNumber('');
    setChequeDate(new Date().toISOString().split('T')[0]);
    setNotes(paymentStatus.status === 'advance'
      ? `تكملة خلاص رسوم التسجيل السنوي (السنة ${schoolYear})`
      : `رسوم التسجيل السنوي (السنة ${schoolYear})`);
  };

  const handleEnrollStudent = (st: Student) => {
    const updatedStudent: Student = {
      ...st,
      enrolledServices: {
        ...(st.enrolledServices || { teenCenter: true, library: false, meals: false }),
        suivi: true
      },
      suiviFees: st.suiviFees || { 
        annualRegistrationFee: settings ? getFeesForYear(settings, st.academicYear || schoolYear).fraisAnnuelSuivi : 150, 
        monthlyFee: settings ? getFeesForYear(settings, st.academicYear || schoolYear).fraisMensuelSuivi : 250 
      }
    };
    onUpdateStudent(updatedStudent);
    setIsEnrollModalOpen(false);
    toast.success(`تم إلحاق التلميذ (${st.firstName} ${st.lastName}) بالمتابعة الدراسية بنجاح!`);
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForPayment || isSubmitting) return;
    setIsSubmitting(true);

    if (paymentMethod === 'Chèque' && (!chequeNumber.trim() || !chequeDate)) {
      toast.error('عذراً، يجب إدخال رقم الشيك وتاريخ الدفع عند الدفع بالشيك!');
      setIsSubmitting(false);
      return;
    }

    const numDiscount = Number(discount) || 0;
    const baseRequired = paymentServiceTarget === 'Inscription'
      ? (Number(totalRequired) || 0)
      : currentFees(selectedStudentForPayment).monthlyFee;

    if (numDiscount < 0) {
      toast.error('قيمة التخفيض لا يمكن أن تكون سالبة!');
      setIsSubmitting(false);
      return;
    }

    if (numDiscount >= baseRequired && baseRequired > 0) {
      toast.error(`قيمة التخفيض (${numDiscount} د.ت) يجب أن تكون أقل تماماً من المبلغ المستوجب (${baseRequired} د.ت) ولا يمكن أن تساويه أو تتجاوزه!`);
      setIsSubmitting(false);
      return;
    }

    const disc = Math.max(0, numDiscount);
    const paid = Math.max(0, Number(amountPaid) || 0);

    if (paymentServiceTarget === 'Inscription') {
      const currentStatus = getStudentInscriptionStatus(selectedStudentForPayment);
      const effectiveRequired = Math.max(0, Number(totalRequired) - disc);
      const maxPayable = Math.max(0, effectiveRequired - currentStatus.paidAmount);
      if (paid > maxPayable) {
        toast.error(`عذراً، المبلغ المدفوع أكبر من باقي رسوم التسجيل بعد التخفيض (${maxPayable} د.ت)!`);
        setIsSubmitting(false);
        return;
      }
      const totalPaidAfterThis = currentStatus.paidAmount + paid;
      const remaining = Math.max(0, effectiveRequired - totalPaidAfterThis);
      const newPayment: PaymentRecord = {
        id: 'pay_' + crypto.randomUUID(),
        date: new Date().toISOString().split('T')[0],
        amountPaid: paid,
        totalRequired: effectiveRequired,
        remainingBalance: remaining,
        service: 'Inscription',
        month: `Annuel (${schoolYear})`,
        paymentType: totalPaidAfterThis >= effectiveRequired ? (paymentType === 'balance' ? 'balance' : 'full') : 'advance',
        method: paymentMethod,
        chequeNumber: paymentMethod === 'Chèque' ? chequeNumber : undefined,
        chequeDate: paymentMethod === 'Chèque' ? chequeDate : undefined,
        receiptNumber: generateReceiptNumber(students, 'REC-'),
        notes: notes || 'رسوم التسجيل السنوي',
        discount: disc > 0 ? disc : undefined
      };

      const updatedStudent: Student = {
        ...selectedStudentForPayment,
        payments: [...(selectedStudentForPayment.payments || []), newPayment]
      };

      onUpdateStudent(updatedStudent);
      setSelectedStudentForPayment(null);
      setPrintingReceipt({ student: updatedStudent, payment: newPayment });
      setIsSubmitting(false);
      return;
    }

    const currentStatus = getStudentMonthStatus(selectedStudentForPayment, paymentMonth as AcademicMonth);

    const fullFee = currentFees(selectedStudentForPayment).monthlyFee;
    const effectiveRequired = Math.max(0, fullFee - disc);
    const maxPayable = Math.max(0, effectiveRequired - currentStatus.paidAmount);
    
    // Validation: cannot pay more than remaining balance
    if (paid > maxPayable) {
      toast.error(`عذراً، المبلغ المدفوع (${paid} د.ت) أكبر من باقي المبلغ المستوجب بعد التخفيض (${maxPayable} د.ت)!`);
      setIsSubmitting(false);
      return;
    }

    const totalPaidAfterThis = currentStatus.paidAmount + paid;
    const remaining = Math.max(0, effectiveRequired - totalPaidAfterThis);

    const newPayment: PaymentRecord = {
      id: 'pay_' + crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      amountPaid: paid,
      totalRequired: effectiveRequired,
      remainingBalance: remaining,
      service: 'Suivi',
      month: `${paymentMonth} (${schoolYear})`,
paymentType: totalPaidAfterThis >= effectiveRequired ? (paymentType === 'balance' ? 'balance' : 'full') : 'advance',
        method: paymentMethod,
        chequeNumber: paymentMethod === 'Chèque' ? chequeNumber : undefined,
        chequeDate: paymentMethod === 'Chèque' ? chequeDate : undefined,
        receiptNumber: generateReceiptNumber(students, 'REC-'),
        notes,
      discount: disc > 0 ? disc : undefined
    };

    const updatedStudent: Student = {
      ...selectedStudentForPayment,
      payments: [...(selectedStudentForPayment.payments || []), newPayment]
    };

    onUpdateStudent(updatedStudent);
    setSelectedStudentForPayment(null);
    setPrintingReceipt({ student: updatedStudent, payment: newPayment });
    setIsSubmitting(false);
  };

  // Open refund modal for future paid months (cannot refund current month)
  const handleOpenRefund = (st: Student) => {
    setRefundStudent(st);
    const currentIdx = getCurrentAcademicIndex();
    const refundable: Record<string, boolean> = {};
    ACADEMIC_MONTHS.forEach(m => {
      const ms = getStudentMonthStatus(st, m);
      if (ms.paidAmount > 0 && ACADEMIC_INDEX[m] > currentIdx) {
        const alreadyRefunded = (st.payments || []).some(
          p => p.refund && p.service === 'Suivi' && p.month === `${m} (${schoolYear})`
        );
        if (!alreadyRefunded) refundable[m] = true;
      }
    });
    setRefundMonths(refundable);
    setIsRefundModalOpen(true);
  };

  // Execute refund for selected months
  const handleConfirmRefund = () => {
    if (!refundStudent) return;
    const currentIdx = getCurrentAcademicIndex();
    const refundRecords: PaymentRecord[] = [];
    let totalRefund = 0;

    ACADEMIC_MONTHS.forEach(m => {
      if (!refundMonths[m]) return;
      const ms = getStudentMonthStatus(refundStudent, m);
      if (ms.paidAmount <= 0 || ACADEMIC_INDEX[m] <= currentIdx) return;
      const alreadyRefunded = (refundStudent.payments || []).some(
        p => p.refund && p.service === 'Suivi' && p.month === `${m} (${schoolYear})`
      );
      if (alreadyRefunded) {
        toast.warning(`شهر ${monthToArabic(m)} تمت استرجاعه مسبقاً — تم تخطيه.`);
        return;
      }
      totalRefund += ms.paidAmount;
      refundRecords.push({
        id: 'ref_' + crypto.randomUUID() + '_' + m,
        date: new Date().toISOString().split('T')[0],
        amountPaid: -ms.paidAmount, // negative = retour d'argent
        totalRequired: ms.paidAmount,
        remainingBalance: 0,
        service: 'Suivi',
        month: `${m} (${schoolYear})`,
        paymentType: 'balance',
        method: 'Espèces',
        receiptNumber: generateReceiptNumber(students, 'REM-'),
        notes: `استرجاع (Remboursement) شهر ${monthToArabic(m)} بسبب انسحاب التلميذ - ${schoolYear}`,
        refund: true
      });
    });

    if (refundRecords.length === 0) return;

    const updatedStudent: Student = {
      ...refundStudent,
      payments: [...(refundStudent.payments || []), ...refundRecords]
    };

    onUpdateStudent(updatedStudent);
    setIsRefundModalOpen(false);
    setRefundStudent(null);
    toast.success(`تم تسجيل استرجاع بمبلغ ${totalRefund} د.ت عند خلاص ${refundRecords.length} شهر لصالح الولي (مسجّل في الميزانية)!`);
  };

  // ---- NOTES (DEVOIRS) MODAL ----

  // Update a grade value for the active trimester + subject + which devoir
  // Notes are only accepted between 0 and 20 (values outside are rejected)
  const handleGradeChange = (subject: string, field: 'devoir1' | 'devoir2' | 'synthese', value: string) => {
    if (!notesStudent) return;
    const num = value === '' ? undefined : Number(value);

    if (num !== undefined && (isNaN(num) || num < 0 || num > 20)) {
      toast.error('النقطة يجب أن تكون بين 0 و 20!');
      return;
    }

    const current = getTrimesterSubjects(notesStudent, schoolYear, notesTrimester);
    const updatedSubjects: Record<string, SuiviSubjectGrade> = { ...current };
    updatedSubjects[subject] = { ...(updatedSubjects[subject] || {}), [field]: num };

    const updatedStudent: Student = {
      ...notesStudent,
      suiviNotes: upsertNotes(notesStudent, schoolYear, notesTrimester, updatedSubjects)
    };
    setNotesStudent(updatedStudent);
  };

  // Clear all grades for the active trimester (persist immediately)
  const handleClearTrimesterNotes = () => {
    if (!notesStudent) return;
    const updatedStudent: Student = {
      ...notesStudent,
      suiviNotes: upsertNotes(notesStudent, schoolYear, notesTrimester, {})
    };
    setNotesStudent(updatedStudent);
    onUpdateStudent(updatedStudent);
    toast.success(`تم مسح نقاط الثلاثي ${notesTrimester} للتلميذ (${notesStudent.firstName} ${notesStudent.lastName}).`);
  };

  const handleSaveNotes = () => {
    if (!notesStudent) return;
    onUpdateStudent(notesStudent);
    toast.success(`تم حفظ نقط التلميذ (${notesStudent.firstName} ${notesStudent.lastName}) للثلاثي ${notesTrimester} (السنة ${schoolYear}) بنجاح!`);
  };

  // Compute best / weakest subject averages for the selected trimester
  const getSubjectStats = (): { best: { subject: string; avg: number } | null; weak: { subject: string; avg: number } | null } => {
    const current = getTrimesterSubjects(notesStudent, schoolYear, notesTrimester);
    const entries = Object.entries(current).filter(([, g]) => g && (g.devoir1 != null || g.synthese != null));
    if (entries.length === 0) return { best: null, weak: null };

    const avgs = entries.map(([subject, g]) => {
      const nums = [g.devoir1, g.devoir2, g.synthese].filter((n): n is number => n != null && !isNaN(n));
      const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      return { subject, avg };
    });

    let best = avgs[0], weak = avgs[0];
    avgs.forEach(a => {
      if (a.avg > best.avg) best = a;
      if (a.avg < weak.avg) weak = a;
    });
    return { best, weak };
  };

  return (
    <div className="space-y-6">
      
      {/* Module Banner */}
      <div className="bg-white border border-[#E0EFF1] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
           <span className="px-3 py-1 bg-[#F2F8F9] text-[#14464E] text-xs font-bold rounded-lg border border-[#C3E0E4]/60">
               المتابعة الدراسية
             </span>
            <span className="text-xs text-slate-400 font-bold">المتابعة السنوية والشهرية</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-[#257C86]" />
            المتابعة الدراسية والمدفوعات
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            رسوم التسجيل السنوي والاشتراكات الشهرية، مع إمكانية الدفع على أقساط ومتابعة المبالغ المتبقية.
          </p>
        </div>

        {nonEnrolledStudents.length > 0 && (
          <button
            onClick={() => { setIsEnrollModalOpen(true); setEnrollSearch(''); }}
            className="px-4 py-3 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-2xl shadow-md cursor-pointer flex items-center gap-2 shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            إلحاق تلميذ بالمتابعة الدراسية
          </button>
        )}
      </div>

      {/* Filter and Academic Year Bar (NO TOP MONTH SELECTOR) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row gap-3 items-center justify-between no-print">
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
          <input 
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم التلميذ أو المستوى..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Calendar className="h-4 w-4 text-[#257C86] shrink-0" />
          <label className="text-xs font-black text-slate-700">السنة الدراسية:</label>
          <select
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
          >
            {customYears.map(yr => (
              <option key={yr} value={yr}>السنة الدراسية {yr}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#257C86] shrink-0" />
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86] cursor-pointer"
          >
            <option value="all">كل المستويات</option>
            <option value="Collège 7ème Année">Collège 7ème</option>
            <option value="Collège 8ème Année">Collège 8ème</option>
            <option value="Collège 9ème Année">Collège 9ème</option>
            <option value="Lycée 1ère Année">Lycée 1ère</option>
            <option value="Lycée 2ème Année">Lycée 2ème</option>
            <option value="Lycée 3ème Année">Lycée 3ème</option>
            <option value="Baccalauréat">Baccalauréat</option>
          </select>
        </div>
      </div>

      {/* STUDENTS ACADEMIC MONTH GRID TABLE (Module 2 Grid Septembre -> Mai) */}
      <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs no-print">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">شبكة المتابعة والمدفوعات ({schoolYear})</h3>
            <p className="text-xs text-slate-500">اضغط على شهر لتنزيل دفعة أو معاينة الوصل.</p>
          </div>
          
          <div className="flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-1.5 text-emerald-700">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span>Payé</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#17555F]">
              <div className="w-3 h-3 rounded-full bg-[#257C86]"></div>
              <span>Avance</span>
            </div>
            <div className="flex items-center gap-1.5 text-red-600">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <span>Non payé</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1100px] text-right text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">التلميذ</th>
                <th className="p-4">رسوم التسجيل السنوي</th>
                {ACADEMIC_MONTHS.map(m => (
                  <th key={m} className="p-4 text-center">
                    {ARABIC_ACADEMIC_MONTHS[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedStudents.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400 font-bold">
                    لا يوجد تلاميذ في هذه القائمة
                  </td>
                </tr>
              ) : (
                paginatedStudents.map(st => {
                  const regStatus = getStudentInscriptionStatus(st);
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4 font-extrabold text-slate-900">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setNotesStudent(st);
                              setNotesTrimester(1);
                            }}
                            className="p-1.5 shrink-0 bg-[#F2F8F9] hover:bg-[#E0EFF1] text-[#257C86] rounded-lg border border-[#C3E0E4] transition cursor-pointer"
                            title="إدخال نقاط الفروض (Notes Devoirs)"
                          >
                            <NotebookPen className="h-3.5 w-3.5" />
                          </button>
                          {st.timeSheetId && studentTimeSheets.some(t => t.id === st.timeSheetId) ? (
                            <button
                              onClick={() => {
                                const ts = studentTimeSheets.find(t => t.id === st.timeSheetId);
                                if (ts) setViewTimeSheetStudent(st);
                              }}
                              className="p-1.5 shrink-0 bg-[#F2F8F9] hover:bg-[#E0EFF1] text-[#257C86] rounded-lg border border-[#C3E0E4] transition cursor-pointer"
                              title="عرض الجدول الزمني"
                            >
                              <Clock className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span
                              className="p-1.5 shrink-0 bg-slate-100 text-slate-400 rounded-lg border border-slate-200 cursor-not-allowed"
                              title="لم يُسنَد جدول توقيت بعد"
                            >
                              <Clock className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <button
                            onClick={() => handleOpenRefund(st)}
                            className="p-1.5 shrink-0 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 transition cursor-pointer"
                            title="استرجاع أشهر مستقبلية"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{st.firstName} {st.lastName}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono font-bold">
                        {regStatus.status === 'paid' && regStatus.paymentRecord ? (
                          <button
                            onClick={() => setPrintingReceipt({ student: st, payment: regStatus.paymentRecord! })}
                            className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded font-black text-[10px] flex items-center gap-1 cursor-pointer"
                            title="طباعة وصل التسجيل السنوي"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            التسجيل السنوي 🖨️
                          </button>
                        ) : regStatus.status === 'advance' ? (
                          <button
                            onClick={() => handleOpenInscriptionPayment(st)}
                            className="px-2.5 py-1 bg-[#F2F8F9] hover:bg-[#E0EFF1] text-[#14464E] border border-[#A0CBCF] rounded font-bold cursor-pointer"
                          >
                            تكملة التسجيل ({regStatus.remaining} د.ت)
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenInscriptionPayment(st)}
                            className="px-2.5 py-1 bg-[#F2F8F9] hover:bg-[#E0EFF1] text-[#14464E] border border-[#A0CBCF] rounded font-bold cursor-pointer"
                          >
                            خلاص التسجيل السنوي
                          </button>
                        )}
                      </td>

                      {/* Academic months cells */}
                      {ACADEMIC_MONTHS.map(m => {
                        const mStatus = getStudentMonthStatus(st, m);
                        return (
                          <td key={m} className="p-3 text-center">
                            {mStatus.status === 'paid' && (
                              <button
                                onClick={() => handleOpenPayment(st, m)}
                                className="w-full py-1.5 px-2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-black text-[10px] flex items-center justify-center gap-1 hover:bg-emerald-200 transition cursor-pointer"
                                title="طباعة الوصل"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Payé ({mStatus.paidAmount} د.ت) 🖨️
                              </button>
                            )}

                            {mStatus.status === 'advance' && (
                              <button
                                onClick={() => handleOpenPayment(st, m)}
                                className="w-full py-1.5 px-2 bg-[#E0EFF1] text-[#103840] border border-[#A0CBCF] rounded-xl font-black text-[10px] flex items-center justify-center gap-1 hover:bg-[#C3E0E4] transition cursor-pointer"
                              >
                                <Clock className="h-3 w-3" />
                                Avance ({mStatus.paidAmount} د.ت)
                                <span className="block text-[9px] font-normal">باقي {mStatus.remaining}د.ت</span>
                              </button>
                            )}

                            {mStatus.status === 'unpaid' && (
                              <button
                                onClick={() => handleOpenPayment(st, m)}
                                className="w-full py-1.5 px-2 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-xl font-bold text-[10px] transition cursor-pointer"
                              >
                                Non payé
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls (20 by 20) */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              عرض {((currentPage - 1) * 20) + 1} - {Math.min(currentPage * 20, suiviStudents.length)} من أصل {suiviStudents.length} تلميذ
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                السابقة
              </button>
              <span className="text-xs font-black text-slate-700">
                صفحة {currentPage} من {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                التالية
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ENROLL STUDENT MODAL */}
      <AnimatePresence>
        {isEnrollModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-[#3A93A0]" />
                  <h3 className="text-lg font-black">إلحاق تلميذ بالمتابعة الدراسية</h3>
                </div>

                <button 
                  onClick={() => setIsEnrollModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500 font-medium">
                  اختر تلميذاً من القائمة العامة لإلحاقه بالمتابعة الدراسية:
                </p>

                {nonEnrolledStudents.length > 0 && (
                  <div className="relative">
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={enrollSearch}
                      onChange={(e) => setEnrollSearch(e.target.value)}
                      placeholder="بحث باسم التلميذ..."
                      className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                )}

                {nonEnrolledStudents.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
                    جميع التلاميذ مسجلون في المتابعة الدراسية!
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                    {nonEnrolledStudents.filter(st => {
                      if (!enrollSearch.trim()) return true;
                      const full = `${st.firstName} ${st.lastName} ${st.grade}`.toLowerCase();
                      return full.includes(enrollSearch.toLowerCase());
                    }).map(st => (
                      <div key={st.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-xs text-slate-900">{st.firstName} {st.lastName}</p>
                          <p className="text-[10px] text-slate-400">{st.grade} — ولي الأمر: <span dir="ltr">{st.father?.phoneMobile || st.mother?.phoneMobile || 'لا يوجد'}</span></p>
                        </div>
                        <button
                          onClick={() => handleEnrollStudent(st)}
                          className="px-3 py-1.5 bg-[#257C86] hover:bg-[#1E6A73] text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <FileCheck className="h-3.5 w-3.5" />
                          إلحاق بالدراسة
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setIsEnrollModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FRACTIONAL PAYMENT ENTRY MODAL */}
      <AnimatePresence>
        {selectedStudentForPayment && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-[#3A93A0]" />
                  <div>
                    <h3 className="text-lg font-black">
                      {paymentServiceTarget === 'Inscription' 
                        ? `تنزيل خلاص التسجيل السنوي (${schoolYear})`
                        : `تنزيل دفعة شهر ${paymentMonth} (${schoolYear})`}
                    </h3>
                    <p className="text-xs text-slate-300">
                      التلميذ(ة): {selectedStudentForPayment.firstName} {selectedStudentForPayment.lastName}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setSelectedStudentForPayment(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
                {(() => {
                  const isInscription = paymentServiceTarget === 'Inscription';
                  const activeMonthStatus = selectedStudentForPayment
                    ? (isInscription
                      ? getStudentInscriptionStatus(selectedStudentForPayment)
                      : getStudentMonthStatus(selectedStudentForPayment, paymentMonth as AcademicMonth))
                    : null;
                  const isAdvanceStatus = activeMonthStatus?.status === 'advance';
                  const stFees = selectedStudentForPayment ? currentFees(selectedStudentForPayment) : null;
                  const standardFee = isInscription 
                    ? (stFees?.annualRegistrationFee || 150)
                    : (stFees?.monthlyFee || 250);

                  return (
                    <>
                      {isAdvanceStatus && activeMonthStatus && (
                        <div className="p-3.5 bg-[#F2F8F9] rounded-2xl border border-[#A0CBCF] text-xs space-y-1.5 font-bold text-[#0B252B]">
                          <div className="flex justify-between items-center">
                            <span>سبق خلاص تسبقة لشهر {paymentMonth}:</span>
                            <span className="font-mono text-emerald-800 font-extrabold text-sm">{activeMonthStatus.paidAmount} د.ت</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-[#C3E0E4]/80 pt-1.5">
                            <span>المتبقي لاستكمال الشهر (Solde):</span>
                            <span className="font-mono text-red-700 font-black text-sm">{activeMonthStatus.remaining} د.ت</span>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">نوع الدفعة *</label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentType('full');
                              const targetVal = isAdvanceStatus ? activeMonthStatus.remaining : Math.max(0, standardFee - (Number(discount) || 0));
                              setAmountPaid(targetVal);
                              setTotalRequired(standardFee);
                            }}
                            className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                              paymentType === 'full' 
                                ? 'bg-[#257C86] text-white border-[#257C86]' 
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {isAdvanceStatus 
                              ? `خلاص الباقي (${activeMonthStatus?.remaining} د.ت)` 
                              : isInscription 
                                ? `خلاص التسجيل كامل (${standardFee} د.ت)`
                                : `خلاص كامل (${standardFee} د.ت)`}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentType('advance');
                              const defaultAdv = isAdvanceStatus 
                                ? Math.min(50, activeMonthStatus.remaining) 
                                : Math.round(Math.max(0, standardFee - (Number(discount) || 0)) / 2);
                              setAmountPaid(defaultAdv);
                              setTotalRequired(standardFee);
                            }}
                            className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                              paymentType === 'advance' 
                                ? 'bg-[#257C86] text-white border-[#257C86]' 
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            تسبقة (Avance)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentType('balance');
                              if (isAdvanceStatus) {
                                setAmountPaid(activeMonthStatus.remaining);
                              }
                            }}
                            className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                              paymentType === 'balance' 
                                ? 'bg-[#257C86] text-white border-[#257C86]' 
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            تكملة باقي (Solde)
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">طريقة الدفع *</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => { setPaymentMethod('Espèces'); setChequeNumber(''); setChequeDate(new Date().toISOString().split('T')[0]); }}
                            className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                              paymentMethod === 'Espèces'
                                ? 'bg-[#257C86] text-white border-[#257C86]'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            نقداً (Espèces)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('Chèque')}
                            className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                              paymentMethod === 'Chèque'
                                ? 'bg-[#257C86] text-white border-[#257C86]'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            شيك (Par Chèque)
                          </button>
                        </div>
                      </div>

                      {paymentMethod === 'Chèque' && (
                        <div className="grid grid-cols-2 gap-3 p-3 bg-[#F2F8F9] rounded-xl border border-[#A0CBCF]">
                          <div className="flex flex-col justify-end">
                            <label className="text-[10px] font-bold text-slate-600 block mb-1">رقم الشيك *</label>
                            <input
                              type="text" required
                              value={chequeNumber}
                              onChange={(e) => setChequeNumber(e.target.value)}
                              placeholder="رقم الشيك"
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 h-[38px]"
                            />
                          </div>
                          <div className="flex flex-col justify-end">
                            <label className="text-[10px] font-bold text-slate-600 block mb-1">تاريخ الدفع *</label>
                            <DateField
                              required
                              value={chequeDate}
                              onChange={(e) => setChequeDate(e.target.value)}
                              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 h-[38px]"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">
                          التخفيض (د.ت) <span className="text-[10px] text-amber-600 font-semibold">(يجب أن يكون أقل من المبلغ)</span>
                        </label>
                        <input 
                          type="number" min="0" max={Math.max(0, standardFee - 1)}
                          value={discount}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(standardFee - 1, Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0));
                            setDiscount(val);
                            if (paymentType === 'full') {
                              setAmountPaid(Math.max(0, standardFee - val));
                            }
                          }}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-emerald-700"
                        />
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          المستوجب بعد التخفيض: {Math.max(0, standardFee - (Number(discount) || 0))} د.ت
                          {Number(discount) >= standardFee && standardFee > 0 && (
                            <span className="text-red-500 font-black block mt-0.5">⚠️ التخفيض لا يمكن أن يساوي أو يتجاوز {standardFee} د.ت!</span>
                          )}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-slate-600 block mb-1">
                            المبلغ المدفوع (د.ت) *
                          </label>
                           <input 
                            type="number" required min="0"
                            value={amountPaid} 
                            max={isAdvanceStatus ? activeMonthStatus?.remaining : undefined}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = Math.max(0, Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0);
                              if (isAdvanceStatus && activeMonthStatus && val > activeMonthStatus.remaining) {
                                toast.warning(`عذراً، المبلغ المطلوب لاستكمال الشهر هو ${activeMonthStatus.remaining} د.ت فقط!`);
                                setAmountPaid(activeMonthStatus.remaining);
                              } else {
                                setAmountPaid(val);
                              }
                            }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-emerald-700"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-600 block mb-1">
                            {isInscription ? 'إجمالي التسجيل (د.ت)' : 'إجمالي الشهر (د.ت)'}
                          </label>
                          <input 
                            type="number" required value={totalRequired} readOnly
                            className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Remaining calculation banner */}
                      <div className="p-3 bg-[#F2F8F9] rounded-2xl border border-[#C3E0E4] text-xs flex justify-between font-bold text-[#103840]">
                        <span>المبلغ المتبقي بعد هذه الدفعة:</span>
                        <span className="font-mono text-sm font-black text-red-700">
                          {Math.max(0, Math.max(0, Number(totalRequired) - (Number(discount) || 0)) - (activeMonthStatus?.paidAmount || 0) - Number(amountPaid || 0))} د.ت
                        </span>
                      </div>
                    </>
                  );
                })()}

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setSelectedStudentForPayment(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    تأكيد الدفع وطباعة الوصل
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRINT RECEIPT MODAL */}
      <AnimatePresence>
        {printingReceipt && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-8"
            >
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center no-print">
                <span className="font-bold text-sm">وصل خلاص رسمي</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#257C86] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    طباعة الوصل 🖨️
                  </button>
                  <button
                    onClick={() => setPrintingReceipt(null)}
                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto">
              {/* RECEIPT PRINT TEMPLATE */}
              {(() => {
                const allMonthPayments = (printingReceipt.student.payments || []).filter(p => 
                  p.service === printingReceipt.payment.service && p.month === printingReceipt.payment.month
                );
                const totalPaidForMonth = allMonthPayments.reduce((s, p) => s + p.amountPaid, 0);
                const totalMonthDiscount = allMonthPayments.reduce((s, p) => s + (p.discount || 0), 0);
                const fullFeeRequired = printingReceipt.payment.totalRequired || (printingReceipt.payment.service === 'Inscription' ? 150 : 250);
                const finalRemaining = Math.max(0, fullFeeRequired - totalPaidForMonth);

                return (
                  <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col">
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-950">Teen Center — وصل خلاص كشف المدفوعات</h2>
                        <p className="text-[10px] text-slate-500 font-mono">رقم آخر وصل: {printingReceipt.payment.receiptNumber}</p>
                        <p className="text-[10px] text-slate-400">تاريخ آخر دفعة: {printingReceipt.payment.date}</p>
                      </div>
                      <div className="text-left font-mono font-bold text-xs bg-slate-100 p-2 rounded border border-slate-300">
                        <p>الخدمة: <strong>{printingReceipt.payment.service}</strong></p>
                        <p className="text-[11px] text-[#14464E] mt-0.5">{printingReceipt.payment.service === 'Inscription' ? 'الفترة:' : 'الشهر:'} {printingReceipt.payment.month}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-bold">اسم التلميذ(ة):</span>
                        <span className="font-extrabold text-slate-900">{printingReceipt.student.firstName} {printingReceipt.student.lastName} ({printingReceipt.student.grade})</span>
                      </div>

                      <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-bold">اسم الولي المسجل:</span>
                        <span className="font-bold text-slate-800">{printingReceipt.student.father?.name || printingReceipt.student.mother?.name || 'غير مدون'}</span>
                      </div>

                      {/* Payment History Table for this month */}
                      <div className="space-y-1.5 pt-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex justify-between items-center">
                          <span>{printingReceipt.payment.service === 'Inscription' ? 'سجل دفعات التسجيل:' : 'سجل دفعات هذا الشهر:'}</span>
                          <span className="text-[10px] text-slate-500 font-normal">عدد الدفعات: {allMonthPayments.length}</span>
                        </h4>

                        <div className="border border-slate-300 rounded-xl overflow-hidden">
                          <table className="w-full text-right text-[11px]">
                            <thead className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                              <tr>
                                <th className="p-2">#</th>
                                <th className="p-2">التاريخ</th>
                                <th className="p-2">رقم الوصل</th>
                                <th className="p-2">طريقة الدفع / ملاحظات</th>
                                <th className="p-2 text-left">المبلغ المقبوض</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                              {allMonthPayments.map((p, idx) => (
                                <tr key={p.id || idx}>
                                  <td className="p-2 font-bold text-slate-400">{idx + 1}</td>
                                  <td className="p-2 font-mono text-slate-700">{p.date}</td>
                                  <td className="p-2 font-mono text-slate-500 text-[10px]">{p.receiptNumber}</td>
                                  <td className="p-2 text-slate-800 font-medium">
                                    <span className="font-bold">{p.method}</span>
                                    {p.notes && <span className="text-slate-500 text-[10px] block">{p.notes}</span>}
                                    {p.discount ? <span className="text-[#17555F] text-[10px] block font-bold">التخفيض: {p.discount} د.ت</span> : null}
                                  </td>
                                  <td className="p-2 text-left font-black font-mono text-emerald-800">{p.amountPaid} د.ت</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-300">
                          <span className="text-[10px] text-slate-600 block font-bold">{printingReceipt.payment.service === 'Inscription' ? 'مبلغ التسجيل السنوي:' : 'مبلغ الشهر:'}</span>
                          <span className="text-base font-black text-slate-900 font-mono">{fullFeeRequired} د.ت</span>
                        </div>

                        <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-300">
                          <span className="text-[10px] text-emerald-800 block font-bold">المسدد حتى الآن:</span>
                          <span className="text-base font-black text-emerald-700 font-mono">{totalPaidForMonth} د.ت</span>
                        </div>

                        <div className={`p-2.5 rounded-xl border ${finalRemaining === 0 ? 'bg-slate-50 border-slate-200' : 'bg-[#F2F8F9] border-[#A0CBCF]'}`}>
                          <span className="text-[10px] text-[#103840] block font-bold">الرصيد المتبقي:</span>
                          <span className={`text-base font-black font-mono ${finalRemaining === 0 ? 'text-slate-400' : 'text-red-700'}`}>{finalRemaining} د.ت</span>
                        </div>
                      </div>

                      {totalMonthDiscount > 0 && (
                        <div className="p-2.5 bg-[#F2F8F9] rounded-xl border border-[#A0CBCF] flex justify-between items-center">
                          <span className="text-[10px] text-[#14464E] font-bold">{'إجمالي التخفيض:'}</span>
                          <span className="text-base font-black text-[#17555F] font-mono">-{totalMonthDiscount} د.ت</span>
                        </div>
                      )}

                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center font-bold">
                        {finalRemaining === 0 ? (
                          <span className="text-emerald-700 text-xs flex items-center justify-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            {printingReceipt.payment.service === 'Inscription' ? 'حالة التسجيل: مسدد بالكامل' : 'حالة الشهر: مسدد بالكامل'}
                          </span>
                        ) : (
                          <span className="text-[#14464E] text-xs">
                            {printingReceipt.payment.service === 'Inscription' ? `حالة التسجيل: خلاص جزئي — باقي: ${finalRemaining} د.ت` : `حالة الشهر: خلاص جزئي — باقي: ${finalRemaining} د.ت`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-slate-300">
                      <div className="flex justify-between items-center text-[10px] text-slate-500 mb-8">
                        <p>نشكركم على ثقتكم في مركز Teen Center.</p>
                        <p className="font-bold text-slate-900">ختم وإدارة مركز Teen Center</p>
                      </div>
                      <div className="w-1/2 text-center mr-auto">
                        <div className="border-b-2 border-dotted border-slate-400 h-20 mb-1"></div>
                        <p className="text-[10px] text-slate-500 font-bold">ختم وإمضاء إدارة المركز</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              </div>
            </motion.div>
          </div>
        )}

        {/* REFUND (Remboursement) MODAL */}
        {isRefundModalOpen && refundStudent && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Undo2 className="h-5 w-5 text-red-400" />
                  <div>
                    <h3 className="text-lg font-black">استرجاع أشهر مستقبلية</h3>
                    <p className="text-xs text-slate-300">
                      التلميذ(ة): {refundStudent.firstName} {refundStudent.lastName} — عند الانسحاب
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsRefundModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-600 font-bold leading-relaxed bg-[#F2F8F9] border border-[#C3E0E4] rounded-2xl p-3">
                  يُسترجع مبلغ الأشهر المخلصة التي لم يحن موعدها بعد (عدا الشهر الحالي)، ويثبت ذلك في الميزانية.
                </p>

                {Object.keys(refundMonths).length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
                    لا توجد أشهر مستقبلية مدفوعة للاسترجاع.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {Object.keys(refundMonths).map(m => {
                      const ms = getStudentMonthStatus(refundStudent, m as AcademicMonth);
                      return (
                        <label
                          key={m}
                          className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition ${refundMonths[m] ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'}`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={!!refundMonths[m]}
                              onChange={(e) => setRefundMonths({ ...refundMonths, [m]: e.target.checked })}
                              className="h-4 w-4 accent-red-600"
                            />
                            <div>
                              <p className="text-xs font-black text-slate-900">{monthToArabic(m)} ({m})</p>
                              <p className="text-[10px] text-slate-500">المبلغ المسدد: <span className="font-mono font-bold">{ms.paidAmount} د.ت</span></p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-red-600">قابل للاسترجاع</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsRefundModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRefund}
                    disabled={!Object.values(refundMonths).some(v => v)}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Undo2 className="h-4 w-4" />
                    تأكيد الاسترجاع وتسجيله في الميزانية
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* NOTES (DEVOIRS) MODAL */}
        {notesStudent && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <NotebookPen className="h-5 w-5 text-[#3A93A0]" />
                  <div>
                    <h3 className="text-lg font-black">نقاط الفروض والامتحانات (Notes Devoirs)</h3>
                    <p className="text-xs text-slate-300">
                      التلميذ(ة): {notesStudent.firstName} {notesStudent.lastName} — السنة {schoolYear}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setNotesStudent(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                {/* Trimester tabs */}
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setNotesTrimester(t)}
                      className={`py-2.5 rounded-2xl text-sm font-black border transition cursor-pointer ${
                        notesTrimester === t
                          ? 'bg-[#257C86] text-white border-[#257C86] shadow-md'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-[#F2F8F9]'
                      }`}
                    >
                      الثلاثي {['الأول', 'الثاني', 'الثالث'][t - 1]} (Trimestre {t})
                    </button>
                  ))}
                </div>

                {/* Best / Weak summary */}
                {(() => {
                  const stats = getSubjectStats();
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      {stats.best ? (
                        <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-emerald-700 shrink-0" />
                          <div className="text-xs">
                            <span className="text-emerald-700 font-bold">أفضل مادة: </span>
                            <span className="font-black text-emerald-900">{stats.best.subject}</span>
                            <span className="font-mono font-black text-emerald-700"> ({stats.best.avg.toFixed(1)}/20)</span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-2 text-slate-400">
                          <Star className="h-4 w-4 shrink-0" />
                          <span className="text-xs font-bold">لا توجد نقاط بعد لهذا الثلاثي</span>
                        </div>
                      )}
                      {stats.weak && stats.weak.subject !== stats.best?.subject ? (
                        <div className="p-3 bg-red-50 rounded-2xl border border-red-200 flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-red-700 shrink-0" />
                          <div className="text-xs">
                            <span className="text-red-700 font-bold">أضعف مادة: </span>
                            <span className="font-black text-red-900">{stats.weak.subject}</span>
                            <span className="font-mono font-black text-red-700"> ({stats.weak.avg.toFixed(1)}/20)</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* Grades table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">المادة (Matière)</th>
                        <th className="p-3 text-center">فرض إختبار ن°1</th>
                        <th className="p-3 text-center">فرض إختبار ن°2 <span className="block text-[9px] font-normal text-slate-500">(رياضيات فقط)</span></th>
                        <th className="p-3 text-center">فرض مراقبة (Synthèse)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {appSubjects.map(subject => {
                        const subjects = getTrimesterSubjects(notesStudent, schoolYear, notesTrimester);
                        const grade = subjects[subject] || {};
                        return (
                          <tr key={subject} className="hover:bg-slate-50/60 transition">
                            <td className="p-3 font-extrabold text-slate-900">
                              {isMathSubject(subject) ? (
                                <span className="flex items-center gap-1.5">
                                  {subject}
                                  <Star className="h-3 w-3 text-[#257C86]" />
                                </span>
                              ) : subject}
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number" min={0} max={20} step="0.25"
                                value={grade.devoir1 ?? ''}
                                onChange={(e) => handleGradeChange(subject, 'devoir1', e.target.value)}
                                placeholder="—"
                                className="w-24 px-2 py-1.5 text-center bg-slate-50 border border-slate-200 rounded-xl font-mono font-black focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                              />
                            </td>
                            <td className="p-3 text-center">
                              {isMathSubject(subject) ? (
                                <input
                                  type="number" min={0} max={20} step="0.25"
                                  value={grade.devoir2 ?? ''}
                                  onChange={(e) => handleGradeChange(subject, 'devoir2', e.target.value)}
                                  placeholder="—"
                                  className="w-24 px-2 py-1.5 text-center bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                                />
                              ) : (
                                <span className="text-slate-300 font-bold">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number" min={0} max={20} step="0.25"
                                value={grade.synthese ?? ''}
                                onChange={(e) => handleGradeChange(subject, 'synthese', e.target.value)}
                                placeholder="—"
                                className="w-24 px-2 py-1.5 text-center bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Add new matière */}
                  <div className="p-3 bg-slate-50 border-t border-slate-200 flex gap-2">
                    <input
                      type="text"
                      value={newNotesSubject}
                      onChange={(e) => setNewNotesSubject(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNotesSubject(); } }}
                      placeholder="إضافة مادة جديدة (ستُضاف تلقائياً في كل الوحدات)..."
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    />
                    <button
                      type="button"
                      onClick={handleAddNotesSubject}
                      className="px-4 py-1.5 bg-[#257C86] hover:bg-[#1E6A73] text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      إضافة المادة
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setNotesStudent(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleClearTrimesterNotes}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    مسح نقاط الثلاثي
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Save className="h-4 w-4" />
                    حفظ النقاط
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

      </AnimatePresence>

      {/* READ-ONLY TIMESHEET VIEW OVERLAY */}
      {viewTimeSheetStudent && (() => {
        const ts = studentTimeSheets.find(t => t.id === viewTimeSheetStudent.timeSheetId);
        if (!ts) return null;
        return (
          <TimeSheetViewDialog
            key={ts.id}
            timeSheet={ts}
            studentName={`${viewTimeSheetStudent.firstName} ${viewTimeSheetStudent.lastName}`}
            onClose={() => setViewTimeSheetStudent(null)}
          />
        );
      })()}

    </div>
  );
}
