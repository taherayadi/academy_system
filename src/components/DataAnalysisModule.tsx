import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Utensils,
  BookOpen,
  Clock,
  GraduationCap,
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Student,
  StaffMember,
  TeenCenterSlot,
  ExternalCourse,
  ExternalCourseSession,
  MealPlanDay,
  CenterExpense,
  TimesheetEntry,
  RevisionSeance,
  CenterSettings,
  ACADEMIC_MONTHS,
  ARABIC_ACADEMIC_MONTHS,
  DEFAULT_ACADEMIC_YEARS,
  PaymentRecord,
  ExternalStudentRegister,
  Formation,
} from '../types';
import { analyzeCenterData, AnalysisStats } from '../utils/aiAnalysis';

interface DataAnalysisModuleProps {
  students: Student[];
  staff: StaffMember[];
  slots: TeenCenterSlot[];
  courses: ExternalCourse[];
  sessions: ExternalCourseSession[];
  mealPlans: MealPlanDay[];
  expenses: CenterExpense[];
  timesheets: TimesheetEntry[];
  revisionSeances: RevisionSeance[];
  externalStudents: ExternalStudentRegister[];
  formations?: Formation[];
  settings: CenterSettings;
}

type PeriodOption = 'all' | 'T1' | 'T2' | 'T3' | typeof ACADEMIC_MONTHS[number];

const TRIMESTER_MONTHS: Record<string, typeof ACADEMIC_MONTHS[number][]> = {
  T1: ['Septembre', 'Octobre', 'Novembre'],
  T2: ['Décembre', 'Janvier', 'Février'],
  T3: ['Mars', 'Avril', 'Mai'],
};

const SERVICE_LABELS: Record<string, string> = {
  'Suivi': 'المتابعة الدراسية',
  'Étude Teen Center': 'تأطير Étude',
  'Cours Particuliers': 'الدروس الخصوصية',
  'Revision': 'حصة مراجعة',
  'Bibliothèque': 'المكتبة',
  'Repas': 'الوجبات',
  'Inscription': 'تسجيل المتابعة',
  'Assurance': 'التأمين',
  'Autres': 'أخرى',
};

const ROLE_LABELS: Record<string, string> = {
  'enseignant': 'أستاذ',
  'encadrant': 'مشرف',
  'administration': 'إدارة',
  'agent_entretien': 'عنصصر صيانة',
  'cuisinier': 'طباخ',
  'autre': 'أخرى',
};

function matchesMonth(dateStr: string, months: string[]): boolean {
  if (!dateStr) return false;
  return months.some(m => dateStr.includes(m));
}

function getPaymentMonths(payment: PaymentRecord): string[] {
  return payment.month ? [payment.month] : [];
}

export default function DataAnalysisModule({
  students, staff, slots, courses, sessions, mealPlans, expenses, timesheets, revisionSeances, externalStudents, settings,
}: DataAnalysisModuleProps) {
  const [schoolYear, setSchoolYear] = useState<string>(DEFAULT_ACADEMIC_YEARS[DEFAULT_ACADEMIC_YEARS.length - 1]);
  const [period, setPeriod] = useState<PeriodOption>('all');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showModuleBreakdown, setShowModuleBreakdown] = useState(true);
  const [showMealsDetail, setShowMealsDetail] = useState(false);
  const [showExpensesDetail, setShowExpensesDetail] = useState(false);

  const activeMonths = useMemo(() => {
    if (period === 'all') return [...ACADEMIC_MONTHS];
    if (TRIMESTER_MONTHS[period]) return TRIMESTER_MONTHS[period];
    return [period];
  }, [period]);

  const periodLabel = useMemo(() => {
    if (period === 'all') return 'السنة الكاملة';
    if (TRIMESTER_MONTHS[period]) return `الفترة ${period === 'T1' ? 'الأولى' : period === 'T2' ? 'الثانية' : 'الثالثة'}`;
    return ARABIC_ACADEMIC_MONTHS[period as keyof typeof ARABIC_ACADEMIC_MONTHS] || period;
  }, [period]);

  const stats: AnalysisStats = useMemo(() => {
    const yearStudents = students.filter(s => s.academicYear === schoolYear);

    const studentsByGrade: Record<string, number> = {};
    yearStudents.forEach(s => { studentsByGrade[s.grade] = (studentsByGrade[s.grade] || 0) + 1; });

    const staffByRole: Record<string, number> = {};
    staff.forEach(s => { staffByRole[s.role] = (staffByRole[s.role] || 0) + 1; });

    const incomeByService: Record<string, number> = {};
    const paymentMethodBreakdown: Record<string, number> = {};
    const monthlyIncomeByMonth: Record<string, number> = {};

    // 1. Internal student payments
    yearStudents.forEach(s => {
      (s.payments || []).forEach(p => {
        const matches = activeMonths.some(m => p.month?.includes(m) || p.date?.includes(m));
        if (!matches) return;
        const amt = p.amountPaid || 0;
        if (amt <= 0) return;
        incomeByService[p.service] = (incomeByService[p.service] || 0) + amt;
        paymentMethodBreakdown[p.method] = (paymentMethodBreakdown[p.method] || 0) + amt;
        const monthKey = p.month || 'غير محدد';
        monthlyIncomeByMonth[monthKey] = (monthlyIncomeByMonth[monthKey] || 0) + amt;
      });
    });

    // 2. External course student payments
    const yearExternal = externalStudents.filter(e => e.schoolYear === schoolYear || !e.schoolYear);
    let externalCourseStudents = 0;
    let externalCourseRevenue = 0;
    yearExternal.forEach(reg => {
      if (reg.assurancePaid && reg.assuranceAmount > 0) {
        const matches = activeMonths.some(m => reg.assuranceDate?.includes(m));
        if (matches) {
          incomeByService['Assurance'] = (incomeByService['Assurance'] || 0) + reg.assuranceAmount;
          paymentMethodBreakdown['Espèces'] = (paymentMethodBreakdown['Espèces'] || 0) + reg.assuranceAmount;
        }
      }
      (reg.payments || []).forEach(p => {
        const matches = activeMonths.some(m => p.date?.includes(m));
        if (!matches) return;
        const amt = p.amountPaid || 0;
        if (amt <= 0) return;
        externalCourseRevenue += amt;
        incomeByService['Cours Particuliers'] = (incomeByService['Cours Particuliers'] || 0) + amt;
        paymentMethodBreakdown[p.method] = (paymentMethodBreakdown[p.method] || 0) + amt;
        const monthKey = p.date?.slice(0, 7) || 'غير محدد';
        monthlyIncomeByMonth[monthKey] = (monthlyIncomeByMonth[monthKey] || 0) + amt;
      });
      externalCourseStudents++;
    });

    const totalIncome = Object.values(incomeByService).reduce((a, b) => a + b, 0);

    const filteredExpenses = expenses.filter(e => {
      if (!e.date) return false;
      return activeMonths.some(m => e.date.includes(m));
    });
    const totalExpenses = filteredExpenses.reduce((a, e) => a + (e.amount || 0), 0);

    const expensesByCategory: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + (e.amount || 0);
    });

    const mealAttendanceByDish: Record<string, { count: number; unitPaid: number; subscriptionCount: number }> = {};
    let totalMealAttendances = 0;
    const filteredMealPlans = mealPlans.filter(mp => {
      return activeMonths.some(m => mp.date?.includes(m));
    });
    filteredMealPlans.forEach(mp => {
      const dish = mp.dishName || 'غير محدد';
      if (!mealAttendanceByDish[dish]) mealAttendanceByDish[dish] = { count: 0, unitPaid: 0, subscriptionCount: 0 };
      (mp.attendees || []).forEach(a => {
        totalMealAttendances++;
        mealAttendanceByDish[dish].count++;
        if (a.isOneTime && a.paidUnit) mealAttendanceByDish[dish].unitPaid++;
        else mealAttendanceByDish[dish].subscriptionCount++;
      });
    });

    // Weekly meal plan breakdown
    const weeklyMealPlan: Record<string, { dish: string; attendees: number; date: string }[]> = {};
    filteredMealPlans.forEach(mp => {
      const day = mp.day || 'غير محدد';
      if (!weeklyMealPlan[day]) weeklyMealPlan[day] = [];
      weeklyMealPlan[day].push({ dish: mp.dishName, attendees: (mp.attendees || []).length, date: mp.date });
    });

    // Revision seances
    const revSessions = revisionSeances.filter(r => {
      return activeMonths.some(m => r.date?.includes(m));
    });
    const revisionRevenue = revSessions.reduce((a, r) => a + (r.centerShare || 0), 0);
    const revisionStudentsCount = revSessions.reduce((a, r) => a + (r.students || []).length, 0);

    // External course sessions
    const courseSessions = sessions.filter(s => {
      return activeMonths.some(m => s.date?.includes(m));
    });

    return {
      period: periodLabel,
      schoolYear,
      totalStudents: yearStudents.length,
      studentsByGrade,
      totalStaff: staff.length,
      staffByRole,
      slotsCount: slots.length,
      activeCourses: courses.length,
      mealDaysCount: filteredMealPlans.length,
      totalMealAttendances,
      mealAttendanceByDish,
      weeklyMealPlan,
      incomeByService,
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      expensesByCategory,
      totalRevisionSessions: revSessions.length,
      revisionRevenue,
      revisionStudentsCount,
      externalCourseStudents,
      externalCourseRevenue,
      externalCourseSessions: courseSessions.length,
      paymentMethodBreakdown,
      avgIncomePerStudent: (yearStudents.length + externalCourseStudents) > 0 ? totalIncome / (yearStudents.length + externalCourseStudents) : 0,
      monthlyIncomeByMonth,
    };
  }, [students, staff, slots, courses, mealPlans, expenses, timesheets, revisionSeances, externalStudents, sessions, schoolYear, activeMonths, periodLabel]);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await analyzeCenterData(stats, settings.geminiApiKey);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إجراء التحليل.');
    } finally {
      setLoading(false);
    }
  };

  const sortedDishes = useMemo(() => {
    return Object.entries(stats.mealAttendanceByDish)
      .sort((a, b) => b[1].count - a[1].count);
  }, [stats.mealAttendanceByDish]);

  const sortedIncome = useMemo(() => {
    return Object.entries(stats.incomeByService).sort((a, b) => b[1] - a[1]);
  }, [stats.incomeByService]);

  const sortedExpenses = useMemo(() => {
    return Object.entries(stats.expensesByCategory).sort((a, b) => b[1] - a[1]);
  }, [stats.expensesByCategory]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#257C86] to-[#1d6169] flex items-center justify-center shadow-lg shadow-[#257C86]/25">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">تحليل البيانات</h2>
            <p className="text-[11px] text-slate-500 font-bold">تحليل شامل بأيام الذكاء الاصطناعي لتحسين الخدمات والدخل</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1">السنة الدراسية</label>
            <select
              value={schoolYear}
              onChange={e => setSchoolYear(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
            >
              {DEFAULT_ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1">الفترة</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as PeriodOption)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
            >
              <option value="all">السنة الكاملة</option>
              <optgroup label="فترات">
                <option value="T1">الفترة الأولى (سبتمبر - نوفمبر)</option>
                <option value="T2">الفترة الثانية (ديسمبر - فبراير)</option>
                <option value="T3">الفترة الثالثة (مارس - ماي)</option>
              </optgroup>
              <optgroup label="أشهر">
                {ACADEMIC_MONTHS.map(m => (
                  <option key={m} value={m}>{ARABIC_ACADEMIC_MONTHS[m]} ({m})</option>
                ))}
              </optgroup>
            </select>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="mt-5 px-5 py-2 bg-[#257C86] hover:bg-[#1d6169] text-white font-black text-xs rounded-xl shadow-md shadow-[#257C86]/25 cursor-pointer disabled:opacity-60 flex items-center gap-2 transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'جاري التحليل...' : 'تحليل بالذكاء الاصطناعي'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <span className="text-[10px] font-extrabold text-slate-500">إجمالي الدخل</span>
          </div>
          <p className="text-lg font-black text-emerald-600">{stats.totalIncome.toLocaleString('fr-TN')} <span className="text-[10px]">د.ت</span></p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-red-600" />
            </div>
            <span className="text-[10px] font-extrabold text-slate-500">المصاريف</span>
          </div>
          <p className="text-lg font-black text-red-600">{stats.totalExpenses.toLocaleString('fr-TN')} <span className="text-[10px]">د.ت</span></p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-blue-600" />
            </div>
            <span className="text-[10px] font-extrabold text-slate-500">صافي الربح</span>
          </div>
          <p className={`text-lg font-black ${stats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {stats.netProfit >= 0 ? '+' : ''}{stats.netProfit.toLocaleString('fr-TN')} <span className="text-[10px]">د.ت</span>
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-amber-600" />
            </div>
            <span className="text-[10px] font-extrabold text-slate-500">مدخول لكل تلميذ</span>
          </div>
          <p className="text-lg font-black text-amber-600">{stats.avgIncomePerStudent.toFixed(0)} <span className="text-[10px]">د.ت</span></p>
        </motion.div>
      </div>

      {/* Module Breakdown */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        <button
          onClick={() => setShowModuleBreakdown(!showModuleBreakdown)}
          className="w-full flex items-center justify-between p-5 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-slate-500" />
            <h3 className="font-black text-slate-900 text-sm">تحليل كل وحدة</h3>
          </div>
          {showModuleBreakdown ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {showModuleBreakdown && (
          <div className="px-5 pb-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-right py-2 px-3 font-extrabold text-slate-500">الوحدة</th>
                    <th className="text-right py-2 px-3 font-extrabold text-slate-500">المدخول</th>
                    <th className="text-right py-2 px-3 font-extrabold text-slate-500">% من الإجمالي</th>
                    <th className="text-right py-2 px-3 font-extrabold text-slate-500">المدخول/تلميذ</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedIncome.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-slate-400 font-bold">لا توجد بيانات دخل لهذه الفترة</td></tr>
                  ) : sortedIncome.map(([service, amount]) => {
                    const pct = stats.totalIncome > 0 ? (amount / stats.totalIncome * 100) : 0;
                    return (
                      <tr key={service} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{SERVICE_LABELS[service] || service}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{amount.toLocaleString('fr-TN')} د.ت</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-[#257C86] rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="font-bold text-slate-600">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{stats.totalStudents > 0 ? (amount / stats.totalStudents).toFixed(0) : 0} د.ت</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-black">
                    <td className="py-2.5 px-3 text-slate-900">المجموع</td>
                    <td className="py-2.5 px-3 font-mono text-slate-900">{stats.totalIncome.toLocaleString('fr-TN')} د.ت</td>
                    <td className="py-2.5 px-3 text-slate-600">100%</td>
                    <td className="py-2.5 px-3 font-mono text-slate-900">{stats.totalStudents > 0 ? (stats.totalIncome / stats.totalStudents).toFixed(0) : 0} د.ت</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Meals Detail */}
      {sortedDishes.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <button
            onClick={() => setShowMealsDetail(!showMealsDetail)}
            className="w-full flex items-center justify-between p-5 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Utensils className="h-4 w-4 text-orange-500" />
              <h3 className="font-black text-slate-900 text-sm">تحليل الوجبات — ترتيب حسب الشهبية</h3>
            </div>
            {showMealsDetail ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {showMealsDetail && (
            <div className="px-5 pb-5">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-right py-2 px-3 font-extrabold text-slate-500">الترقيم</th>
                      <th className="text-right py-2 px-3 font-extrabold text-slate-500">اسم الوجبة</th>
                      <th className="text-right py-2 px-3 font-extrabold text-slate-500">عدد الحضور</th>
                      <th className="text-right py-2 px-3 font-extrabold text-slate-500">اشتراكي</th>
                      <th className="text-right py-2 px-3 font-extrabold text-slate-500">nonce منفرد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDishes.map(([dish, info], idx) => (
                      <tr key={dish} className={`border-b border-slate-50 hover:bg-slate-50/50 ${idx === 0 ? 'bg-emerald-50/50' : ''}`}>
                        <td className="py-2.5 px-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                            idx === 0 ? 'bg-emerald-500 text-white' : idx === 1 ? 'bg-blue-500 text-white' : idx === 2 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>{idx + 1}</span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">{dish}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{info.count}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{info.subscriptionCount}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{info.unitPaid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expenses Detail */}
      {sortedExpenses.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <button
            onClick={() => setShowExpensesDetail(!showExpensesDetail)}
            className="w-full flex items-center justify-between p-5 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <h3 className="font-black text-slate-900 text-sm">المصاريف حسب الفئة</h3>
            </div>
            {showExpensesDetail ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {showExpensesDetail && (
            <div className="px-5 pb-5">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-right py-2 px-3 font-extrabold text-slate-500">الفئة</th>
                      <th className="text-right py-2 px-3 font-extrabold text-slate-500">المبلغ</th>
                      <th className="text-right py-2 px-3 font-extrabold text-slate-500">% من المصاريف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedExpenses.map(([cat, amount]) => {
                      const pct = stats.totalExpenses > 0 ? (amount / stats.totalExpenses * 100) : 0;
                      return (
                        <tr key={cat} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-bold text-slate-800">{cat}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{amount.toLocaleString('fr-TN')} د.ت</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="font-bold text-slate-600">{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-extrabold text-slate-500">التلاميذ الداخليون</span>
          </div>
          <p className="text-sm font-black text-slate-900">{stats.totalStudents}</p>
          <p className="text-[10px] text-slate-400 font-bold">{Object.keys(stats.studentsByGrade).length} مستوى</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-extrabold text-slate-500">التلاميذ الخارجيون</span>
          </div>
          <p className="text-sm font-black text-slate-900">{stats.externalCourseStudents}</p>
          <p className="text-[10px] text-[#257C86] font-bold">{stats.externalCourseRevenue.toLocaleString('fr-TN')} د.ت</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-extrabold text-slate-500">ساعات Étude</span>
          </div>
          <p className="text-sm font-black text-slate-900">{stats.slotsCount} حصة</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-extrabold text-slate-500">حصص المراجعة</span>
          </div>
          <p className="text-sm font-black text-slate-900">{stats.totalRevisionSessions} حصة</p>
          <p className="text-[10px] text-[#257C86] font-bold">{stats.revisionRevenue.toLocaleString('fr-TN')} د.ت</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center gap-2 mb-1">
            <Utensils className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-extrabold text-slate-500">الوجبات</span>
          </div>
          <p className="text-sm font-black text-slate-900">{stats.totalMealAttendances} وجبة</p>
          <p className="text-[10px] text-slate-400 font-bold">{stats.mealDaysCount} يوم</p>
        </div>
      </div>

      {/* Weekly Meal Plan */}
      {Object.keys(stats.weeklyMealPlan).length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 flex items-center gap-2">
            <Utensils className="h-4 w-4 text-[#257C86]" />
            <h3 className="font-black text-slate-900 text-sm">خطة الوجبات الأسبوعية</h3>
          </div>
          <div className="px-5 pb-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(stats.weeklyMealPlan).map(([day, meals]) => (
                <div key={day} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <h4 className="font-black text-[#257C86] text-xs mb-2">{day}</h4>
                  {meals.map((meal, i) => (
                    <div key={i} className="flex justify-between items-center text-[11px] py-1 border-b border-slate-100 last:border-0">
                      <span className="font-bold text-slate-800">{meal.dish}</span>
                      <span className="text-slate-500 font-mono">{meal.attendees} حضور</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* External Courses & Revision */}
      {(stats.externalCourseStudents > 0 || stats.totalRevisionSessions > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.externalCourseStudents > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap className="h-4 w-4 text-[#257C86]" />
                <h3 className="font-black text-slate-900 text-xs">الدروس الخصوصية</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500 font-bold">عدد الدروس النشطة</span>
                  <span className="font-black text-slate-900">{stats.activeCourses}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500 font-bold">التلاميذ الخارجيون</span>
                  <span className="font-black text-slate-900">{stats.externalCourseStudents}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500 font-bold">حصص الدروس</span>
                  <span className="font-black text-slate-900">{stats.externalCourseSessions}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-2 border-t border-slate-100">
                  <span className="text-slate-500 font-bold">المدخول</span>
                  <span className="font-black text-[#257C86]">{stats.externalCourseRevenue.toLocaleString('fr-TN')} د.ت</span>
                </div>
              </div>
            </div>
          )}
          {stats.totalRevisionSessions > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="h-4 w-4 text-[#257C86]" />
                <h3 className="font-black text-slate-900 text-xs">حصص المراجعة</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500 font-bold">عدد الحصص</span>
                  <span className="font-black text-slate-900">{stats.totalRevisionSessions}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500 font-bold">إجمالي التلاميذ</span>
                  <span className="font-black text-slate-900">{stats.revisionStudentsCount}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-2 border-t border-slate-100">
                  <span className="text-slate-500 font-bold">حصة المركز</span>
                  <span className="font-black text-[#257C86]">{stats.revisionRevenue.toLocaleString('fr-TN')} د.ت</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Loading State */}
      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-gradient-to-r from-[#257C86]/5 to-[#257C86]/10 rounded-3xl p-8 border border-[#257C86]/20 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-[#257C86] animate-spin" />
          <p className="text-sm font-black text-[#257C86]">جاري تحليل البيانات بالذكاء الاصطناعي...</p>
          <p className="text-[11px] text-[#257C86]/70 font-bold">قد يستغرق هذا بضع ثوانٍ</p>
        </motion.div>
      )}

      {/* AI Error */}
      {error && (
        <div className="bg-red-50 rounded-2xl p-5 border border-red-200 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black text-red-800">تعذر التحليل</p>
            <p className="text-xs text-red-600 font-bold mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* AI Analysis Result */}
      {analysis && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 bg-gradient-to-r from-[#257C86] to-[#1d6169] text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <h3 className="font-black text-sm">تحليل الذكاء الاصطناعي — {periodLabel}</h3>
          </div>
          <div className="p-6 prose prose-sm max-w-none text-slate-800 leading-relaxed whitespace-pre-wrap text-xs font-bold" dir="rtl"
            dangerouslySetInnerHTML={{ __html: formatAnalysisMarkdown(analysis) }}
          />
          <div className="px-6 pb-4">
            <button
              onClick={() => {
                const blob = new Blob([analysis], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analysis-${schoolYear}-${period}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 transition"
            >
              <FileText className="h-3.5 w-3.5" />
              تحميل التحليل
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function formatAnalysisMarkdown(text: string): string {
  return text
    .replace(/### (.*?)\n/gi, '<h3 class="text-sm font-black text-slate-900 mt-4 mb-2">$1</h3>')
    .replace(/## (.*?)\n/gi, '<h2 class="text-base font-black text-slate-900 mt-6 mb-3 pb-2 border-b border-slate-200">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-slate-900">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\- (.*$)/gm, '<li class="mr-4">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc space-y-1 my-2">$&</ul>')
    .replace(/\n/g, '<br />');
}
