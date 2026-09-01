import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  GraduationCap, 
  BookOpen, 
  Clock, 
  BookMarked, 
  Utensils, 
  DollarSign, 
  Users, 
  Bus, 
  Menu, 
  X, 
  Sparkles,
  Settings as SettingsIcon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpenCheck,
  Loader2,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Award,
  CalendarCheck
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
  CenterSettings,
  ExternalStudentRegister,
  RevisionSeance,
  UserAccount,
  StudentTimeSheet,
  Formation,
  initialCenterSettings,
  initialStudentFeeSet,
  APP_SUBJECTS,
  getCurrentAcademicYear,
  normalizeSettings
} from './types';

import { 
  fetchDatabase, 
  saveDatabase, 
  saveStudents, 
  saveStaff, 
  saveSlots, 
  saveCourses, 
  saveSessions, 
  saveMealPlans, 
  saveExpenses, 
  saveTimesheets, 
  saveExternalStudents, 
  saveRevisionSeances, 
  saveStudentTimeSheets,
  saveFormations,
  saveSettings, 
  UnauthorizedError 
} from './api';
import { saveSessionUser, clearSessionUser, clearLocalSession } from './auth';

// Module Components
import Dashboard from './components/Dashboard';
import StudentRegistrationModule from './components/StudentRegistrationModule';
import SuiviScolaireModule from './components/SuiviScolaireModule';
import StudentTimeSheetModule from './components/StudentTimeSheetModule';
import TeenCenterModule from './components/TeenCenterModule';
import ExternalCoursesModule from './components/ExternalCoursesModule';
import SeanceRevisionModule from './components/SeanceRevisionModule';
import FormationModule from './components/FormationModule';
import LibraryModule from './components/LibraryModule';
import MealsModule from './components/MealsModule';
import FinanceModule from './components/FinanceModule';
import StaffManagementModule from './components/StaffManagementModule';
import DataAnalysisModule from './components/DataAnalysisModule';
import SettingsModule from './components/SettingsModule';
import BusDriverModule from './components/BusDriverModule';
import LoginScreen from './components/LoginScreen';
import ConfirmDialog from './components/ConfirmDialog';
import CloseConfirmDialog from './components/CloseConfirmDialog';
import { useToast } from './components/Toast';
import logo from './assets/logo.png';


export default function App() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // When switching between modules, reset the page scroll so every module
  // starts displayed from the top (scroll position must not carry over).
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [activeTab]);

  // Authentication State
  // Always start logged out so the app requires login on every launch.
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  // Clear any stale persisted session (user + token) so every launch needs login.
  useEffect(() => {
    clearLocalSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (user: UserAccount) => {
    setCurrentUser(user);
    saveSessionUser(user);
    // Always land on the dashboard after login, not the last visited module.
    setActiveTab('dashboard');
    setReloadKey(prev => prev + 1);
    toast.success(`مرحباً ${user.name}`);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    clearSessionUser();
    toast.info('تم تسجيل الخروج.');
  };

  const hideRestrictedModules = currentUser?.role === 'restricted_admin';

  useEffect(() => {
    if (hideRestrictedModules && (activeTab === 'module4' || activeTab === 'module4b' || activeTab === 'formations' || activeTab === 'module6')) {
      setActiveTab('module1');
    }
  }, [hideRestrictedModules, activeTab]);

  // Server-backed state (data lives in local SQLite via Express)
  const [students, setStudents] = useState<Student[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [slots, setSlots] = useState<TeenCenterSlot[]>([]);
  const [courses, setCourses] = useState<ExternalCourse[]>([]);
  const [sessions, setSessions] = useState<ExternalCourseSession[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlanDay[]>([]);
  const [expenses, setExpenses] = useState<CenterExpense[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [settings, setSettings] = useState<CenterSettings | null>(null);
  const [externalStudents, setExternalStudents] = useState<ExternalStudentRegister[]>([]);
  const [revisionSeances, setRevisionSeances] = useState<RevisionSeance[]>([]);
  const [studentTimeSheets, setStudentTimeSheets] = useState<StudentTimeSheet[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);

  // Import confirmation state
  const [importPendingData, setImportPendingData] = useState<Record<string, unknown> | null>(null);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  // Latest-known state mirrored in a ref so commits never read stale closures.
  const stateRef = useRef<{
    settings: CenterSettings | null;
    students: Student[]; staff: StaffMember[]; slots: TeenCenterSlot[];
    courses: ExternalCourse[]; sessions: ExternalCourseSession[]; mealPlans: MealPlanDay[];
    expenses: CenterExpense[]; timesheets: TimesheetEntry[]; externalStudents: ExternalStudentRegister[];
    revisionSeances: RevisionSeance[]; studentTimeSheets: StudentTimeSheet[];
    formations: Formation[];
  }>({ settings: null, students: [], staff: [], slots: [], courses: [], sessions: [], mealPlans: [], expenses: [], timesheets: [], externalStudents: [], revisionSeances: [], studentTimeSheets: [], formations: [] });

  // Serializes full-state PUTs so concurrent module updates never overwrite each other.
  const commitQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Load full state from the local API on mount or when logged in
  useEffect(() => {
    if (!currentUser) {
      setIsBootLoading(false);
      return;
    }

    let cancelled = false;
    setIsBootLoading(true);
    setBootError(null);
    fetchDatabase()
      .then((db) => {
        if (cancelled) return;
        stateRef.current = {
          settings: db.settings,
          students: db.students || [],
          staff: db.staff || [],
          slots: db.slots || [],
          courses: db.courses || [],
          sessions: db.sessions || [],
          mealPlans: db.mealPlans || [],
          expenses: db.expenses || [],
          timesheets: db.timesheets || [],
          externalStudents: db.externalStudents || [],
          revisionSeances: db.revisionSeances || [],
          studentTimeSheets: db.studentTimeSheets || [],
          formations: db.formations || []
        };
        setStudents(db.students || []);
        setStaff(db.staff || []);
        setSlots(db.slots || []);
        setCourses(db.courses || []);
        setSessions(db.sessions || []);
        setMealPlans(db.mealPlans || []);
        setExpenses(db.expenses || []);
        setTimesheets(db.timesheets || []);
        setExternalStudents(db.externalStudents || []);
        setRevisionSeances(db.revisionSeances || []);
        setStudentTimeSheets(db.studentTimeSheets || []);
        setFormations(db.formations || []);
        setSettings(db.settings);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          // Session expired or missing — send user back to login.
          setCurrentUser(null);
          clearLocalSession();
        } else {
          setBootError(err instanceof Error ? err.message : 'تعذر الاتصال بالخادم.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsBootLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.email, reloadKey]);

  // Helper queue for executing granular domain saves sequentially
  const commitDomain = (saveFn: () => Promise<void>) => {
    commitQueueRef.current = commitQueueRef.current
      .then(saveFn)
      .catch((err) => {
        if (err instanceof UnauthorizedError) {
          // Session expired mid-session — force re-login.
          setCurrentUser(null);
          clearLocalSession();
          toast.error('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.');
        } else {
          toast.error(err instanceof Error ? err.message : 'تعذر حفظ البيانات على الخادم.');
        }
      });
  };

  const handleUpdateSettings = (newSettings: CenterSettings) => {
    const normalized = normalizeSettings(newSettings);
    setSettings(normalized);
    stateRef.current.settings = normalized;
    commitDomain(() => saveSettings(normalized));
  };

  // Granular domain setters with server sync
  const handleUpdateStudents = (updated: Student[]) => {
    setStudents(updated);
    commitDomain(() => saveStudents(updated));
  };

  const handleUpdateSingleStudent = (updatedStudent: Student) => {
    const updatedList = students.map(s => s.id === updatedStudent.id ? updatedStudent : s);
    setStudents(updatedList);
    commitDomain(() => saveStudents(updatedList));
  };

  const handleUpdateStaff = (updated: StaffMember[]) => {
    setStaff(updated);
    commitDomain(() => saveStaff(updated));
  };

  const handleUpdateSlots = (updated: TeenCenterSlot[]) => {
    setSlots(updated);
    commitDomain(() => saveSlots(updated));
  };

  const handleUpdateCourses = (updated: ExternalCourse[]) => {
    setCourses(updated);
    commitDomain(() => saveCourses(updated));
  };

  const handleUpdateSessions = (updated: ExternalCourseSession[]) => {
    setSessions(updated);
    commitDomain(() => saveSessions(updated));
  };

  const handleUpdateMealPlans = (updated: MealPlanDay[]) => {
    setMealPlans(updated);
    commitDomain(() => saveMealPlans(updated));
  };

  const handleUpdateExpenses = (updated: CenterExpense[]) => {
    setExpenses(updated);
    commitDomain(() => saveExpenses(updated));
  };

  const handleUpdateTimesheets = (updated: TimesheetEntry[]) => {
    setTimesheets(updated);
    commitDomain(() => saveTimesheets(updated));
  };

  const handleUpdateExternalStudents = (updated: ExternalStudentRegister[]) => {
    setExternalStudents(updated);
    commitDomain(() => saveExternalStudents(updated));
  };

  const handleUpdateRevisionSeances = (updated: RevisionSeance[]) => {
    setRevisionSeances(updated);
    commitDomain(() => saveRevisionSeances(updated));
  };

  const handleUpdateStudentTimeSheets = (updated: StudentTimeSheet[]) => {
    setStudentTimeSheets(updated);
    commitDomain(() => saveStudentTimeSheets(updated));
  };

  const handleUpdateFormations = (updated: Formation[]) => {
    setFormations(updated);
    commitDomain(() => saveFormations(updated));
  };

  // Export database backup
  const handleExportDatabase = () => {
    const currentSettings: CenterSettings = settings || stateRef.current.settings || initialCenterSettings;
    const data = {
      settings: currentSettings,
      students: students.length > 0 ? students : (stateRef.current.students || []),
      staff: staff.length > 0 ? staff : (stateRef.current.staff || []),
      slots: slots.length > 0 ? slots : (stateRef.current.slots || []),
      courses: courses.length > 0 ? courses : (stateRef.current.courses || []),
      sessions: sessions.length > 0 ? sessions : (stateRef.current.sessions || []),
      mealPlans: mealPlans.length > 0 ? mealPlans : (stateRef.current.mealPlans || []),
      expenses: expenses.length > 0 ? expenses : (stateRef.current.expenses || []),
      timesheets: timesheets.length > 0 ? timesheets : (stateRef.current.timesheets || []),
      externalStudents: externalStudents.length > 0 ? externalStudents : (stateRef.current.externalStudents || []),
      revisionSeances: revisionSeances.length > 0 ? revisionSeances : (stateRef.current.revisionSeances || []),
      studentTimeSheets: studentTimeSheets.length > 0 ? studentTimeSheets : (stateRef.current.studentTimeSheets || []),
      formations: formations.length > 0 ? formations : (stateRef.current.formations || []),
      exportedAt: new Date().toISOString()
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `TeenCenter_Database_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  // Import database backup
  const VALID_COLLECTION_KEYS = [
    'students', 'staff', 'slots', 'courses', 'sessions', 'mealPlans',
    'expenses', 'timesheets', 'externalStudents', 'revisionSeances', 'studentTimeSheets', 'formations'
  ];
  const VALID_OBJECT_KEYS = ['settings'];

  const handleImportDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so re-importing the same file triggers onChange again
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);

        // --- Schema validation ------------------------------------------------
        if (!parsed || typeof parsed !== 'object') {
          toast.error('ملف غير صالح: المحتوى يجب أن يكون JSON.');
          return;
        }
        // Every present collection key must be an array
        const badKey = VALID_COLLECTION_KEYS.find(
          k => parsed[k] !== undefined && !Array.isArray(parsed[k])
        );
        if (badKey) {
          toast.error(`ملف غير صالح: "${badKey}" يجب أن يكون مصفوفة.`);
          return;
        }
        // settings must be an object if present
        if (parsed.settings !== undefined && (typeof parsed.settings !== 'object' || Array.isArray(parsed.settings))) {
          toast.error('ملف غير صالح: "settings" يجب أن يكون كائناً.');
          return;
        }
        // Check if file contains settings/fees in any valid format
        const hasSettingsData = !!(
          parsed.settings ||
          parsed.fees ||
          parsed.fraisAnnuelSuivi != null ||
          parsed.frais_annuel_suivi != null
        );

        // Must contain at least one collection or settings
        const hasSomeCollection = VALID_COLLECTION_KEYS.some(k => Array.isArray(parsed[k]));
        if (!hasSomeCollection && !hasSettingsData) {
          toast.error('ملف فارغ: لا توجد مجموعات بيانات صالحة.');
          return;
        }
        // --- Auto-backup current state before overwriting ----------------------
        try {
          const currentSettings = settings || stateRef.current.settings || initialCenterSettings;
          const backup = {
            students, staff, slots, courses, sessions, mealPlans, expenses, timesheets,
            externalStudents, revisionSeances, studentTimeSheets, settings: currentSettings,
            exportedAt: new Date().toISOString(),
            _note: 'Auto-backup before import'
          };
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `TeenCenter_AutoBackup_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch { /* backup is best-effort — don't block import */ }

        // --- Store parsed data and open confirmation dialog --------------------
        setImportPendingData(parsed);
        setIsImportConfirmOpen(true);
      } catch {
        toast.error('تعذر قراءة ملف الباك اب — تأكد من صيغة JSON.');
      }
    };
    reader.readAsText(file);
  };

  // Called after user confirms the import dialog
  const handleConfirmImport = () => {
    if (!importPendingData) return;
    const parsed = importPendingData;

    const next: Record<string, unknown> = {};
    for (const key of VALID_COLLECTION_KEYS) {
      if (Array.isArray(parsed[key])) next[key] = parsed[key];
    }

    // Validate shapes — reject malformed objects that would crash the app
    const validateArray = (arr: unknown[], requiredKeys: string[], label: string): boolean => {
      if (!Array.isArray(arr)) return false;
      for (let i = 0; i < arr.length; i++) {
        const obj = arr[i];
        if (!obj || typeof obj !== 'object') {
          toast.error(`بيانات غير صالحة في ${label} (صف ${i + 1}): يجب أن يكون كائناً.`);
          return false;
        }
        for (const key of requiredKeys) {
          if (!(key in obj)) {
            toast.error(`بيانات ناقصة في ${label} (صف ${i + 1}): الحقل "${key}" مفقود.`);
            return false;
          }
        }
      }
      return true;
    };

    if (next.students !== undefined) {
      if (!validateArray(next.students as unknown[], ['id', 'firstName', 'lastName'], 'الطلاب')) return;
      setStudents(next.students as Student[]);
    }
    if (next.staff !== undefined) {
      if (!validateArray(next.staff as unknown[], ['id', 'firstName', 'lastName', 'role'], 'الأطراف')) return;
      setStaff(next.staff as StaffMember[]);
    }
    if (next.slots !== undefined) {
      if (!validateArray(next.slots as unknown[], ['id', 'day'], 'الأقسام')) return;
      setSlots(next.slots as TeenCenterSlot[]);
    }
    if (next.courses !== undefined) {
      if (!validateArray(next.courses as unknown[], ['id'], 'الدروس')) return;
      setCourses(next.courses as ExternalCourse[]);
    }
    if (next.sessions !== undefined) {
      if (!validateArray(next.sessions as unknown[], ['id', 'date'], 'المحاضرات')) return;
      setSessions(next.sessions as ExternalCourseSession[]);
    }
    if (next.mealPlans !== undefined) {
      if (!validateArray(next.mealPlans as unknown[], ['date'], 'خطط الوجبات')) return;
      setMealPlans(next.mealPlans as MealPlanDay[]);
    }
    if (next.expenses !== undefined) {
      if (!validateArray(next.expenses as unknown[], ['id', 'date', 'category', 'amount'], 'المصاريف')) return;
      setExpenses(next.expenses as CenterExpense[]);
    }
    if (next.timesheets !== undefined) {
      if (!validateArray(next.timesheets as unknown[], ['date', 'staffId'], 'الحضور')) return;
      setTimesheets(next.timesheets as TimesheetEntry[]);
    }
    if (next.externalStudents !== undefined) {
      if (!validateArray(next.externalStudents as unknown[], ['id', 'name'], 'الطلاب الخارجيين')) return;
      setExternalStudents(next.externalStudents as ExternalStudentRegister[]);
    }
    if (next.revisionSeances !== undefined) {
      if (!validateArray(next.revisionSeances as unknown[], ['id', 'date'], 'محاضرات المراجعة')) return;
      setRevisionSeances(next.revisionSeances as RevisionSeance[]);
    }
    if (next.studentTimeSheets !== undefined) {
      if (!validateArray(next.studentTimeSheets as unknown[], ['id', 'establishmentName'], 'جداول التوقيت')) return;
      setStudentTimeSheets(next.studentTimeSheets as StudentTimeSheet[]);
    }
    if (next.formations !== undefined) {
      if (!validateArray(next.formations as unknown[], ['id', 'name'], 'التكوينات')) return;
      setFormations(next.formations as Formation[]);
    }

    // Extract settings/fees from parsed payload
    const rawSettings = parsed.settings || (parsed.fees ? { fees: parsed.fees, feesByYear: parsed.feesByYear } : null) || (parsed.fraisAnnuelSuivi != null || parsed.frais_annuel_suivi != null ? parsed : null);
    if (rawSettings) {
      const normalizedSettings = normalizeSettings(rawSettings, parsed.fees, parsed.feesByYear);
      next.settings = normalizedSettings;
      setSettings(normalizedSettings);
      stateRef.current.settings = normalizedSettings;
    }

    stateRef.current = {
      settings: next.settings !== undefined ? (next.settings as CenterSettings) : (settings || stateRef.current.settings),
      students: next.students !== undefined ? (next.students as Student[]) : students,
      staff: next.staff !== undefined ? (next.staff as StaffMember[]) : staff,
      slots: next.slots !== undefined ? (next.slots as TeenCenterSlot[]) : slots,
      courses: next.courses !== undefined ? (next.courses as ExternalCourse[]) : courses,
      sessions: next.sessions !== undefined ? (next.sessions as ExternalCourseSession[]) : sessions,
      mealPlans: next.mealPlans !== undefined ? (next.mealPlans as MealPlanDay[]) : mealPlans,
      expenses: next.expenses !== undefined ? (next.expenses as CenterExpense[]) : expenses,
      timesheets: next.timesheets !== undefined ? (next.timesheets as TimesheetEntry[]) : timesheets,
      externalStudents: next.externalStudents !== undefined ? (next.externalStudents as ExternalStudentRegister[]) : externalStudents,
      revisionSeances: next.revisionSeances !== undefined ? (next.revisionSeances as RevisionSeance[]) : revisionSeances,
      studentTimeSheets: next.studentTimeSheets !== undefined ? (next.studentTimeSheets as StudentTimeSheet[]) : studentTimeSheets,
      formations: next.formations !== undefined ? (next.formations as Formation[]) : formations
    };

    commitDomain(async () => {
      await saveDatabase(next as any);
      const freshDb = await fetchDatabase();
      setSettings(freshDb.settings);
      setStudents(freshDb.students || []);
      setStaff(freshDb.staff || []);
      setSlots(freshDb.slots || []);
      setCourses(freshDb.courses || []);
      setSessions(freshDb.sessions || []);
      setMealPlans(freshDb.mealPlans || []);
      setExpenses(freshDb.expenses || []);
      setTimesheets(freshDb.timesheets || []);
      setExternalStudents(freshDb.externalStudents || []);
      setRevisionSeances(freshDb.revisionSeances || []);
      setStudentTimeSheets(freshDb.studentTimeSheets || []);
      setFormations(freshDb.formations || []);
      stateRef.current = freshDb;
    });

    toast.success('تم استرجاع البيانات بنجاح!');

    setImportPendingData(null);
    setIsImportConfirmOpen(false);
  };

  if (!currentUser) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} />
        <CloseConfirmDialog />
      </>
    );
  }

  if (isBootLoading || !settings) {
    return (
      <>
        <div className="min-h-screen bg-[#FCFAF6] flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
          <div className="flex flex-col items-center gap-4">
            <span className="w-16 h-16 rounded-2xl bg-slate-100 p-1 shadow-md shadow-slate-900/10 overflow-hidden">
<img src={logo} alt={settings?.center_name || 'Academy System'} className="w-full h-full rounded-xl object-cover" />
            </span>
            <Loader2 className="h-6 w-6 text-[#257C86] animate-spin" />
            <p className="text-xs font-bold text-slate-500">جارٍ تحميل البيانات...</p>
          </div>
        </div>
        <CloseConfirmDialog />
      </>
    );
  }

  if (bootError) {
    return (
      <>
        <div className="min-h-screen bg-[#FCFAF6] flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
          <div className="max-w-sm w-full bg-white rounded-3xl border border-red-200 shadow-lg p-8 flex flex-col items-center gap-4 text-center">
            <span className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-red-500" />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900">تعذر تحميل البيانات</h2>
              <p className="text-xs text-slate-500 mt-1 font-bold">{bootError}</p>
            </div>
            <button
              onClick={() => setReloadKey(k => k + 1)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#257C86] hover:bg-[#1e626b] text-white text-xs font-extrabold rounded-2xl transition cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </button>
          </div>
        </div>
        <CloseConfirmDialog />
      </>
    );
  }

  const menuItems = [
    { id: 'dashboard', label: 'لوحة القيادة', icon: LayoutDashboard },
    { id: 'module1', label: 'تسجيل التلاميذ', icon: GraduationCap },
    { id: 'module2', label: 'المتابعة الدراسية', icon: BookOpen },
    !hideRestrictedModules && { id: 'studentTimeSheets', label: 'جداول التوقيت', icon: CalendarCheck },
    { id: 'module3', label: 'تأطير Étude', icon: Clock },
    !hideRestrictedModules && { id: 'module4', label: 'الدروس الخصوصية', icon: BookMarked },
    !hideRestrictedModules && { id: 'module4b', label: 'حصة مراجعة', icon: BookOpenCheck },
    !hideRestrictedModules && { id: 'formations', label: 'التكوينات والدورات', icon: Award },
    { id: 'module5', label: 'المكتبة', icon: BookOpen },
    !hideRestrictedModules && { id: 'module6', label: 'إدارة الوجبات', icon: Utensils },
    { id: 'moduleBus', label: 'خطة الحافلة', icon: Bus },
    { id: 'module8', label: 'إدارة الموظفين', icon: Users },
    { id: 'module7', label: 'المنظومة المالية', icon: DollarSign },
    { id: 'dataAnalysis', label: 'تحليل البيانات', icon: BarChart3 },
    { id: 'settings', label: 'الإعدادات', icon: SettingsIcon },
  ].filter(Boolean) as { id: string; label: string; icon: any }[];

  return (
    <div className="min-h-screen bg-[#FCFAF6] flex flex-col md:flex-row font-sans text-slate-800" style={{ direction: 'rtl' }}>
      
      {/* MOBILE HEADER */}
      <header className="md:hidden bg-white border-b border-[#257C86]/20 text-slate-900 p-4 flex justify-between items-center shadow-xs no-print">
        <div className="flex items-center gap-2">
          <span className="w-10 h-10 rounded-xl bg-slate-100 p-0.5 shadow-md shadow-slate-900/10 shrink-0 overflow-hidden">
            <img src={logo} alt={settings?.center_name || 'Academy System'} className="w-full h-full rounded-lg object-cover" />
          </span>
          <div>
            <h1 className="font-black text-sm text-slate-900">{settings?.center_name || 'Academy System'}</h1>
            <span className="text-[10px] text-[#257C86] font-bold block">{currentUser.email}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="px-2.5 py-1 bg-red-50 text-red-700 rounded-lg text-[11px] font-black cursor-pointer border border-red-200"
          >
            خروج
          </button>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 bg-[#257C86]/10 text-[#257C86] rounded-lg cursor-pointer"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* MOBILE MENU DRAWER */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden absolute top-[72px] right-0 left-0 bg-white border-b border-[#257C86]/20 z-40 p-4 space-y-2 shadow-xl no-print"
          >
            {menuItems.map((item) => {
              const IconComp = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition text-right cursor-pointer ${
                    activeTab === item.id 
                      ? 'bg-[#257C86] text-white' 
                      : 'text-slate-600 hover:bg-[#257C86]/10'
                  }`}
                >
                  <IconComp className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* DESKTOP SIDEBAR */}
      <aside className={`hidden md:flex flex-col justify-between bg-white text-slate-800 min-h-screen p-3 xl:p-4 border-l border-[#257C86]/20 shadow-xs shrink-0 no-print transition-all duration-300 ${sidebarCollapsed ? 'w-16 xl:w-20' : 'w-60 xl:w-72'}`}>
        <div className="space-y-3">

          {/* Logo Brand */}
          <div className="flex items-center justify-between gap-1 px-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`rounded-2xl bg-slate-100 p-1 shadow-md shadow-slate-900/15 shrink-0 overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'w-8 h-8' : 'w-12 h-12'}`}>
<img src={logo} alt="Academy System" className="w-full h-full rounded-xl object-cover" />
              </span>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <h1 className="font-black text-base text-slate-950 leading-tight truncate">System Academy</h1>
                  <span className="text-[11px] text-[#257C86] font-bold block truncate">الإدارة والتأطير</span>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="طيّ القائمة"
                className="p-1.5 text-slate-400 hover:text-[#257C86] hover:bg-[#257C86]/10 rounded-lg transition cursor-pointer shrink-0"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </div>

          {sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              title="توسيع القائمة"
              className="w-full flex items-center justify-center p-1.5 text-slate-400 hover:text-[#257C86] hover:bg-[#257C86]/10 rounded-lg transition cursor-pointer"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}

          {/* Navigation Items */}
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const IconComp = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-bold transition text-right cursor-pointer relative ${
                    sidebarCollapsed ? 'justify-center px-0' : ''
                  } ${
                    active 
                      ? 'bg-[#257C86] text-white shadow-md shadow-[#257C86]/25' 
                      : 'text-slate-600 hover:bg-[#257C86]/10 hover:text-[#257C86]'
                  }`}
                >
                  <IconComp className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                  {!sidebarCollapsed && item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Sessions + Logout */}
        <div className="space-y-1 pt-3 border-t border-slate-200/70 text-xs">

          {!sidebarCollapsed && (
            <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase block px-1 mb-1.5">Sessions</span>
          )}

          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-[#8DC760] shadow-sm shadow-[#8DC760]/60 shrink-0 animate-pulse"></span>
              <span className="text-xs font-bold text-slate-700">Administrateur</span>
            </div>
          )}

          <button
            onClick={handleLogout}
            title="Déconnexion"
            className={`w-full flex items-center gap-2 px-3 py-2 bg-[#257C86]/10 hover:bg-[#257C86]/20 border border-[#257C86]/20 hover:border-[#257C86]/40 text-[#257C86] hover:text-[#1d6169] text-[11px] font-extrabold transition cursor-pointer group rounded-xl ${
              sidebarCollapsed ? 'justify-center px-0' : ''
            }`}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0 group-hover:translate-x-[-2px] transition-transform" />
            {!sidebarCollapsed && <span>Déconnexion</span>}
          </button>

          {!sidebarCollapsed && (
            <p className="text-[10px] text-slate-300 text-center font-bold pt-1">Academy System © 2026</p>
          )}
        </div>
      </aside>

      {/* CORE CANVAS */}
      <main ref={mainRef} className="min-w-0 flex-1 p-4 md:p-5 xl:p-8 overflow-y-auto max-h-screen">
        <div className="max-w-7xl mx-auto">
          
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.12 }}
            >
              {activeTab === 'dashboard' && (
                <Dashboard 
                  staff={staff}
                  students={students}
                  setActiveTab={setActiveTab}
                  openAddStudent={() => setActiveTab('module1')}
                  openAddStaff={() => setActiveTab('module8')}
                  hideRestrictedModules={hideRestrictedModules}
                />
              )}

              {activeTab === 'module1' && (
                <StudentRegistrationModule 
                  students={students}
                  settings={settings}
                  onAddStudent={(newStData) => {
                    const newSt: Student = {
                      ...newStData,
                      id: 'st_' + crypto.randomUUID()
                    };
                    handleUpdateStudents([...students, newSt]);
                  }}
                  onUpdateStudent={handleUpdateSingleStudent}
                  onDeleteStudent={(id) => handleUpdateStudents(students.filter(s => s.id !== id))}
                  hideRestrictedModules={hideRestrictedModules}
                  sidebarCollapsed={sidebarCollapsed}
                />
              )}

              {activeTab === 'module2' && (
                <SuiviScolaireModule 
                  students={students}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onUpdateStudent={handleUpdateSingleStudent}
                  onUpdateStudents={handleUpdateStudents}
                  studentTimeSheets={studentTimeSheets}
                />
              )}

              {activeTab === 'studentTimeSheets' && !hideRestrictedModules && (
                <StudentTimeSheetModule
                  students={students}
                  studentTimeSheets={studentTimeSheets}
                  onUpdateStudentTimeSheets={handleUpdateStudentTimeSheets}
                  onUpdateStudent={handleUpdateSingleStudent}
                  onUpdateStudents={handleUpdateStudents}
                />
              )}

              {activeTab === 'module3' && (
                <TeenCenterModule 
                  students={students}
                  staff={staff}
                  slots={slots}
                  timesheets={timesheets}
                  settings={settings}
                  sidebarCollapsed={sidebarCollapsed}
                  onUpdateSlots={handleUpdateSlots}
                  onUpdateTimesheets={handleUpdateTimesheets}
                  onUpdateStudent={handleUpdateSingleStudent}
                />
              )}

              {activeTab === 'module4' && !hideRestrictedModules && (
                <ExternalCoursesModule 
                  students={students}
                  courses={courses}
                  sessions={sessions}
                  settings={settings}
                  sidebarCollapsed={sidebarCollapsed}
                  onUpdateSettings={handleUpdateSettings}
                  externalStudents={externalStudents}
                  onUpdateExternalStudents={handleUpdateExternalStudents}
                  onUpdateCourses={handleUpdateCourses}
                  onUpdateSessions={handleUpdateSessions}
                />
              )}

              {activeTab === 'module4b' && !hideRestrictedModules && (
                <SeanceRevisionModule
                  revisions={revisionSeances}
                  onUpdateRevisions={handleUpdateRevisionSeances}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  sidebarCollapsed={sidebarCollapsed}
                />
              )}

              {activeTab === 'formations' && !hideRestrictedModules && (
                <FormationModule
                  formations={formations}
                  onUpdateFormations={handleUpdateFormations}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  sidebarCollapsed={sidebarCollapsed}
                />
              )}

              {activeTab === 'module5' && (
                <LibraryModule 
                  students={students}
                  settings={settings}
                  onUpdateStudent={handleUpdateSingleStudent}
                  studentTimeSheets={studentTimeSheets}
                />
              )}

              {activeTab === 'module6' && !hideRestrictedModules && (
                <MealsModule 
                  students={students}
                  mealPlans={mealPlans}
                  settings={settings}
                  onUpdateStudents={handleUpdateStudents}
                  onUpdateMealPlans={handleUpdateMealPlans}
                />
              )}

              {activeTab === 'moduleBus' && (
                <BusDriverModule
                  students={students}
                  staff={staff}
                  slots={slots}
                  studentTimeSheets={studentTimeSheets}
                  settings={settings}
                  sidebarCollapsed={sidebarCollapsed}
                />
              )}

              {activeTab === 'module7' && (
                <FinanceModule 
                  students={students}
                  expenses={expenses}
                  onUpdateExpenses={handleUpdateExpenses}
                  onUpdateStudent={handleUpdateSingleStudent}
                  externalStudents={externalStudents}
                  courses={courses}
                  revisions={revisionSeances}
                  formations={formations}
                  onUpdateFormations={handleUpdateFormations}
                  slots={slots}
                  hideRestrictedModules={hideRestrictedModules}
                  settings={settings}
                />
              )}

              {activeTab === 'module8' && (
                <StaffManagementModule 
                  staff={staff}
                  slots={slots}
                  timesheets={timesheets}
                  settings={settings}
                  expenses={expenses}
                  onUpdateExpenses={handleUpdateExpenses}
                  onUpdateSettings={handleUpdateSettings}
                  onUpdateStaff={handleUpdateStaff}
                  onUpdateTimesheets={handleUpdateTimesheets}
                />
              )}

              {activeTab === 'dataAnalysis' && (
                <DataAnalysisModule
                  students={students}
                  staff={staff}
                  slots={slots}
                  courses={courses}
                  sessions={sessions}
                  mealPlans={mealPlans}
                  expenses={expenses}
                  timesheets={timesheets}
                  revisionSeances={revisionSeances}
                  externalStudents={externalStudents}
                  formations={formations}
                  settings={settings}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsModule
                  key={`settings_${reloadKey}_${settings?.centerName || ''}_${JSON.stringify(settings?.fees || {})}`}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  hideRestrictedModules={hideRestrictedModules}
                  currentUserEmail={currentUser.email}
                  onExportDatabase={handleExportDatabase}
                  onImportDatabase={handleImportDatabase}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Import confirmation dialog */}
          <ConfirmDialog
            open={isImportConfirmOpen}
            title="تأكيد استرجاع الباك اب"
            danger={true}
            confirmLabel="نعم، استرجاع"
            cancelLabel="إلغاء"
            message={
              <span>
                سيتم <strong>استبدال جميع البيانات الحالية</strong> بمحتوى ملف الباك اب.
                <br /><br />
                <span className="text-[#257C86] font-black">✓</span> تم إنشاء نسخة احتياطية تلقائية من البيانات الحالية قبل الاسترجاع.
              </span>
            }
            onConfirm={handleConfirmImport}
            onCancel={() => { setIsImportConfirmOpen(false); setImportPendingData(null); }}
          />

          <CloseConfirmDialog />

        </div>
      </main>

    </div>
  );
}
