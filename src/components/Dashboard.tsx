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
  Sparkles,
  CalendarClock,
  BookOpenCheck,
  Award,
  Bus
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
  /** 'jardin' | 'formation' — drives the time-sheet module naming. */
  centerType?: string;
  /** SaaS gating: returns false when the tab's module is not enabled for this center. */
  isModuleAllowed?: (tabId: string) => boolean;
}

export default function Dashboard({ staff, students, setActiveTab, openAddStudent, openAddStaff, hideRestrictedModules, settings, centerType, isModuleAllowed }: DashboardProps) {
  // SaaS module gating (default: everything allowed).
  const allowed = (tab: string) => (isModuleAllowed ? isModuleAllowed(tab) : true);
  const totalStaff = staff.length;
  const totalStudents = students.length;

  // ── Quick-access catalog: ONLY the modules enabled in the center's plan ──
  const RESTRICTED_TABS = ['module4', 'module4b', 'formations', 'module6'];
  const QUICK_MODULES: { tab: string; title: string; desc: string; icon: any; tile: string }[] = [
    { tab: 'module1', title: "Fiche d'inscription élève", desc: 'بطاقة التسجيل والأولياء', icon: UserPlus, tile: 'bg-[#257C86]/10 text-[#257C86]' },
    { tab: 'module2', title: 'Suivi Scolaire', desc: 'الدراسة والمدفوعات', icon: BookOpen, tile: 'bg-emerald-50 text-emerald-600' },
    { tab: 'studentTimeSheets', title: centerType === 'jardin' ? 'Pointage Élèves' : 'Jd. Horaires', desc: centerType === 'jardin' ? 'تسجيل حضور وخروج التلاميذ' : 'جداول التوقيت الأسبوعية', icon: CalendarClock, tile: 'bg-[#257C86]/10 text-[#257C86]' },
    { tab: 'module3', title: `Étude ${settings?.centerName || 'المركز'}`, desc: 'الخانات الزمنية والتايم شيت', icon: Clock, tile: 'bg-[#257C86]/10 text-[#257C86]' },
    { tab: 'module4', title: `Études Hors ${settings?.centerName || 'المركز'}`, desc: 'الكورسات الخاصة', icon: BookMarked, tile: 'bg-slate-100 text-slate-500' },
    { tab: 'module4b', title: 'Séance de Révision', desc: 'حصص المراجعة', icon: BookOpenCheck, tile: 'bg-emerald-50 text-emerald-600' },
    { tab: 'formations', title: 'Formations & Cours', desc: 'التكوينات والدورات', icon: Award, tile: 'bg-[#257C86]/10 text-[#257C86]' },
    { tab: 'module5', title: 'Bibliothèque', desc: 'مكتبة المطالعة', icon: Library, tile: 'bg-emerald-50 text-emerald-600' },
    { tab: 'module6', title: 'Gestion des Repas', desc: 'وجبة اليوم وتعويض الإلغاء', icon: Utensils, tile: 'bg-[#257C86]/10 text-[#257C86]' },
    { tab: 'moduleBus', title: 'Plan de Bus', desc: 'خطة الحافلة والتوصيل', icon: Bus, tile: 'bg-slate-100 text-slate-500' },
    { tab: 'module7', title: 'Module Financier', desc: 'المصاريف STEG/SONEDE والمقبوضات', icon: DollarSign, tile: 'bg-emerald-50 text-emerald-600' },
    { tab: 'module8', title: 'Gestion du Personnel', desc: 'بطاقات المعلمين وكشوفات الرواتب', icon: Users, tile: 'bg-slate-100 text-slate-500' }
  ];
  const quickModules = QUICK_MODULES.filter(m =>
    allowed(m.tab) && !(hideRestrictedModules && RESTRICTED_TABS.includes(m.tab))
  );
  const moduleCount = quickModules.length;

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
      <div className="relative overflow-hidden bg-[#257C86] text-white rounded-3xl p-8 shadow-lg shadow-[#257C86]/25 border border-white/20">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-[#257C86] rounded-full opacity-5 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-emerald-300 rounded-full opacity-15 blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <span className="text-white/90 font-extrabold text-xs bg-white/10 px-3 py-1 rounded-full border border-white/25">منظومة {settings?.centerName || 'المركز'}</span>
            <h1 className="text-3xl md:text-4xl font-black mt-3">{settings?.centerName || 'المركز'}</h1>
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

        {/* Total Staff — uniquement si le module Personnel est au plan */}
        {allowed('module8') && (
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 flex items-center justify-between"
        >
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 block">المعلمون والطاقم</span>
            <span className="text-3xl font-black text-slate-900 block">{totalStaff} <span className="text-xs text-slate-400 font-normal">إطار</span></span>
            <button 
              onClick={() => setActiveTab('module8')}
              className="text-xs font-bold text-[#257C86] hover:text-[#1e626b] transition flex items-center gap-1 cursor-pointer"
            >
              إدارة الموظفين <span>←</span>
            </button>
          </div>
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Users className="h-7 w-7" />
          </div>
        </motion.div>
        )}

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

      {/* Quick Access — only the modules in the center plan */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-4">
        <h3 className="text-lg font-black text-slate-900">الانتقال السريع إلى {moduleCount} موديولات</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickModules.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.tab}
                onClick={() => setActiveTab(m.tab)}
                className="p-4 rounded-2xl border border-slate-200/70 bg-white hover:border-[#257C86]/40 hover:bg-[#257C86]/[0.04] hover:shadow-md hover:shadow-slate-900/5 transition text-right cursor-pointer"
              >
                <div className={`w-10 h-10 ${m.tile} rounded-xl flex items-center justify-center`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="font-extrabold text-slate-900 text-sm mt-2">{m.title}</h4>
                <p className="text-[11px] text-slate-500 mt-1">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
