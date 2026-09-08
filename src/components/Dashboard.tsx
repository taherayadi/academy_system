import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  GraduationCap, 
  DollarSign, 
  BookOpen, 
  Clock, 
  Utensils, 
  CalendarDays,
  FileText,
  UserPlus,
  BookMarked,
  Library,
  Sparkles
} from 'lucide-react';
import { StaffMember, Student, ACADEMIC_MONTHS, CenterSettings } from '../types';

interface DashboardProps {
  staff: StaffMember[];
  students: Student[];
  setActiveTab: (tab: string) => void;
  openAddStudent: () => void;
  openAddStaff: () => void;
  hideRestrictedModules?: boolean;
  settings?: CenterSettings;
  /** SaaS gating: returns false when the tab's module is not enabled for this center. */
  isModuleAllowed?: (tabId: string) => boolean;
}

export default function Dashboard({ staff, students, setActiveTab, openAddStudent, openAddStaff, hideRestrictedModules, settings, isModuleAllowed }: DashboardProps) {
  // SaaS module gating (default: everything allowed).
  const allowed = (tab: string) => (isModuleAllowed ? isModuleAllowed(tab) : true);
  const totalStaff = staff.length;
  const totalStudents = students.length;
  const QUICK_MODULE_TABS = ['module1', 'module2', 'module3', 'module4', 'module5', 'module6', 'module7', 'module8'];
  const moduleCount = QUICK_MODULE_TABS.filter(t => {
    if ((t === 'module4' || t === 'module6') && hideRestrictedModules) return false;
    return allowed(t);
  }).length;

  const finances = useMemo(() => {
    let collected = 0;
    students.forEach(s => {
      (s.payments || []).forEach(p => {
        if (hideRestrictedModules && (p.service === 'Repas' || p.service === 'Cours Particuliers' || p.service === 'Revision')) return;
        collected += p.amountPaid || 0;
      });
    });
    return collected;
  }, [students, hideRestrictedModules]);

  // Group students by grade
  const studentsByGrade = useMemo(() => {
    const counts: Record<string, number> = {};
    students.forEach(s => {
      const g = s.grade || 'غير محدد';
      counts[g] = (counts[g] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [students]);

  return (
    <div className="space-y-8" dir="rtl">
      
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white rounded-3xl p-8 shadow-lg shadow-[#257C86]/25 border border-white/20">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-[#257C86] rounded-full opacity-5 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-emerald-300 rounded-full opacity-15 blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <span className="text-teal-50 font-extrabold text-xs uppercase tracking-widest bg-white/10 px-3 py-1 rounded-full border border-white/25">منظومة {settings?.centerName || 'المركز'}</span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-3">{settings?.centerName || 'المركز'}</h1>
            <p className="mt-2 text-slate-300 text-base max-w-xl font-light leading-relaxed">
              مرحباً بك في لوحة قيادة {settings?.centerName || 'المركز'} الذكية لإدارة الدراسة والمدفوعات والحصص والمكتبة والمطعم.
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center min-w-[210px] shadow-lg">
            <CalendarDays className="h-6 w-6 text-emerald-300 mx-auto mb-1" />
            <span className="block text-[11px] text-slate-400">تاريخ اليوم</span>
            <span className="block text-xl font-black text-emerald-200 mt-1">
              {new Date().toLocaleDateString('ar-TN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total Students */}
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 flex items-center justify-between"
        >
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 block">التلاميذ المسجلون</span>
            <span className="text-3xl font-black text-slate-900 block">{totalStudents} <span className="text-xs text-slate-400 font-normal">تلميذ</span></span>
            {allowed('module1') && (
            <button 
              onClick={() => setActiveTab('module1')}
              className="text-xs font-bold text-[#257C86] hover:text-[#1e626b] transition flex items-center gap-1 cursor-pointer"
            >
              عرض التسجيلات <span>←</span>
            </button>
            )}
          </div>
          <div className="p-4 bg-[#257C86]/10 text-[#257C86] rounded-2xl">
            <GraduationCap className="h-7 w-7" />
          </div>
        </motion.div>

        {/* Total Staff */}
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 flex items-center justify-between"
        >
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 block">المعلمون والطاقم</span>
            <span className="text-3xl font-black text-slate-900 block">{totalStaff} <span className="text-xs text-slate-400 font-normal">إطار</span></span>
            {allowed('module8') && (
            <button 
              onClick={() => setActiveTab('module8')}
              className="text-xs font-bold text-[#257C86] hover:text-[#1e626b] transition flex items-center gap-1 cursor-pointer"
            >
              إدارة الموظفين <span>←</span>
            </button>
            )}
          </div>
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Users className="h-7 w-7" />
          </div>
        </motion.div>

        {/* Total Revenues */}
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 flex items-center justify-between"
        >
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 block">مجموع المقبوضات</span>
            <span className="text-xl font-black text-emerald-700 block whitespace-nowrap font-mono">{finances.toLocaleString()} د.ت</span>
            {allowed('module7') && (
            <button 
              onClick={() => setActiveTab('module7')}
              className="text-xs font-bold text-[#257C86] hover:text-[#1e626b] transition flex items-center gap-1 cursor-pointer"
            >
              التقرير المالي <span>←</span>
            </button>
            )}
          </div>
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <DollarSign className="h-7 w-7" />
          </div>
        </motion.div>

        {/* Modules count */}
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 flex items-center justify-between"
        >
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 block">الوحدات والموديولات</span>
            <span className="text-3xl font-black text-slate-900 block">{moduleCount} وحدات</span>
            <span className="text-[10px] text-slate-400 font-bold block">متابعة شاملة 100%</span>
          </div>
          <div className="p-4 bg-slate-100 text-slate-500 rounded-2xl">
            <BookOpen className="h-7 w-7" />
          </div>
        </motion.div>
      </div>

      {/* Quick Access to the 8 Modules */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-4">
        <h3 className="text-lg font-black text-slate-900">الانتقال السريع إلى {moduleCount} موديولات</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {allowed('module1') && (
          <button 
            onClick={() => setActiveTab('module1')}
            className="p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-[#257C86]/40 hover:bg-[#257C86]/[0.04] hover:shadow-md hover:shadow-slate-900/5 transition text-right cursor-pointer"
          >
            <div className="w-10 h-10 bg-[#257C86]/10 text-[#257C86] rounded-xl flex items-center justify-center">
              <UserPlus className="h-5 w-5" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm mt-2">Fiche d'inscription élève</h4>
            <p className="text-[11px] text-slate-500 mt-1">بطاقة التسجيل والأولياء</p>
          </button>
          )}

          {allowed('module2') && (
          <button 
            onClick={() => setActiveTab('module2')}
            className="p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-[#257C86]/40 hover:bg-[#257C86]/[0.04] hover:shadow-md hover:shadow-slate-900/5 transition text-right cursor-pointer"
          >
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <BookOpen className="h-5 w-5" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm mt-2">Suivi Scolaire Lycée/Collège</h4>
            <p className="text-[11px] text-slate-500 mt-1">الدراسة والمدفوعات</p>
          </button>
          )}

          {allowed('module3') && (
          <button 
            onClick={() => setActiveTab('module3')}
            className="p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-[#257C86]/40 hover:bg-[#257C86]/[0.04] hover:shadow-md hover:shadow-slate-900/5 transition text-right cursor-pointer"
          >
            <div className="w-10 h-10 bg-[#257C86]/10 text-[#257C86] rounded-xl flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm mt-2">Étude {settings?.centerName || 'المركز'}</h4>
            <p className="text-[11px] text-slate-500 mt-1">الخانات الزمنية والتايم شيت</p>
          </button>
          )}

          {!hideRestrictedModules && allowed('module4') && (
            <button 
              onClick={() => setActiveTab('module4')}
              className="p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-[#257C86]/40 hover:bg-[#257C86]/[0.04] hover:shadow-md hover:shadow-slate-900/5 transition text-right cursor-pointer"
            >
              <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center">
                <BookMarked className="h-5 w-5" />
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm mt-2">Études Hors {settings?.centerName || 'المركز'}</h4>
              <p className="text-[11px] text-slate-500 mt-1">الكورسات الخاصة</p>
            </button>
          )}

          {allowed('module5') && (
          <button 
            onClick={() => setActiveTab('module5')}
            className="p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-[#257C86]/40 hover:bg-[#257C86]/[0.04] hover:shadow-md hover:shadow-slate-900/5 transition text-right cursor-pointer"
          >
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <Library className="h-5 w-5" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm mt-2">Bibliothèque</h4>
            <p className="text-[11px] text-slate-500 mt-1">مكتبة المطالعة</p>
          </button>
          )}

          {!hideRestrictedModules && allowed('module6') && (
            <button 
              onClick={() => setActiveTab('module6')}
              className="p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-[#257C86]/40 hover:bg-[#257C86]/[0.04] hover:shadow-md hover:shadow-slate-900/5 transition text-right cursor-pointer"
            >
              <div className="w-10 h-10 bg-[#257C86]/10 text-[#257C86] rounded-xl flex items-center justify-center">
                <Utensils className="h-5 w-5" />
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm mt-2">Gestion des Repas</h4>
              <p className="text-[11px] text-slate-500 mt-1">وجبة اليوم وتعويض الإلغاء</p>
            </button>
          )}

          {allowed('module7') && (
          <button 
            onClick={() => setActiveTab('module7')}
            className="p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-[#257C86]/40 hover:bg-[#257C86]/[0.04] hover:shadow-md hover:shadow-slate-900/5 transition text-right cursor-pointer"
          >
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <DollarSign className="h-5 w-5" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm mt-2">Module Financier</h4>
            <p className="text-[11px] text-slate-500 mt-1">المصاريف STEG/SONEDE والمقبوضات</p>
          </button>
          )}

          {allowed('module8') && (
          <button 
            onClick={() => setActiveTab('module8')}
            className="p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-[#257C86]/40 hover:bg-[#257C86]/[0.04] hover:shadow-md hover:shadow-slate-900/5 transition text-right cursor-pointer"
          >
            <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm mt-2">Gestion du Personnel</h4>
            <p className="text-[11px] text-slate-500 mt-1">بطاقات المعلمين وكشوفات الرواتب</p>
          </button>
          )}
        </div>
      </div>

    </div>
  );
}
