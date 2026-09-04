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
  ChevronDown,
  Coffee,
  Cookie
} from 'lucide-react';
import { Student, MealPlanDay, CenterSettings, ACADEMIC_MONTHS, ARABIC_ACADEMIC_MONTHS, AcademicMonth, getFeesForYear, PaymentRecord, getCurrentAcademicIndex, monthToArabic, DEFAULT_ACADEMIC_YEARS, generateReceiptNumber, getCurrentAcademicYear, MealServiceType } from '../types';
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
  const [discount, setDiscount] = useState<number>(0);
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

  // Goûter subscriber & payment grid states
  const [gouterGridCollapsed, setGouterGridCollapsed] = useState(false);
  const [gouterPage, setGouterPage] = useState<number>(1);
  const [isEnrollGouterModalOpen, setIsEnrollGouterModalOpen] = useState(false);
  const [enrollGouterSearch, setEnrollGouterSearch] = useState('');
  const [enrollGouterType, setEnrollGouterType] = useState<'matin' | 'soir' | 'both'>('both');
  const [selectedStudentForGouterEnroll, setSelectedStudentForGouterEnroll] = useState<Student | null>(null);
  const [paymentService, setPaymentService] = useState<'Repas' | 'Goûter'>('Repas');
  
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

  // Consumption tracking month filter ('all' = every active subscriber). Default = current academic month; during off-season (Jun-Aug) default to 'all'
  const [consumptionMonth, setConsumptionMonth] = useState<string>(() => {
    const idx = getCurrentAcademicIndex();
    return idx >= 0 ? ACADEMIC_MONTHS[idx] : 'all';
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
  const subscribedStudents = yearStudents.filter(s =>
    s.enrolledServices?.meals === true &&
    s.mealSubscription?.active !== false
  );
  const getMealStatus = (st: Student, month: AcademicMonth) => {
    const total = settings ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas : (st.mealSubscription?.monthlyPrice || 150);
    const payments = (st.payments || []).filter(p => p.service === 'Repas' && p.month === `${month} (${schoolYear})`);
    const paidAmount = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    const discount = payments.reduce((max, p) => Math.max(max, p.discount || 0), 0);
    const effectiveRequired = Math.max(0, total - discount);
    return {
      status: paidAmount >= effectiveRequired && effectiveRequired > 0 ? ('paid' as const) : paidAmount > 0 ? ('advance' as const) : ('unpaid' as const),
      paidAmount,
      remaining: Math.max(0, effectiveRequired - paidAmount),
      total,
      discount,
      effectiveRequired
    };
  };
  // True only when a refund exists AND hasn't been re-paid (net ≤ 0)
  const hasUncoveredRefund = (st: Student, month: AcademicMonth) => {
    const payments = (st.payments || []).filter(p => p.service === 'Repas' && p.month === `${month} (${schoolYear})`);
    const hasRefundRecord = payments.some(p => p.refund);
    const net = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    return hasRefundRecord && net <= 0;
  };

  const getGouterStatus = (st: Student, month: AcademicMonth) => {
    const fees = settings ? getFeesForYear(settings, schoolYear) : null;
    const isBoth = st.enrolledServices?.gouterBoth || (!!st.enrolledServices?.gouterMatin && !!st.enrolledServices?.gouterSoir);
    const isMatin = st.enrolledServices?.gouterMatin;
    const isSoir = st.enrolledServices?.gouterSoir;

    let total = 0;
    let typeLabel = 'غير محدد';
    if (isBoth) {
      total = fees?.fraisDeuxGoutersMensuel || ((fees?.fraisGouterMatinMensuel || 0) + (fees?.fraisGouterSoirMensuel || 0));
      typeLabel = 'اللمجتان معاً';
    } else if (isMatin) {
      total = fees?.fraisGouterMatinMensuel || 0;
      typeLabel = 'لمجة الصباح';
    } else if (isSoir) {
      total = fees?.fraisGouterSoirMensuel || 0;
      typeLabel = 'لمجة المساء';
    }
    if (total === 0) total = 30;

    const payments = (st.payments || []).filter(p => p.service === 'Goûter' && p.month === `${month} (${schoolYear})`);
    const paidAmount = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    const discount = payments.reduce((max, p) => Math.max(max, p.discount || 0), 0);
    const effectiveRequired = Math.max(0, total - discount);
    return {
      status: paidAmount >= effectiveRequired && effectiveRequired > 0 ? ('paid' as const) : paidAmount > 0 ? ('advance' as const) : ('unpaid' as const),
      paidAmount,
      remaining: Math.max(0, effectiveRequired - paidAmount),
      total,
      discount,
      effectiveRequired,
      isBoth,
      isMatin,
      isSoir,
      typeLabel
    };
  };

  const hasGouterSubscription = (st: Student) => {
    return (
      st.enrolledServices?.gouterMatin === true ||
      st.enrolledServices?.gouterSoir === true ||
      st.enrolledServices?.gouterBoth === true ||
      (st.payments || []).some(p => p.service === 'Goûter' && !p.month.includes('unitaire'))
    );
  };
  const getServiceAttendance = (st: Student, service: MealServiceType = 'lunch') =>
    (st.mealAttendances || []).find(a => a.date === selectedDate && (a.service || 'lunch') === service);

  const getTodayAttendances = (st: Student) =>
    (st.mealAttendances || []).filter(a => a.date === selectedDate);

  const getAttendance = (st: Student) => (st.mealAttendances || []).find(a => a.date === selectedDate);

  const handleToggleMealService = (st: Student, service: MealServiceType) => {
    const existing = getServiceAttendance(st, service);
    const serviceLabel = service === 'lunch' ? 'الغداء' : service === 'gouter_matin' ? 'لمجة الصباح' : 'لمجة المساء';
    if (existing) {
      const newAttendances = (st.mealAttendances || []).filter(
        a => !(a.date === selectedDate && (a.service || 'lunch') === service)
      );
      let updatedStudent: Student = {
        ...st,
        mealAttendances: newAttendances,
        mealSubscription: (service === 'lunch' && existing.type === 'subscription' && st.mealSubscription)
          ? {
              ...st.mealSubscription,
              consumedMealsCount: Math.max(0, (st.mealSubscription.consumedMealsCount || 0) - 1)
            }
          : st.mealSubscription
      };
      if (existing.type === 'unit' && existing.paid) {
        const fees = settings ? getFeesForYear(settings, schoolYear) : null;
        const refundedAmount = service === 'lunch'
          ? (fees?.fraisParRepas ?? (st.mealSubscription?.unitPrice || 8))
          : service === 'gouter_matin'
            ? (fees?.fraisGouterMatinUnitaire ?? 0)
            : (fees?.fraisGouterSoirUnitaire ?? 0);
        if (refundedAmount > 0) {
          updatedStudent = {
            ...updatedStudent,
            payments: [...(st.payments || []), {
              id: `ref_meal_unit_${crypto.randomUUID()}`,
              date: new Date().toISOString().split('T')[0],
              amountPaid: -refundedAmount,
              totalRequired: refundedAmount,
              remainingBalance: 0,
              service: service === 'lunch' ? 'Repas' : 'Goûter',
              month: `${serviceLabel} unitaire (${selectedDate})`,
              paymentType: 'balance',
              method: 'Espèces',
              receiptNumber: generateReceiptNumber(students, 'REM-REP-'),
              notes: `استرجاع ثمن ${serviceLabel} - ${selectedDate}`,
              refund: true
            }]
          };
        }
      }
      onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
      toast.info(`تم إلغاء تسجيل ${serviceLabel} للتلميذ (${st.firstName} ${st.lastName}).`);
    } else {
      const dateMonth = new Date(`${selectedDate}T12:00:00`).getMonth();
      const monthMap: Record<number, AcademicMonth> = {
        8: 'Septembre', 9: 'Octobre', 10: 'Novembre', 11: 'Décembre',
        0: 'Janvier', 1: 'Février', 2: 'Mars', 3: 'Avril', 4: 'Mai'
      };
      const academicMonth = monthMap[dateMonth];
      const hasPaidLunch = academicMonth ? getMealStatus(st, academicMonth).status !== 'unpaid' : false;
      const hasRefund = academicMonth ? hasUncoveredRefund(st, academicMonth) : false;
      const isSubscribedSys = st.mealSubscription?.active === true;
      const isLunchSubscribed = service === 'lunch' && isSubscribedSys && !hasRefund;

      const isGouterMatinSubscribed = service === 'gouter_matin' && (st.enrolledServices?.gouterMatin === true || st.enrolledServices?.gouterBoth === true);
      const isGouterSoirSubscribed = service === 'gouter_apres_midi' && (st.enrolledServices?.gouterSoir === true || st.enrolledServices?.gouterBoth === true);
      const isSubscribedForService = service === 'lunch' ? isLunchSubscribed : (isGouterMatinSubscribed || isGouterSoirSubscribed);

      const hasPaidGouter = academicMonth ? getGouterStatus(st, academicMonth).status !== 'unpaid' : false;
      const mealType: 'subscription' | 'unit' = isSubscribedForService ? 'subscription' : 'unit';
      const hasPaid = service === 'lunch' ? hasPaidLunch : hasPaidGouter;

      // Option C: snapshot current traiteur price on lunch attendance so past records
      // are never retroactively changed when settings.prixPlatTraiteur changes later.
      const snapshotTraiteurPrice = (service === 'lunch' && settings)
        ? (getFeesForYear(settings, schoolYear).prixPlatTraiteur ?? 6)
        : undefined;

      const updatedStudent: Student = {
        ...st,
        mealSubscription: (service === 'lunch' && isLunchSubscribed && st.mealSubscription)
          ? {
              ...st.mealSubscription,
              consumedMealsCount: (st.mealSubscription.consumedMealsCount || 0) + 1
            }
          : st.mealSubscription,
        mealAttendances: [
          ...(st.mealAttendances || []),
          { date: selectedDate, service, type: mealType, paid: mealType === 'subscription' ? hasPaid : false, ...(snapshotTraiteurPrice != null ? { traiteurPrice: snapshotTraiteurPrice } : {}) }
        ]
      };
      onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
      toast.success(`تم تسجيل ${serviceLabel} للتلميذ (${st.firstName} ${st.lastName}).`);
    }
  };


  const handlePayUnitService = (st: Student, service: MealServiceType = 'lunch') => {
    const attendance = getServiceAttendance(st, service);
    if (!attendance || attendance.type !== 'unit' || attendance.paid) return;
    const fees = settings ? getFeesForYear(settings, schoolYear) : null;
    const unitPrice = service === 'lunch'
      ? (fees?.fraisParRepas ?? (st.mealSubscription?.unitPrice || 8))
      : service === 'gouter_matin'
        ? (fees?.fraisGouterMatinUnitaire ?? 0)
        : (fees?.fraisGouterSoirUnitaire ?? 0);
    const serviceLabel = service === 'lunch' ? 'الغداء' : service === 'gouter_matin' ? 'لمجة الصباح' : 'لمجة المساء';
    const updatedStudent: Student = {
      ...st,
      mealAttendances: (st.mealAttendances || []).map(a =>
        (a.date === selectedDate && (a.service || 'lunch') === service)
          ? { ...a, paid: true, paidAt: new Date().toISOString() }
          : a
      ),
      payments: [...(st.payments || []), {
        id: `pay_unit_${service}_${crypto.randomUUID()}`,
        date: selectedDate,
        amountPaid: unitPrice,
        totalRequired: unitPrice,
        remainingBalance: 0,
        service: service === 'lunch' ? 'Repas' : 'Goûter',
        month: `${serviceLabel} unitaire (${selectedDate})`,
        paymentType: 'full',
        method: 'Espèces',
        receiptNumber: generateReceiptNumber(students, service === 'lunch' ? 'REC-REP-' : 'REC-GOUT-'),
        notes: `${serviceLabel}: ${service === 'lunch' ? activePlan.dishName : 'استهلاك بالوحدة'}`
      }]
    };
    onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
    toast.success(`تم تسجيل خلاص ${serviceLabel} (${unitPrice} د.ت).`);
  };

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
    : subscribedStudents;
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
    if (!st.mealSubscription && st.enrolledServices?.meals !== true) return;
    if (getAttendance(st)) {
      toast.info('وجبة هذا التلميذ مسجلة لهذا التاريخ مسبقاً.');
      return;
    }

    // Determine academic month from selectedDate to check payment status
    const dateMonth = new Date(`${selectedDate}T12:00:00`).getMonth();
    const monthMap: Record<number, AcademicMonth> = {
      8: 'Septembre', 9: 'Octobre', 10: 'Novembre', 11: 'Décembre',
      0: 'Janvier', 1: 'Février', 2: 'Mars', 3: 'Avril', 4: 'Mai'
    };
    const academicMonth = monthMap[dateMonth];
    const hasPaid = academicMonth ? getMealStatus(st, academicMonth).status !== 'unpaid' : false;

    // If student has an uncovered refund for this month, treat meal as unit (pay per plate)
    const hasRefund = academicMonth ? hasUncoveredRefund(st, academicMonth) : false;
    const isSubscribedSys = st.mealSubscription?.active === true;

    const mealType = (!isSubscribedSys || hasRefund) ? 'unit' : 'subscription';

    const snapshotTraiteurPrice = ((settings?.mealOperatingMode || 'external_traiteur') === 'external_traiteur' && settings)
      ? (getFeesForYear(settings, schoolYear).prixPlatTraiteur ?? 6)
      : 0;

    const updatedStudent: Student = {
      ...st,
      mealSubscription: st.mealSubscription
        ? {
            ...st.mealSubscription,
            consumedMealsCount: (st.mealSubscription.consumedMealsCount || 0) + (mealType === 'subscription' ? 1 : 0)
          }
        : undefined,
      mealAttendances: [
        ...(st.mealAttendances || []),
        { date: selectedDate, service: 'lunch', type: mealType, paid: mealType === 'unit' ? false : hasPaid, traiteurPrice: snapshotTraiteurPrice }
      ]
    };

    onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
    if (hasRefund) {
      toast.info(`تم تسجيل وجبة كوجبة منفردة (مسترجع شهر ${academicMonth}) — يُدفع عند الاستلام.`);
    }
  };

  // Add one-time unit student for today's dish
  const handleAddOneTimeMealStudent = (stId: string) => {
    const stObj = students.find(s => s.id === stId);
    if (!stObj) return;

    if (getAttendance(stObj)) {
      toast.info('هذا التلميذ مسجل بالفعل في قائمة وجبات هذا التاريخ.');
      return;
    }

    const snapshotTraiteurPrice = ((settings?.mealOperatingMode || 'external_traiteur') === 'external_traiteur' && settings)
      ? (getFeesForYear(settings, schoolYear).prixPlatTraiteur ?? 6)
      : 0;

    const updatedStudent: Student = {
      ...stObj,
      mealAttendances: [
        ...(stObj.mealAttendances || []),
        { date: selectedDate, service: 'lunch', type: 'unit', paid: false, traiteurPrice: snapshotTraiteurPrice }
      ]
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
    const wasRefunded = (st.payments || []).some(
      p => p.service === 'Repas' && p.refund && p.month === `${month} (${schoolYear})`
    );
    setPaymentService('Repas');
    setSelectedStudentForPayment(st);
    setPaymentMonth(month);
    setTotalRequired(fullFee);
    const storedDiscount = status.discount || 0;
    setDiscount(storedDiscount);

    if (status.status === 'advance' && !wasRefunded) {
      setAmountPaid(status.remaining);
      setPaymentType('balance');
      setPaymentMethod('Espèces');
      setChequeNumber('');
      setChequeDate(new Date().toISOString().split('T')[0]);
      setNotes(`تكملة خلاص اشتراك المطعم لشهر ${month} (${schoolYear})`);
    } else {
      setAmountPaid(Math.max(0, fullFee - storedDiscount));
      setPaymentType('full');
      setPaymentMethod('Espèces');
      setChequeNumber('');
      setChequeDate(new Date().toISOString().split('T')[0]);
      setNotes(wasRefunded
        ? `خلاص اشتراك المطعم لشهر ${month} (${schoolYear}) بعد الاسترجاع`
        : `خلاص اشتراك المطعم لشهر ${month} (${schoolYear})`);
    }
  };

  const handleOpenMonthlyGouterPayment = (st: Student, month: AcademicMonth) => {
    const status = getGouterStatus(st, month);
    if (status.status === 'paid') return;
    const fullFee = status.total;
    setPaymentService('Goûter');
    setSelectedStudentForPayment(st);
    setPaymentMonth(month);
    setTotalRequired(fullFee);
    const storedDiscount = status.discount || 0;
    setDiscount(storedDiscount);

    if (status.status === 'advance') {
      setAmountPaid(status.remaining);
      setPaymentType('balance');
      setPaymentMethod('Espèces');
      setChequeNumber('');
      setChequeDate(new Date().toISOString().split('T')[0]);
      setNotes(`تكملة خلاص اشتراك اللمجة (${status.typeLabel}) لشهر ${month} (${schoolYear})`);
    } else {
      setAmountPaid(Math.max(0, fullFee - storedDiscount));
      setPaymentType('full');
      setPaymentMethod('Espèces');
      setChequeNumber('');
      setChequeDate(new Date().toISOString().split('T')[0]);
      setNotes(`خلاص اشتراك اللمجة (${status.typeLabel}) لشهر ${month} (${schoolYear})`);
    }
  };

  const handleEnrollStudentInGouter = (st: Student, type: 'matin' | 'soir' | 'both') => {
    const updatedStudent: Student = {
      ...st,
      enrolledServices: {
        ...(st.enrolledServices || { etude: true, suivi: true, library: false, meals: false }),
        gouterMatin: type === 'matin' || type === 'both',
        gouterSoir: type === 'soir' || type === 'both',
        gouterBoth: type === 'both'
      }
    };
    onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
    setIsEnrollGouterModalOpen(false);
    const typeLabel = type === 'both' ? 'اللمجتان معاً (صباح ومساء)' : type === 'matin' ? 'لمجة الصباح' : 'لمجة المساء';
    toast.success(`تم إلحاق التلميذ (${st.firstName} ${st.lastName}) بخدمة اللمجة: ${typeLabel}.`);
  };

  const handleUnenrollGouter = (st: Student) => {
    const updatedStudent: Student = {
      ...st,
      enrolledServices: {
        ...(st.enrolledServices || { etude: true, suivi: true, library: false, meals: false }),
        gouterMatin: false,
        gouterSoir: false,
        gouterBoth: false
      }
    };
    onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
    toast.info(`تم إلغاء اشتراك اللمجة للتلميذ (${st.firstName} ${st.lastName}).`);
  };

  const handleEnrollStudent = (st: Student) => {
    const monthlyPrice = settings ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas : 150;
    const unitPrice = settings ? getFeesForYear(settings, schoolYear).fraisParRepas : 8;
    // On re-enrollment, always start completely fresh.
    // Clear ALL subscription-based Repas payments (monthly + refund records).
    // Keep unit meal records (وجبة منفردة) — they are independent daily history.
    const clearedPayments = (st.payments || []).filter(
      p => !(p.service === 'Repas' && !p.month.includes('Repas unitaire'))
    );
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
      },
      payments: clearedPayments
    };
    onUpdateStudents(students.map(s => s.id === st.id ? updatedStudent : s));
    setIsEnrollModalOpen(false);
    toast.success(`تم إلحاق التلميذ (${st.firstName} ${st.lastName}) بالمطعم — يبدأ كمنخرط جديد بدون أي رصيد سابق.`);
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
  // A student whose repas service was FINISHED via refund of the actual month is excluded
  // (they move to the unit-meal list until they re-inscribe).
  const repasServiceFinished = (st: Student) =>
    st.mealSubscription?.active === false ||
    st.enrolledServices?.meals === false;

  const hasMealActivity = (st: Student) => {
    if (repasServiceFinished(st)) return false;
    return st.enrolledServices?.meals === true ||
      st.mealSubscription?.active === true ||
      (st.payments || []).some(p => p.service === 'Repas' && !p.month.includes('Repas unitaire'));
  };

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

  // Goûter subscribers list & counts
  const gouterStudents = students.filter(st => {
    const studentYear = st.academicYear || getCurrentAcademicYear();
    const matchesYear = schoolYear === 'all' || studentYear === schoolYear;
    const name = `${st.firstName} ${st.lastName} ${st.grade}`.toLowerCase();
    return hasGouterSubscription(st) && matchesYear && name.includes(searchTerm.toLowerCase());
  });
  const gouterTotalPages = Math.ceil(gouterStudents.length / pageSize) || 1;
  const gouterCurrentPage = Math.min(Math.max(1, gouterPage), gouterTotalPages);
  const paginatedGouter = gouterStudents.slice((gouterCurrentPage - 1) * pageSize, gouterCurrentPage * pageSize);

  const gouterMatinCount = gouterStudents.filter(st => st.enrolledServices?.gouterMatin && !st.enrolledServices?.gouterBoth && !st.enrolledServices?.gouterSoir).length;
  const gouterSoirCount = gouterStudents.filter(st => st.enrolledServices?.gouterSoir && !st.enrolledServices?.gouterBoth && !st.enrolledServices?.gouterMatin).length;
  const gouterBothCount = gouterStudents.filter(st => st.enrolledServices?.gouterBoth || (st.enrolledServices?.gouterMatin && st.enrolledServices?.gouterSoir)).length;

  const nonGouterStudents = students.filter(st => {
    const studentYear = st.academicYear || getCurrentAcademicYear();
    const matchesYear = schoolYear === 'all' || studentYear === schoolYear;
    const isEnrolledInGouter = st.enrolledServices?.gouterMatin || st.enrolledServices?.gouterSoir || st.enrolledServices?.gouterBoth;
    return !isEnrolledInGouter && matchesYear;
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

    const isGouter = paymentService === 'Goûter';
    const monthKey = `${paymentMonth} (${schoolYear})`;
    const currentService = isGouter ? 'Goûter' : 'Repas';
    // Compute the current net (including refund records) to know how much is still payable.
    const priorRefundAmount = isGouter ? 0 : Math.abs((selectedStudentForPayment.payments || [])
      .filter(p => p.service === 'Repas' && p.month === monthKey && p.refund)
      .reduce((a, b) => a + b.amountPaid, 0));
    const wasRefunded = priorRefundAmount > 0;

    const numDiscount = Math.max(0, Number(discount) || 0);
    const standardFee = Number(totalRequired) || (isGouter
      ? getGouterStatus(selectedStudentForPayment, paymentMonth).total
      : (settings ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas : 150));
    const effectiveRequired = Math.max(0, standardFee - numDiscount);

    const status = (selectedStudentForPayment.payments || [])
      ?.filter(p => p.service === currentService && p.month === monthKey && !p.refund)
      ?.reduce((acc, p) => acc + p.amountPaid, 0) || 0;
    const paid = Math.max(0, Number(amountPaid) || 0);
    const maxPayable = Math.max(0, effectiveRequired - status);
    if (paid > maxPayable && maxPayable > 0) {
      toast.error(`عذراً، المبلغ المدفوع (${paid} د.ت) أكبر من باقي اشتراك الشهر بعد التخفيض (${maxPayable} د.ت)!`);
      setIsSubmitting(false);
      return;
    }
    const paidAfterThis = status + paid;
    const remainingAfterThis = Math.max(0, effectiveRequired - paidAfterThis);
    const newPayment: PaymentRecord = {
      id: `pay_${isGouter ? 'gouter' : 'meal'}_${crypto.randomUUID()}`,
      date: new Date().toISOString().split('T')[0],
      amountPaid: paid,
      totalRequired: standardFee,
      remainingBalance: remainingAfterThis,
      service: currentService,
      month: monthKey,
      paymentType: paidAfterThis >= effectiveRequired ? (paymentType === 'balance' ? 'balance' : 'full') : 'advance',
      method: paymentMethod,
      chequeNumber: paymentMethod === 'Chèque' ? chequeNumber : undefined,
      chequeDate: paymentMethod === 'Chèque' ? chequeDate : undefined,
      receiptNumber: generateReceiptNumber(students, isGouter ? 'REC-GOUT-' : 'REC-MEAL-'),
      notes: notes || (numDiscount > 0
        ? `خلاص اشتراك ${isGouter ? 'اللمجة' : 'المطعم'} لشهر ${paymentMonth} (${schoolYear}) - تخفيض: ${numDiscount} د.ت`
        : `خلاص اشتراك ${isGouter ? 'اللمجة' : 'المطعم'} لشهر ${paymentMonth} (${schoolYear})`),
      discount: numDiscount > 0 ? numDiscount : undefined
    };
    // Update student
    const updatedStudent: Student = isGouter ? {
      ...selectedStudentForPayment,
      payments: [...(selectedStudentForPayment.payments || []), newPayment]
    } : {
      ...selectedStudentForPayment,
      enrolledServices: {
        suivi: selectedStudentForPayment.enrolledServices?.suivi ?? true,
        etude: selectedStudentForPayment.enrolledServices?.etude ?? true,
        library: selectedStudentForPayment.enrolledServices?.library ?? false,
        meals: true
      },
      mealSubscription: selectedStudentForPayment.mealSubscription
        ? { ...selectedStudentForPayment.mealSubscription, mode: 'subscription' as const, active: true }
        : selectedStudentForPayment.mealSubscription,
      payments: [...(selectedStudentForPayment.payments || []), newPayment]
    };
    onUpdateStudents(students.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    setSelectedStudentForPayment(null);
    setPrintingReceipt({ student: updatedStudent, payment: newPayment });
    toast.success(isGouter
      ? `تم تسجيل خلاص اشتراك اللمجة (${paid} د.ت) بنجاح.`
      : wasRefunded
        ? `تم تسجيل خلاص اشتراك المطعم (${paid} د.ت) وتفعيل الاشتراك وتغطية الاسترجاع السابق (${priorRefundAmount} د.ت).`
        : `تم تسجيل خلاص اشتراك المطعم (${paid} د.ت) وتفعيل الاشتراك.`);
    setIsSubmitting(false);
  };

  // Open refund modal for all paid (non-refunded or re-paid) months
  const handleOpenRefund = (st: Student) => {
    setRefundingStudent(st);
    const refundable: Record<string, boolean> = {};
    ACADEMIC_MONTHS.forEach(m => {
      const monthKey = `${m} (${schoolYear})`;
      const monthPayments = (st.payments || []).filter(
        p => p.service === 'Repas' && p.month === monthKey
      );
      const ms = getMealStatus(st, m);
      const latestPayment = monthPayments.length > 0 ? monthPayments[monthPayments.length - 1] : null;

      // A month is refundable if the student currently has money paid (ms.paidAmount > 0)
      // and the latest transaction is not an uncovered refund with 0 balance.
      if (ms.paidAmount > 0 && latestPayment?.refund !== true) {
        refundable[m] = true;
      }
    });
    setRefundMonths(refundable);
    setRefundAmounts({});
    setIsRefundModalOpen(true);
  };

  // Execute meals refund for selected paid months.
  // Refunding the CURRENT actual month removes the student from the repas service;
  // refunding only UPCOMING months keeps the service active.
  const handleConfirmRefund = () => {
    if (!refundingStudent) return;
    const refundRecords: PaymentRecord[] = [];
    let totalRefund = 0;
    const currentIdx = getCurrentAcademicIndex();
    const currentMonth = currentIdx >= 0 ? ACADEMIC_MONTHS[currentIdx] : null;

    ACADEMIC_MONTHS.forEach(m => {
      if (!refundMonths[m]) return;
      const ms = getMealStatus(refundingStudent, m);
      if (ms.paidAmount <= 0) return;
      const monthKey = `${m} (${schoolYear})`;
      const monthPayments = (refundingStudent.payments || []).filter(
        p => p.service === 'Repas' && p.month === monthKey
      );
      const latestPayment = monthPayments.length > 0 ? monthPayments[monthPayments.length - 1] : null;
      if (latestPayment?.refund === true && ms.paidAmount <= 0) {
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

      // Find if there was an earlier refund for this month
      const previousRefund = (refundingStudent.payments || []).filter(
        p => p.service === 'Repas' && p.refund && p.month === monthKey
      ).pop();

      const [startYear, endYear] = schoolYear.split('/');
      const mNum: Record<string, number> = { 'Septembre': 9, 'Octobre': 10, 'Novembre': 11, 'Décembre': 12, 'Janvier': 1, 'Février': 2, 'Mars': 3, 'Avril': 4, 'Mai': 5 };
      const num = mNum[m as AcademicMonth] ?? 9;
      const yr = num >= 9 ? startYear : endYear;
      const prefix = `${yr}-${String(num).padStart(2, '0')}`;

      // Only count attendances that occurred AFTER the previous refund (if any)
      const allMonthAttendances = (refundingStudent.mealAttendances || []).filter(
        a => a.type === 'subscription' && a.date.startsWith(prefix)
      );
      const currentSubAttendances = previousRefund
        ? allMonthAttendances.filter(a => a.date > previousRefund.date)
        : allMonthAttendances;

      const consumedThisMonth = currentSubAttendances.length;
      const remainingMeals = Math.max(0, prepaid - consumedThisMonth);
      // If nothing was consumed in current subscription, refund full current paidAmount
      const defaultRefund = consumedThisMonth === 0
        ? ms.paidAmount
        : Math.max(0, ms.paidAmount - (consumedThisMonth * unitPrice));
      // Respect user's manually entered amount. Cap at actual paid amount (not defaultRefund).
      const refundAmount = refundAmounts[m] !== undefined
        ? Math.min(Math.max(0, refundAmounts[m]), ms.paidAmount)
        : defaultRefund;
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
        notes: `استرجاع (Remboursement) لشهر ${monthToArabic(m)} — مبلغ الاسترجاع: ${refundAmount} د.ت (${ms.paidAmount} د.ت مسددة - ${consumedThisMonth} وجبة مستهلكة) - ${schoolYear}`,
        refund: true
      });
    });

    // Determine the effective current month (if during summer/off-season, default to Septembre, or selected consumptionMonth)
    const effectiveCurrentMonth = currentMonth || (consumptionMonth !== 'all' ? consumptionMonth : 'Septembre');

    // Check if the current (actual) month was refunded
    const isCurrentMonthRefunded = refundRecords.some(r =>
      r.month === `${effectiveCurrentMonth} (${schoolYear})` || r.month.startsWith(`${effectiveCurrentMonth} `)
    );

    // Also check if any paid un-refunded months remain for this student
    const allRefundedMonthKeys = new Set(
      [
        ...(refundingStudent.payments || []).filter(p => p.service === 'Repas' && p.refund).map(p => p.month),
        ...refundRecords.map(r => r.month)
      ]
    );
    const hasRemainingPaidMonth = ACADEMIC_MONTHS.some(m => {
      const monthKey = `${m} (${schoolYear})`;
      if (allRefundedMonthKeys.has(monthKey)) return false;
      const ms = getMealStatus(refundingStudent, m);
      return ms.paidAmount > 0;
    });

    // Shut down service if the current/actual month was refunded OR if the student has no more paid months
    const shutsDownService = isCurrentMonthRefunded || !hasRemainingPaidMonth;

    const updatedStudent: Student = {
      ...refundingStudent,
      enrolledServices: shutsDownService && refundingStudent.enrolledServices
        ? { ...refundingStudent.enrolledServices, meals: false }
        : refundingStudent.enrolledServices,
      mealSubscription: refundingStudent.mealSubscription
        ? { ...refundingStudent.mealSubscription, active: !shutsDownService }
        : refundingStudent.mealSubscription,
      payments: [...(refundingStudent.payments || []), ...refundRecords]
    };

    onUpdateStudents(students.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    setIsRefundModalOpen(false);
    setRefundingStudent(null);
    setRefundAmounts({});
    toast.success(refundRecords.length > 0
      ? shutsDownService
        ? `تم استرجاع ${totalRefund} د.ت (سُجّل في الميزانية)! أُنهيت خدمة المطعم للتلميذ(ة) ${updatedStudent.firstName} ${updatedStudent.lastName} — يمكنه أخذ وجبات منفردة حتى يعيد الخلاص.`
        : `تم استرجاع ${totalRefund} د.ت مقابل ${refundRecords.length} شهر (سُجّل في الميزانية)! تبقى خدمة المطعم نشطة.`
      : `لا توجد أشهر قابلة للاسترجاع للتلميذ(ة) ${updatedStudent.firstName} ${updatedStudent.lastName}.`);
  };

  return (
    <div className="space-y-6">
      
      {/* Module Banner */}
      <div className="bg-white border border-[#E0EFF1] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-[#F2F8F9] text-[#14464E] text-xs font-bold rounded-lg border border-[#C3E0E4]/60">
              المطعم المدرسي (الوجبات واللمجة)
            </span>
            {settings?.mealOperatingMode === 'in_house_kitchen' ? (
              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-black rounded-lg border border-emerald-200 flex items-center gap-1">
                👨‍🍳 نظام المطبخ الداخلي (طباخ قار)
              </span>
            ) : (
              <span className="px-3 py-1 bg-orange-50 text-orange-800 text-xs font-black rounded-lg border border-orange-200 flex items-center gap-1">
                🤝 متعاقد مع Traiteur خارجي
              </span>
            )}
            <span className="text-xs text-slate-400 font-bold">تسجيل الحضور والوجبات السريع</span>
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
                        const hasRefund = hasUncoveredRefund(st, m);
                        return (
                          <td key={m} className="p-3 text-center">
                            {hasRefund ? (
                              <button
                                onClick={() => handlePayMonthlySubscription(st, m)}
                                className="w-full py-1.5 px-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-black text-[10px] flex items-center justify-center gap-1 hover:bg-slate-200 transition cursor-pointer"
                                title="مسترجع — اضغط لخلاص هذا الشهر من جديد"
                              >
                                <Undo2 className="h-3 w-3" />
                                مسترجع
                              </button>
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

      {/* GOUTER SUBSCRIBERS & PAYMENT GRID */}
      <div className="bg-white rounded-3xl border border-purple-200/80 overflow-hidden shadow-xs no-print">
        <div className="p-5 border-b border-purple-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-purple-50/50 via-pink-50/30 to-white">
          <button
            type="button"
            onClick={() => setGouterGridCollapsed(c => !c)}
            className="flex items-center gap-2 flex-row-reverse text-right hover:text-purple-800 cursor-pointer"
          >
            <ChevronDown className={`h-5 w-5 text-purple-600 transition-transform ${gouterGridCollapsed ? '' : 'rotate-180'}`} />
            <div>
              <div className="flex items-center gap-2">
                <Cookie className="h-5 w-5 text-purple-600" />
                <h3 className="font-extrabold text-slate-900 text-base">جدول المشتركين في خدمة اللمجة - Goûter ({schoolYear})</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">متابعة اشتراكات التلاميذ في لمجة الصباح أو المساء أو اللمجتين معاً وخلاصاتهم الشهرية.</p>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setIsEnrollGouterModalOpen(true); setEnrollGouterSearch(''); }}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" />
              إلحاق تلميذ باللمجة
            </button>
          </div>
        </div>

        {/* Goûter KPI mini-cards */}
        {!gouterGridCollapsed && (
          <div className="p-4 bg-purple-50/30 border-b border-purple-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-white rounded-2xl border border-purple-100">
              <span className="text-[10px] font-bold text-purple-700 block">🥐 لمجة الصباح فقط</span>
              <span className="text-base font-black text-purple-900 font-mono">{gouterMatinCount}</span>
              <span className="text-[10px] text-slate-400 block font-semibold">
                {settings ? getFeesForYear(settings, schoolYear).fraisGouterMatinMensuel : 0} د.ت/شهر
              </span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-indigo-100">
              <span className="text-[10px] font-bold text-indigo-700 block">🍪 لمجة المساء فقط</span>
              <span className="text-base font-black text-indigo-900 font-mono">{gouterSoirCount}</span>
              <span className="text-[10px] text-slate-400 block font-semibold">
                {settings ? getFeesForYear(settings, schoolYear).fraisGouterSoirMensuel : 0} د.ت/شهر
              </span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-pink-100">
              <span className="text-[10px] font-bold text-pink-700 block">🥐🍪 اللمجتان معاً</span>
              <span className="text-base font-black text-pink-900 font-mono">{gouterBothCount}</span>
              <span className="text-[10px] text-slate-400 block font-semibold">
                {settings ? (getFeesForYear(settings, schoolYear).fraisDeuxGoutersMensuel || ((getFeesForYear(settings, schoolYear).fraisGouterMatinMensuel || 0) + (getFeesForYear(settings, schoolYear).fraisGouterSoirMensuel || 0))) : 0} د.ت/شهر
              </span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-emerald-100">
              <span className="text-[10px] font-bold text-emerald-700 block">👥 مجموع المشتركين</span>
              <span className="text-base font-black text-emerald-900 font-mono">{gouterStudents.length}</span>
              <span className="text-[10px] text-slate-400 block font-semibold">تلميذ مسجل</span>
            </div>
          </div>
        )}

        {!gouterGridCollapsed && (<>
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[1100px] text-right text-xs">
              <thead className="bg-purple-50/70 text-slate-700 font-bold border-b border-purple-100">
                <tr>
                  <th className="p-4">التلميذ</th>
                  <th className="p-3 text-center">نوع اللمجة</th>
                  <th className="p-3 text-center">المعلوم الشهري</th>
                  {ACADEMIC_MONTHS.map(m => (
                    <th key={m} className="p-3 text-center">
                      {ARABIC_ACADEMIC_MONTHS[m]}
                    </th>
                  ))}
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gouterStudents.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-slate-400 font-bold">
                      لا يوجد مشتركون في خدمة اللمجة حتى الآن. اضغط "إلحاق تلميذ باللمجة" لإضافة تلاميذ.
                    </td>
                  </tr>
                ) : (
                  paginatedGouter.map(st => {
                    const isBoth = st.enrolledServices?.gouterBoth || (st.enrolledServices?.gouterMatin && st.enrolledServices?.gouterSoir);
                    const isMatin = st.enrolledServices?.gouterMatin;
                    const isSoir = st.enrolledServices?.gouterSoir;
                    const fees = settings ? getFeesForYear(settings, schoolYear) : null;
                    const monthlyFee = isBoth
                      ? (fees?.fraisDeuxGoutersMensuel || ((fees?.fraisGouterMatinMensuel || 0) + (fees?.fraisGouterSoirMensuel || 0)))
                      : isMatin
                        ? (fees?.fraisGouterMatinMensuel || 0)
                        : (fees?.fraisGouterSoirMensuel || 0);

                    return (
                      <tr key={st.id} className="hover:bg-purple-50/20 transition">
                        <td className="p-4 font-extrabold text-slate-900">
                          <div>
                            <span className="block font-black text-slate-900">{st.firstName} {st.lastName}</span>
                            <span className="text-[10px] text-slate-400">{st.grade}</span>
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          {isBoth ? (
                            <span className="px-2.5 py-1 bg-pink-100 text-pink-800 border border-pink-200 rounded-lg text-[10px] font-black">
                              🥐🍪 اللمجتان معاً
                            </span>
                          ) : isMatin ? (
                            <span className="px-2.5 py-1 bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-[10px] font-black">
                              🥐 لمجة الصباح
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-[10px] font-black">
                              🍪 لمجة المساء
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-slate-700">
                          {monthlyFee} د.ت
                        </td>

                        {/* 9 Months Cells */}
                        {ACADEMIC_MONTHS.map(m => {
                          const gStatus = getGouterStatus(st, m);
                          return (
                            <td key={m} className="p-2.5 text-center">
                              {gStatus.status === 'paid' && (
                                <button
                                  onClick={() => {
                                    const payment = (st.payments || []).find(p => p.service === 'Goûter' && p.month === `${m} (${schoolYear})`);
                                    if (payment) setPrintingReceipt({ student: st, payment });
                                    else handleOpenMonthlyGouterPayment(st, m);
                                  }}
                                  className="w-full py-1.5 px-2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-black text-[10px] flex items-center justify-center gap-1 hover:bg-emerald-200 transition cursor-pointer"
                                  title="طباعة وصل اللمجة"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Payé ({gStatus.paidAmount} د.ت) 🖨️
                                </button>
                              )}

                              {gStatus.status === 'advance' && (
                                <button
                                  onClick={() => handleOpenMonthlyGouterPayment(st, m)}
                                  className="w-full py-1.5 px-2 bg-purple-100 text-purple-900 border border-purple-300 rounded-xl font-black text-[10px] flex items-center justify-center gap-1 hover:bg-purple-200 transition cursor-pointer"
                                >
                                  <Clock className="h-3 w-3" />
                                  Avance ({gStatus.paidAmount} د.ت)
                                  <span className="block text-[9px] font-normal">باقي {gStatus.remaining}د.ت</span>
                                </button>
                              )}

                              {gStatus.status === 'unpaid' && (
                                <button
                                  onClick={() => handleOpenMonthlyGouterPayment(st, m)}
                                  className="w-full py-1.5 px-2 bg-slate-50 hover:bg-purple-50 text-slate-400 hover:text-purple-700 border border-slate-200 hover:border-purple-200 rounded-xl font-bold text-[10px] transition cursor-pointer"
                                >
                                  Non payé
                                </button>
                              )}
                            </td>
                          );
                        })}

                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedStudentForGouterEnroll(st);
                                setEnrollGouterType(isBoth ? 'both' : isMatin ? 'matin' : 'soir');
                              }}
                              className="p-1.5 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold cursor-pointer"
                              title="تعديل نوع الاشتراك"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleUnenrollGouter(st)}
                              className="p-1.5 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold cursor-pointer"
                              title="إلغاء الاشتراك في اللمجة"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {gouterStudents.length > pageSize && (
            <div className="flex items-center justify-center gap-2 p-3 border-t border-purple-100 bg-purple-50/30">
              <button onClick={() => setGouterPage(p => Math.max(1, p - 1))} disabled={gouterCurrentPage <= 1} className="px-3 py-1.5 bg-white border border-purple-200 text-purple-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">◀ السابق</button>
              <span className="text-[10px] font-bold text-slate-500 mx-2">صفحة {gouterCurrentPage} من {gouterTotalPages}</span>
              <button onClick={() => setGouterPage(p => Math.min(gouterTotalPages, p + 1))} disabled={gouterCurrentPage >= gouterTotalPages} className="px-3 py-1.5 bg-white border border-purple-200 text-purple-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">التالي ▶</button>
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

      {/* Enroll Student in Gouter Modal */}
      <AnimatePresence>
        {(isEnrollGouterModalOpen || selectedStudentForGouterEnroll) && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-purple-950 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Cookie className="h-5 w-5 text-pink-400" />
                  <h3 className="text-lg font-black">
                    {selectedStudentForGouterEnroll ? 'تعديل اشتراك اللمجة' : 'إلحاق تلميذ بخدمة اللمجة (Goûter)'}
                  </h3>
                </div>

                <button 
                  onClick={() => { setIsEnrollGouterModalOpen(false); setSelectedStudentForGouterEnroll(null); }}
                  className="p-2 hover:bg-purple-900 rounded-xl text-purple-300 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {selectedStudentForGouterEnroll ? (
                  <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200">
                    <p className="font-extrabold text-sm text-purple-900">
                      {selectedStudentForGouterEnroll.firstName} {selectedStudentForGouterEnroll.lastName}
                    </p>
                    <p className="text-xs text-purple-600 font-bold">{selectedStudentForGouterEnroll.grade}</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 font-medium">
                      اختر تلميذاً لإلحاقه باشتراك خدمة اللمجة
                    </p>

                    <div className="relative">
                      <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={enrollGouterSearch}
                        onChange={(e) => setEnrollGouterSearch(e.target.value)}
                        placeholder="بحث باسم التلميذ..."
                        className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </>
                )}

                {/* Goûter Type Selection */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-black text-slate-700 block">اختر نوع الاشتراك في اللمجة :</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setEnrollGouterType('matin')}
                      className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                        enrollGouterType === 'matin'
                          ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-300 text-sky-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="text-lg block">🥐</span>
                      <span className="text-xs font-black block mt-1">لمجة الصباح</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {settings ? getFeesForYear(settings, schoolYear).fraisGouterMatinMensuel : 0} د.ت/ش
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEnrollGouterType('soir')}
                      className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                        enrollGouterType === 'soir'
                          ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-300 text-indigo-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="text-lg block">🍪</span>
                      <span className="text-xs font-black block mt-1">لمجة المساء</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {settings ? getFeesForYear(settings, schoolYear).fraisGouterSoirMensuel : 0} د.ت/ش
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEnrollGouterType('both')}
                      className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                        enrollGouterType === 'both'
                          ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-300 text-purple-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="text-lg block">🥐🍪</span>
                      <span className="text-xs font-black block mt-1">اللمجتان معاً</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {settings ? (getFeesForYear(settings, schoolYear).fraisDeuxGoutersMensuel || ((getFeesForYear(settings, schoolYear).fraisGouterMatinMensuel || 0) + (getFeesForYear(settings, schoolYear).fraisGouterSoirMensuel || 0))) : 0} د.ت/ش
                      </span>
                    </button>
                  </div>
                </div>

                {selectedStudentForGouterEnroll ? (
                  <div className="pt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedStudentForGouterEnroll(null)}
                      className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleEnrollStudentInGouter(selectedStudentForGouterEnroll, enrollGouterType);
                        setSelectedStudentForGouterEnroll(null);
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                    >
                      حفظ التعديل
                    </button>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                    {nonGouterStudents.filter(st => {
                      if (!enrollGouterSearch.trim()) return true;
                      const full = `${st.firstName} ${st.lastName} ${st.grade}`.toLowerCase();
                      return full.includes(enrollGouterSearch.toLowerCase());
                    }).map(st => (
                      <div key={st.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-xs text-slate-900">{st.firstName} {st.lastName}</p>
                          <p className="text-[10px] text-slate-400">{st.grade}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEnrollStudentInGouter(st, enrollGouterType)}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          إلحاق باللمجة
                        </button>
                      </div>
                    ))}
                    {nonGouterStudents.length === 0 && (
                      <div className="p-6 text-center text-xs text-slate-400">
                        جميع التلاميذ مشتركون حالياً في خدمة اللمجة!
                      </div>
                    )}
                  </div>
                )}
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
                <span className="font-bold text-sm">{printingReceipt.payment.service === 'Goûter' ? 'وصل خلاص رسمي لخدمة اللمجة (Goûter)' : 'وصل خلاص رسمي للمطعم'}</span>
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
                const isGouterReceipt = printingReceipt.payment.service === 'Goûter';
                const allMonthPayments = (printingReceipt.student.payments || []).filter(p => 
                  (p.service === printingReceipt.payment.service) && p.month.includes(printingReceipt.payment.month)
                );
                const totalPaidForMonth = allMonthPayments.reduce((s, p) => s + p.amountPaid, 0);
                const totalMonthDiscount = allMonthPayments.reduce((s, p) => s + (p.discount || 0), 0);
                const fullFeeRequired = printingReceipt.payment.totalRequired || (!!printingReceipt.payment.month.includes('Annuel') ? 150 : 300);
                const finalRemaining = Math.max(0, fullFeeRequired - totalMonthDiscount - totalPaidForMonth);

                return (
                  <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col">
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-950">{centerName} — {isGouterReceipt ? 'خدمة اللمجة (Goûter)' : 'المطعم المدرسي'} (وصل مدفوعات)</h2>
                        <p className="text-[10px] text-slate-500 font-mono">رقم آخر وصل: {printingReceipt.payment.receiptNumber}</p>
                        <p className="text-[10px] text-slate-400">تاريخ آخر دفعة: {printingReceipt.payment.date}</p>
                      </div>
                      <div className="text-left font-mono font-bold text-xs bg-[#F2F8F9] p-2 rounded border border-[#A0CBCF]">
                        <p>الخدمة: <strong>{isGouterReceipt ? 'اللمجة (Goûter)' : 'المطعم'}</strong></p>
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
                          <span>سجل دفعات هذا الشهر {isGouterReceipt ? 'باللمجة' : 'بالمطعم'}:</span>
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
                : `المشتركون لشهر ${ARABIC_ACADEMIC_MONTHS[consumptionMonth as AcademicMonth]} — ${consumptionStudents.length} تلميذ(ة) (مسددون + غير مسددين)`}
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
                <th className="p-4">حالة الدفع</th>
                <th className="p-4">{consumptionMonth === 'all' ? 'الوجبات المستهلكة (كل المدة)' : `الوجبات المستهلكة في شهر ${ARABIC_ACADEMIC_MONTHS[consumptionMonth as AcademicMonth]}`}</th>
                <th className="p-4 text-center">تأكيد وجبة اليوم</th>
                <th className="p-4 text-left">إلغاء الاشتراك والاسترجاع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consumptionStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                    {consumptionMonth === 'all'
                      ? 'لا يوجد تلاميذ مشتركون حالياً'
                      : `لا يوجد تلاميذ مشتركون لشهر ${ARABIC_ACADEMIC_MONTHS[consumptionMonth as AcademicMonth]} (${consumptionMonth}).`}
                  </td>
                </tr>
              ) : paginatedConsumption.map(st => {
                const consumed = st.mealSubscription?.consumedMealsCount || 0;
                const consumedThisMonth = consumptionMonth === 'all' ? consumed : getConsumedInMonth(st, consumptionMonth as AcademicMonth);
                const subFee = settings
                  ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas
                  : (st.mealSubscription?.monthlyPrice || 150);
                const monthStatus = consumptionMonth === 'all'
                  ? null
                  : getMealStatus(st, consumptionMonth as AcademicMonth);
                const hasRefundThisMonth = consumptionMonth !== 'all' && hasUncoveredRefund(st, consumptionMonth as AcademicMonth);

                // Check for refund & repayment in this month to show detailed breakdown
                const [startYear, endYear] = schoolYear.split('/');
                const mNum: Record<string, number> = { 'Septembre': 9, 'Octobre': 10, 'Novembre': 11, 'Décembre': 12, 'Janvier': 1, 'Février': 2, 'Mars': 3, 'Avril': 4, 'Mai': 5 };
                const num = consumptionMonth !== 'all' ? (mNum[consumptionMonth] ?? 9) : null;
                const yr = num ? (num >= 9 ? startYear : endYear) : null;
                const prefix = yr && num ? `${yr}-${String(num).padStart(2, '0')}` : null;

                const monthAttendances = prefix
                  ? (st.mealAttendances || []).filter(a => a.type === 'subscription' && a.date.startsWith(prefix))
                  : (st.mealAttendances || []).filter(a => a.type === 'subscription');

                const monthRefund = consumptionMonth !== 'all'
                  ? (st.payments || []).find(p => p.service === 'Repas' && p.refund && p.month === `${consumptionMonth} (${schoolYear})`)
                  : null;

                let beforeRefundCount = 0;
                let afterRefundCount = 0;
                if (monthRefund) {
                  beforeRefundCount = monthAttendances.filter(a => a.date <= monthRefund.date).length;
                  afterRefundCount = monthAttendances.filter(a => a.date > monthRefund.date).length;
                }

                return (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4 font-black text-slate-900">{st.firstName} {st.lastName} </td>
                    <td className="p-4">
                      {consumptionMonth === 'all' ? (
                        <span className="inline-block px-2.5 py-1 font-bold text-[10px] rounded-md border bg-[#F2F8F9] text-[#103840] border-[#C3E0E4]">
                          مشترك
                        </span>
                      ) : (
                        <span className={`inline-block px-2.5 py-1 font-black text-[10px] rounded-md border ${
                          monthStatus?.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : monthStatus?.status === 'advance'
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : hasRefundThisMonth
                                ? 'bg-orange-50 text-orange-700 border-orange-200'
                                : 'bg-red-50 text-red-600 border-red-200'
                        }`}>
                          {monthStatus?.status === 'paid'
                            ? '✓ خالص'
                            : monthStatus?.status === 'advance'
                              ? 'تسبقة'
                              : hasRefundThisMonth
                                ? 'مسترجع'
                                : 'غير خالص'}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="font-mono font-black text-[#17555F] text-sm">
                        {consumedThisMonth} وجبة
                      </span>
                      {monthRefund && afterRefundCount > 0 && (
                        <div className="text-[10px] font-bold mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            {beforeRefundCount} قبل الاسترجاع
                          </span>
                          <span className="text-slate-400">+</span>
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {afterRefundCount} بعد إعادة الخلاص
                          </span>
                        </div>
                      )}
                      {monthRefund && afterRefundCount === 0 && beforeRefundCount > 0 && (
                        <div className="text-[10px] text-slate-600 font-bold mt-1">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 inline-block">
                            ({beforeRefundCount} قبل الاسترجاع)
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleMarkConsumption(st)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-[11px] shadow-xs cursor-pointer flex items-center justify-center gap-1 mx-auto ${
                          hasRefundThisMonth
                            ? 'bg-slate-700 hover:bg-slate-800 text-white'
                            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        }`}
                        title={hasRefundThisMonth ? 'عند الاسترجاع يُسجَّل كوجبة منفردة يُدفع عند الاستلام' : 'تسجيل وجبة ضمن الاشتراك'}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {hasRefundThisMonth ? 'وجبة منفردة' : 'تسجيل الوجبة'}
                      </button>
                    </td>
                    <td className="p-4 text-left">
                      {consumptionMonth !== 'all' && monthStatus?.status === 'paid' && (
                        <button
                          onClick={() => handleOpenRefund(st)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold cursor-pointer flex items-center gap-1 mx-auto"
                          title={`استرجاع اشتراك شهر ${ARABIC_ACADEMIC_MONTHS[consumptionMonth as AcademicMonth]}`}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          استرجاع الشهر
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100/80 border-t-2 border-slate-200 font-black text-slate-900">
              <tr>
                <td className="p-4 text-center" colSpan={5}>
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

      {/* DATED DAILY MEAL & GOUTER LIST */}
      {(() => {
        const dailyLunchCount = yearStudents.reduce((sum, st) => sum + ((st.mealAttendances || []).filter(a => a.date === selectedDate && (!a.service || a.service === 'lunch')).length), 0);
        const dailyGouterMatinCount = yearStudents.reduce((sum, st) => sum + ((st.mealAttendances || []).filter(a => a.date === selectedDate && a.service === 'gouter_matin').length), 0);
        const dailyGouterSoirCount = yearStudents.reduce((sum, st) => sum + ((st.mealAttendances || []).filter(a => a.date === selectedDate && a.service === 'gouter_apres_midi').length), 0);
        const dailyAttendingStudents = yearStudents.filter(st => (st.mealAttendances || []).some(a => a.date === selectedDate));

        return (
          <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs no-print space-y-4">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Pointage اليوم — {selectedDateLabel}</h3>
                <p className="text-xs text-slate-500 mt-1">تسجيل سريع للوجبات ولمجة الصباح ولمجة المساء لكل تلميذ.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer shadow-xs">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <span className="hidden sm:inline">تاريخ اليوم:</span>
                  <DateField
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent text-slate-700 font-bold text-xs"
                  />
                </label>

                <button
                  onClick={() => { setIsAddUnitMealModalOpen(true); setUnitMealSearch(''); }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <UserPlus className="h-4 w-4" />
                  إضافة تلميذ بالوحدة...
                </button>
              </div>
            </div>

            {/* Daily KPI Badges */}
            <div className="px-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-700 block">🍽️ وجبات الغداء</span>
                  <span className="text-lg font-black text-blue-900 font-mono">{dailyLunchCount}</span>
                </div>
                <span className="text-xs text-blue-500 font-bold">وجبة</span>
              </div>

              <div className="p-3 bg-sky-50/60 border border-sky-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-sky-700 block">🥐 لمجة الصباح</span>
                  <span className="text-lg font-black text-sky-900 font-mono">{dailyGouterMatinCount}</span>
                </div>
                <span className="text-xs text-sky-500 font-bold">حصة</span>
              </div>

              <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-purple-700 block">🍪 لمجة المساء</span>
                  <span className="text-lg font-black text-purple-900 font-mono">{dailyGouterSoirCount}</span>
                </div>
                <span className="text-xs text-purple-500 font-bold">حصة</span>
              </div>

              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-700 block">👥 التلاميذ الحاضرين</span>
                  <span className="text-lg font-black text-emerald-900 font-mono">{dailyAttendingStudents.length}</span>
                </div>
                <span className="text-xs text-emerald-500 font-bold">تلميذ</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-y border-slate-200">
                  <tr>
                    <th className="p-3.5">التلميذ</th>
                    <th className="p-3.5 text-center">🍽️ الغداء (Déjeuner)</th>
                    <th className="p-3.5 text-center">🥐 لمجة الصباح</th>
                    <th className="p-3.5 text-center">🍪 لمجة المساء</th>
                    <th className="p-3.5 text-center">حالة الدفع والإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailyAttendingStudents.map(st => {
                    const lunchAtt = getServiceAttendance(st, 'lunch');
                    const gouterMatinAtt = getServiceAttendance(st, 'gouter_matin');
                    const gouterSoirAtt = getServiceAttendance(st, 'gouter_apres_midi');

                    return (
                      <tr key={st.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3.5 font-bold">
                          <span className="text-slate-900 block">{st.firstName} {st.lastName}</span>
                          <span className="text-[10px] text-slate-400">{st.grade}</span>
                        </td>

                        {/* Lunch Column */}
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleMealService(st, 'lunch')}
                            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition cursor-pointer border flex items-center justify-center gap-1 mx-auto ${
                              lunchAtt
                                ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-emerald-300 hover:text-slate-600'
                            }`}
                          >
                            {lunchAtt ? '✓ غداء مسجل' : '+ غداء'}
                          </button>
                        </td>

                        {/* Gouter Matin Column */}
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleMealService(st, 'gouter_matin')}
                            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition cursor-pointer border flex items-center justify-center gap-1 mx-auto ${
                              gouterMatinAtt
                                ? 'bg-sky-600 text-white border-sky-700 shadow-xs'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-sky-300 hover:text-slate-600'
                            }`}
                          >
                            {gouterMatinAtt ? '✓ لمجة صباح' : '+ لمجة صباح'}
                          </button>
                        </td>

                        {/* Gouter Apres-midi Column */}
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleMealService(st, 'gouter_apres_midi')}
                            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition cursor-pointer border flex items-center justify-center gap-1 mx-auto ${
                              gouterSoirAtt
                                ? 'bg-purple-500 text-white border-purple-600 shadow-xs'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-purple-300 hover:text-slate-600'
                            }`}
                          >
                            {gouterSoirAtt ? '✓ لمجة مساء' : '+ لمجة مساء'}
                          </button>
                        </td>

                        {/* Payment & Actions */}
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {/* Unpaid Unit Lunch */}
                            {lunchAtt && lunchAtt.type === 'unit' && !lunchAtt.paid && (
                              <button
                                onClick={() => handlePayUnitService(st, 'lunch')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10px] cursor-pointer shadow-xs"
                                title="خلاص الغداء المنفرد"
                              >
                                خلاص الغداء ({settings ? getFeesForYear(settings, schoolYear).fraisParRepas : 8} د.ت)
                              </button>
                            )}
                            {/* Unpaid Unit Gouter Matin */}
                            {gouterMatinAtt && gouterMatinAtt.type === 'unit' && !gouterMatinAtt.paid && (
                              <button
                                onClick={() => handlePayUnitService(st, 'gouter_matin')}
                                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-[10px] cursor-pointer shadow-xs"
                                title="خلاص لمجة الصباح"
                              >
                                خلاص الصباح ({settings ? getFeesForYear(settings, schoolYear).fraisGouterMatinUnitaire : 0} د.ت)
                              </button>
                            )}
                            {/* Unpaid Unit Gouter Soir */}
                            {gouterSoirAtt && gouterSoirAtt.type === 'unit' && !gouterSoirAtt.paid && (
                              <button
                                onClick={() => handlePayUnitService(st, 'gouter_apres_midi')}
                                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-[10px] cursor-pointer shadow-xs"
                                title="خلاص لمجة المساء"
                              >
                                خلاص المساء ({settings ? getFeesForYear(settings, schoolYear).fraisGouterSoirUnitaire : 0} د.ت)
                              </button>
                            )}

                            <button
                              onClick={() => setRemoveAttendanceStudent(st)}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg font-bold text-[10px] cursor-pointer flex items-center gap-1"
                              title="إزالة جميع تسجيلات اليوم"
                            >
                              <Trash2 className="h-3 w-3" />
                              إزالة الكل
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {dailyAttendingStudents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        لا توجد وجبات أو لمجات مسجلة لهذا التاريخ. استخدم زر "إضافة تلميذ بالوحدة" أو سجّل من جدول الاشتراكات أعلاه.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

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
                    {paymentService === 'Goûter' ? (
                      <Cookie className="h-5 w-5 text-pink-400" />
                    ) : (
                      <CreditCard className="h-5 w-5 text-[#3A93A0]" />
                    )}
                    {paymentService === 'Goûter'
                      ? `خلاص اشتراك اللمجة — ${paymentMonth} (${schoolYear})`
                      : `خلاص اشتراك المطعم — ${paymentMonth} (${schoolYear})`}
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
                  const isGouter = paymentService === 'Goûter';
                  const activeMonthStatus = selectedStudentForPayment
                    ? (isGouter ? getGouterStatus(selectedStudentForPayment, paymentMonth) : getMealStatus(selectedStudentForPayment, paymentMonth))
                    : null;
                  const isAdvanceStatus = activeMonthStatus?.status === 'advance';
                  const hasRefund = (!isGouter && selectedStudentForPayment)
                    ? hasUncoveredRefund(selectedStudentForPayment, paymentMonth)
                    : false;
                  const standardFee = activeMonthStatus?.total || (isGouter ? 30 : (settings ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas : 150));

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
                              const targetVal = isAdvanceStatus ? activeMonthStatus.remaining : Math.max(0, standardFee - discount);
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
                              : `خلاص كامل (${Math.max(0, standardFee - discount)} د.ت)`}
                          </button>
                          <button
                            type="button"
                            disabled={hasRefund}
                            title={hasRefund ? 'عند إعادة خلاص شهر مسترجع يجب دفع المبلغ كاملاً' : undefined}
                            onClick={() => {
                              setPaymentType('advance');
                              const effectiveReq = Math.max(0, standardFee - discount);
                              const defaultAdv = isAdvanceStatus 
                                ? Math.min(10, activeMonthStatus.remaining) 
                                : Math.round(effectiveReq / 2);
                              setAmountPaid(defaultAdv);
                              setTotalRequired(standardFee);
                            }}
                            className={`py-2 rounded-xl text-xs font-bold border transition ${
                              hasRefund ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                            } ${
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

                      {/* Remise / Discount Field */}
                      {!isAdvanceStatus && (
                        <div>
                          <label className="text-xs font-bold text-slate-600 block mb-1">
                            التخفيض / Remise (د.ت) <span className="text-[10px] text-slate-500 font-semibold">(مثال: خصم الأيام غير المستهلكة أو التحاق متأخر)</span>
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
                          <p className="text-[10px] text-slate-400 font-bold mt-1 flex items-center justify-between">
                            <span>المستوجب بعد التخفيض: <strong className="text-slate-700 font-mono">{Math.max(0, standardFee - (Number(discount) || 0))} د.ت</strong></span>
                            {Number(discount) > 0 && (
                              <span className="text-emerald-700 font-black">✓ تخفيض بقيمة {discount} د.ت</span>
                            )}
                          </p>
                        </div>
                      )}

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
                            max={isAdvanceStatus ? activeMonthStatus?.remaining : Math.max(0, standardFee - discount)}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const maxVal = isAdvanceStatus ? activeMonthStatus?.remaining : Math.max(0, standardFee - discount);
                              const val = Math.max(0, Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0);
                              if (maxVal !== undefined && val > maxVal) {
                                toast.warning(`المطلوب ${maxVal} د.ت فقط!`);
                                setAmountPaid(maxVal);
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
                            : Math.max(0, standardFee - discount - amountPaid)} د.ت
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
                  التلاميذ الذين لا يملكون اشتراكاً شهرياً فعّالاً بالمطعم لهذه السنة الدراسية، أو مشتركون لكنهم مسترجعون (refunded) لهذا الشهر ويواصلون تناوُل أطباقهم الفردية بالثمن الفردي. تُحتسب الوجبة بالثمن الفردي فقط.
                </p>

                {(() => {
                  const dateMonth = new Date(`${selectedDate}T12:00:00`).getMonth();
                  const mMap: Record<number, AcademicMonth> = {
                    8: 'Septembre', 9: 'Octobre', 10: 'Novembre', 11: 'Décembre',
                    0: 'Janvier', 1: 'Février', 2: 'Mars', 3: 'Avril', 4: 'Mai'
                  };
                  const selMonth = mMap[dateMonth];
                  const refundedForMonth = (s: Student) => selMonth ? hasUncoveredRefund(s, selMonth) : false;
                  const activelySubscribed = (s: Student) =>
                    (s.mealSubscription?.mode === 'subscription' && s.mealSubscription?.active) ||
                    s.enrolledServices?.meals === true;
                  const eligible = yearStudents.filter(s =>
                    (refundedForMonth(s) || !activelySubscribed(s)) && !getAttendance(s)
                  );
                  const candidates = eligible.filter(s => {
                    if (!unitMealSearch.trim()) return true;
                    const full = `${s.firstName} ${s.lastName} ${s.grade}`.toLowerCase();
                    return full.includes(unitMealSearch.toLowerCase());
                  });
                  return eligible.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
                      لا توجد تلاميذ متاحين لإضافتهم كوجبة منفردة لهذا التاريخ.
                    </div>
                  ) : (
                    <>
                      <div className="p-2 border border-slate-200 rounded-t-2xl bg-white border-b-0">
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
                      {candidates.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-b-2xl border border-t-0 border-slate-200">
                          لا توجد نتائج مطابقة لبحثك.
                        </div>
                      ) : (
                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 border-t-0 rounded-b-2xl">
                          {candidates.map(s => (
                            <div key={s.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <p className="font-extrabold text-xs text-slate-900">{s.firstName} {s.lastName}</p>
                                <p className="text-[10px] text-slate-400">{s.grade} — ولي الأمر: <span dir="ltr">{s.father?.phoneMobile || s.mother?.phoneMobile || 'لا يوجد'}</span></p>
                                {refundedForMonth(s) && (
                                  <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-black rounded-md border border-orange-200">
                                    مسترجع الشهر الحالي — يُدفع عند الاستلام
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => handleAddOneTimeMealStudent(s.id)}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                أضف وجبة اليوم
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
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
                    <h3 className="text-lg font-black">استرجاع اشتراك المطعم</h3>
                    <p className="text-xs text-slate-300">
                      التلميذ(ة): {refundingStudent.firstName} {refundingStudent.lastName} — اختر الأشهر المدفوعة للاسترجاع
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
                  يتم استرجاع قيمة الوجبات المتبقية (غير المستهلكة) للأشهر المدفوعة المختارة.
                  يُحتسب الاسترجاع على أساس: عدد الوجبات المتبقية × سعر الوجبة. يمكنك تعديل المبلغ يدوياً إذا لزم الأمر.
                  إذا استرجعت الشهر الحالي (الجاري) تُنهى خدمة المطعم للتلميذ ويمكنه أخذ وجبات منفردة حتى يعيد الخلاص.
                  إذا استرجعت أشهراً قادمة فقط تبقى خدمة المطعم نشطة. يُثبت الاسترجاع في الميزانية والمالية.
                </p>

                {Object.keys(refundMonths).length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
                    لا توجد اشتراكات أشهر مستقبلية مدفوعة لهذا التلميذ. يمكنك تأكيد إلغاء الاشتراك فقط دون أي استرجاع.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                    {Object.keys(refundMonths).map(m => {
                      const ms = getMealStatus(refundingStudent, m as AcademicMonth);
                      const unitPrice = settings
                        ? getFeesForYear(settings, schoolYear).fraisParRepas
                        : (refundingStudent.mealSubscription?.unitPrice || 8);
                      const subFee = settings
                        ? getFeesForYear(settings, schoolYear).fraisAbonnementRepas
                        : (refundingStudent.mealSubscription?.monthlyPrice || 150);
                      const prepaid = Math.floor(subFee / unitPrice) || 18;
                      const monthKey = `${m} (${schoolYear})`;
                      const previousRefund = (refundingStudent.payments || []).filter(
                        p => p.service === 'Repas' && p.refund && p.month === monthKey
                      ).pop();

                      // Get list of consumed meal dates for this month
                      const [startYear, endYear] = schoolYear.split('/');
                      const mNum: Record<string, number> = { 'Septembre': 9, 'Octobre': 10, 'Novembre': 11, 'Décembre': 12, 'Janvier': 1, 'Février': 2, 'Mars': 3, 'Avril': 4, 'Mai': 5 };
                      const num = mNum[m as AcademicMonth] ?? 9;
                      const yr = num >= 9 ? startYear : endYear;
                      const prefix = `${yr}-${String(num).padStart(2, '0')}`;
                      const allConsumedDates = (refundingStudent.mealAttendances || [])
                        .filter(a => a.type === 'subscription' && a.date.startsWith(prefix))
                        .map(a => a.date)
                        .sort();

                      const consumedDates = previousRefund
                        ? allConsumedDates.filter(d => d > previousRefund.date)
                        : allConsumedDates;
                      const settledDates = previousRefund
                        ? allConsumedDates.filter(d => d <= previousRefund.date)
                        : [];

                      const consumedThisMonth = consumedDates.length;
                      const remainingMeals = Math.max(0, prepaid - consumedThisMonth);
                      const defaultRefund = consumedThisMonth === 0
                        ? ms.paidAmount
                        : Math.max(0, ms.paidAmount - (consumedThisMonth * unitPrice));
                      const refundAmount = refundAmounts[m] !== undefined ? refundAmounts[m] : defaultRefund;

                      return (
                        <div
                          key={m}
                          className={`rounded-2xl border overflow-hidden ${refundMonths[m] ? 'border-red-300' : 'border-slate-200'}`}
                        >
                          {/* Month header row */}
                          <label className={`flex items-center justify-between p-3 cursor-pointer transition ${refundMonths[m] ? 'bg-red-50' : 'bg-slate-50 hover:bg-slate-100'}`}>
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
                                  الوجبات المستهلكة (الاشتراك الحالي): <span className="font-mono font-bold text-[#17555F]">{consumedThisMonth}</span>
                                  {settledDates.length > 0 && (
                                    <span className="text-slate-600 mr-1.5 font-bold">
                                      ({settledDates.length} وجبة تمت تسويتها بالاسترجاع السابق)
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="text-left space-y-1">
                              <span className="text-[10px] font-bold text-red-600">مبلغ الاسترجاع</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={ms.paidAmount}
                                  step={0.5}
                                  value={refundAmounts[m] !== undefined ? refundAmounts[m] : ''}
                                  placeholder={defaultRefund.toString()}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? undefined : Math.min(Number(e.target.value), ms.paidAmount);
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
                                <p className="text-[9px] text-slate-400">المقترح: {defaultRefund} د.ت</p>
                              )}
                            </div>
                          </label>

                          {/* Consumed meals dates */}
                          {consumedDates.length > 0 && (
                            <div className="px-3 pb-3 pt-1 bg-white border-t border-slate-100">
                              <p className="text-[10px] font-extrabold text-slate-500 mb-1.5 flex items-center gap-1">
                                <span>🗓</span> تاريخ الوجبات المستهلكة لشهر {monthToArabic(m)}:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {consumedDates.map(d => (
                                  <span key={d} className="inline-block px-2 py-0.5 bg-[#F2F8F9] text-[#257C86] border border-[#C3E0E4] rounded-md text-[9px] font-mono font-bold">
                                    {d}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {consumedDates.length === 0 && (
                            <div className="px-3 pb-2 pt-1 bg-white border-t border-slate-100">
                              <p className="text-[10px] text-slate-400 italic">لا توجد وجبات مستهلكة مسجلة لهذا الشهر.</p>
                            </div>
                          )}
                        </div>
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
