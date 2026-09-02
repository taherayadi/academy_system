import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Utensils, 
  Calendar, 
  Users, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  XSquare, 
  RefreshCw, 
  Trash2, 
  Edit3, 
  Clock, 
  Search, 
  DollarSign, 
  X,
  UserPlus,
  Printer,
  CreditCard,
  Undo2,
  CalendarDays,
  ChevronDown
} from 'lucide-react';
import { Student, MealPlanDay, CenterSettings, ACADEMIC_MONTHS, ARABIC_ACADEMIC_MONTHS, AcademicMonth, getFeesForYear, PaymentRecord, getCurrentAcademicIndex, monthToArabic, DEFAULT_ACADEMIC_YEARS, generateReceiptNumber, getCurrentAcademicYear } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import DateField from './DateField';

interface MealsModuleProps {
  students: Student[];
  mealPlans: MealPlanDay[];
  onUpdateStudents: (students: Student[]) => void;
  onUpdateMealPlans: (plans: MealPlanDay[]) => void;
  settings?: CenterSettings;
}

const WEEKDAYS: MealPlanDay['day'][] = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const DAY_BY_INDEX: Record<number, MealPlanDay['day']> = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi' };
const ARABIC_WEEKDAYS: Record<MealPlanDay['day'], string> = {
  'Lundi': 'الإثنين',
  'Mardi': 'الثلاثاء',
  'Mercredi': 'الأربعاء',
  'Jeudi': 'الخميس',
  'Vendredi': 'الجمعة'
};

const ACADEMIC_INDEX: Record<AcademicMonth, number> = {
  'Septembre': 0, 'Octobre': 1, 'Novembre': 2, 'Décembre': 3,
  'Janvier': 4, 'Février': 5, 'Mars': 6, 'Avril': 7, 'Mai': 8
};

export default function MealsModule({
  students,
  mealPlans,
  onUpdateStudents,
  onUpdateMealPlans,
  settings
}: MealsModuleProps) {
  const centerName = settings?.centerName || 'المركز';
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDay, setSelectedDay] = useState<MealPlanDay['day']>(() => DAY_BY_INDEX[new Date().getDay()] || 'Lundi');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [schoolYear, setSchoolYear] = useState(getCurrentAcademicYear());
  const [customYears, setCustomYears] = useState<string[]>(DEFAULT_ACADEMIC_YEARS);
  const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');
  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState<Student | null>(null);
  const [paymentMonth, setPaymentMonth] = useState<AcademicMonth>('Septembre');
  const [amountPaid, setAmountPaid] = useState(0);
  const [totalRequired, setTotalRequired] = useState(0);
  const [paymentType, setPaymentType] = useState<'full' | 'advance' | 'balance'>('full');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Espèces' | 'Chèque'>('Espèces');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
  const [isAddDishOpen, setIsAddDishOpen] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState<{ student: Student; payment: PaymentRecord } | null>(null);
  // Payment grid collapsed (default: open)
  const [payGridCollapsed, setPayGridCollapsed] = useState(false);
  
  // Menu form
  const [dishName, setDishName] = useState('');
  const [description, setDescription] = useState('');
  
  // Enrollment state
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [consumptionPage, setConsumptionPage] = useState<number>(1);
  const [dailyPage, setDailyPage] = useState<number>(1);
  const pageSize = 20;
  
  // Cancellation / Refund modal
  const [refundingStudent, setRefundingStudent] = useState<Student | null>(null);
  const [refundMonths, setRefundMonths] = useState<Record<string, boolean>>({});
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundAmounts, setRefundAmounts] = useState<Record<string, number>>({});

  // Add one-time (unit) meal student modal
  const [isAddUnitMealModalOpen, setIsAddUnitMealModalOpen] = useState(false);
  const [unitMealSearch, setUnitMealSearch] = useState('');

  // Removal from daily meal list confirmation
  const [removeAttendanceStudent, setRemoveAttendanceStudent] = useState<Student | null>(null);

  // Consumption tracking month filter ('all' = every active subscriber). Default = current academic month (Septembre if outside the calendar, e.g. August testing)
  const [consumptionMonth, setConsumptionMonth] = useState<string>(() => {
    const idx = getCurrentAcademicIndex();
    return idx >= 0 ? ACADEMIC_MONTHS[idx] : 'Septembre';
  });

  // Clear all meals data confirmation
  const [clearMealsConfirm, setClearMealsConfirm] = useState(false);

  // Active day plan
  const activePlan = mealPlans.find(p => p.day === selectedDay) || {
    id: 'meal_' + selectedDay,
    day: selectedDay,
    date: new Date().toISOString().split('T')[0],
    dishName: 'أكلة اليوم غير محددة بعد',
    description: '',
    attendees: []
  };

  const selectedDateDay = DAY_BY_INDEX[new Date(`${selectedDate}T12:00:00`).getDay()];
  const selectedDateLabel = new Intl.DateTimeFormat('ar-TN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${selectedDate}T12:00:00`));
  const yearStudents = students.filter(s => {
    const text = `${s.firstName} ${s.lastName} ${s.grade}`.toLowerCase();
    return (s.academicYear || getCurrentAcademicYear()) === schoolYear && text.includes(searchTerm.toLowerCase());
  });
  const subscribedStudents = yearStudents.filter(s => s.mealSubscription?.mode === 'subscription' && s.mealSubscription?.active);
  const getMealStatus = (st: Student, month: AcademicMonth) => {
    const total = settings ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas : (st.mealSubscription?.monthlyPrice || 150);
    const payments = (st.payments || []).filter(p => p.service === 'Repas' && p.month === `${month} (${schoolYear})`);
    const paidAmount = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    return { status: paidAmount >= total ? 'paid' as const : paidAmount > 0 ? 'advance' as const : 'unpaid' as const, paidAmount, remaining: Math.max(0, total - paidAmount), total };
  };
  const getAttendance = (st: Student) => (st.mealAttendances || []).find(a => a.date === selectedDate);

  const getConsumedInMonth = (st: Student, month: AcademicMonth): number => {
    const [startYear, endYear] = schoolYear.split('/');
    const mNum: Record<AcademicMonth, number> = { 'Septembre': 9, 'Octobre': 10, 'Novembre': 11, 'Décembre': 12, 'Janvier': 1, 'Février': 2, 'Mars': 3, 'Avril': 4, 'Mai': 5 };
    const num = mNum[month] ?? 9;
    const year = num >= 9 ? startYear : endYear;
    const prefix = `${year}-${String(num).padStart(2, '0')}`;
    return (st.mealAttendances || []).filter(a => a.type === 'subscription' && a.date.startsWith(prefix)).length;
  };
  const consumptionStudents = consumptionMonth === 'all'
    ? subscribedStudents
    : subscribedStudents.filter(st => getMealStatus(st, consumptionMonth as AcademicMonth).paidAmount > 0);
  const consumptionTotalPages = Math.ceil(consumptionStudents.length / pageSize) || 1;
  const consumptionCurrentPage = Math.min(Math.max(1, consumptionPage), consumptionTotalPages);
  const paginatedConsumption = consumptionStudents.slice((consumptionCurrentPage - 1) * pageSize, consumptionCurrentPage * pageSize);

  // Total repas consumed in a given academic month (subscription + unit meals),
  // counting every student who took a repas that month (subscribed or daily).
  const getMonthConsumedTotal = (month: AcademicMonth): number => {
    const [startYear, endYear] = schoolYear.split('/');
    const mNum: Record<AcademicMonth, number> = { 'Septembre': 9, 'Octobre': 10, 'Novembre': 11, 'Décembre': 12, 'Janvier': 1, 'Février': 2, 'Mars': 3, 'Avril': 4, 'Mai': 5 };
    const num = mNum[month] ?? 9;
    const year = num >= 9 ? startYear : endYear;
    const prefix = `${year}-${String(num).padStart(2, '0')}`;
    return yearStudents.reduce((sum, st) => sum + (st.mealAttendances || []).filter(a => a.date.startsWith(prefix)).length, 0);
  };
  const monthConsumedSummary = ACADEMIC_MONTHS.map(m => ({ month: m, count: getMonthConsumedTotal(m) }));
  const totalMealsConsumed = monthConsumedSummary.reduce((s, x) => s + x.count, 0);

  const handleAddCustomYear = (e: React.FormEvent) => {
    e.preventDefault();
    const year = newYearInput.trim();
    if (!year) return;
    if (!customYears.includes(year)) setCustomYears([...customYears, year]);
    setSchoolYear(year);
    setNewYearInput('');
    setIsAddYearModalOpen(false);
  };

  const handleOpenEditMenu = () => {
    setDishName(activePlan.dishName);
    setDescription(activePlan.description);
    setIsEditMenuOpen(true);
  };

  const handleSaveMenu = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedPlan: MealPlanDay = {
      ...activePlan,
      dishName: dishName.trim(),
      description: description.trim()
    };

    const exists = mealPlans.some(p => p.day === selectedDay);
    if (exists) {
      onUpdateMealPlans(mealPlans.map(p => p.day === selectedDay ? updatedPlan : p));
      toast.success(`تم تحديث قائمة وجبات يوم ${ARABIC_WEEKDAYS[selectedDay]} بنجاح!`);
    } else {
      onUpdateMealPlans([...mealPlans, updatedPlan]);
      toast.success(`تم تسجيل قائمة وجبات يوم ${ARABIC_WEEKDAYS[selectedDay]} بنجاح!`);
    }

    setIsEditMenuOpen(false);
  };

  // Mark consumption for subscribed student
  const handleMarkConsumption = (st: Student) => {
    if (!st.mealSubscription) return;
    if (getAttendance(st)) {
      toast.info('وجبة هذا التلميذ مسجلة لهذا التاريخ مسبقاً.');
      return;
    }

    const currentConsumed = st.mealSubscription.consumedMealsCount || 0;
    const updatedStudent: Student = {
      ...st,
      mealSubscription: {
        ...st.mealSubscription,
        consumedMealsCount: currentConsumed + 1
      },
      mealAttendances: [...(st.mealAttendances || []), { date: selectedDate, type: 'subscription', paid: true }]
    };

    onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
  };

  // Add one-time unit student for today's dish
  const handleAddOneTimeMealStudent = (stId: string) => {
    const stObj = students.find(s => s.id === stId);
    if (!stObj) return;

    if (getAttendance(stObj)) {
      toast.info('هذا التلميذ مسجل بالفعل في قائمة وجبات هذا التاريخ.');
      return;
    }
    const updatedStudent: Student = {
      ...stObj,
      mealAttendances: [...(stObj.mealAttendances || []), { date: selectedDate, type: 'unit', paid: false }]
    };
    onUpdateStudents(students.map(s => s.id === stId ? updatedStudent : s));
    toast.success('تمت إضافة التلميذ إلى قائمة وجبات اليوم — سجّل الدفع عند الاستلام.');
  };

  const handlePayUnitMeal = (st: Student) => {
    const attendance = getAttendance(st);
    if (!attendance || attendance.type !== 'unit' || attendance.paid) return;
    const unitPrice = settings ? getFeesForYear(settings, schoolYear).fraisParRepas : (st.mealSubscription?.unitPrice || 8);
    const updatedStudent: Student = {
      ...st,
      mealAttendances: (st.mealAttendances || []).map(a => a.date === selectedDate ? { ...a, paid: true, paidAt: new Date().toISOString() } : a),
      payments: [...(st.payments || []), {
        id: `pay_meal_unit_${crypto.randomUUID()}`,
        date: selectedDate,
        amountPaid: unitPrice,
        totalRequired: unitPrice,
        remainingBalance: 0,
        service: 'Repas',
        month: `Repas unitaire (${selectedDate})`,
        paymentType: 'full',
        method: 'Espèces',
        receiptNumber: generateReceiptNumber(students, 'REC-REP-'),
        notes: `وجبة اليوم: ${activePlan.dishName}`
      }]
    };
    onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
    toast.success(`تم تسجيل دفع وجبة اليوم (${unitPrice} د.ت).`);
  };

  // Remove a student from today's meal list (refunds paid unit meal or restores meal credit)
  const handleRemoveAttendance = (st: Student) => {
    const attendance = getAttendance(st);
    if (!attendance) return;

    const newAttendances = (st.mealAttendances || []).filter(a => a.date !== selectedDate);

    let updatedStudent: Student = { ...st, mealAttendances: newAttendances };

    if (attendance.type === 'unit' && attendance.paid) {
      const refundedAmount = settings
        ? getFeesForYear(settings, schoolYear).fraisParRepas
        : (st.mealSubscription?.unitPrice || 8);
      updatedStudent = {
        ...updatedStudent,
        payments: [...(st.payments || []), {
          id: `ref_meal_unit_${crypto.randomUUID()}`,
          date: new Date().toISOString().split('T')[0],
          amountPaid: -refundedAmount,
          totalRequired: refundedAmount,
          remainingBalance: 0,
          service: 'Repas',
          month: `Repas unitaire (${selectedDate})`,
          paymentType: 'balance',
          method: 'Espèces',
          receiptNumber: generateReceiptNumber(students, 'REM-REP-'),
          notes: `استرجاع ثمن وجبة ${activePlan.dishName} - ${selectedDate}`,
          refund: true
        }]
      };
    } else if (attendance.type === 'subscription' && st.mealSubscription) {
      updatedStudent = {
        ...updatedStudent,
        mealSubscription: {
          ...st.mealSubscription,
          consumedMealsCount: Math.max(0, (st.mealSubscription.consumedMealsCount || 0) - 1)
        }
      };
    }

    onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
    setRemoveAttendanceStudent(null);
    toast.success(attendance.type === 'unit' && attendance.paid
      ? 'تم إزالة التلميذ واسترجاع ثمن الوجبة المنفردة.'
      : 'تمت إزالة التلميذ من قائمة وجبات هذا التاريخ.');
  };

  const handlePayMonthlySubscription = (st: Student, month: AcademicMonth) => {
    const status = getMealStatus(st, month);
    if (status.status === 'paid') return;
    handleOpenMonthlyPayment(st, month);
  };

  const handleOpenMonthlyPayment = (st: Student, month: AcademicMonth) => {
    const status = getMealStatus(st, month);
    if (status.status === 'paid') return;
    const fullFee = status.total;
    setSelectedStudentForPayment(st);
    setPaymentMonth(month);
    setTotalRequired(fullFee);
    setAmountPaid(status.status === 'advance' ? status.remaining : fullFee);
    setPaymentType(status.status === 'advance' ? 'balance' : 'full');
    setPaymentMethod('Espèces');
    setChequeNumber('');
    setChequeDate(new Date().toISOString().split('T')[0]);
    setNotes(status.status === 'advance'
      ? `تكملة خلاص اشتراك المطعم لشهر ${month} (${schoolYear})`
      : `خلاص اشتراك المطعم لشهر ${month} (${schoolYear})`);
  };

  const handleEnrollStudent = (st: Student) => {
    const monthlyPrice = settings ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas : 150;
    const unitPrice = settings ? getFeesForYear(settings, schoolYear).fraisParRepas : 8;
    const updatedStudent: Student = {
      ...st,
      enrolledServices: {
        ...(st.enrolledServices || { etude: true, suivi: true, library: false, meals: false }),
        meals: true
      },
      mealSubscription: {
        mode: 'subscription' as const,
        active: true,
        monthlyPrice,
        unitPrice,
        prepaidMeals: Math.floor(monthlyPrice / unitPrice) || 18,
        consumedMealsCount: 0
      }
    };
    onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
    setIsEnrollModalOpen(false);
    toast.success(`تم إلحاق التلميذ (${st.firstName} ${st.lastName}) بالمطعم بنجاح!`);
  };

  // Remove all students from Repas: clear payments, subscriptions and attendances
  const handleClearMealsData = () => {
    const updated = students.map(st => ({
      ...st,
      enrolledServices: { ...st.enrolledServices, meals: false },
      mealSubscription: {
        mode: 'unit' as const,
        monthlyPrice: 150,
        unitPrice: 8,
        prepaidMeals: 0,
        consumedMealsCount: 0,
        active: false
      },
      mealAttendances: [],
      payments: (st.payments || []).filter(p => p.service !== 'Repas')
    }));
    onUpdateStudents(updated);
    setClearMealsConfirm(false);
    toast.success('تم مسح كل بيانات المطعم السابقة من جميع التلاميذ.');
  };

  // Students with any MONTHLY meal activity — shown in the payments grid even after cancelling the subscription.
  // Unit meals (وجبة منفردة) for a single day do NOT add the student to this monthly grid.
  const hasMealActivity = (st: Student) =>
    st.enrolledServices?.meals === true ||
    st.mealSubscription?.active === true ||
    (st.payments || []).some(p => p.service === 'Repas' && !p.month.includes('Repas unitaire'));

  const enrolledStudents = students.filter(st => {
    const studentYear = st.academicYear || getCurrentAcademicYear();
    const matchesYear = schoolYear === 'all' || studentYear === schoolYear;
    const name = `${st.firstName} ${st.lastName} ${st.grade}`.toLowerCase();
    return hasMealActivity(st) && matchesYear && name.includes(searchTerm.toLowerCase());
  });
  const enrolledTotalPages = Math.ceil(enrolledStudents.length / pageSize) || 1;
  const enrolledCurrentPage = Math.min(Math.max(1, currentPage), enrolledTotalPages);
  const paginatedEnrolled = enrolledStudents.slice((enrolledCurrentPage - 1) * pageSize, enrolledCurrentPage * pageSize);

  // Filter students NOT enrolled in meals
  const nonEnrolledStudents = students.filter(st => {
    const isNotEnrolled = st.enrolledServices?.meals === false;
    const studentYear = st.academicYear || getCurrentAcademicYear();
    const matchesYear = schoolYear === 'all' || studentYear === schoolYear;
    return isNotEnrolled && matchesYear;
  });

  const handleSubmitMonthlyPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForPayment || isSubmitting) return;
    setIsSubmitting(true);

    if (paymentMethod === 'Chèque' && (!chequeNumber.trim() || !chequeDate)) {
      toast.error('عذراً، يجب إدخال رقم الشيك وتاريخ الدفع عند الدفع بالشيك!');
      setIsSubmitting(false);
      return;
    }

    const status = selectedStudentForPayment.payments
      ?.filter(p => p.service === 'Repas' && p.month === `${paymentMonth} (${schoolYear})`)
      ?.reduce((acc, p) => acc + p.amountPaid, 0) || 0;
    const paid = Math.max(0, Number(amountPaid) || 0);
    const maxPayable = Math.max(0, Number(totalRequired) - status);
    if (paid > maxPayable) {
      toast.error(`عذراً، المبلغ المدفوع (${paid} د.ت) أكبر من باقي اشتراك الشهر (${maxPayable} د.ت)!`);
      setIsSubmitting(false);
      return;
    }
    const paidAfterThis = status + paid;
    const remainingAfterThis = Math.max(0, Number(totalRequired) - paidAfterThis);
    const newPayment: PaymentRecord = {
      id: `pay_meal_${crypto.randomUUID()}`,
      date: new Date().toISOString().split('T')[0],
      amountPaid: paid,
      totalRequired: Number(totalRequired),
      remainingBalance: remainingAfterThis,
      service: 'Repas',
      month: `${paymentMonth} (${schoolYear})`,
      paymentType: paidAfterThis >= Number(totalRequired) ? (paymentType === 'balance' ? 'balance' : 'full') : 'advance',
      method: paymentMethod,
      chequeNumber: paymentMethod === 'Chèque' ? chequeNumber : undefined,
      chequeDate: paymentMethod === 'Chèque' ? chequeDate : undefined,
      receiptNumber: generateReceiptNumber(students, 'REC-MEAL-'),
      notes: notes || `خلاص اشتراك المطعم لشهر ${paymentMonth} (${schoolYear})`
    };
    const updatedStudent: Student = {
      ...selectedStudentForPayment,
      mealSubscription: selectedStudentForPayment.mealSubscription
        ? { ...selectedStudentForPayment.mealSubscription, mode: 'subscription' as const, active: true }
        : selectedStudentForPayment.mealSubscription,
      payments: [...(selectedStudentForPayment.payments || []), newPayment]
    };
    onUpdateStudents(students.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    setSelectedStudentForPayment(null);
    setPrintingReceipt({ student: updatedStudent, payment: newPayment });
    toast.success(`تم تسجيل خلاص اشتراك المطعم (${paid} د.ت) وتفعيل الاشتراك.`);
    setIsSubmitting(false);
  };

  // Open refund modal for future paid months in Meals (Library-style)
  const handleOpenRefund = (st: Student) => {
    setRefundingStudent(st);
    const currentIdx = getCurrentAcademicIndex();
    const refundable: Record<string, boolean> = {};
    ACADEMIC_MONTHS.forEach(m => {
      const ms = getMealStatus(st, m);
      if (ms.paidAmount > 0 && ACADEMIC_INDEX[m] > currentIdx) {
        const alreadyRefunded = (st.payments || []).some(
          p => p.refund && p.service === 'Repas' && p.month === `${m} (${schoolYear})`
        );
        if (!alreadyRefunded) refundable[m] = true;
      }
    });
    setRefundMonths(refundable);
    setRefundAmounts({});
    setIsRefundModalOpen(true);
  };

  // Execute meals refund for selected future paid months + deactivate subscription
  const handleConfirmRefund = () => {
    if (!refundingStudent) return;
    const currentIdx = getCurrentAcademicIndex();
    const refundRecords: PaymentRecord[] = [];
    let totalRefund = 0;

    ACADEMIC_MONTHS.forEach(m => {
      if (!refundMonths[m]) return;
      const ms = getMealStatus(refundingStudent, m);
      if (ms.paidAmount <= 0 || ACADEMIC_INDEX[m] <= currentIdx) return;
      const alreadyRefunded = (refundingStudent.payments || []).some(
        p => p.refund && p.service === 'Repas' && p.month === `${m} (${schoolYear})`
      );
      if (alreadyRefunded) {
        toast.warning(`شهر ${monthToArabic(m)} تمت استرجاعه مسبقاً — تم تخطيه.`);
        return;
      }
      const unitPrice = settings
        ? getFeesForYear(settings, schoolYear).fraisParRepas
        : (refundingStudent.mealSubscription?.unitPrice || 8);
      const subFee = settings
        ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas
        : (refundingStudent.mealSubscription?.monthlyPrice || 150);
      const prepaid = Math.floor(subFee / unitPrice) || 18;
      const consumedThisMonth = getConsumedInMonth(refundingStudent, m);
      const remainingMeals = Math.max(0, prepaid - consumedThisMonth);
      const defaultRefund = remainingMeals * unitPrice;
      const refundAmount = Math.min(refundAmounts[m] !== undefined ? refundAmounts[m] : defaultRefund, defaultRefund);
      totalRefund += refundAmount;
      refundRecords.push({
        id: 'ref_meal_' + crypto.randomUUID() + '_' + m,
        date: new Date().toISOString().split('T')[0],
        amountPaid: -refundAmount,
        totalRequired: refundAmount,
        remainingBalance: 0,
        service: 'Repas',
        month: `${m} (${schoolYear})`,
        paymentType: 'balance',
        method: 'Espèces',
        receiptNumber: generateReceiptNumber(students, 'REM-REP-'),
        notes: `استرجاع (Remboursement) ثمن ${remainingMeals} وجبة متبقية لشهر ${monthToArabic(m)} (${ms.paidAmount} د.ت مسددة - ${consumedThisMonth} مستهلكة × ${unitPrice} د.ت) - ${schoolYear}`,
        refund: true
      });
    });

    const updatedStudent: Student = {
      ...refundingStudent,
      mealSubscription: refundingStudent.mealSubscription
        ? { ...refundingStudent.mealSubscription, active: false }
        : refundingStudent.mealSubscription,
      payments: [...(refundingStudent.payments || []), ...refundRecords]
    };

    onUpdateStudents(students.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    setIsRefundModalOpen(false);
    setRefundingStudent(null);
    setRefundAmounts({});
    toast.success(refundRecords.length > 0
      ? `أُلغي الاشتراك واستُرجِع ${totalRefund} د.ت مقابل ${refundRecords.length} شهر (سُجّل في الميزانية)!`
      : `أُلغي اشتراك المطعم للتلميذ(ة) ${updatedStudent.firstName} ${updatedStudent.lastName}.`);
  };

  return (
    <div className="space-y-6">
      
      {/* Module Banner */}
      <div className="bg-white border border-[#E0EFF1] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-[#F2F8F9] text-[#14464E] text-xs font-bold rounded-lg border border-[#C3E0E4]/60">
              المطعم المدرسي (الوجبات)
            </span>
            <span className="text-xs text-slate-400 font-bold">اشتراك المطعم والتغذية بالسنتر</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <Utensils className="h-6 w-6 text-[#257C86]" />
            اشتراكات ومدفوعات المطعم
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            متابعة اشتراكات التلاميذ الشهرية وتأكيد الوصولات الرسمية.
          </p>
        </div>
        
        {nonEnrolledStudents.length > 0 && (
          <button
            onClick={() => { setIsEnrollModalOpen(true); setEnrollSearch(''); }}
            className="px-4 py-3 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-2xl shadow-md cursor-pointer flex items-center gap-2 shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            إلحاق تلميذ بالمطعم
          </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row gap-3 items-center justify-between no-print">
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
          <input 
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            placeholder="بحث باسم التلميذ أو المستوى..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-black text-slate-700">السنة الدراسية :</label>
          <select
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
          >
            {customYears.map(y => (
              <option key={y} value={y}>السنة الدراسية {y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* MEALS ACADEMIC MONTH GRID TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs no-print">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <button
            type="button"
            onClick={() => setPayGridCollapsed(c => !c)}
            className="flex items-center gap-2 flex-row-reverse text-right hover:text-[#257C86] cursor-pointer"
          >
            <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${payGridCollapsed ? '' : 'rotate-180'}`} />
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">شبكة مدفوعات المطعم ({schoolYear})</h3>
              <p className="text-xs text-slate-500">اضغط على أي شهر لتنزيل دفعة اشتراك أو طباعة الوصل.</p>
            </div>
          </button>
          
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
            <button
              onClick={() => setClearMealsConfirm(true)}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-black flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              مسح كل بيانات المطعم
            </button>
          </div>
        </div>
        
        {!payGridCollapsed && (<>
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1100px] text-right text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">التلميذ</th>
                {ACADEMIC_MONTHS.map(m => (
                  <th key={m} className="p-3 text-center">
                    {ARABIC_ACADEMIC_MONTHS[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrolledStudents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                    لا يوجد تلاميذ في هذه القائمة
                  </td>
                </tr>
              ) : (
                paginatedEnrolled.map(st => {
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4 font-extrabold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{st.firstName} {st.lastName}</span>
                        </div>
                      </td>
                      
                      {/* Academic months cells */}
                      {ACADEMIC_MONTHS.map(m => {
                        const mStatus = getMealStatus(st, m);
                        const hasRefund = (st.payments || []).some(p => p.service === 'Repas' && p.refund && p.month === `${m} (${schoolYear})`);
                        return (
                          <td key={m} className="p-3 text-center">
                            {hasRefund ? (
                              <div className="w-full py-1.5 px-2 bg-slate-100 text-slate-500 border border-slate-300 rounded-xl font-black text-[10px] flex items-center justify-center gap-1" title="تم استرجاع مبلغ هذا الشهر">
                                <Undo2 className="h-3 w-3" />
                                مسترجع
                              </div>
                            ) : mStatus.status === 'paid' && (
                              <button
                                onClick={() => {
                                  const payment = (st.payments || []).find(p => p.service === 'Repas' && p.month === `${m} (${schoolYear})`);
                                  if (payment) setPrintingReceipt({ student: st, payment });
                                  else handlePayMonthlySubscription(st, m);
                                }}
                                className="w-full py-1.5 px-2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-black text-[10px] flex items-center justify-center gap-1 hover:bg-emerald-200 transition cursor-pointer"
                                title="طباعة الوصل"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Payé ({mStatus.paidAmount} د.ت) 🖨️
                              </button>
                            )}
                            
                            {!hasRefund && mStatus.status === 'advance' && (
                              <button
                                onClick={() => handleOpenMonthlyPayment(st, m)}
                                className="w-full py-1.5 px-2 bg-[#E0EFF1] text-[#103840] border border-[#A0CBCF] rounded-xl font-black text-[10px] flex items-center justify-center gap-1 hover:bg-[#C3E0E4] transition cursor-pointer"
                              >
                                <Clock className="h-3 w-3" />
                                Avance ({mStatus.paidAmount} د.ت)
                                <span className="block text-[9px] font-normal">باقي {mStatus.remaining}د.ت</span>
                              </button>
                            )}
                            
                            {!hasRefund && mStatus.status === 'unpaid' && (
                              <button
                                onClick={() => handlePayMonthlySubscription(st, m)}
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

        {enrolledStudents.length > pageSize && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-slate-100 bg-slate-50/50">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={enrolledCurrentPage <= 1} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">◀ السابق</button>
            <span className="text-[10px] font-bold text-slate-500 mx-2">صفحة {enrolledCurrentPage} من {enrolledTotalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(enrolledTotalPages, p + 1))} disabled={enrolledCurrentPage >= enrolledTotalPages} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">التالي ▶</button>
          </div>
        )}
        </>)}
      </div>

      {/* Enroll Student Modal */}
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
                  <h3 className="text-lg font-black">إلحاق تلميذ بمطعم السنتر</h3>
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
                  اختر تلميذاً من القائمة العامة لإلحاقه بالمطعم
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
                    جميع التلاميذ ملحقون حالياً بالمطعم!
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
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          إلحاق بالمطعم
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
                <span className="font-bold text-sm">وصل خلاص رسمي للمطعم</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#257C86] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Utensils className="h-4 w-4" />
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
                  (p.service === 'Repas') && p.month.includes(printingReceipt.payment.month)
                );
                const totalPaidForMonth = allMonthPayments.reduce((s, p) => s + p.amountPaid, 0);
                const totalMonthDiscount = allMonthPayments.reduce((s, p) => s + (p.discount || 0), 0);
                const fullFeeRequired = printingReceipt.payment.totalRequired || (!!printingReceipt.payment.month.includes('Annuel') ? 150 : 300);
                const finalRemaining = Math.max(0, fullFeeRequired - totalPaidForMonth);

                return (
                  <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col">
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-950">{centerName} — المطعم المدرسي (وصل مدفوعات)</h2>
                        <p className="text-[10px] text-slate-500 font-mono">رقم آخر وصل: {printingReceipt.payment.receiptNumber}</p>
                        <p className="text-[10px] text-slate-400">تاريخ آخر دفعة: {printingReceipt.payment.date}</p>
                      </div>
                      <div className="text-left font-mono font-bold text-xs bg-[#F2F8F9] p-2 rounded border border-[#A0CBCF]">
                        <p>الخدمة: <strong>المطعم</strong></p>
                        <p className="text-[11px] text-[#103840] mt-0.5">الشهر: {printingReceipt.payment.month}</p>
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
                          <span>سجل دفعات هذا الشهر بالمطعم:</span>
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
                          <span className="text-[10px] text-slate-600 block font-bold">الاشتراك المطلوب:</span>
                          <span className="text-base font-black text-slate-900 font-mono">{fullFeeRequired} د.ت</span>
                        </div>

                        <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-300">
                          <span className="text-[10px] text-emerald-800 block font-bold">المجموع المسدد حتى الآن:</span>
                          <span className="text-base font-black text-emerald-700 font-mono">{totalPaidForMonth} د.ت</span>
                        </div>

                        <div className={`p-2.5 rounded-xl border ${finalRemaining === 0 ? 'bg-slate-50 border-slate-200' : 'bg-[#F2F8F9] border-[#A0CBCF]'}`}>
                          <span className="text-[10px] text-[#103840] block font-bold">الرصيد المتبقي:</span>
                          <span className={`text-base font-black font-mono ${finalRemaining === 0 ? 'text-slate-400' : 'text-red-700'}`}>{finalRemaining} د.ت</span>
                        </div>
                      </div>

                      {totalMonthDiscount > 0 && (
                        <div className="p-2.5 bg-[#F2F8F9] rounded-xl border border-[#A0CBCF] flex justify-between items-center">
                          <span className="text-[10px] text-[#14464E] font-bold">إجمالي التخفيض:</span>
                          <span className="text-base font-black text-[#17555F] font-mono">-{totalMonthDiscount} د.ت</span>
                        </div>
                      )}

                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center font-bold">
                        {finalRemaining === 0 ? (
                          <span className="text-emerald-700 text-xs flex items-center justify-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            حالة الشهر: تم التسديد بالكامل
                          </span>
                        ) : (
                          <span className="text-[#14464E] text-xs">
                            حالة الاشتراك: خلاص جزئي — باقي: {finalRemaining} د.ت
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-slate-300">
                      <div className="flex justify-between items-center text-[10px] text-slate-500 mb-8">
                        <p>نشكركم على استخدام مطعم {centerName}.</p>
                        <p className="font-bold text-slate-900">ختم وإدارة مركز {centerName}</p>
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
      </AnimatePresence>

      {/* WEEKLY MEAL PLANNING TABS (Lundi -> Vendredi) */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 flex items-center gap-2 overflow-x-auto no-print">
        <span className="text-xs font-bold text-slate-500 px-3 shrink-0">برنامج وجبة اليوم:</span>
        {WEEKDAYS.map(day => (
          <button
            key={day}
            onClick={() => setSelectedDay(day)}
            className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition shrink-0 cursor-pointer ${
              selectedDay === day
                ? 'bg-[#257C86] text-white shadow-md shadow-[#257C86]/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {ARABIC_WEEKDAYS[day]}
          </button>
        ))}
      </div>

      {/* ACTIVE DAY DISH CARD */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div className="space-y-1">
          <span className="text-xs font-bold text-[#17555F]">طبق يوم {ARABIC_WEEKDAYS[selectedDay]}</span>
          <h3 className="text-2xl font-black text-slate-900">{activePlan.dishName}</h3>
          <p className="text-xs text-slate-500">{activePlan.description || 'بدون وصف إضافي'}</p>
        </div>

        <button
          onClick={handleOpenEditMenu}
          className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0"
        >
          <Edit3 className="h-4 w-4 text-[#3A93A0]" />
          تعديل طبق يوم {ARABIC_WEEKDAYS[selectedDay]}
        </button>
      </div>

      {/* SUBSCRIBED STUDENTS CONSUMPTION COUNTER & ACTIONS */}
      <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs no-print">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-slate-50/50">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">متابعة استهلاك المشتركين شهرياً</h3>
            <p className="text-xs text-slate-500">
              {consumptionMonth === 'all'
                ? `الاستهلاك الفعلي مقابل المسبق الدفع — ${subscribedStudents.length} مشترك(ة)`
                : `المسددون لشهر ${ARABIC_ACADEMIC_MONTHS[consumptionMonth as AcademicMonth]} — ${consumptionStudents.length} تلميذ(ة)`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={consumptionMonth}
              onChange={(e) => { setConsumptionMonth(e.target.value); setConsumptionPage(1); }}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
            >
              <option value="all">كل الأشهر (المشتركون حالياً)</option>
              {ACADEMIC_MONTHS.map(m => (
                <option key={m} value={m}>شهر {ARABIC_ACADEMIC_MONTHS[m]} ({m})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">التلميذ</th>
                <th className="p-4">نوع الاشتراك</th>
                <th className="p-4">{consumptionMonth === 'all' ? 'الوجبات المستهلكة (كل المدة)' : `المستهلكة في شهر ${ARABIC_ACADEMIC_MONTHS[consumptionMonth as AcademicMonth]}`}</th>
                <th className="p-4">الوجبات المستهلكة / المسبقة الدفع</th>
                <th className="p-4">الوجبات المتبقية</th>
                <th className="p-4 text-center">تأكيد وجبة اليوم</th>
                <th className="p-4 text-left">إلغاء الاشتراك والتعويض</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consumptionStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    {consumptionMonth === 'all'
                      ? 'لا يوجد تلاميذ مشتركون حالياً'
                      : `لا يوجد تلاميذ مسددون لشهر ${ARABIC_ACADEMIC_MONTHS[consumptionMonth as AcademicMonth]} (${consumptionMonth}).`}
                  </td>
                </tr>
              ) : paginatedConsumption.map(st => {
                const consumed = st.mealSubscription?.consumedMealsCount || 0;
                const consumedThisMonth = consumptionMonth === 'all' ? consumed : getConsumedInMonth(st, consumptionMonth as AcademicMonth);
                const subFee = settings
                  ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas
                  : (st.mealSubscription?.monthlyPrice || 150);
                const unitPrice = settings
                  ? getFeesForYear(settings, schoolYear).fraisParRepas
                  : (st.mealSubscription?.unitPrice || 8);
                // Prepaid meals derived from the monthly fee ÷ price per day (e.g. 150 ÷ 8 = 18 repas)
                const prepaid = Math.floor(subFee / unitPrice) || 18;
                const remaining = Math.max(0, prepaid - consumed);
                const monthStatus = consumptionMonth === 'all'
                  ? null
                  : getMealStatus(st, consumptionMonth as AcademicMonth);

                return (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4 font-black text-slate-900">{st.firstName} {st.lastName} </td>
                    <td className="p-4">
                      <span className={`inline-flex flex-col items-start gap-0.5 px-2.5 py-1 font-bold text-[10px] rounded-md border ${
                        st.mealSubscription?.active === false
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-[#F2F8F9] text-[#103840] border-[#C3E0E4]/60'
                      }`}>
                        <span>{st.mealSubscription?.active === false ? '❌ اشتراك ملغي (مسترجع)' : `اشتراك (${subFee} د.ت)`}</span>
                        {monthStatus && (
                          <span className={`text-[9px] font-black ${monthStatus.status === 'paid' ? 'text-emerald-700' : 'text-[#17555F]'}`}>
                            {monthStatus.status === 'paid' ? '✓ خلاص كامل' : `تسبقة (${monthStatus.paidAmount} د.ت)`}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-black text-[#17555F]">
                      {consumedThisMonth} وجبة
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-800">
                      {consumed} / {prepaid} وجبة
                    </td>
                    <td className="p-4 font-mono font-black text-emerald-700">
                      {remaining} وجبات متبقية
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleMarkConsumption(st)}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-[11px] shadow-xs cursor-pointer flex items-center justify-center gap-1 mx-auto"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        تسجيل الوجبة
                      </button>
                    </td>
                    <td className="p-4 text-left">
                      <button
                        onClick={() => handleOpenRefund(st)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold cursor-pointer flex items-center gap-1 mx-auto"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        إلغاء الاشتراك
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100/80 border-t-2 border-slate-200 font-black text-slate-900">
              <tr>
                <td className="p-4 text-center" colSpan={7}>
                  {consumptionMonth === 'all'
                    ? `الإجمالي — الوجبات المستهلكة: ${totalMealsConsumed} وجبة`
                    : `الإجمالي — الوجبات المستهلكة في شهر ${ARABIC_ACADEMIC_MONTHS[consumptionMonth as AcademicMonth]}: ${getMonthConsumedTotal(consumptionMonth as AcademicMonth)} وجبة`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {consumptionStudents.length > pageSize && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-slate-100 bg-slate-50/50">
            <button onClick={() => setConsumptionPage(p => Math.max(1, p - 1))} disabled={consumptionCurrentPage <= 1} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">◀ السابق</button>
            <span className="text-[10px] font-bold text-slate-500 mx-2">صفحة {consumptionCurrentPage} من {consumptionTotalPages}</span>
            <button onClick={() => setConsumptionPage(p => Math.min(consumptionTotalPages, p + 1))} disabled={consumptionCurrentPage >= consumptionTotalPages} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">التالي ▶</button>
          </div>
        )}
      </div>

      {/* DATED DAILY MEAL LIST */}
      <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs no-print">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h3 className="font-extrabold text-slate-900">قائمة وجبات {selectedDateLabel}</h3>
            <p className="text-xs text-slate-500 mt-1">التلاميذ الذين تسلموا وجبة في هذا التاريخ مع حالة دفع الوجبة المنفردة.</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <span className="hidden sm:inline">تاريخ الوجبة:</span>
              <DateField
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-slate-700 font-bold text-xs"
              />
            </label>

            {/* Quick add one-time meal student */}
            <button
              onClick={() => { setIsAddUnitMealModalOpen(true); setUnitMealSearch(''); }}
              className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <UserPlus className="h-4 w-4" />
              إضافة تلميذ وجبة منفردة ({settings ? getFeesForYear(settings, schoolYear).fraisParRepas : 8} د.ت)...
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-bold"><tr><th className="p-4">التلميذ</th><th className="p-4">نوع الوجبة</th><th className="p-4">حالة الدفع</th><th className="p-4">إجراء</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {yearStudents.filter(st => getAttendance(st)).map(st => {
                const attendance = getAttendance(st)!;
                return <tr key={st.id} className="hover:bg-slate-50/80"><td className="p-4 font-bold">{st.firstName} {st.lastName} ({st.grade})</td><td className="p-4">{attendance.type === 'subscription' ? 'اشتراك شهري' : 'وجبة منفردة'}</td><td className="p-4 font-bold">{attendance.paid ? 'مدفوع' : 'غير مدفوع'}</td><td className="p-4"><div className="flex items-center justify-end gap-2">{attendance.type === 'unit' && !attendance.paid && <button onClick={() => handlePayUnitMeal(st)} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold cursor-pointer">تسجيل الدفع</button>}<button onClick={() => setRemoveAttendanceStudent(st)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold cursor-pointer flex items-center gap-1" title={attendance.paid ? 'إزالة مع استرجاع الثمن' : 'إزالة من القائمة'}><Trash2 className="h-3.5 w-3.5" />إزالة</button></div></td></tr>;
              })}
              {yearStudents.filter(st => getAttendance(st)).length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">لا توجد وجبات مسجلة لهذا التاريخ.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW PAYMENT MODAL */}
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
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-[#3A93A0]" />
                    {`خلاص اشتراك المطعم — ${paymentMonth} (${schoolYear})`}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 font-bold">
                    التلميذ(ة): {selectedStudentForPayment.firstName} {selectedStudentForPayment.lastName} ({selectedStudentForPayment.grade})
                  </p>
                </div>

                <button 
                  onClick={() => setSelectedStudentForPayment(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitMonthlyPayment} className="p-6 space-y-4">
                {(() => {
                  const activeMonthStatus = selectedStudentForPayment
                    ? getMealStatus(selectedStudentForPayment, paymentMonth)
                    : null;
                  const isAdvanceStatus = activeMonthStatus?.status === 'advance';
                  const hasRefund = selectedStudentForPayment
                    ? (selectedStudentForPayment.payments || []).some(p => p.service === 'Repas' && p.refund && p.month === `${paymentMonth} (${schoolYear})`)
                    : false;
                  const standardFee = activeMonthStatus?.total || (settings ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas : 150);

                  return (
                    <>
                      {isAdvanceStatus && !hasRefund && activeMonthStatus && (
                        <div className="p-3.5 bg-[#F2F8F9] rounded-2xl border border-[#A0CBCF] text-xs space-y-1.5 font-bold text-[#0B252B]">
                          <div className="flex justify-between items-center">
                            <span>تسبقة مسددة لشهر {paymentMonth}:</span>
                            <span className="font-mono text-emerald-800 font-extrabold text-sm">{activeMonthStatus.paidAmount} د.ت</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-[#C3E0E4]/80 pt-1.5">
                            <span>المتبقي لاستكمال الشهر:</span>
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
                              const targetVal = isAdvanceStatus ? activeMonthStatus.remaining : standardFee;
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
                              : `خلاص كامل (${standardFee} د.ت)`}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentType('advance');
                              const defaultAdv = isAdvanceStatus 
                                ? Math.min(10, activeMonthStatus.remaining) 
                                : Math.round(standardFee / 2);
                              setAmountPaid(defaultAdv);
                              setTotalRequired(standardFee);
                            }}
                            className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                              paymentType === 'advance' 
                                ? 'bg-[#257C86] text-white border-[#257C86]' 
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            تسبقة / (Avance)
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
                            تكملة باقي
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

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-slate-600 block mb-1">
                            المبلغ المدفوع الآن (د.ت) * {isAdvanceStatus && `(أقصاه ${activeMonthStatus?.remaining} د.ت)`}
                          </label>
                           <input 
                            type="number" required min="0"
                            value={amountPaid} 
                            max={isAdvanceStatus ? activeMonthStatus?.remaining : undefined}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = Math.max(0, Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0);
                              if (isAdvanceStatus && activeMonthStatus && val > activeMonthStatus.remaining) {
                                 toast.warning(`المطلوب لاستكمال الشهر ${activeMonthStatus.remaining} د.ت فقط!`);
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
                            الاشتراك الشهري الإجمالي (د.ت)
                          </label>
                          <input 
                            type="number" required value={totalRequired} readOnly
                            className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Remaining calculation banner */}
                      <div className="p-3 bg-[#F2F8F9] rounded-2xl border border-[#C3E0E4] text-xs flex justify-between font-bold text-[#103840]">
                        <span>المتبقي بذمة التلميذ بعد هذه الدفعة:</span>
                        <span className="font-mono text-sm font-black text-red-700">
                          {isAdvanceStatus && activeMonthStatus 
                            ? Math.max(0, activeMonthStatus.remaining - amountPaid) 
                            : Math.max(0, totalRequired - amountPaid)} د.ت
                        </span>
                      </div>
                    </>
                  );
                })()}

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setSelectedStudentForPayment(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    تأكيد الدفع واستخرج الوصل
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT MENU MODAL */}
      <AnimatePresence>
        {isEditMenuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-[#3A93A0]" />
                  <h3 className="text-lg font-black">تحديد طبق يوم {ARABIC_WEEKDAYS[selectedDay]}</h3>
                </div>

                <button 
                  onClick={() => setIsEditMenuOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveMenu} className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">اسم طبق اليوم *</label>
                  <input 
                    type="text" required value={dishName} onChange={(e) => setDishName(e.target.value)}
                    placeholder="مثال: كسكسي تونسي بالخضار والدجاج"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">الوصف والمكونات الغذائية</label>
                  <textarea 
                    value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="تفاصيل التقديم والفواكه المصاحبة..."
                    className="w-full p-3 bg-slate-50 border rounded-xl text-xs font-semibold h-20"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsEditMenuOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer"
                  >
                    حفظ طبق اليوم
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD ONE-TIME (UNIT) MEAL STUDENT MODAL */}
      <AnimatePresence>
        {isAddUnitMealModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-emerald-400" />
                  <div>
                    <h3 className="text-lg font-black">إضافة تلميذ وجبة منفردة لليوم</h3>
                    <p className="text-xs text-slate-300 font-bold mt-0.5">
                      {selectedDateLabel} — الثمن: {settings ? getFeesForYear(settings, schoolYear).fraisParRepas : 8} د.ت
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsAddUnitMealModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500 font-medium">
                  التلاميذ الذين لا يملكون اشتراكاً شهرياً فعّالاً بالمطعم لهذه السنة الدراسية. تُحتسب الوجبة بالثمن الفردي فقط.
                </p>

                {(() => {
                  const candidates = yearStudents.filter(s =>
                    !(s.mealSubscription?.mode === 'subscription' && s.mealSubscription?.active) && !getAttendance(s)
                  ).filter(s => {
                    if (!unitMealSearch.trim()) return true;
                    const full = `${s.firstName} ${s.lastName} ${s.grade}`.toLowerCase();
                    return full.includes(unitMealSearch.toLowerCase());
                  });
                  return candidates.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
                      {yearStudents.filter(s => !(s.mealSubscription?.mode === 'subscription' && s.mealSubscription?.active) && !getAttendance(s)).length === 0
                        ? 'لا يوجد تلاميذ غير مشتركين متاحين لإضافتهم لهذا التاريخ.'
                        : 'لا توجد نتائج مطابقة لبحثك.'}
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                      {yearStudents.filter(s => !(s.mealSubscription?.mode === 'subscription' && s.mealSubscription?.active) && !getAttendance(s)).length > 0 && (
                        <div className="p-2 sticky top-0 bg-white border-b border-slate-100 z-10">
                          <div className="relative">
                            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              value={unitMealSearch}
                              onChange={(e) => setUnitMealSearch(e.target.value)}
                              placeholder="بحث باسم التلميذ..."
                              className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                            />
                          </div>
                        </div>
                      )}
                      {candidates.map(s => (
                        <div key={s.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-2">
                          <div>
                            <p className="font-extrabold text-xs text-slate-900">{s.firstName} {s.lastName}</p>
                            <p className="text-[10px] text-slate-400">{s.grade} — ولي الأمر: <span dir="ltr">{s.father?.phoneMobile || s.mother?.phoneMobile || 'لا يوجد'}</span></p>
                          </div>
                          <button
                            onClick={() => handleAddOneTimeMealStudent(s.id)}
                            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            أضف وجبة اليوم
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setIsAddUnitMealModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REFUND (Remboursement) MODAL - future paid months */}
      <AnimatePresence>
        {isRefundModalOpen && refundingStudent && (
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
                    <h3 className="text-lg font-black">استرجاع اشتراكات مطعم مستقبلية</h3>
                    <p className="text-xs text-slate-300">
                      التلميذ(ة): {refundingStudent.firstName} {refundingStudent.lastName} — عند الانسحاب
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsRefundModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-600 font-bold leading-relaxed bg-[#F2F8F9] border border-[#C3E0E4] rounded-2xl p-3">
                  في حالة انسحاب التلميذ من المطعم، يتم استرجاع قيمة الوجبات المتبقية (غير المستهلكة) للأشهر المستقبلية المدفوعة.
                  يُحتسب الاسترجاع على أساس: عدد الوجبات المتبقية × سعر الوجبة. يمكنك تعديل المبلغ يدوياً إذا لزم الأمر.
                  يقع إثبات العملية في الميزانية والمالية.
                </p>

                {Object.keys(refundMonths).length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
                    لا توجد اشتراكات أشهر مستقبلية مدفوعة لهذا التلميذ. يمكنك تأكيد إلغاء الاشتراك فقط دون أي استرجاع.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {Object.keys(refundMonths).map(m => {
                      const ms = getMealStatus(refundingStudent, m as AcademicMonth);
                      const unitPrice = settings
                        ? getFeesForYear(settings, schoolYear).fraisParRepas
                        : (refundingStudent.mealSubscription?.unitPrice || 8);
                      const subFee = settings
                        ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas
                        : (refundingStudent.mealSubscription?.monthlyPrice || 150);
                      const prepaid = Math.floor(subFee / unitPrice) || 18;
                      const consumedThisMonth = getConsumedInMonth(refundingStudent, m as AcademicMonth);
                      const remainingMeals = Math.max(0, prepaid - consumedThisMonth);
                      const defaultRefund = remainingMeals * unitPrice;
                      const refundAmount = refundAmounts[m] !== undefined ? refundAmounts[m] : defaultRefund;
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
                              <p className="text-[10px] text-slate-500">
                                الوجبات المتبقية: <span className="font-mono font-bold">{remainingMeals} من {prepaid} وجبات</span>
                              </p>
                            </div>
                          </div>
                            <div className="text-left space-y-1">
                            <span className="text-[10px] font-bold text-red-600">قابل للاسترجاع</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={defaultRefund}
                                value={refundAmounts[m] !== undefined ? refundAmounts[m] : ''}
                                placeholder={defaultRefund.toString()}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? undefined : Math.min(Number(e.target.value), defaultRefund);
                                  setRefundAmounts(prev => {
                                    const next = { ...prev };
                                    if (val === undefined || val < 0) { delete next[m]; } else { next[m] = val; }
                                    return next;
                                  });
                                }}
                                className="w-20 px-2 py-1 border border-red-200 rounded-lg text-xs font-mono font-bold text-red-700 text-center bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
                              />
                              <span className="text-[10px] font-bold text-red-500">د.ت</span>
                            </div>
                            {refundAmounts[m] !== undefined && refundAmounts[m] !== defaultRefund && (
                              <p className="text-[9px] text-slate-400">الافتراضي: {defaultRefund} د.ت</p>
                            )}
                          </div>
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
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Undo2 className="h-4 w-4" />
                    تأكيد الاسترجاع وتسجيله في الميزانية
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REMOVE FROM DAILY MEAL LIST CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={!!removeAttendanceStudent}
        title="إزالة من قائمة وجبات اليوم"
        message={
          removeAttendanceStudent ? (() => {
            const attendance = getAttendance(removeAttendanceStudent);
            const refundAmount = settings ? getFeesForYear(settings, schoolYear).fraisParRepas : 8;
            return (
              <>
                هل أنت متأكد من إزالة التلميذ(ة) <strong>{removeAttendanceStudent.firstName} {removeAttendanceStudent.lastName}</strong> من قائمة وجبات {selectedDateLabel}؟
                {attendance?.type === 'unit' && attendance.paid && (
                  <div className="mt-3 p-3 bg-red-50 rounded-2xl border border-red-200 text-xs font-bold text-red-700">
                    هذا التلميذ دفع ثمن الوجبة المنفردة ({refundAmount} د.ت). سيُسجّل الاسترجاع تلقائياً في الميزانية.
                  </div>
                )}
              </>
            );
          })() : undefined
        }
        confirmLabel="نعم، إزالة"
        onConfirm={() => {
          if (removeAttendanceStudent) handleRemoveAttendance(removeAttendanceStudent);
        }}
        onCancel={() => setRemoveAttendanceStudent(null)}
      />

      {/* CLEAR ALL MEALS DATA CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={clearMealsConfirm}
        title="مسح كل بيانات المطعم"
        message={
          <>
            هل أنت متأكد من مسح كل بيانات المطعم السابقة لجميع التلاميذ؟
            <div className="mt-3 p-3 bg-red-50 rounded-2xl border border-red-200 text-xs space-y-1 text-red-700 font-bold">
              <p>• مدفوعات المطعم لجميع الأشهر</p>
              <p>• الاشتراكات الشهرية والأشهر المدفوعة</p>
              <p>• الوجبات المسجلة (الاستهلاك)</p>
            </div>
            ستعود شبكة المدفوعات فارغة لإعادة إلحاق التلاميذ.
          </>
        }
        confirmLabel="نعم، مسح الكل"
        onConfirm={handleClearMealsData}
        onCancel={() => setClearMealsConfirm(false)}
      />

    </div>
  );
}
