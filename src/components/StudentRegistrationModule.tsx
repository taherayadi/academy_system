import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserPlus, 
  FileText, 
  Search, 
  Filter, 
  Plus, 
  Trash2, 
  Edit3, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  ShieldCheck, 
  Calendar, 
  BookOpen, 
  HeartHandshake, 
  Phone, 
  Mail, 
  MapPin, 
  X,
  Sparkles,
  HeartPulse,
  Lock,
  Upload,
  Loader2,
  WifiOff
} from 'lucide-react';
import { Student, ParentInfo, Sibling, AuthorizedPerson, CenterSettings, getFeesForYear, DEFAULT_ACADEMIC_YEARS, PaymentRecord, getCurrentAcademicYear } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import { capitalizeFirst } from '../utils/format';
import DateField from './DateField';
import { renderPDFPages } from '../utils/pdfExtract';
import { extractStudentFromPages, type ExtractedStudentData } from '../utils/aiExtract';

interface StudentRegistrationModuleProps {
  students: Student[];
  onAddStudent: (student: Omit<Student, 'id'>) => void;
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent: (id: string) => void;
  settings?: CenterSettings;
  openAddFormTrigger?: boolean;
  setOpenAddFormTrigger?: (val: boolean) => void;
  hideRestrictedModules?: boolean;
  sidebarCollapsed?: boolean;
}

const emptyParent = (): ParentInfo => ({
  name: '',
  birthDate: '',
  profession: '',
  address: '',
  phoneFixed: '',
  phoneMobile: '',
  email: ''
});

// Human-readable Arabic label for the family situation key
const parentalSituationLabel = (key?: string): string => {
  switch (key) {
    case 'mariés': return 'متزوجان';
    case 'séparés_garde_mere': return 'منفصلان - حضانة الأم';
    case 'séparés_garde_pere': return 'منفصلان - حضانة الأب';
    case 'séparés_garde_alternee': return 'منفصلان - حضانة تناوبية';
    default: return key || 'متزوجان';
  }
};

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return /network|fetch|internet|offline|connection|failed to fetch|econnrefused|enotfound|timeout/.test(msg);
  }
  return false;
}

export default function StudentRegistrationModule({
  students,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  settings,
  openAddFormTrigger,
  setOpenAddFormTrigger,
  hideRestrictedModules,
  sidebarCollapsed
}: StudentRegistrationModuleProps) {
  const toast = useToast();
  const centerName = settings?.centerName || 'المركز';
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(openAddFormTrigger || false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [printingRegistrationStudent, setPrintingRegistrationStudent] = useState<Student | null>(null);

  // Generic themed delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ title: string; message: React.ReactNode; action: () => void } | null>(null);

  // Form states
  const [academicYear, setAcademicYear] = useState<string>(getCurrentAcademicYear());
  const [customYears, setCustomYears] = useState<string[]>(DEFAULT_ACADEMIC_YEARS);
  const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');

  // Import from previous year modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedStudentToImport, setSelectedStudentToImport] = useState<string>('');
  const [importTargetYear, setImportTargetYear] = useState<string>(getCurrentAcademicYear());

  // PDF import state
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfImportOffline, setPdfImportOffline] = useState(false);
  const pdfFileInputRef = React.useRef<HTMLInputElement>(null);
  const pdfImportActiveRef = React.useRef(false);

  React.useEffect(() => {
    if (!pdfImporting) return;
    const onOffline = () => {
      pdfImportActiveRef.current = false;
      setPdfImportOffline(true);
    };
    window.addEventListener('offline', onOffline);
    return () => window.removeEventListener('offline', onOffline);
  }, [pdfImporting]);

  // Filter & Pagination states
  const [academicYearFilter, setAcademicYearFilter] = useState<string>(getCurrentAcademicYear());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [grade, setGrade] = useState('Lycée 1ère Année');
  const [academicYearInput, setAcademicYearInput] = useState<string>(academicYearFilter);

  // Parents
  const [mother, setMother] = useState<ParentInfo>(emptyParent());
  const [father, setFather] = useState<ParentInfo>(emptyParent());
  const [parentalSituation, setParentalSituation] = useState<Student['parentalSituation']>('mariés');
  const [parentalComments, setParentalComments] = useState('');

  // Family & Authorizations
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [authorizedPersons, setAuthorizedPersons] = useState<AuthorizedPerson[]>([]);
  const [allergies, setAllergies] = useState('');

  // 3 Last Academic Years
  const [nMinus1School, setNMinus1School] = useState('');
  const [nMinus1Grade, setNMinus1Grade] = useState('');
  const [nMinus2School, setNMinus2School] = useState('');
  const [nMinus2Grade, setNMinus2Grade] = useState('');
  const [nMinus3School, setNMinus3School] = useState('');
  const [nMinus3Grade, setNMinus3Grade] = useState('');

  // Signature
  const [regLocation, setRegLocation] = useState('صفاقس');
  const [regDate, setRegDate] = useState(new Date().toISOString().split('T')[0]);
  const [signatureName, setSignatureName] = useState('');
  const [signedElectronically, setSignedElectronically] = useState(true);

    // Services
  const [suiviEnrolled, setSuiviEnrolled] = useState(false);
  const [etudeEnrolled, setEtudeEnrolled] = useState(false);
  const [libraryEnrolled, setLibraryEnrolled] = useState(false);
  const [mealsEnrolled, setMealsEnrolled] = useState(false);

  // Sync open trigger
  React.useEffect(() => {
    if (openAddFormTrigger) {
      resetForm();
      setIsFormOpen(true);
      if (setOpenAddFormTrigger) setOpenAddFormTrigger(false);
    }
  }, [openAddFormTrigger]);

  const resetForm = () => {
    setAcademicYear(academicYearFilter || getCurrentAcademicYear());
    setFirstName('');
    setLastName('');
    setBirthDate('');
    setBirthPlace('');
    setGrade('Lycée 1ère Année');
    setMother(emptyParent());
    setFather(emptyParent());
    setParentalSituation('mariés');
    setParentalComments('');
    setSiblings([]);
    setAuthorizedPersons([]);
    setAllergies('');
    setNMinus1School('');
    setNMinus1Grade('');
    setNMinus2School('');
    setNMinus2Grade('');
    setNMinus3School('');
    setNMinus3Grade('');
    setRegLocation('صفاقس');
    setRegDate(new Date().toISOString().split('T')[0]);
    setSignatureName('');
    setSignedElectronically(true);
    setSuiviEnrolled(false);
    setEtudeEnrolled(false);
    setLibraryEnrolled(false);
    setMealsEnrolled(false);
    setEditingStudentId(null);
  };

  const handlePdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pdfFileInputRef.current) pdfFileInputRef.current.value = '';

    pdfImportActiveRef.current = true;
    setPdfImporting(true);
    setPdfImportOffline(false);
    let offlineDetected = false;

    try {
      if (!navigator.onLine) {
        offlineDetected = true;
        setPdfImportOffline(true);
        return;
      }

      const pages = await renderPDFPages(file);
      if (!pdfImportActiveRef.current) return;
      if (pages.length === 0) throw new Error('الملف فارغ.');

      if (!navigator.onLine) {
        offlineDetected = true;
        setPdfImportOffline(true);
        return;
      }

      const data = await extractStudentFromPages(pages, settings?.geminiApiKey, centerName);
      if (!pdfImportActiveRef.current) return;

      resetForm();
      applyExtractedData(data);
      setIsFormOpen(true);
      toast.success('تم استخراج البيانات بنجاح — راجع الحقول قبل الحفظ');
    } catch (err: unknown) {
      if (!pdfImportActiveRef.current) {
        offlineDetected = true;
        setPdfImportOffline(true);
        return;
      }

      if (!navigator.onLine || isNetworkError(err)) {
        offlineDetected = true;
        setPdfImportOffline(true);
      } else {
        const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
        toast.error(`فشل الاستخراج: ${msg}`);
      }
    } finally {
      if (offlineDetected) {
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      pdfImportActiveRef.current = false;
      setPdfImporting(false);
      setPdfImportOffline(false);
    }
  };

  const applyExtractedData = (d: ExtractedStudentData) => {
    setFirstName(d.firstName || '');
    setLastName(d.lastName || '');
    setBirthDate(d.birthDate || '');
    setBirthPlace(d.birthPlace || '');
    setGrade(d.grade || 'Lycée 1ère Année');
    setMother({
      name: d.mother?.name || '',
      birthDate: d.mother?.birthDate || '',
      profession: d.mother?.profession || '',
      address: d.mother?.address || '',
      phoneFixed: d.mother?.phoneFixed || '',
      phoneMobile: d.mother?.phoneMobile || '',
      email: d.mother?.email || '',
    });
    setFather({
      name: d.father?.name || '',
      birthDate: d.father?.birthDate || '',
      profession: d.father?.profession || '',
      address: d.father?.address || '',
      phoneFixed: d.father?.phoneFixed || '',
      phoneMobile: d.father?.phoneMobile || '',
      email: d.father?.email || '',
    });
    setParentalSituation((d.parentalSituation as Student['parentalSituation']) || 'mariés');
    setParentalComments(d.parentalComments || '');
    setSiblings(
      (d.siblings || []).map(s => ({ id: crypto.randomUUID(), name: s.name, age: s.age || 0, grade: s.grade || '' }))
    );
    setAuthorizedPersons(
      (d.authorizedPersons || []).map(ap => ({
        id: crypto.randomUUID(),
        name: ap.name || '',
        phone: ap.phone || '',
        relation: ap.relation || '',
      }))
    );
    setAllergies(d.allergies || '');
    setNMinus1School(d.academicHistory?.nMinus1?.school || '');
    setNMinus1Grade(d.academicHistory?.nMinus1?.grade || '');
    setNMinus2School(d.academicHistory?.nMinus2?.school || '');
    setNMinus2Grade(d.academicHistory?.nMinus2?.grade || '');
    setNMinus3School(d.academicHistory?.nMinus3?.school || '');
    setNMinus3Grade(d.academicHistory?.nMinus3?.grade || '');
    if (d.enrolledServices) {
      setSuiviEnrolled(d.enrolledServices.suivi ?? false);
      setEtudeEnrolled(d.enrolledServices.etude ?? false);
      setLibraryEnrolled(d.enrolledServices.library ?? false);
      setMealsEnrolled(d.enrolledServices.meals ?? false);
    }
  };

  const openEdit = (st: Student) => {
    setEditingStudentId(st.id);
    setAcademicYear(st.academicYear || getCurrentAcademicYear());
    setFirstName(st.firstName);
    setLastName(st.lastName);
    setBirthDate(st.birthDate);
    setBirthPlace(st.birthPlace);
    setGrade(st.grade);
    setMother(st.mother || emptyParent());
    setFather(st.father || emptyParent());
    setParentalSituation(st.parentalSituation || 'mariés');
    setParentalComments(st.parentalComments || '');
    setSiblings(st.siblings || []);
    setAuthorizedPersons(st.authorizedPersons || []);
    setAllergies(st.allergies || '');

    setNMinus1School(st.academicHistory?.nMinus1?.school || '');
    setNMinus1Grade(st.academicHistory?.nMinus1?.grade || '');
    setNMinus2School(st.academicHistory?.nMinus2?.school || '');
    setNMinus2Grade(st.academicHistory?.nMinus2?.grade || '');
    setNMinus3School(st.academicHistory?.nMinus3?.school || '');
    setNMinus3Grade(st.academicHistory?.nMinus3?.grade || '');

    setRegLocation(st.registration?.location || 'صفاقس');
    setRegDate(st.registration?.date || new Date().toISOString().split('T')[0]);
    setSignatureName(st.registration?.signatureName || `${st.father?.name || st.mother?.name}`);
    setSignedElectronically(st.registration?.signedElectronically ?? true);

    setSuiviEnrolled(st.enrolledServices?.suivi ?? true);
    setEtudeEnrolled(st.enrolledServices?.etude ?? true);
    setLibraryEnrolled(st.enrolledServices?.library ?? false);
    setMealsEnrolled(st.enrolledServices?.meals ?? true);

    setIsFormOpen(true);
  };

  // Services already paid (annual or monthly) for the student in the editing year → locked, cannot be removed until a refund is issued
  const editingPayments = editingStudentId ? (students.find(s => s.id === editingStudentId)?.payments || []) : [];
  const hasPaidService = (...services: PaymentRecord['service'][]) =>
    editingPayments.some(p => services.includes(p.service) && !p.refund && p.month.includes(academicYear));
  const lockedSuivi = hasPaidService('Suivi', 'Inscription Suivi');
  const lockedEtude = hasPaidService('Étude', 'Inscription Étude');
  const lockedLibrary = hasPaidService('Bibliothèque', 'Inscription Bibliothèque');
  const lockedMeals = hasPaidService('Repas');

  // Import/Copy student file from previous academic year
  const handleImportStudent = (stId: string) => {
    const sourceSt = students.find(s => s.id === stId);
    if (!sourceSt) return;

    const targetYr = importTargetYear || getCurrentAcademicYear();

    // Check if student with same first and last name already exists in target academic year
    const duplicate = students.find(s => 
      (s.academicYear || getCurrentAcademicYear()) === targetYr &&
      s.firstName.trim().toLowerCase() === sourceSt.firstName.trim().toLowerCase() &&
      s.lastName.trim().toLowerCase() === sourceSt.lastName.trim().toLowerCase()
    );

    if (duplicate) {
      toast.warning(`تنبيه: التلميذ (${sourceSt.firstName} ${sourceSt.lastName}) مسجل بالفعل في السنة الدراسية (${targetYr})! لا يمكن إعادة إضافته مرتين في نفس السنة.`);
      return;
    }

    // Populate form with existing student details but target CURRENT academic year as new record
    setEditingStudentId(null); // Ensure a NEW student record is created
    setAcademicYear(targetYr);
    setFirstName(sourceSt.firstName);
    setLastName(sourceSt.lastName);
    setBirthDate(sourceSt.birthDate);
    setBirthPlace(sourceSt.birthPlace);
    setGrade(sourceSt.grade);
    setMother(sourceSt.mother || emptyParent());
    setFather(sourceSt.father || emptyParent());
    setParentalSituation(sourceSt.parentalSituation || 'mariés');
    setParentalComments(sourceSt.parentalComments || '');
    // Regenerate child-record IDs so they don't collide with the source student's DB rows (TEXT PRIMARY KEY)
    setSiblings((sourceSt.siblings || []).map(sib => ({ ...sib, id: 'sib_' + crypto.randomUUID() + '_' + Math.random().toString(36).slice(2, 8) })));
    setAuthorizedPersons((sourceSt.authorizedPersons || []).map(ap => ({ ...ap, id: 'auth_' + crypto.randomUUID() + '_' + Math.random().toString(36).slice(2, 8) })));
    setAllergies(sourceSt.allergies || '');

    setNMinus1School(sourceSt.grade);
    setNMinus1Grade(sourceSt.academicYear || 'سنة سابقة');
    setNMinus2School(sourceSt.academicHistory?.nMinus1?.school || '');
    setNMinus2Grade(sourceSt.academicHistory?.nMinus1?.grade || '');
    setNMinus3School(sourceSt.academicHistory?.nMinus2?.school || '');
    setNMinus3Grade(sourceSt.academicHistory?.nMinus2?.grade || '');

    setRegLocation(sourceSt.registration?.location || 'صفاقس');
    setRegDate(new Date().toISOString().split('T')[0]);
    setSignatureName(sourceSt.registration?.signatureName || `${sourceSt.father?.name || sourceSt.mother?.name}`);
    setSignedElectronically(true);

    setSuiviEnrolled(sourceSt.enrolledServices?.suivi ?? true);
    setEtudeEnrolled(sourceSt.enrolledServices?.etude ?? true);
    setLibraryEnrolled(sourceSt.enrolledServices?.library ?? false);
    setMealsEnrolled(sourceSt.enrolledServices?.meals ?? true);

    setIsImportModalOpen(false);
    setIsFormOpen(true);
    toast.success(`تم نسخ بيانات التلميذ (${sourceSt.firstName} ${sourceSt.lastName}) بنجاح! يمكنك الآن مراجعة الفيش واعتمادها للسنة الدراسية الجديدة (${importTargetYear || getCurrentAcademicYear()}).`);
  };

  const handleAddSibling = () => {
    setSiblings([
      ...siblings,
      { id: 'sib_' + crypto.randomUUID(), name: '', age: 10, grade: '' }
    ]);
  };

  const handleRemoveSibling = (id: string) => {
    setSiblings(siblings.filter(s => s.id !== id));
  };

  const handleAddAuthPerson = () => {
    setAuthorizedPersons([
      ...authorizedPersons,
      { id: 'auth_' + crypto.randomUUID(), name: '', phone: '', relation: '' }
    ]);
  };

  const handleRemoveAuthPerson = (id: string) => {
    setAuthorizedPersons(authorizedPersons.filter(a => a.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.warning('يرجى إدخال اسم ولقب التلميذ');
      return;
    }

    const existing = editingStudentId ? students.find(s => s.id === editingStudentId) : undefined;

    const payload: Omit<Student, 'id'> = {
      academicYear,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      birthPlace,
      grade,
      mother,
      father,
      parentalSituation,
      parentalComments,
      siblings,
      authorizedPersons,
      allergies,
      academicHistory: {
        nMinus1: { school: nMinus1School, grade: nMinus1Grade },
        nMinus2: { school: nMinus2School, grade: nMinus2Grade },
        nMinus3: { school: nMinus3School, grade: nMinus3Grade }
      },
      registration: {
        date: regDate,
        location: regLocation,
        signedElectronically,
        signatureName: signatureName || `${father.name || mother.name}`
      },
      enrolledServices: {
        suivi: lockedSuivi ? true : suiviEnrolled,
        etude: lockedEtude ? true : etudeEnrolled,
        library: lockedLibrary ? true : libraryEnrolled,
        meals: lockedMeals ? true : mealsEnrolled
      },
      suiviFees: {
        annualRegistrationFee: settings ? getFeesForYear(settings, academicYear).fraisAnnuelSuivi : 150,
        monthlyFee: settings ? getFeesForYear(settings, academicYear).fraisMensuelSuivi : 250
      },
      etudeFees: {
        annualRegistrationFee: settings ? getFeesForYear(settings, academicYear).fraisAnnuelEtude : 100,
        monthlyFee: settings ? getFeesForYear(settings, academicYear).fraisMensuelEtude : 180
      },
      libraryFees: {
        annualRegistrationFee: settings ? getFeesForYear(settings, academicYear).fraisAnnuelBibliotheque : 20,
        monthlyFee: settings ? getFeesForYear(settings, academicYear).fraisMensuelBibliotheque : 30
      },
      mealSubscription: {
        mode: 'subscription',
        monthlyPrice: settings ? getFeesForYear(settings, academicYear).fraisAbonnementRepas : 120,
        unitPrice: settings ? getFeesForYear(settings, academicYear).fraisParRepas : 8,
        prepaidMeals: 18,
        consumedMealsCount: existing?.mealSubscription?.consumedMealsCount || 0,
        active: mealsEnrolled
      },
      payments: existing?.payments || [],
      mealAttendances: existing?.mealAttendances || [],
      suiviNotes: existing?.suiviNotes || [],
      timeSheetId: existing?.timeSheetId
    };

    if (editingStudentId) {
      onUpdateStudent({ ...payload, id: editingStudentId });
      toast.success(`تم تحديث ملف التلميذ (${firstName} ${lastName}) بنجاح!`);
    } else {
      onAddStudent(payload);
      toast.success(`تم تسجيل التلميذ (${firstName} ${lastName}) في السنة الدراسية (${academicYear}) بنجاح!`);
    }

    setIsFormOpen(false);
    resetForm();
  };

  // Filter students
  const filteredStudents = students.filter(st => {
    const full = `${st.firstName} ${st.lastName} ${st.mother?.name || ''} ${st.father?.name || ''}`.toLowerCase();
    const matchesSearch = full.includes(searchTerm.toLowerCase());
    const matchesGrade = gradeFilter === 'all' || st.grade === gradeFilter;
    const matchesYear = academicYearFilter === 'all' || (st.academicYear || getCurrentAcademicYear()) === academicYearFilter;
    return matchesSearch && matchesGrade && matchesYear;
  });

  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedStudents = filteredStudents.slice((validCurrentPage - 1) * pageSize, validCurrentPage * pageSize);

  const handleAddCustomYear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearInput.trim()) return;
    const formatted = newYearInput.trim();
    if (!customYears.includes(formatted)) {
      setCustomYears([...customYears, formatted]);
    }
    setAcademicYearFilter(formatted);
    setAcademicYear(formatted);
    setImportTargetYear(formatted);
    setNewYearInput('');
    setIsAddYearModalOpen(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white border border-[#E0EFF1] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-[#F2F8F9] text-[#14464E] text-xs font-bold rounded-lg border border-[#C3E0E4]/60">
              بطاقة التسجيل الشاملة
            </span>
            <span className="text-xs text-slate-400 font-bold">إجبارية لكل تلميذ</span>
          </div>
           <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
             <UserPlus className="h-6 w-6 text-[#257C86]" />
             بطاقة تسجيل التلميذ
           </h2>
          <p className="text-slate-500 text-xs mt-1">
            البيانات الشخصية، الأولياء، الحساسيات، والمسار الدراسي مع إمكانية الاستيراد من سنة سابقة.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs rounded-2xl transition border border-slate-300 flex items-center gap-2 cursor-pointer"
            title="استيراد ملف تلميذ من سنة سابقة"
          >
            <Sparkles className="h-4 w-4 text-[#257C86]" />
            استيراد ملف من سنة سابقة
          </button>

          <input
            ref={pdfFileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handlePdfImport}
          />
          <button
            onClick={() => pdfFileInputRef.current?.click()}
            disabled={pdfImporting}
            className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs rounded-2xl transition border border-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="استيراد بطاقة تسجيل من ملف PDF"
          >
            {pdfImporting ? (
              <span className="animate-spin h-4 w-4 border-2 border-[#257C86] border-t-transparent rounded-full" />
            ) : (
              <Upload className="h-4 w-4 text-[#257C86]" />
            )}
            {pdfImporting ? 'جاري الاستخراج...' : 'استيراد من PDF'}
          </button>

          <button
            onClick={() => {
              resetForm();
              setIsFormOpen(true);
            }}
            className="px-5 py-3 bg-[#257C86] hover:bg-[#1E6A73] text-white font-extrabold text-xs rounded-2xl transition shadow-md shadow-[#257C86]/20 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            تسجيل تلميذ جديد
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row gap-3 items-center justify-between no-print">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute right-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="بحث باسم التلميذ أو الولي..."
              className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#257C86] shrink-0" />
            <label className="text-xs font-black text-slate-700">السنة الدراسية:</label>
            <select
              value={academicYearFilter}
              onChange={(e) => {
                setAcademicYearFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
            >
              <option value="all">كل السنوات</option>
              {customYears.map(yr => (
                <option key={yr} value={yr}>السنة الدراسية {yr}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={gradeFilter}
            onChange={(e) => {
              setGradeFilter(e.target.value);
              setCurrentPage(1);
            }}
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

      {/* Students list cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 no-print transition-all duration-300 ${sidebarCollapsed ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {paginatedStudents.map((st) => (
          <motion.div 
            key={st.id}
            whileHover={{ y: -2 }}
            className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between h-full"
          >
            {/* Header info */}
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#17555F] bg-[#F2F8F9] border border-[#C3E0E4]/50 px-2.5 py-0.5 rounded-md">
                      {st.grade}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {st.academicYear || getCurrentAcademicYear()}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mt-2 truncate whitespace-nowrap" title={`${st.firstName} ${st.lastName}`}>
                    {st.firstName} {st.lastName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">تاريخ الميلاد: {st.birthDate || 'غير محدد'}</p>
                </div>
                
                <div className="flex gap-1">
                  <button 
                    onClick={() => openEdit(st)}
                    className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition cursor-pointer"
                    title="تعديل الفيش"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => setDeleteConfirm({
                      title: 'حذف تسجيل التلميذ',
                      message: (
                        <>
                          هل أنت متأكد من حذف تسجيل التلميذ <strong>{st.firstName} {st.lastName}</strong> للسنة (<strong>{st.academicYear || getCurrentAcademicYear()}</strong>)?
                          <p className="mt-2 text-[11px] text-slate-400 font-bold">الحذف لهذه السنة فقط ولا يمس السنوات الأخرى.</p>
                        </>
                      ),
                      action: () => {
                        onDeleteStudent(st.id);
                        toast.success(`تم حذف تسجيل التلميذ (${st.firstName} ${st.lastName}) للسنة الدراسية (${st.academicYear || getCurrentAcademicYear()}).`);
                      }
                    })}
                    className="p-2 hover:bg-red-50 rounded-xl text-red-500 transition cursor-pointer"
                    title="حذف التلميذ"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Parents brief */}
              <div className="p-3 bg-slate-50 rounded-2xl space-y-1 text-xs">
                <p className="flex justify-between items-center gap-2 font-medium">
                  <span className="text-slate-400 shrink-0">الأب:</span>
                  <span className="font-bold text-slate-800 truncate">{st.father?.name || 'غير مسجل'}</span>
                </p>
                <p className="flex justify-between items-center gap-2 font-medium">
                  <span className="text-slate-400 shrink-0">الأم:</span>
                  <span className="font-bold text-slate-800 truncate">{st.mother?.name || 'غير مسجلة'}</span>
                </p>
                <p className="flex justify-between items-center gap-2 font-medium">
                  <span className="text-slate-400 shrink-0">هاتف الاتصال:</span>
                  <span dir="ltr" className="font-bold font-mono text-slate-900 truncate">{st.father?.phoneMobile || st.mother?.phoneMobile || 'لا يوجد'}</span>
                </p>
              </div>

              {/* Badges of Enrolled Services */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {st.enrolledServices?.suivi && (
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200/50">
                    Suivi Scolaire
                  </span>
                )}
                {st.enrolledServices?.etude && (
                  <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-200/50">
                    Étude {centerName}
                  </span>
                )}
                {st.enrolledServices?.library && (
                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200/50">
                    Bibliothèque
                  </span>
                )}
                {!hideRestrictedModules && st.enrolledServices?.meals && (
                  <span className="text-[10px] font-bold bg-[#F2F8F9] text-[#14464E] px-2 py-0.5 rounded-md border border-[#C3E0E4]/50">
                    Repas (مطعم)
                  </span>
                )}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
              <button
                onClick={() => setSelectedStudent(st)}
                className="flex-1 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <FileText className="h-4 w-4 text-[#257C86]" />
                معاينة الملف
              </button>
              
              <button
                onClick={() => setPrintingRegistrationStudent(st)}
                className="py-2 px-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                title="طباعة بطاقة التسجيل"
              >
                <Printer className="h-4 w-4" />
                طباعة
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pagination Controls (20 per page) */}
      {totalPages > 1 && (
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs font-bold no-print">
          <button
            disabled={validCurrentPage <= 1}
            onClick={() => setCurrentPage(validCurrentPage - 1)}
            className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl disabled:opacity-40 cursor-pointer"
          >
            ◀ السابق
          </button>
          <span className="text-slate-600">صفحة {validCurrentPage} من {totalPages} (عرض 20 تلميذ)</span>
          <button
            disabled={validCurrentPage >= totalPages}
            onClick={() => setCurrentPage(validCurrentPage + 1)}
            className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl disabled:opacity-40 cursor-pointer"
          >
            التالي ▶
          </button>
        </div>
      )}

      {/* FULL FORM MODAL (MODULE 1 INSCIRPTION SHEET) */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#257C86] rounded-xl text-white font-bold">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black">
                      {editingStudentId ? 'تعديل بطاقة التسجيل' : 'تسجيل تلميذ جديد'}
                    </h3>
                    <p className="text-xs text-slate-300">مركز {centerName} — منظومة التسجيل</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsFormOpen(false)}
                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-8 max-h-[75vh] overflow-y-auto">
                
                {/* SECTION 1: ÉLÈVE */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-[#17555F] bg-[#F2F8F9] border-r-4 border-[#257C86] p-2 rounded-l-lg flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    1. هويّة التلميذ والسنة الدراسية
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">السنة الدراسية *</label>
                      <select
                        value={academicYear}
                        onChange={(e) => setAcademicYear(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      >
                        {customYears.map(yr => (
                          <option key={yr} value={yr}>السنة الدراسية {yr}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">اللقب *</label>
                      <input 
                        type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} onBlur={(e) => setLastName(capitalizeFirst(e.target.value))}
                        placeholder="مثال: الطرابلسي"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">الاسم *</label>
                      <input 
                        type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} onBlur={(e) => setFirstName(capitalizeFirst(e.target.value))}
                        placeholder="مثال: ياسين"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">تاريخ الميلاد</label>
                      <DateField 
                        value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">مكان الميلاد</label>
                      <input 
                        type="text" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)}
                        placeholder="مثال: تونس العاصمة"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">المستوى الدراسي *</label>
                      <select
                        value={grade} onChange={(e) => setGrade(e.target.value)}
                        className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                        style={{
                          backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%2364748b\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>')",
                          backgroundPosition: 'right 0.6rem center',
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: '1rem'
                        }}
                      >
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
                </div>

                {/* SECTION 2: RESPONSABLES LÉGAUX (MÈRE + PÈRE) */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-black text-[#17555F] bg-[#F2F8F9] border-r-4 border-[#257C86] p-2 rounded-l-lg flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    2. الوليين القانونيين
                  </h4>

                  {/* MÈRE */}
                  <div className="p-4 bg-slate-50 rounded-2xl space-y-3 border border-slate-200/60">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-[#14464E]">👩 الأم</span>
                      <button
                        type="button"
                        onClick={() => {
                          const currentExtras = mother.extraPhones || [];
                          setMother({ ...mother, extraPhones: [...currentExtras, ''] });
                        }}
                        className="text-[11px] font-bold text-[#17555F] hover:text-[#103840] bg-[#E0EFF1]/80 px-2.5 py-1 rounded-lg cursor-pointer border border-[#A0CBCF] flex items-center gap-1"
                      >
                        إضافة رقم هاتف للأم
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input 
                        type="text" value={mother.name} onChange={(e) => setMother({ ...mother, name: e.target.value })} onBlur={(e) => setMother({ ...mother, name: capitalizeFirst(e.target.value) })}
                        placeholder="اسم ولقب الأم" className="px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                      <DateField 
                        value={mother.birthDate} onChange={(e) => setMother({ ...mother, birthDate: e.target.value })}
                        className="px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                      <input 
                        type="text" value={mother.profession} onChange={(e) => setMother({ ...mother, profession: e.target.value })}
                        placeholder="المهنة" className="px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                      <input 
                        type="text" value={mother.phoneMobile} onChange={(e) => setMother({ ...mother, phoneMobile: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                        placeholder="الهاتف الجوال (8 أرقام) *" className="input-phone px-3 py-2 bg-white border rounded-xl text-xs font-mono font-semibold" maxLength={8}
                      />
                      <input 
                        type="text" value={mother.phoneFixed} onChange={(e) => setMother({ ...mother, phoneFixed: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                        placeholder="الهاتف القار (8 أرقام)" className="input-phone px-3 py-2 bg-white border rounded-xl text-xs font-mono font-semibold" maxLength={8}
                      />
                      <input 
                        type="email" value={mother.email} onChange={(e) => setMother({ ...mother, email: e.target.value })}
                        placeholder="البريد الإلكتروني" className="px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                      <input 
                        type="text" value={mother.address} onChange={(e) => setMother({ ...mother, address: e.target.value })}
                        placeholder="عنوان الإقامة" className="md:col-span-3 px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                    </div>

                    {/* Extra Phones for Mother */}
                    {(mother.extraPhones || []).length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <span className="text-[11px] font-bold text-slate-600 block">أرقام إضافية للأم:</span>
                        {(mother.extraPhones || []).map((phone, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input 
                              type="text"
                              value={phone}
                              onChange={(e) => {
                                const updated = [...(mother.extraPhones || [])];
                                updated[idx] = e.target.value.replace(/\D/g, '').slice(0, 8);
                                setMother({ ...mother, extraPhones: updated });
                              }}
                              placeholder={`رقم هاتف للأم #${idx + 1}`}
                              className="input-phone flex-1 px-3 py-1.5 bg-white border rounded-xl text-xs font-mono" maxLength={8}
                            />
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm({
                                title: 'حذف رقم للأم',
                                message: <>هل تريد حذف هذا الرقم: <strong className="font-mono" dir="ltr">{phone}</strong>؟</>,
                                action: () => {
                                  const updated = (mother.extraPhones || []).filter((_, i) => i !== idx);
                                  setMother({ ...mother, extraPhones: updated });
                                }
                              })}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                              title="حذف الرقم"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* PÈRE */}
                  <div className="p-4 bg-slate-50 rounded-2xl space-y-3 border border-slate-200/60">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-[#14464E]">👨 الأب (Père)</span>
                      <button
                        type="button"
                        onClick={() => {
                          const currentExtras = father.extraPhones || [];
                          setFather({ ...father, extraPhones: [...currentExtras, ''] });
                        }}
                        className="text-[11px] font-bold text-[#17555F] hover:text-[#103840] bg-[#E0EFF1]/80 px-2.5 py-1 rounded-lg cursor-pointer border border-[#A0CBCF] flex items-center gap-1"
                      >
                        إضافة رقم هاتف للأب
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input 
                        type="text" value={father.name} onChange={(e) => setFather({ ...father, name: e.target.value })} onBlur={(e) => setFather({ ...father, name: capitalizeFirst(e.target.value) })}
                        placeholder="اسم ولقب الأب" className="px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                      <DateField 
                        value={father.birthDate} onChange={(e) => setFather({ ...father, birthDate: e.target.value })}
                        className="px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                      <input 
                        type="text" value={father.profession} onChange={(e) => setFather({ ...father, profession: e.target.value })}
                        placeholder="المهنة" className="px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                      <input 
                        type="text" value={father.phoneMobile} onChange={(e) => setFather({ ...father, phoneMobile: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                        placeholder="الهاتف الجوال (8 أرقام) *" className="input-phone px-3 py-2 bg-white border rounded-xl text-xs font-mono font-semibold" maxLength={8}
                      />
                      <input 
                        type="text" value={father.phoneFixed} onChange={(e) => setFather({ ...father, phoneFixed: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                        placeholder="الهاتف القار (8 أرقام)" className="input-phone px-3 py-2 bg-white border rounded-xl text-xs font-mono font-semibold" maxLength={8}
                      />
                      <input 
                        type="email" value={father.email} onChange={(e) => setFather({ ...father, email: e.target.value })}
                        placeholder="البريد الإلكتروني" className="px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                      <input 
                        type="text" value={father.address} onChange={(e) => setFather({ ...father, address: e.target.value })}
                        placeholder="عنوان الإقامة" className="md:col-span-3 px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                    </div>

                    {/* Extra Phones for Father */}
                    {(father.extraPhones || []).length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <span className="text-[11px] font-bold text-slate-600 block">أرقام إضافية للأب:</span>
                        {(father.extraPhones || []).map((phone, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input 
                              type="text"
                              value={phone}
                              onChange={(e) => {
                                const updated = [...(father.extraPhones || [])];
                                updated[idx] = e.target.value.replace(/\D/g, '').slice(0, 8);
                                setFather({ ...father, extraPhones: updated });
                              }}
                              placeholder={`رقم هاتف للأب #${idx + 1}`}
                              className="input-phone flex-1 px-3 py-1.5 bg-white border rounded-xl text-xs font-mono" maxLength={8}
                            />
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm({
                                title: 'حذف رقم للأب',
                                message: <>هل تريد حذف هذا الرقم: <strong className="font-mono" dir="ltr">{phone}</strong>؟</>,
                                action: () => {
                                  const updated = (father.extraPhones || []).filter((_, i) => i !== idx);
                                  setFather({ ...father, extraPhones: updated });
                                }
                              })}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                              title="حذف الرقم"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* SITUATION PARENTALE & CUSTODY COMMENTS IN STACKED ORDER */}
                  <div className="space-y-4 pt-2 bg-[#F2F8F9]/40 p-4 rounded-2xl border border-[#C3E0E4]/60">
                    <div>
                      <label className="text-xs font-black text-[#103840] block mb-1">الوضعية العائلية *</label>
                      <select
                        value={parentalSituation} onChange={(e) => setParentalSituation(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      >
                        <option value="mariés">متزوجان</option>
                        <option value="séparés_garde_mere">منفصلان - حضانة الأم</option>
                        <option value="séparés_garde_pere">منفصلان - حضانة الأب</option>
                        <option value="séparés_garde_alternee">منفصلان - حضانة تناوبية</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-black text-[#103840] block mb-1">ملاحظات وقرارات الحضانة</label>
                      <input 
                        type="text" value={parentalComments} onChange={(e) => setParentalComments(e.target.value)}
                        placeholder="تفاصيل وقرارات الحضانة..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: FAMILY & AUTHORIZED PERSONS IN 2 SEPARATE ROWS */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-black text-[#17555F] bg-[#F2F8F9] border-r-4 border-[#257C86] p-2 rounded-l-lg flex items-center gap-2">
                    <HeartHandshake className="h-4 w-4" />
                    3. التركيبة العائلية والمأذونون بالمغادرة
                  </h4>

                  <div className="space-y-6">
                    {/* Row 1: Siblings */}
                    <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                      <div className="flex justify-between items-center border-b border-slate-200/80 pb-2">
                        <span className="text-xs font-black text-slate-800">السطر الأول: الإخوة والأخوات</span>
                        <button 
                          type="button" onClick={handleAddSibling}
                          className="px-3 py-1 bg-[#257C86] text-white font-bold text-xs rounded-lg hover:bg-[#1E6A73] transition cursor-pointer"
                        >
                          إضافة أخ/أخت
                        </button>
                      </div>

                      {siblings.length === 0 ? (
                        <p className="text-[11px] text-slate-400">لا يوجد إخوة مضافون.</p>
                      ) : (
                        <div className="space-y-2">
                          {siblings.map((sib, i) => (
                            <div key={sib.id} className="flex gap-2 items-center">
                              <input 
                                type="text" placeholder="اسم الأخ / الاخت" value={sib.name}
                                onChange={(e) => {
                                  const updated = [...siblings];
                                  updated[i].name = e.target.value;
                                  setSiblings(updated);
                                }}
                                onBlur={(e) => {
                                  const updated = [...siblings];
                                  updated[i].name = capitalizeFirst(e.target.value);
                                  setSiblings(updated);
                                }}
                                className="flex-1 px-3 py-1.5 bg-white border rounded-xl text-xs font-semibold"
                              />
                              <input 
                                type="number" placeholder="العمر" value={sib.age || ''}
                                onChange={(e) => {
                                  const updated = [...siblings];
                                  updated[i].age = Number(e.target.value);
                                  setSiblings(updated);
                                }}
                                className="w-20 px-3 py-1.5 bg-white border rounded-xl text-xs font-bold"
                              />
                              <input 
                                type="text" placeholder="القسم / المستوى" value={sib.grade}
                                onChange={(e) => {
                                  const updated = [...siblings];
                                  updated[i].grade = e.target.value;
                                  setSiblings(updated);
                                }}
                                className="w-32 px-3 py-1.5 bg-white border rounded-xl text-xs"
                              />
                              <button 
                                type="button" onClick={() => setDeleteConfirm({
                                  title: 'حذف الأخ / الأخت',
                                  message: <>هل أنت متأكد من حذف الأخ/الأخت <strong>{sib.name || `#${i + 1}`}</strong>؟</>,
                                  action: () => handleRemoveSibling(sib.id)
                                })}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Row 2: Authorized Persons */}
                    <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                      <div className="flex justify-between items-center border-b border-slate-200/80 pb-2">
                        <span className="text-xs font-black text-slate-800">السطر الثاني: الأشخاص المأذونون بالمغادرة</span>
                        <button 
                          type="button" onClick={handleAddAuthPerson}
                          className="px-3 py-1 bg-[#257C86] text-white font-bold text-xs rounded-lg hover:bg-[#1E6A73] transition cursor-pointer"
                        >
                          إضافة مأذون
                        </button>
                      </div>

                      {authorizedPersons.length === 0 ? (
                        <p className="text-[11px] text-slate-400">لا يوجد مأذونون (الوالدان فقط).</p>
                      ) : (
                        <div className="space-y-2">
                          {authorizedPersons.map((auth, i) => (
                            <div key={auth.id} className="flex gap-2 items-center">
                              <input 
                                type="text" placeholder="الاسم واللقب للمأذون" value={auth.name}
                                onChange={(e) => {
                                  const updated = [...authorizedPersons];
                                  updated[i].name = e.target.value;
                                  setAuthorizedPersons(updated);
                                }}
                                onBlur={(e) => {
                                  const updated = [...authorizedPersons];
                                  updated[i].name = capitalizeFirst(e.target.value);
                                  setAuthorizedPersons(updated);
                                }}
                                className="flex-1 px-3 py-1.5 bg-white border rounded-xl text-xs font-semibold"
                              />
                              <input 
                                type="text" placeholder="رقم الهاتف (8 أرقام)" value={auth.phone}
                                onChange={(e) => {
                                  const updated = [...authorizedPersons];
                                  updated[i].phone = e.target.value.replace(/\D/g, '').slice(0, 8);
                                  setAuthorizedPersons(updated);
                                }}
                                className="input-phone w-36 px-3 py-1.5 bg-white border rounded-xl text-xs font-mono" maxLength={8}
                              />
                              <input 
                                type="text" placeholder="صلة القرابة (خال، جدة)" value={auth.relation}
                                onChange={(e) => {
                                  const updated = [...authorizedPersons];
                                  updated[i].relation = e.target.value;
                                  setAuthorizedPersons(updated);
                                }}
                                className="w-32 px-3 py-1.5 bg-white border rounded-xl text-xs"
                              />
                              <button 
                                type="button" onClick={() => setDeleteConfirm({
                                  title: 'حذف المأذون',
                                  message: <>هل أنت متأكد من حذف المأذون <strong>{auth.name || `#${i + 1}`}</strong> من قائمة المأذونين بالمغادرة؟</>,
                                  action: () => handleRemoveAuthPerson(auth.id)
                                })}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 4: FICHE MÉDICALE & ALLERGIES */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-black text-red-700 bg-red-50 border-r-4 border-red-500 p-2 rounded-l-lg flex items-center gap-2">
                    <HeartPulse className="h-4 w-4" />
                    4. الاحتياطات والحساسيات الطبية
                  </h4>
                  <p className="text-xs text-slate-500">
                    تحديد الحالات الصحية والحساسيات والاحتياطات الطبية الخاصة بالتلميذ.
                  </p>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">الحساسيات والاحتياطات الطبية</label>
                    <input 
                      type="text" value={allergies} onChange={(e) => setAllergies(e.target.value)}
                      placeholder="مثال: حساسية الفول السوداني / حليب اللاكتوز / الربو..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                </div>

                {/* SECTION 5: CURSUS SCOLAIRE (3 LAST YEARS) */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-black text-[#17555F] bg-[#F2F8F9] border-r-4 border-[#257C86] p-2 rounded-l-lg flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    5. المسار الدراسي لآخر 3 سنوات
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                    <div className="space-y-2">
                      <span className="text-xs font-black text-slate-800 block">السنة السابقة (N-1)</span>
                      <input 
                        type="text" placeholder="المؤسسة / الإعدادية" value={nMinus1School} onChange={(e) => setNMinus1School(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                      />
                      <input 
                        type="text" placeholder="المستوى (القسم)" value={nMinus1Grade} onChange={(e) => setNMinus1Grade(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-black text-slate-800 block">قبل سنتين (N-2)</span>
                      <input 
                        type="text" placeholder="المؤسسة / الإعدادية" value={nMinus2School} onChange={(e) => setNMinus2School(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                      />
                      <input 
                        type="text" placeholder="المستوى (القسم)" value={nMinus2Grade} onChange={(e) => setNMinus2Grade(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-black text-slate-800 block">قبل 3 سنوات (N-3)</span>
                      <input 
                        type="text" placeholder="المؤسسة / المدرسة" value={nMinus3School} onChange={(e) => setNMinus3School(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                      />
                      <input 
                        type="text" placeholder="المستوى (القسم)" value={nMinus3Grade} onChange={(e) => setNMinus3Grade(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 5: SERVICES SUBSCRIPTION */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-black text-[#17555F] bg-[#F2F8F9] border-r-4 border-[#257C86] p-2 rounded-l-lg flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    5. خدمات وموديولات السنتر
                  </h4>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <label className={`p-4 rounded-2xl border transition flex items-center gap-3 ${lockedSuivi ? 'bg-slate-100 border-slate-300 text-slate-700 cursor-not-allowed' : suiviEnrolled ? 'bg-[#F2F8F9] border-[#3A93A0] text-[#103840] cursor-pointer' : 'bg-slate-50 border-slate-200 text-slate-600 cursor-pointer'}`}>
                      <input 
                        type="checkbox" checked={suiviEnrolled} disabled={lockedSuivi} onChange={(e) => setSuiviEnrolled(e.target.checked)}
                        className="h-4 w-4 rounded text-[#257C86] focus:ring-[#257C86]"
                      />
                      <div>
                        <span className="font-bold text-xs block">Suivi Scolaire</span>
                        {lockedSuivi && (
                          <span className="flex items-center gap-1 text-[9px] font-black text-slate-600 mt-0.5">
                            <Lock className="h-3 w-3 shrink-0" /> مدفوع — الاسترجاع مطلوب لتغيير الاشتراك
                          </span>
                        )}
                      </div>
                    </label>

                    <label className={`p-4 rounded-2xl border transition flex items-center gap-3 ${lockedEtude ? 'bg-slate-100 border-slate-300 text-slate-700 cursor-not-allowed' : etudeEnrolled ? 'bg-[#F2F8F9] border-[#3A93A0] text-[#103840] cursor-pointer' : 'bg-slate-50 border-slate-200 text-slate-600 cursor-pointer'}`}>
                      <input 
                        type="checkbox" checked={etudeEnrolled} disabled={lockedEtude} onChange={(e) => setEtudeEnrolled(e.target.checked)}
                        className="h-4 w-4 rounded text-[#257C86] focus:ring-[#257C86]"
                      />
                      <div>
                        <span className="font-bold text-xs block">Étude {centerName}</span>
                        {lockedEtude && (
                          <span className="flex items-center gap-1 text-[9px] font-black text-slate-600 mt-0.5">
                            <Lock className="h-3 w-3 shrink-0" /> مدفوع — الاسترجاع مطلوب لتغيير الاشتراك
                          </span>
                        )}
                      </div>
                    </label>

                    <label className={`p-4 rounded-2xl border transition flex items-center gap-3 ${lockedLibrary ? 'bg-slate-100 border-slate-300 text-slate-700 cursor-not-allowed' : libraryEnrolled ? 'bg-[#F2F8F9] border-[#3A93A0] text-[#103840] cursor-pointer' : 'bg-slate-50 border-slate-200 text-slate-600 cursor-pointer'}`}>
                      <input 
                        type="checkbox" checked={libraryEnrolled} disabled={lockedLibrary} onChange={(e) => setLibraryEnrolled(e.target.checked)}
                        className="h-4 w-4 rounded text-[#257C86] focus:ring-[#257C86]"
                      />
                      <div>
                        <span className="font-bold text-xs block">Bibliothèque</span>
                        {lockedLibrary && (
                          <span className="flex items-center gap-1 text-[9px] font-black text-slate-600 mt-0.5">
                            <Lock className="h-3 w-3 shrink-0" /> مدفوع — الاسترجاع مطلوب لتغيير الاشتراك
                          </span>
                        )}
                      </div>
                    </label>

                    {!hideRestrictedModules && (
                      <label className={`p-4 rounded-2xl border transition flex items-center gap-3 ${lockedMeals ? 'bg-slate-100 border-slate-300 text-slate-700 cursor-not-allowed' : mealsEnrolled ? 'bg-[#F2F8F9] border-[#3A93A0] text-[#103840] cursor-pointer' : 'bg-slate-50 border-slate-200 text-slate-600 cursor-pointer'}`}>
                        <input 
                          type="checkbox" checked={mealsEnrolled} disabled={lockedMeals} onChange={(e) => setMealsEnrolled(e.target.checked)}
                          className="h-4 w-4 rounded text-[#257C86] focus:ring-[#257C86]"
                        />
                        <div>
                          <span className="font-bold text-xs block">Repas (مطعم)</span>
                          {lockedMeals && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-slate-600 mt-0.5">
                              <Lock className="h-3 w-3 shrink-0" /> مدفوع — الاسترجاع مطلوب لتغيير الاشتراك
                            </span>
                          )}
                        </div>
                      </label>
                    )}
                  </div>
                </div>

                {/* SECTION 6: SIGNATURE & DATE */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-black text-[#17555F] bg-[#F2F8F9] border-r-4 border-[#257C86] p-2 rounded-l-lg flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    6. التوقيع وتاريخ التسجيل
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">التحرير</label>
                      <input 
                        type="text" value={regLocation} onChange={(e) => setRegLocation(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">تاريخ التسجيل</label>
                      <DateField 
                        value={regDate} onChange={(e) => setRegDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">اسم الموقع</label>
                      <input 
                        type="text" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} onBlur={(e) => setSignatureName(capitalizeFirst(e.target.value))}
                        placeholder="اسم الولي"
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold text-[#103840]"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit actions */}
                <div className="pt-4 border-t border-slate-100 flex gap-3 justify-end">
                  <button
                    type="button" onClick={() => setIsFormOpen(false)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#257C86] hover:bg-[#1E6A73] text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-[#257C86]/20 flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {editingStudentId ? 'حفظ التعديلات' : 'تأكيد التسجيل'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DETAILED STUDENT MODAL VIEW */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold text-[#3A93A0] bg-[#257C86]/20 px-2.5 py-1 rounded-md">
                    بطاقة تلميذ — {selectedStudent.grade}
                  </span>
                  <h3 className="text-2xl font-black mt-1.5">
                    {selectedStudent.firstName} {selectedStudent.lastName}
                  </h3>
                </div>

                <button 
                  onClick={() => setSelectedStudent(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-xs">
                
                {/* Legal Guardians */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 space-y-1">
                    <h4 className="font-bold text-slate-800 text-sm mb-2 border-b pb-1">👩 بيانات الأم</h4>
                    <p><span className="text-slate-400">الاسم:</span> <strong className="text-slate-900">{selectedStudent.mother?.name || 'غير مدخل'}</strong></p>
                    <p><span className="text-slate-400">المهنة:</span> <strong className="text-slate-900">{selectedStudent.mother?.profession || 'غير مدخل'}</strong></p>
                    <p><span className="text-slate-400">الهاتف:</span> <strong dir="ltr" className="font-mono text-slate-900">{selectedStudent.mother?.phoneMobile || 'غير مدخل'}</strong></p>
                    <p><span className="text-slate-400">البريد:</span> <strong className="font-mono text-slate-900">{selectedStudent.mother?.email || 'غير مدخل'}</strong></p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 space-y-1">
                    <h4 className="font-bold text-slate-800 text-sm mb-2 border-b pb-1">👨 بيانات الأب</h4>
                    <p><span className="text-slate-400">الاسم:</span> <strong className="text-slate-900">{selectedStudent.father?.name || 'غير مدخل'}</strong></p>
                    <p><span className="text-slate-400">المهنة:</span> <strong className="text-slate-900">{selectedStudent.father?.profession || 'غير مدخل'}</strong></p>
                    <p><span className="text-slate-400">الهاتف:</span> <strong dir="ltr" className="font-mono text-slate-900">{selectedStudent.father?.phoneMobile || 'غير مدخل'}</strong></p>
                    <p><span className="text-slate-400">البريد:</span> <strong className="font-mono text-slate-900">{selectedStudent.father?.email || 'غير مدخل'}</strong></p>
                  </div>
                </div>

                {/* Situation & Allergies */}
                <div className="p-4 bg-[#F2F8F9]/50 rounded-2xl border border-[#E0EFF1] space-y-2">
                  <p><span className="font-bold text-slate-700">الوضعية العائلية:</span> <span className="font-extrabold text-[#103840]">{parentalSituationLabel(selectedStudent.parentalSituation)}</span></p>
                  {selectedStudent.parentalComments && <p><span className="font-bold text-slate-700">ملاحظات الحضانة:</span> {selectedStudent.parentalComments}</p>}
                  {selectedStudent.allergies && <p><span className="font-bold text-red-600">⚠️ الحساسية والاحتياطات:</span> <span className="font-bold text-red-800">{selectedStudent.allergies}</span></p>}
                </div>

                {/* Academic History */}
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800 text-sm">📚 المسار الدراسي (3 سنوات)</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px]">السنة السابقة N-1</span>
                      <p className="font-bold text-slate-900">{selectedStudent.academicHistory?.nMinus1?.school || 'غير مسجل'}</p>
                      <p className="text-[10px] text-slate-500">{selectedStudent.academicHistory?.nMinus1?.grade}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px]">قبل سنتين N-2</span>
                      <p className="font-bold text-slate-900">{selectedStudent.academicHistory?.nMinus2?.school || 'غير مسجل'}</p>
                      <p className="text-[10px] text-slate-500">{selectedStudent.academicHistory?.nMinus2?.grade}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px]">قبل 3 سنوات N-3</span>
                      <p className="font-bold text-slate-900">{selectedStudent.academicHistory?.nMinus3?.school || 'غير مسجل'}</p>
                      <p className="text-[10px] text-slate-500">{selectedStudent.academicHistory?.nMinus3?.grade}</p>
                    </div>
                  </div>
                </div>

                {/* Signature info */}
                <div className="p-4 bg-slate-900 text-white rounded-2xl flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-slate-400 block">التوقيع وتاريخ التسجيل</span>
                    <span className="font-bold text-[#3A93A0]">الموقع: {selectedStudent.registration?.signatureName || 'الولي'}</span>
                  </div>
                  <div className="text-left font-mono text-[11px] text-slate-300">
                    <div>{selectedStudent.registration?.location}</div>
                    <div>{selectedStudent.registration?.date}</div>
                  </div>
                </div>

              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-2">
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  إغلاق
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDeleteConfirm({
                      title: 'حذف ملف التلميذ',
                      message: (
                        <>
                          هل أنت متأكد تماماً من حذف التلميذ <strong>{selectedStudent.firstName} {selectedStudent.lastName}</strong> من المنظومة؟
                          <p className="mt-2 text-[11px] text-slate-400 font-bold">لا يمكن التراجع عن هذا الإجراء.</p>
                        </>
                      ),
                      action: () => {
                        onDeleteStudent(selectedStudent.id);
                        setSelectedStudent(null);
                        toast.success(`تم حذف تسجيل التلميذ (${selectedStudent.firstName} ${selectedStudent.lastName}) نهائياً.`);
                      }
                    })}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف ملف التلميذ
                  </button>

                  <button
                    onClick={() => setPrintingRegistrationStudent(selectedStudent)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    طباعة بطاقة التسجيل
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRINTABLE OFFICIAL INSCRIPTION SHEET MODAL */}
      <AnimatePresence>
        {printingRegistrationStudent && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh] overflow-hidden"
            >
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center no-print shrink-0">
                <span className="font-bold text-sm">معاينة بطاقة التسجيل قبل الطباعة</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#257C86] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    طباعة / حفظ PDF 🖨️
                  </button>
                  <button
                    onClick={() => setPrintingRegistrationStudent(null)}
                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* PRINT CONTENT */}
              <div className="overflow-y-auto p-4">
              <div className="print-area p-6 sm:p-8 bg-white text-slate-900 font-sans leading-relaxed rounded-2xl w-full mx-auto text-xs flex flex-col">
                
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-950">{centerName} — مركز الدعم والدروس الخصوصية</h2>
                    <p className="text-[10px] text-slate-500 font-bold">بطاقة التسجيل الرسمية</p>
                    <p className="text-[10px] text-slate-400">
                      {settings?.locationCity || 'Sfax / تونس'} — الهاتف: <span dir="ltr" className="font-mono font-bold">{settings?.phoneNumber || '+216 71 000 000'}</span>
                    </p>
                  </div>
                  <div className="text-left font-mono text-[10px]">
                    <div className="p-2 border border-slate-900 rounded font-bold bg-slate-50">
                      رقم الملف: TC-REG-{printingRegistrationStudent.id.slice(-4)}
                    </div>
                  </div>
                </div>

                {/* Élève info - ROW 1 */}
                <div className="space-y-4 flex-1">
                  <div className="p-3 bg-slate-100 rounded border border-slate-300">
                    <h3 className="font-black text-sm mb-2 text-slate-900 border-b border-slate-300 pb-1">1. معلومات التلميذ(ة)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <p><span className="text-slate-500">اللقب والاسم:</span> <strong>{printingRegistrationStudent.lastName} {printingRegistrationStudent.firstName}</strong></p>
                      <p><span className="text-slate-500">تاريخ الميلاد:</span> <strong>{printingRegistrationStudent.birthDate || 'غير محدد'}</strong></p>
                      <p><span className="text-slate-500">مكان الميلاد:</span> <strong>{printingRegistrationStudent.birthPlace || 'تونس'}</strong></p>
                      <p><span className="text-slate-500">المستوى الدراسي:</span> <strong>{printingRegistrationStudent.grade}</strong></p>
                    </div>
                    {printingRegistrationStudent.allergies && (
                      <p className="mt-1 text-[11px]"><span className="text-slate-500">الحساسيات والاحتياطات الطبية:</span> <strong className="text-red-700">{printingRegistrationStudent.allergies}</strong></p>
                    )}
                  </div>

                    {/* Parents info - ROW 2 */}
                  <div className="p-3 bg-slate-100 rounded border border-slate-300">
                    <h3 className="font-black text-sm mb-2 text-slate-900 border-b border-slate-300 pb-1">2. الوليين القانونيين</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-2 rounded border border-slate-200">
                        <p className="font-bold text-[#103840] border-b pb-0.5 mb-1">👩 بيانات الأم:</p>
                        <p>الاسم: <strong>{printingRegistrationStudent.mother?.name || 'غير مسجل'}</strong></p>
                        <p>المهنة: {printingRegistrationStudent.mother?.profession || 'غير محددة'}</p>
                        <p>الهاتف الجوال: <strong dir="ltr" className="font-mono">{printingRegistrationStudent.mother?.phoneMobile || 'لا يوجد'}</strong></p>
                        {printingRegistrationStudent.mother?.phoneFixed && <p>الهاتف القار: <span dir="ltr" className="font-mono">{printingRegistrationStudent.mother?.phoneFixed}</span></p>}
                        {printingRegistrationStudent.mother?.extraPhones && printingRegistrationStudent.mother.extraPhones.length > 0 && (
                          <p dir="ltr">أرقام إضافية للأم: <strong className="font-mono">{printingRegistrationStudent.mother.extraPhones.filter(Boolean).join(' / ')}</strong></p>
                        )}
                        <p>العنوان: {printingRegistrationStudent.mother?.address || 'نفس العنوان'}</p>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200">
                        <p className="font-bold text-[#103840] border-b pb-0.5 mb-1">👨 بيانات الأب:</p>
                        <p>الاسم: <strong>{printingRegistrationStudent.father?.name || 'غير مسجل'}</strong></p>
                        <p>المهنة: {printingRegistrationStudent.father?.profession || 'غير محددة'}</p>
                        <p>الهاتف الجوال: <strong dir="ltr" className="font-mono">{printingRegistrationStudent.father?.phoneMobile || 'لا يوجد'}</strong></p>
                        {printingRegistrationStudent.father?.phoneFixed && <p>الهاتف القار: <span dir="ltr" className="font-mono">{printingRegistrationStudent.father?.phoneFixed}</span></p>}
                        {printingRegistrationStudent.father?.extraPhones && printingRegistrationStudent.father.extraPhones.length > 0 && (
                          <p dir="ltr">أرقام إضافية للأب: <strong className="font-mono">{printingRegistrationStudent.father.extraPhones.filter(Boolean).join(' / ')}</strong></p>
                        )}
                        <p>العنوان: {printingRegistrationStudent.father?.address || 'نفس العنوان'}</p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-300 flex justify-between items-center bg-white p-2 rounded">
                      <p><span className="text-slate-500">الوضعية العائلية:</span> <strong>{parentalSituationLabel(printingRegistrationStudent.parentalSituation) || 'متزوجان'}</strong></p>
                      {printingRegistrationStudent.parentalComments && (
                        <p><span className="text-slate-500">قرارات الحضانة:</span> <strong className="text-slate-800">{printingRegistrationStudent.parentalComments}</strong></p>
                      )}
                    </div>
                  </div>

                  {/* Family & Authorized persons - ROW 3 */}
                  <div className="p-3 bg-slate-100 rounded border border-slate-300">
                    <h3 className="font-black text-sm mb-2 text-slate-900 border-b border-slate-300 pb-1">3. التركيبة العائلية والمأذونون بالمغادرة</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="font-bold text-slate-800 mb-1">الإخوة والأخوات:</p>
                        {(!printingRegistrationStudent.siblings || printingRegistrationStudent.siblings.length === 0) ? (
                          <p className="text-[10px] text-slate-400">لا يوجد إخوة مسجلين.</p>
                        ) : (
                          <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                            {printingRegistrationStudent.siblings.map(sib => (
                              <li key={sib.id}>{sib.name} ({sib.age} سنة) — {sib.grade}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 mb-1">المأذونون بالمغادرة:</p>
                        {(!printingRegistrationStudent.authorizedPersons || printingRegistrationStudent.authorizedPersons.length === 0) ? (
                          <p className="text-[10px] text-slate-400">الوالدان فقط.</p>
                        ) : (
                          <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                            {printingRegistrationStudent.authorizedPersons.map(auth => (
                              <li key={auth.id}>{auth.name} ({auth.relation}) — <span dir="ltr" className="font-mono">{auth.phone}</span></li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Medical / Allergies info - ROW 4 */}
                  <div className="p-3 bg-red-50 rounded border border-red-200">
                    <h3 className="font-black text-sm mb-1 text-red-900 border-b border-red-200 pb-1">4. الاحتياطات والحساسيات الطبية</h3>
                    <p className="text-[11px] font-bold text-red-800">
                      {printingRegistrationStudent.allergies || 'لا توجد حساسيات أو ملاحظات طبية مدونة.'}
                    </p>
                  </div>

                  {/* Academic history - ROW 4 */}
                  <div className="p-3 bg-slate-100 rounded border border-slate-300">
                    <h3 className="font-black text-sm mb-2 text-slate-900 border-b border-slate-300 pb-1">4. المسار الدراسي (3 سنوات سابقة)</h3>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="p-1 bg-white rounded border"><strong>N-1:</strong> {printingRegistrationStudent.academicHistory?.nMinus1?.school || 'غير مدون'} ({printingRegistrationStudent.academicHistory?.nMinus1?.grade || '-'})</div>
                      <div className="p-1 bg-white rounded border"><strong>N-2:</strong> {printingRegistrationStudent.academicHistory?.nMinus2?.school || 'غير مدون'} ({printingRegistrationStudent.academicHistory?.nMinus2?.grade || '-'})</div>
                      <div className="p-1 bg-white rounded border"><strong>N-3:</strong> {printingRegistrationStudent.academicHistory?.nMinus3?.school || 'غير مدون'} ({printingRegistrationStudent.academicHistory?.nMinus3?.grade || '-'})</div>
                    </div>
                  </div>

                  {/* Services - ROW 5 */}
                  <div className="p-3 bg-slate-100 rounded border border-slate-300">
                    <h3 className="font-black text-sm mb-2 text-slate-900 border-b border-slate-300 pb-1">5. الخدمات والاشتراكات</h3>
                    <div className="flex flex-wrap gap-2 text-[10px]">
                      {printingRegistrationStudent.enrolledServices?.suivi && <span className="px-2 py-1 bg-blue-100 text-blue-900 rounded font-bold">✓ Suivi Scolaire</span>}
                      {printingRegistrationStudent.enrolledServices?.etude && <span className="px-2 py-1 bg-purple-100 text-purple-900 rounded font-bold">✓ Étude {centerName}</span>}
                      {printingRegistrationStudent.enrolledServices?.library && <span className="px-2 py-1 bg-emerald-100 text-emerald-900 rounded font-bold">✓ Bibliothèque</span>}
                      {!hideRestrictedModules && printingRegistrationStudent.enrolledServices?.meals && <span className="px-2 py-1 bg-[#E0EFF1] text-[#103840] rounded font-bold">✓ Repas</span>}
                    </div>
                  </div>

                  </div>

                {/* Notes + Signature - always pinned to the bottom of the page (bottom of the last page when the fiche spans 2 pages) */}
                <div className="mt-auto pt-4 border-t-2 border-slate-900 space-y-4 print-footer">
                  <div className="p-3 bg-slate-50 rounded border border-slate-300">
                    <h3 className="font-black text-sm mb-2 text-slate-900 border-b border-slate-300 pb-1">الملاحظات</h3>
                    <ul className="list-disc list-inside space-y-1 text-[11px] font-bold text-red-800">
                      <li>يمنع منعا باتا اصطحاب الهاتف الجوال للسنتر</li>
                      <li>السنتر غير مسؤول عن ضياع الأشياء الثمينة</li>
                    </ul>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p>حرر بـ: <strong>{printingRegistrationStudent.registration?.location || 'تونس'}</strong> في: <strong>{printingRegistrationStudent.registration?.date}</strong></p>
                      <p className="mt-1 text-slate-500 text-[10px]">التوقيع يلزم بالنظام الداخلي لمركز {centerName}.</p>
                    </div>

                    <div className="text-center">
                      <p className="font-bold">توقيع الولي المصرح:</p>
                      <div className="mt-2 px-4 py-2 border border-slate-400 border-dashed rounded font-serif italic font-bold">
                        {printingRegistrationStudent.registration?.signatureName || 'توقيع مصادق عليه'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* IMPORT / COPY STUDENT FILE FROM PREVIOUS YEAR MODAL */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#3A93A0]" />
                  <h3 className="text-lg font-black">استيراد ملف تلميذ من سنة سابقة</h3>
                </div>
                <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                  اختر تلميذاً من سنة سابقة لنسخ ملفه إلى السنة الدراسية المستهدفة:
                </p>

                {/* Target academic year selector */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    السنة الدراسية الهدف *
                  </label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={importTargetYear}
                      onChange={(e) => {
                        setImportTargetYear(e.target.value);
                        setSelectedStudentToImport('');
                      }}
                      className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      {customYears.map(yr => (
                        <option key={yr} value={yr}>السنة الدراسية {yr}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">اختر التلميذ *</label>
                  <select
                    value={selectedStudentToImport}
                    onChange={(e) => setSelectedStudentToImport(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <option value="">-- اختر تلميذاً --</option>
                    {(() => {
                      const targetYr = importTargetYear || getCurrentAcademicYear();
                      const existingNamesInTargetYear = new Set(
                        students
                          .filter(st => (st.academicYear || getCurrentAcademicYear()) === targetYr)
                          .map(st => `${st.firstName.trim().toLowerCase()}_${st.lastName.trim().toLowerCase()}`)
                      );
                      const importableStudents = students.filter(st => {
                        const stYear = st.academicYear || getCurrentAcademicYear();
                        if (stYear === targetYr) return false;
                        const fullNameKey = `${st.firstName.trim().toLowerCase()}_${st.lastName.trim().toLowerCase()}`;
                        if (existingNamesInTargetYear.has(fullNameKey)) return false;
                        return true;
                      });

                      if (importableStudents.length === 0) {
                        return <option disabled value="">كل التلاميذ مسجلون في السنة المستهدفة ({targetYr})</option>;
                      }

                      return importableStudents.map(st => (
                        <option key={st.id} value={st.id}>
                          {st.firstName} {st.lastName} ({st.grade}) — سنة: {st.academicYear || getCurrentAcademicYear()}
                        </option>
                      ));
                    })()}
                  </select>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    disabled={!selectedStudentToImport}
                    onClick={() => handleImportStudent(selectedStudentToImport)}
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] disabled:opacity-40 text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Sparkles className="h-4 w-4 text-white" />
                    استيراد الفيش للسنة الجديدة
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* GENERIC DELETE CONFIRMATION DIALOG */}
      <AnimatePresence>
        {pdfImporting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 no-print"
            aria-busy="true"
            aria-live="polite"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4 pointer-events-auto"
            >
              {pdfImportOffline ? (
                <>
                  <WifiOff className="h-12 w-12 text-red-500 mx-auto" />
                  <h3 className="text-lg font-black text-slate-900">لا يوجد اتصال بالإنترنت</h3>
                  <p className="text-sm text-slate-500">تحقق من اتصالك بالشبكة ثم حاول مرة أخرى</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-12 w-12 text-[#257C86] mx-auto animate-spin" />
                  <h3 className="text-lg font-black text-slate-900">جاري استخراج البيانات</h3>
                  <p className="text-sm text-slate-500">يتم تحليل ملف PDF عبر الذكاء الاصطناعي، يرجى الانتظار...</p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!deleteConfirm}
        title={deleteConfirm?.title || 'تأكيد الحذف'}
        message={deleteConfirm?.message}
        confirmLabel="نعم، احذف"
        onConfirm={() => {
          deleteConfirm?.action();
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

    </div>
  );
}
