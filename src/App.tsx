import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Award,
  CalendarCheck,
  ShieldCheck,
  Building2,
  Inbox,
  Tags,
  ImagePlus
} from 'lucide-react';

import { 
  Student, 
  StaffMember, 
  EtudeSlot,
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
  StudentAttendanceRecord,
  Formation,
  CenterTenant,
  MealForfaitClosure,
  initialCenterSettings,
  initialStudentFeeSet,
  APP_SUBJECTS,
  getCurrentAcademicYear,
  normalizeSettings,
  normalizePaymentService
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
  saveStudentAttendanceApi,
  fetchStudentAttendanceApi,
  saveFormations,
  saveMealForfaitClosures,
  fetchMealForfaitClosures,
  saveSettings,
  createStudentApi,
  updateStudentApi,
  deleteStudentApi,
  createStaffApi,
  updateStaffApi,
  deleteStaffApi,
  createExpenseApi,
  deleteExpenseApi,
  fetchCentersApi,
  fetchRenewalRequestsApi,
  UnauthorizedError 
} from './api';
import { saveSessionUser, clearSessionUser, clearLocalSession } from './auth';

// Module Components
import Dashboard from './components/Dashboard';
import RenewalModule from './components/RenewalModule';
import SubscriptionStatusCard from './components/SubscriptionStatusCard';
import StudentRegistrationModule from './components/StudentRegistrationModule';
import SuiviScolaireModule from './components/SuiviScolaireModule';
import StudentTimeSheetModule from './components/StudentTimeSheetModule';
import EtudeModule from './components/EtudeModule';
import ExternalCoursesModule from './components/ExternalCoursesModule';
import SeanceRevisionModule from './components/SeanceRevisionModule';
import FormationModule from './components/FormationModule';
import LibraryModule from './components/LibraryModule';
import MealsModule from './components/MealsModule';
import FinanceModule from './components/FinanceModule';
import StaffManagementModule from './components/StaffManagementModule';
import SettingsModule from './components/SettingsModule';
import BusDriverModule from './components/BusDriverModule';
import LoginScreen from './components/LoginScreen';
import LandingPage from './components/LandingPage';
import AdvertisementCarousel from './components/AdvertisementCarousel';
import AdvertisementInterstitial from './components/AdvertisementInterstitial';
import PlatformAdminDashboard from './components/PlatformAdminDashboard';
import ConfirmDialog from './components/ConfirmDialog';
import CloseConfirmDialog from './components/CloseConfirmDialog';
import { useToast } from './components/Toast';
import { useLiveSync, subscriptionSnapshot, LIVE_SYNC_INTERVAL_MS, LIVE_SYNC_FAST_INTERVAL_MS } from './hooks/useLiveSync';
import { usePubNubSync } from './hooks/usePubNubSync';
import brandIcon from './assets/icon.png';


// Map sidebar tabs to SaaS module keys. A center admin only sees the tabs whose
// module is enabled for their center (centers.enabled_modules, chosen by the
// platform admin when creating the center or editing its modules).
const TAB_MODULE: Record<string, string> = {
  module1: 'scolaire',            // تسجيل التلاميذ
  module2: 'scolaire',            // المتابعة الدراسية
  studentTimeSheets: 'studentTimeSheets', // جداول التوقيت (Jd. Horaires)
  module3: 'etude',               // تأطير Étude
  module4: 'coursParticuliers',   // الدروس الخصوصية
  module4b: 'revision',           // حصة مراجعة
  formations: 'formations',       // التكوينات والدورات
  module5: 'bibliotheque',        // المكتبة
  module6: 'cantine',             // إدارة الوجبات
  moduleBus: 'transport',         // خطة الحافلة
  module7: 'finance',             // المنظومة المالية
  module8: 'staff'                // إدارة الموظفين
};

// Bibliothèque désactivée pour l'instant : masquée du menu centre.
// (Remettre à true pour réactiver le module.)
const LIBRARY_ENABLED = false;

export default function App() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
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
  const [currentCenter, setCurrentCenter] = useState<CenterTenant | null>(null);
  const [authView, setAuthView] = useState<'landing' | 'login'>('landing');

  const isPlatformSuperAdmin = currentUser?.role === 'platform_super_admin';

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  // Clear any stale persisted session (user + token) so every launch needs login.
  useEffect(() => {
    clearLocalSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (user: UserAccount, center?: CenterTenant | null) => {
    setCurrentUser(user);
    if (center) setCurrentCenter(center);
    saveSessionUser(user);
    // Platform super admin lands on the platform admin dashboard, center admins land on the center dashboard.
    setActiveTab(user.role === 'platform_super_admin' ? 'platformAdmin' : 'dashboard');
    setReloadKey(prev => prev + 1);
    toast.success(`مرحباً ${user.name}`);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentCenter(null);
    clearSessionUser();
    setAuthView('landing');
    toast.info('تم تسجيل الخروج.');
  };

  // ── Live subscription sync (center sessions) ──
  // The platform may accept a renewal / plan-change request at any moment.
  // PubNub pushes "refetch" signals onto `center.{centerId}`; this SAME
  // handler serves both the realtime path and the polling fallback
  // (useLiveSync) used whenever PubNub is unavailable — the pushed payload is
  // never trusted, only freshly fetched state is compared and applied.
  const centerBaselineRef = useRef<string | null>(null);
  // Fast cadence while one of the center's requests is still pending, so a
  // platform decision lands within seconds; slow cadence otherwise.
  const [centerSyncFast, setCenterSyncFast] = useState(false);
  useEffect(() => {
    // New session (or logout): forget the previous baseline.
    centerBaselineRef.current = null;
    setCenterSyncFast(false);
  }, [currentUser?.email]);
  const syncCenterSubscription = useCallback(async () => {
    if (!currentUser || isPlatformSuperAdmin) return;
    try {
      const [centers, renewal] = await Promise.all([fetchCentersApi(), fetchRenewalRequestsApi()]);
      const fresh = (centers || [])[0] ?? null;
      if (!fresh) return;
      setCenterSyncFast((renewal.requests || []).some(r => r.status === 'pending'));
      const snap = subscriptionSnapshot(fresh);
      const known = centerBaselineRef.current
        ?? (currentCenter ? subscriptionSnapshot(currentCenter) : null);
      centerBaselineRef.current = snap;
      if (known === null) {
        // First sight of this session with no local center: adopt silently.
        if (!currentCenter) setCurrentCenter(fresh);
        return;
      }
      if (known !== snap) {
        setCurrentCenter(fresh);
        toastRef.current.success('Votre abonnement a été mis à jour par la plateforme.');
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        // Session expired mid-session — force re-login.
        setCurrentUser(null);
        clearLocalSession();
      }
      // Network/D1 hiccup: stay silent, the next tick retries.
    }
  }, [currentUser, isPlatformSuperAdmin, currentCenter]);

  // PubNub realtime — while it is `active` the polling below pauses, so a
  // decision lands in ~2 s with zero polling traffic; any PubNub failure
  // (missing keys, grant refused, disconnect) flips the state back and
  // polling resumes exactly as before.
  const centerRealtime = usePubNubSync(
    !!currentUser && !isPlatformSuperAdmin,
    syncCenterSubscription,
    currentUser?.email
  );
  useLiveSync(
    !!currentUser && !isPlatformSuperAdmin && centerRealtime !== 'active',
    syncCenterSubscription,
    centerSyncFast ? LIVE_SYNC_FAST_INTERVAL_MS : LIVE_SYNC_INTERVAL_MS
  );

  const hideRestrictedModules = currentUser?.role === 'restricted_admin';

  // ── SaaS module gating ──
  // Only the modules enabled for the connected center are visible/accessible.
  // Without center data (legacy default center, platform super admin) → all.
  const centerModuleKeys = (currentCenter?.enabledModules as string[] | undefined) || [];
  const hasCenterModule = (tabId: string): boolean => {
    const moduleKey = TAB_MODULE[tabId];
    if (!moduleKey) return true; // dashboard / settings — always available
    if (isPlatformSuperAdmin || centerModuleKeys.length === 0) return true;
    return centerModuleKeys.includes(moduleKey);
  };

  // Logo du centre depuis centers.logo_url (ImageKit). Vide → logo par défaut
  // (icône de marque, comme sur la page de connexion).
  const menuLogoSrc = isPlatformSuperAdmin || !currentCenter?.logoUrl ? brandIcon : currentCenter.logoUrl;
  const hasCustomCenterLogo = !isPlatformSuperAdmin && Boolean(currentCenter?.logoUrl);

  useEffect(() => {
    if (hideRestrictedModules && (activeTab === 'module4' || activeTab === 'module4b' || activeTab === 'formations' || activeTab === 'module6')) {
      setActiveTab('module1');
    }
  }, [hideRestrictedModules, activeTab]);

  // If the active tab belongs to a module not enabled for this center (e.g. the
  // platform admin changed the modules after login), fall back to the dashboard
  // so a disabled module can never be opened.
  useEffect(() => {
    if (currentUser && !isPlatformSuperAdmin && !hasCenterModule(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [currentUser, isPlatformSuperAdmin, currentCenter, activeTab]);

  // Keep active tab in sync with user role
  useEffect(() => {
    if (isPlatformSuperAdmin && !activeTab.startsWith('platform')) {
      setActiveTab('platformAdmin');
    } else if (!isPlatformSuperAdmin && activeTab.startsWith('platform')) {
      setActiveTab('dashboard');
    }
  }, [isPlatformSuperAdmin, activeTab]);

  // Server-backed state (data lives in local SQLite via Express)
  const [students, setStudents] = useState<Student[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [slots, setSlots] = useState<EtudeSlot[]>([]);
  const [courses, setCourses] = useState<ExternalCourse[]>([]);
  const [sessions, setSessions] = useState<ExternalCourseSession[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlanDay[]>([]);
  const [expenses, setExpenses] = useState<CenterExpense[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [settings, setSettings] = useState<CenterSettings | null>(null);
  const [externalStudents, setExternalStudents] = useState<ExternalStudentRegister[]>([]);
  const [revisionSeances, setRevisionSeances] = useState<RevisionSeance[]>([]);
  const [studentTimeSheets, setStudentTimeSheets] = useState<StudentTimeSheet[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendanceRecord[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  // Meal "forfait ferme" closures — loaded separately from the main DB snapshot because
  // they live in their own tables and are only read by the finance module.
  const [mealForfaitClosures, setMealForfaitClosures] = useState<MealForfaitClosure[]>([]);

  useEffect(() => {
    if (isPlatformSuperAdmin) {
      document.title = 'إدارة المنصة | System Academy SaaS';
    } else {
      document.title = settings?.centerName || 'المركز';
    }
  }, [settings?.centerName, isPlatformSuperAdmin]);

  // Import confirmation state
  const [importPendingData, setImportPendingData] = useState<Record<string, unknown> | null>(null);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  // Latest-known state mirrored in a ref so commits never read stale closures.
  const stateRef = useRef<{
    settings: CenterSettings | null;
    students: Student[]; staff: StaffMember[]; slots: EtudeSlot[];
    courses: ExternalCourse[]; sessions: ExternalCourseSession[]; mealPlans: MealPlanDay[];
    expenses: CenterExpense[]; timesheets: TimesheetEntry[]; externalStudents: ExternalStudentRegister[];
    revisionSeances: RevisionSeance[]; studentTimeSheets: StudentTimeSheet[];
    studentAttendance: StudentAttendanceRecord[]; formations: Formation[];
  }>({ settings: null, students: [], staff: [], slots: [], courses: [], sessions: [], mealPlans: [], expenses: [], timesheets: [], externalStudents: [], revisionSeances: [], studentTimeSheets: [], studentAttendance: [], formations: [] });

  // Serializes full-state PUTs so concurrent module updates never overwrite each other.
  const commitQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Load full state from the local API on mount or when logged in
  useEffect(() => {
    if (!currentUser) {
      setIsBootLoading(false);
      return;
    }

    // Platform super admin does not manage a specific center's domain data
    if (currentUser.role === 'platform_super_admin') {
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
          studentAttendance: stateRef.current.studentAttendance || [],
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
    // Non-blocking: closures are supplementary finance data. A failure here must not
    // hold up (or fail) the boot, so it is fetched alongside and silently defaults to [].
    fetchMealForfaitClosures()
      .then((closures) => {
        if (!cancelled) setMealForfaitClosures(closures);
      })
      .catch(() => {
        if (!cancelled) setMealForfaitClosures([]);
      });
    // Jardin-only daily attendance is supplementary to the formation time-sheet data.
    // Keep it non-blocking so older deployments without migration 0026 still boot.
    fetchStudentAttendanceApi()
      .then((records) => {
        if (!cancelled) {
          setStudentAttendance(records);
          stateRef.current.studentAttendance = records;
        }
      })
      .catch(() => {
        if (!cancelled) setStudentAttendance([]);
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

  // Atomic student operations (anti-overwrite for concurrent multi-users)
  const handleAddStudent = (newStudent: Student) => {
    setStudents(prev => [...prev, newStudent]);
    commitDomain(() => createStudentApi(newStudent));
  };

  const handleUpdateSingleStudent = (updatedStudent: Student) => {
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    commitDomain(() => updateStudentApi(updatedStudent));
  };

  const handleDeleteStudent = (id: string) => {
    setStudents(prev => prev.filter(s => s.id !== id));
    commitDomain(() => deleteStudentApi(id));
  };

  const handleUpdateStudents = (updated: Student[]) => {
    if (updated.length === students.length + 1) {
      const added = updated[updated.length - 1];
      if (added && !students.some(s => s.id === added.id)) {
        setStudents(updated);
        commitDomain(() => createStudentApi(added));
        return;
      }
    }
    if (updated.length === students.length - 1) {
      const remainingIds = new Set(updated.map(s => s.id));
      const deleted = students.find(s => !remainingIds.has(s.id));
      if (deleted) {
        setStudents(updated);
        commitDomain(() => deleteStudentApi(deleted.id));
        return;
      }
    }
    setStudents(updated);
    commitDomain(() => saveStudents(updated));
  };

  const handleAddStaff = (newStaff: StaffMember) => {
    setStaff(prev => [...prev, newStaff]);
    commitDomain(() => createStaffApi(newStaff));
  };

  const handleUpdateSingleStaff = (updatedStaff: StaffMember) => {
    setStaff(prev => prev.map(s => s.id === updatedStaff.id ? updatedStaff : s));
    commitDomain(() => updateStaffApi(updatedStaff));
  };

  const handleDeleteStaff = (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
    commitDomain(() => deleteStaffApi(id));
  };

  const handleUpdateStaff = (updated: StaffMember[]) => {
    if (updated.length === staff.length + 1) {
      const added = updated[updated.length - 1];
      if (added && !staff.some(s => s.id === added.id)) {
        setStaff(updated);
        commitDomain(() => createStaffApi(added));
        return;
      }
    }
    if (updated.length === staff.length - 1) {
      const remainingIds = new Set(updated.map(s => s.id));
      const deleted = staff.find(s => !remainingIds.has(s.id));
      if (deleted) {
        setStaff(updated);
        commitDomain(() => deleteStaffApi(deleted.id));
        return;
      }
    }
    if (updated.length === staff.length) {
      const changed = updated.find(u => {
        const old = staff.find(s => s.id === u.id);
        return old && JSON.stringify(old) !== JSON.stringify(u);
      });
      if (changed) {
        setStaff(updated);
        commitDomain(() => updateStaffApi(changed));
        return;
      }
    }
    setStaff(updated);
    commitDomain(() => saveStaff(updated));
  };

  const handleAddExpense = (newExpense: CenterExpense) => {
    setExpenses(prev => [...prev, newExpense]);
    commitDomain(() => createExpenseApi(newExpense));
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    commitDomain(() => deleteExpenseApi(id));
  };

  const handleUpdateExpenses = (updated: CenterExpense[]) => {
    if (updated.length === expenses.length + 1) {
      const added = updated[updated.length - 1];
      if (added && !expenses.some(e => e.id === added.id)) {
        setExpenses(updated);
        commitDomain(() => createExpenseApi(added));
        return;
      }
    }
    if (updated.length === expenses.length - 1) {
      const remainingIds = new Set(updated.map(e => e.id));
      const deleted = expenses.find(e => !remainingIds.has(e.id));
      if (deleted) {
        setExpenses(updated);
        commitDomain(() => deleteExpenseApi(deleted.id));
        return;
      }
    }
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

  const handleUpdateMealForfaitClosures = (updated: MealForfaitClosure[]) => {
    setMealForfaitClosures(updated);
    commitDomain(() => saveMealForfaitClosures(updated));
  };

  const handleUpdateStudentTimeSheets = (updated: StudentTimeSheet[]) => {
    setStudentTimeSheets(updated);
    commitDomain(() => saveStudentTimeSheets(updated));
  };

  const handleUpdateStudentAttendance = (updated: StudentAttendanceRecord[]) => {
    setStudentAttendance(updated);
    stateRef.current.studentAttendance = updated;
    commitDomain(() => saveStudentAttendanceApi(updated));
  };

  const handleUpdateFormations = (updated: Formation[]) => {
    setFormations(updated);
    commitDomain(() => saveFormations(updated));
  };

  const handleUpdateSlots = (updated: EtudeSlot[]) => {
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

  // Build a filesystem-safe filename prefix from the center name
  const backupFilePrefix = (name: string): string =>
    (name || 'center').trim().replace(/[^\w\u0600-\u06FF-]+/g, '_').replace(/^_+|_+$/g, '') || 'center';

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
      studentAttendance: studentAttendance.length > 0 ? studentAttendance : (stateRef.current.studentAttendance || []),
      formations: formations.length > 0 ? formations : (stateRef.current.formations || []),
      exportedAt: new Date().toISOString()
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `${backupFilePrefix(currentSettings.centerName)}_Database_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  // Import database backup
  const VALID_COLLECTION_KEYS = [
    'students', 'staff', 'slots', 'courses', 'sessions', 'mealPlans',
    'expenses', 'timesheets', 'externalStudents', 'revisionSeances', 'studentTimeSheets', 'studentAttendance', 'formations'
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
            externalStudents, revisionSeances, studentTimeSheets, studentAttendance, settings: currentSettings,
            exportedAt: new Date().toISOString(),
            _note: 'Auto-backup before import'
          };
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${backupFilePrefix(currentSettings.centerName)}_AutoBackup_${new Date().toISOString().split('T')[0]}.json`;
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
      setSlots(next.slots as EtudeSlot[]);
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
    if (next.studentAttendance !== undefined) {
      if (!validateArray(next.studentAttendance as unknown[], ['id', 'studentId', 'date', 'status'], 'pointage التلاميذ')) return;
      setStudentAttendance(next.studentAttendance as StudentAttendanceRecord[]);
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
      slots: next.slots !== undefined ? (next.slots as EtudeSlot[]) : slots,
      courses: next.courses !== undefined ? (next.courses as ExternalCourse[]) : courses,
      sessions: next.sessions !== undefined ? (next.sessions as ExternalCourseSession[]) : sessions,
      mealPlans: next.mealPlans !== undefined ? (next.mealPlans as MealPlanDay[]) : mealPlans,
      expenses: next.expenses !== undefined ? (next.expenses as CenterExpense[]) : expenses,
      timesheets: next.timesheets !== undefined ? (next.timesheets as TimesheetEntry[]) : timesheets,
      externalStudents: next.externalStudents !== undefined ? (next.externalStudents as ExternalStudentRegister[]) : externalStudents,
      revisionSeances: next.revisionSeances !== undefined ? (next.revisionSeances as RevisionSeance[]) : revisionSeances,
      studentTimeSheets: next.studentTimeSheets !== undefined ? (next.studentTimeSheets as StudentTimeSheet[]) : studentTimeSheets,
      studentAttendance: next.studentAttendance !== undefined ? (next.studentAttendance as StudentAttendanceRecord[]) : (stateRef.current.studentAttendance || []),
      formations: next.formations !== undefined ? (next.formations as Formation[]) : formations
    };

    commitDomain(async () => {
      await saveDatabase(next as any);
      if (next.studentAttendance !== undefined) {
        await saveStudentAttendanceApi(next.studentAttendance as StudentAttendanceRecord[]);
      }
      const freshDb = await fetchDatabase();
      const freshAttendance = await fetchStudentAttendanceApi().catch(() => stateRef.current.studentAttendance || []);
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
      setStudentAttendance(freshAttendance);
      setFormations(freshDb.formations || []);
      stateRef.current = { ...freshDb, studentAttendance: freshAttendance };
    });

    toast.success('تم استرجاع البيانات بنجاح!');

    setImportPendingData(null);
    setIsImportConfirmOpen(false);
  };

  if (!currentUser) {
    if (authView === 'landing') {
      return (
        <>
          <LandingPage
            onOpenLogin={() => setAuthView('login')}
            centerName={settings?.centerName || 'Small Genious'}
          />
          <CloseConfirmDialog />
        </>
      );
    }

    return (
      <>
        <LoginScreen
          onLogin={handleLogin}
          centerName={settings?.centerName}
          onBackToLanding={() => setAuthView('landing')}
        />
        <CloseConfirmDialog />
      </>
    );
  }

  if (isBootLoading || (!isPlatformSuperAdmin && !settings)) {
    return (
      <>
        <div className="min-h-screen bg-[#FCFAF6] flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
          <div className="flex flex-col items-center gap-4">
            <span className={`w-16 h-16 rounded-2xl bg-slate-100 ${hasCustomCenterLogo ? 'p-px' : 'p-1'} shadow-md shadow-slate-900/10 overflow-hidden`}>
              <img src={menuLogoSrc} alt={settings?.centerName || 'المركز'} className="w-full h-full rounded-xl object-cover" />
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

  // Platform super admin sees ONLY the SaaS platform management interface.
  // Center admins (super_admin, admin, restricted_admin) see all center modules but NOT the platform management.
  const menuItems = isPlatformSuperAdmin
    ? [
        { id: 'platformAdmin', label: 'الرئيسية · SaaS', icon: LayoutDashboard },
        { id: 'platformCenters', label: 'المراكز والاشتراكات', icon: Building2 },
        { id: 'platformRequests', label: 'طلبات التجربة', icon: Inbox },
        { id: 'platformFinance', label: 'المالية (SaaS)', icon: DollarSign },
        { id: 'platformPricing', label: 'الأسعار والوحدات', icon: Tags },
        { id: 'platformAdvertisements', label: 'الإعلانات', icon: ImagePlus },
        { id: 'platformRenewals', label: 'طلبات التجديد', icon: RefreshCw },
      ]
    : [
        { id: 'dashboard', label: 'لوحة القيادة', icon: LayoutDashboard },
        { id: 'module1', label: 'تسجيل التلاميذ', icon: GraduationCap },
        { id: 'module2', label: 'المتابعة الدراسية', icon: BookOpen },
        !hideRestrictedModules && { id: 'studentTimeSheets', label: currentCenter?.centerType === 'jardin' ? 'تسجيل حضور التلاميذ' : 'جداول التوقيت', icon: CalendarCheck },
        { id: 'module3', label: 'تأطير Étude', icon: Clock },
        !hideRestrictedModules && { id: 'module4', label: 'الدروس الخصوصية', icon: BookMarked },
        !hideRestrictedModules && { id: 'module4b', label: 'حصة مراجعة', icon: BookOpenCheck },
        !hideRestrictedModules && { id: 'formations', label: 'التكوينات والدورات', icon: Award },
        LIBRARY_ENABLED && { id: 'module5', label: 'المكتبة', icon: BookOpen },
        !hideRestrictedModules && { id: 'module6', label: 'إدارة الوجبات', icon: Utensils },
        { id: 'moduleBus', label: 'خطة الحافلة', icon: Bus },
        { id: 'module8', label: 'إدارة الموظفين', icon: Users },
        { id: 'module7', label: 'المنظومة المالية', icon: DollarSign },
        { id: 'settings', label: 'الإعدادات', icon: SettingsIcon },
        { id: 'renewal', label: 'التجديد', icon: RefreshCw },
      ].filter(Boolean) as { id: string; label: string; icon: any }[];

  // SaaS gating: keep only the tabs allowed for this center's subscription.
  const visibleMenuItems = menuItems.filter(item => hasCenterModule(item.id));


  return (
    <div className="min-h-screen bg-[#FCFAF6] flex flex-col md:flex-row font-sans text-slate-800" style={{ direction: 'rtl' }}>
      
      {/* MOBILE HEADER */}
      <header className="md:hidden bg-white/90 backdrop-blur-xl border-b border-slate-200/70 text-slate-900 p-4 flex justify-between items-center shadow-sm no-print">
        <div className="flex items-center gap-2">
          <span className={`w-10 h-10 rounded-xl bg-slate-100 ${hasCustomCenterLogo ? 'p-px' : 'p-0.5'} shadow-md shadow-slate-900/10 shrink-0 overflow-hidden`}>
            <img src={menuLogoSrc} alt={isPlatformSuperAdmin ? 'System Academy SaaS' : (settings?.centerName || 'المركز')} className="w-full h-full rounded-lg object-cover" />
          </span>
          <div>
            <h1 className="font-black text-sm text-slate-900">{isPlatformSuperAdmin ? 'إدارة المنصة (SaaS)' : (settings?.centerName || 'المركز')}</h1>
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
            className="md:hidden absolute top-[72px] right-0 left-0 bg-white border-b border-slate-200/70 z-40 p-4 space-y-2 shadow-xl shadow-slate-900/10 no-print"
          >
            {visibleMenuItems.map((item) => {
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
                      ? 'bg-[#257C86] text-white shadow-md shadow-[#257C86]/25' 
                      : 'text-slate-500 hover:bg-[#257C86]/10 hover:text-[#257C86]'
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
      <aside className={`hidden md:flex flex-col justify-between bg-white text-slate-800 min-h-screen p-3 xl:p-4 border-l border-slate-200/70 shadow-lg shadow-slate-900/[0.04] shrink-0 no-print transition-all duration-300 ${sidebarCollapsed ? 'w-16 xl:w-20' : 'w-60 xl:w-72'}`}>
        <div className="space-y-3">

          {/* Logo Brand */}
          <div className="flex items-center justify-between gap-1 px-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`rounded-2xl bg-[#257C86] ${hasCustomCenterLogo ? 'p-px' : 'p-1'} shadow-lg shadow-[#257C86]/30 ring-1 ring-white/40 shrink-0 overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'w-8 h-8' : 'w-12 h-12'}`}>
                <img src={menuLogoSrc} alt={isPlatformSuperAdmin ? 'System Academy SaaS' : (settings?.centerName || 'المركز')} className="w-full h-full rounded-xl object-cover" />
              </span>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <h1 className="font-black text-base text-slate-950 leading-tight truncate">{isPlatformSuperAdmin ? 'إدارة المنصة' : (settings?.centerName || 'المركز')}</h1>
                  <span className="text-[11px] text-[#257C86] font-bold block truncate">{isPlatformSuperAdmin ? 'لوحة تحكم SaaS' : 'الإدارة والتأطير'}</span>
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
            {visibleMenuItems.map((item) => {
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
                      ? 'bg-[#257C86] text-white shadow-md shadow-[#257C86]/30' 
                      : 'text-slate-500 hover:bg-[#257C86]/10 hover:text-[#257C86]'
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
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 shrink-0 animate-pulse"></span>
              <span className="text-xs font-bold text-slate-700">
                {isPlatformSuperAdmin ? 'Super Admin SaaS' : (currentUser?.role === 'super_admin' ? 'المدير العام' : 'Administrateur')}
              </span>
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
            <p className="text-[10px] text-slate-300 text-center font-bold pt-1">{isPlatformSuperAdmin ? 'System Academy SaaS' : (settings?.centerName || 'المركز')} © 2026</p>
          )}
        </div>
      </aside>

      {/* CORE CANVAS */}
      <main ref={mainRef} className="min-w-0 flex-1 p-4 md:p-5 xl:p-8 overflow-y-auto max-h-screen">
        <div className="max-w-7xl mx-auto">
          {/* Alerte abonnement — affichée dans TOUS les modules du centre,
              pas seulement sur le tableau de bord, avec un raccourci vers le
              module « Renouvellement ». */}
          {!isPlatformSuperAdmin && currentCenter && (
            <div className="mb-5">
              <SubscriptionStatusCard
                subscription={{
                  status: currentCenter.status,
                  plan: currentCenter.plan,
                  trialEndsAt: currentCenter.trialEndsAt,
                  subscriptionEndsAt: currentCenter.subscriptionEndsAt,
                  billingCycle: currentCenter.billingCycle,
                }}
                onRenew={() => setActiveTab('renewal')}
              />
            </div>
          )}

          {/* Publicité du centre — formats responsives (rectangle + interstitiel) */}
          {!isPlatformSuperAdmin && currentCenter && (
            <>
              {/* Rectangle responsive : toute la largeur dispo (1100 px max), hauteur fluide */}
              <AdvertisementCarousel location="center_admin" centerId={currentCenter.id} format="rectangle" className="mb-5" />
              {/* Carrousel standard (pubs sans position) */}
              <AdvertisementCarousel location="center_admin" centerId={currentCenter.id} className="mb-5" />
              {/* Interstitiel : overlay plein écran fermable, une fois par session */}
              <AdvertisementInterstitial location="center_admin" centerId={currentCenter.id} />
            </>
          )}
          
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
                  settings={settings}
                  centerType={currentCenter?.centerType}
                  isModuleAllowed={hasCenterModule}
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
                    handleAddStudent(newSt);
                  }}
                  onUpdateStudent={handleUpdateSingleStudent}
                  onDeleteStudent={handleDeleteStudent}
                  hideRestrictedModules={hideRestrictedModules}
                  sidebarCollapsed={sidebarCollapsed}
                  enabledModules={centerModuleKeys.length > 0 ? centerModuleKeys : undefined}
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
                  centerType={currentCenter?.centerType}
                  studentAttendance={studentAttendance}
                  onUpdateStudentAttendance={handleUpdateStudentAttendance}
                />
              )}

              {activeTab === 'module3' && (
                <EtudeModule
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

              {LIBRARY_ENABLED && activeTab === 'module5' && (
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
                  enabledModules={currentCenter?.enabledModules as string[] | undefined}
                  mealForfaitClosures={mealForfaitClosures}
                  onUpdateMealForfaitClosures={handleUpdateMealForfaitClosures}
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

              {activeTab === 'settings' && (
                <SettingsModule
                  key={`settings_${reloadKey}_${settings?.centerName || ''}_${JSON.stringify(settings?.fees || {})}`}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  hideRestrictedModules={hideRestrictedModules}
                  currentUserEmail={currentUser.email}
                  onExportDatabase={handleExportDatabase}
                  onImportDatabase={handleImportDatabase}
                  centerLogoUrl={currentCenter?.logoUrl}
                  onCenterLogoChange={(url) => setCurrentCenter(prev => prev ? { ...prev, logoUrl: url } : prev)}
                  enabledModules={centerModuleKeys.length > 0 ? centerModuleKeys : undefined}
                />
              )}

              {activeTab === 'renewal' && (
                <RenewalModule center={currentCenter} />
              )}

              {activeTab.startsWith('platform') && (
                <PlatformAdminDashboard
                  page={
                    activeTab === 'platformCenters' ? 'centers'
                    : activeTab === 'platformRequests' ? 'requests'
                    : activeTab === 'platformFinance' ? 'finance'
                    : activeTab === 'platformPricing' ? 'pricing'
                    : activeTab === 'platformRenewals' ? 'renewals'
                    : activeTab === 'platformAdvertisements' ? 'advertisements'
                    : 'overview'
                  }
                  onNavigate={(p) => setActiveTab(
                    p === 'centers' ? 'platformCenters'
                    : p === 'requests' ? 'platformRequests'
                    : p === 'finance' ? 'platformFinance'
                    : p === 'pricing' ? 'platformPricing'
                    : p === 'renewals' ? 'platformRenewals'
                    : p === 'advertisements' ? 'platformAdvertisements'
                    : 'platformAdmin'
                  )}
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
