import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Users, 
  Phone, 
  Plus, 
  CheckCircle2, 
  Calendar, 
  Percent, 
  DollarSign, 
  Trash2, 
  Edit3, 
  UserPlus, 
  Clock, 
  CheckSquare, 
  XSquare, 
  Printer,
  X,
  ChevronDown
} from 'lucide-react';
import { Student, ExternalCourse, ExternalCourseSession, ExternalCourseStudent, CenterSettings, getFeesForYear, EXTERNAL_GRADE_OPTIONS, SeanceStudentStatus, ExternalStudentRegister, getAppSubjects, getCurrentAcademicYear } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import DateField from './DateField';
import { capitalizeFirst } from '../utils/format';

interface ExternalCoursesModuleProps {
  students: Student[];
  courses: ExternalCourse[];
  sessions: ExternalCourseSession[];
  settings?: CenterSettings;
  onUpdateSettings?: (newSettings: CenterSettings) => void;
  externalStudents: ExternalStudentRegister[];
  onUpdateExternalStudents: (list: ExternalStudentRegister[]) => void;
  onUpdateCourses: (courses: ExternalCourse[]) => void;
  onUpdateSessions: (sessions: ExternalCourseSession[]) => void;
  sidebarCollapsed?: boolean;
}

export default function ExternalCoursesModule({
  students,
  courses,
  sessions,
  settings,
  onUpdateSettings,
  externalStudents,
  onUpdateExternalStudents,
  onUpdateCourses,
  onUpdateSessions,
  sidebarCollapsed
}: ExternalCoursesModuleProps) {
  const toast = useToast();
  const [selectedCourse, setSelectedCourse] = useState<ExternalCourse | null>(courses[0] || null);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

  // Form states for new/edit course
  const [schoolYear, setSchoolYear] = useState(getCurrentAcademicYear());
  const [trimester, setTrimester] = useState('Trimestre 1');
  const [gradeBase, setGradeBase] = useState('Collège 7ème Année');
  const [subject, setSubject] = useState('Mathématiques');
  const [teacherName, setTeacherName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [teacherShare, setTeacherShare] = useState(70);
  const [centerShare, setCenterShare] = useState(10);

  // Filter state for the courses list
  const [filterYear, setFilterYear] = useState('all');
  const [filterTrimester, setFilterTrimester] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [coursesListPage, setCoursesListPage] = useState<number>(1);

  // Add new matière state (shared across the app)
  const [isAddingCourseSubject, setIsAddingCourseSubject] = useState(false);
  const [newCourseSubject, setNewCourseSubject] = useState('');

  const appSubjects = getAppSubjects(settings);

  const handleAddCourseSubject = () => {
    if (!newCourseSubject.trim() || !settings || !onUpdateSettings) return;
    const sub = newCourseSubject.trim();
    if (!appSubjects.includes(sub)) {
      onUpdateSettings({ ...settings, subjects: [...appSubjects, sub] });
    }
    setSubject(sub);
    setNewCourseSubject('');
    setIsAddingCourseSubject(false);
  };

  const YEARS = ['2022/2023', '2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'];

  // External (hors-liste) student enrollment modal state
  const [isExternalStudentModalOpen, setIsExternalStudentModalOpen] = useState(false);
  const [printingAssuranceReceipt, setPrintingAssuranceReceipt] = useState<ExternalStudentRegister | null>(null);
  // Month-payment receipt printed from the seance log (student who paid 'paie_mois' that day)
  const [printingMonthReceipt, setPrintingMonthReceipt] = useState<{ sess: ExternalCourseSession; studentId: string } | null>(null);
  const [extName, setExtName] = useState('');
  const [extPhone, setExtPhone] = useState('');
  const [extGrade, setExtGrade] = useState('Collège 7ème Année');
  const [extYear, setExtYear] = useState(getCurrentAcademicYear());
  const [extAssurance, setExtAssurance] = useState(false);

  // Register modal search state
  const [registerSearch, setRegisterSearch] = useState('');

  // Session history month filter
  const [sessionMonthFilter, setSessionMonthFilter] = useState('all');

  // Session / Attendance modal states
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  // Per-seance status (separate controls): attendance (حاضر/غائب) + payment mode
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [paymentModeMap, setPaymentModeMap] = useState<Record<string, SeanceStudentStatus>>({});
  const [seanceAmountMap, setSeanceAmountMap] = useState<Record<string, number>>({});
  // Locked students (already paid for the month in a previous session) — cannot be switched to pay-per-seance
  const [monthPaidLockMap, setMonthPaidLockMap] = useState<Record<string, boolean>>({});
  // Students enrolled after this seance — shown but locked, cannot be marked present/paid here
  const [disabledSeanceStudents, setDisabledSeanceStudents] = useState<Record<string, boolean>>({});
  // Seances whose student list is expanded in the log (collapsed by default to save space)
  const [expandedSeances, setExpandedSeances] = useState<Record<string, boolean>>({});
  // Cycles collapsed/expanded in the grouped seance log (default: expanded)
  const [collapsedCycles, setCollapsedCycles] = useState<Record<number, boolean>>({});
  // Enrolled students list collapsed (default: collapsed)
  const [enrolledCollapsed, setEnrolledCollapsed] = useState(true);
  // Enrolled students pagination (6 per page)
  const [enrolledPage, setEnrolledPage] = useState(1);
  
  // One-time student form fields

  // Course student removal confirmation state
  const [studentRemoval, setStudentRemoval] = useState<{ course: ExternalCourse; studentName: string; studentId: string } | null>(null);

  // Course deletion confirmation state
  const [courseDeletion, setCourseDeletion] = useState<ExternalCourse | null>(null);

  // Seance deletion confirmation state
  const [seanceDeletion, setSeanceDeletion] = useState<{ sessionId: string; sessionDate: string } | null>(null);

  const confirmDeleteSeance = (sess: ExternalCourseSession) => {
    setSeanceDeletion({ sessionId: sess.id, sessionDate: sess.date });
  };

  const handleDeleteSeance = () => {
    if (!seanceDeletion) return;
    onUpdateSessions(sessions.filter(s => s.id !== seanceDeletion.sessionId));
    toast.success(`تم حذف الحصة بتاريخ ${seanceDeletion.sessionDate}!`);
    setSeanceDeletion(null);
  };

  const openAddCourse = () => {
    setEditingCourseId(null);
    const newYear = filterYear === 'all' ? getCurrentAcademicYear() : filterYear;
    setSchoolYear(newYear);
    setTrimester('Trimestre 1');
    setGradeBase('Collège 7ème Année');
    setSubject('Mathématiques');
    setTeacherName('');
    setTeacherPhone('');
    setTeacherShare(70);
    setCenterShare(10);
    setIsCourseModalOpen(true);
  };

  const openEditCourse = (c: ExternalCourse) => {
    setEditingCourseId(c.id);
    setSchoolYear(c.schoolYear || getCurrentAcademicYear());
    setTrimester(c.trimester);
    setGradeBase(c.gradeLevel);
    setSubject(c.subject);
    setTeacherName(c.teacherName);
    setTeacherPhone(c.teacherPhone);
    setTeacherShare(c.teacherShare);
    setCenterShare(c.centerShare);
    setIsCourseModalOpen(true);
  };

  const handleSaveCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName.trim() || !subject.trim()) {
      toast.warning('يرجى كتابة اسم الأستاذ الخارجي والمادة');
      return;
    }

    const payload: ExternalCourse = {
      id: editingCourseId || 'ext_' + crypto.randomUUID(),
      schoolYear,
      trimester,
      gradeLevel: gradeBase,
      subject,
      teacherName,
      teacherPhone,
      monthlyFee: Number(teacherShare) + Number(centerShare),
      teacherShare: Number(teacherShare),
      centerShare: Number(centerShare),
      enrolledStudents: editingCourseId 
        ? (courses.find(c => c.id === editingCourseId)?.enrolledStudents || []) 
        : []
    };

    if (editingCourseId) {
      onUpdateCourses(courses.map(c => c.id === editingCourseId ? payload : c));
      if (selectedCourse?.id === editingCourseId) setSelectedCourse(payload);
      toast.success(`تم تحديث الكورس (${payload.subject} — ${payload.teacherName}) بنجاح!`);
    } else {
      onUpdateCourses([...courses, payload]);
      setSelectedCourse(payload);
      toast.success(`تمت إضافة الكورس (${payload.subject} — ${payload.teacherName}) بنجاح!`);
    }

    setIsCourseModalOpen(false);
  };

  const handleRemoveStudent = (course: ExternalCourse, studentId: string) => {
    const updatedStudents = course.enrolledStudents.filter(s => s.studentId !== studentId);
    const updatedCourse = { ...course, enrolledStudents: updatedStudents };
    onUpdateCourses(courses.map(c => c.id === course.id ? updatedCourse : c));
    setSelectedCourse(updatedCourse);
    toast.success('تم إزالة التلميذ من الكورس بنجاح!');
  };

  const handleEnrollExternalStudent = () => {
    if (!selectedCourse) return;
    if (!extName.trim()) {
      toast.warning('يرجى كتابة اسم التلميذ الخارجي');
      return;
    }

    const assuranceAmount = settings ? getFeesForYear(settings, extYear || selectedCourse.schoolYear || schoolYear).fraisAssuranceCoursHorsTeenCenter : 50;

    // Upsert into the global register (shared across all courses), reuse existing id
    const existing = externalStudents.find(s => s.name.toLowerCase() === extName.trim().toLowerCase());
    let registerId: string;
    if (existing) {
      registerId = existing.id;
      onUpdateExternalStudents(externalStudents.map(s => s.id === existing.id ? {
        ...s,
        parentPhone: extPhone.trim() || s.parentPhone,
        grade: extGrade,
        schoolYear: extYear || s.schoolYear,
        assurancePaid: s.assurancePaid || extAssurance,
        assuranceAmount: extAssurance ? assuranceAmount : s.assuranceAmount,
        assuranceDate: extAssurance ? new Date().toISOString().split('T')[0] : s.assuranceDate
      } : s));
    } else {
      registerId = 'reg_' + crypto.randomUUID();
      onUpdateExternalStudents([...externalStudents, {
        id: registerId,
        name: extName.trim(),
        parentPhone: extPhone.trim(),
        grade: extGrade,
        schoolYear: extYear,
        assurancePaid: extAssurance,
        assuranceAmount: extAssurance ? assuranceAmount : 0,
        assuranceDate: extAssurance ? new Date().toISOString().split('T')[0] : undefined,
        payments: [],
        attendance: [],
        createdAt: new Date().toISOString().split('T')[0]
      }]);
    }

    // Link into the course using the register id as studentId
    const newStudent: ExternalCourseStudent = {
      studentId: registerId,
      studentName: extName.trim(),
      parentPhone: extPhone.trim(),
      isExternal: true,
      assurancePaid: extAssurance,
      assuranceAmount: extAssurance ? assuranceAmount : 0,
      assuranceDate: extAssurance ? new Date().toISOString().split('T')[0] : undefined,
      enrolledAt: new Date().toISOString().split('T')[0]
    };
    const updatedCourse = {
      ...selectedCourse,
      enrolledStudents: [...selectedCourse.enrolledStudents, newStudent]
    };
    onUpdateCourses(courses.map(c => c.id === selectedCourse.id ? updatedCourse : c));
    setSelectedCourse(updatedCourse);

    setIsExternalStudentModalOpen(false);
    setExtName('');
    setExtPhone('');
    setExtGrade('Collège 7ème Année');
    setExtAssurance(false);
    toast.success(`تم تسجيل التلميذ الخارجي (${extName.trim()}) في الكورس${extAssurance ? ' مع خلاص التأمين المدرسي' : ''} بنجاح!`);
  };

  const monthKey = (date: string) => date.slice(0, 7); // "YYYY-MM"

  interface StudentCycleState {
    completedSeancesCount: number;
    completedCycleNumber: number;
    completedSeanceInCycle: number;
    completedCyclePaid: number;
    completedCycleRemaining: number;
    completedPastDebt: number;

    nextSeanceIndex: number;
    nextCycleNumber: number;
    nextSeanceInCycle: number;
    nextCyclePaid: number;
    nextCycleTarget: number;
    nextCycleRemaining: number;
    nextPastDebt: number;

    totalOutstanding: number;
    isNextCycleCovered: boolean;
  }

  // Calculate 4-seance cycle payment & attendance state for an enrolled student.
  // 1 month = 4 seances.
  // All students share the SAME cycle number & seance number based on course session history.
  // Individual absences, payments, and debts are tracked per-student.
  const getStudentCycleState = (
    course: ExternalCourse,
    studentId: string,
    excludeSessionId?: string
  ): StudentCycleState => {
    // All sessions of this course, sorted chronologically
    const allCourseSessions = sessions
      .filter(s => s.courseId === course.id && s.id !== excludeSessionId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    const totalCourseSessions = allCourseSessions.length;

    // Completed state (after the last existing session)
    const completedSeancesCount = totalCourseSessions;
    const completedCycleNumber = completedSeancesCount === 0 ? 1 : Math.floor((completedSeancesCount - 1) / 4) + 1;
    const completedSeanceInCycle = completedSeancesCount === 0 ? 0 : ((completedSeancesCount - 1) % 4) + 1;

    // Next state (for the next session to be added)
    const nextSeanceIndex = totalCourseSessions + 1;
    const nextCycleNumber = Math.floor((nextSeanceIndex - 1) / 4) + 1;
    const nextSeanceInCycle = ((nextSeanceIndex - 1) % 4) + 1;

    let pastCyclesDebt = 0;
    let currentOpenCyclePaid = 0;
    let currentOpenCycleTarget = course.monthlyFee;

    const numCycles = Math.ceil(totalCourseSessions / 4) || 1;

    for (let c = 1; c <= numCycles; c++) {
      const cycleSessions = allCourseSessions.slice((c - 1) * 4, c * 4);

      // Amount actually collected from this student within this cycle
      let cyclePaid = 0;
      cycleSessions.forEach(s => {
        const status = s.seanceStatusMap?.[studentId];
        if (status === 'paie_mois') {
          cyclePaid += s.seanceAmountMap?.[studentId] ?? course.monthlyFee;
        }
      });

      // A cycle = 4 seances shared by the whole course. A student owes the seances
      // from their first attended (present or paid) seance to the end of the cycle:
      //   - paid on seance 1            -> owes 4 (full month)
      //   - starts on seance 2 (3 or 4) -> owes 3 (2 or 1) remaining seances
      //   - absent on seance 1 without payment, attends from seance 2 -> owes 3
      // A late joiner with no attendance yet owes the seances remaining until the
      // end of the cycle. Absences after paying never trigger refunds.
      const inProgress = cycleSessions.length < 4;
      let firstAttendedIdx: number | null = null;
      cycleSessions.forEach((s, i) => {
        const status = s.seanceStatusMap?.[studentId];
        if (firstAttendedIdx === null && (status === 'present' || status === 'paie_mois')) {
          firstAttendedIdx = i + 1;
        }
      });

      let owedSeances = 0;
      if (firstAttendedIdx !== null) {
        owedSeances = 4 - firstAttendedIdx + 1;
      } else if (inProgress) {
        owedSeances = 4 - cycleSessions.length;
      }

      const cycleTargetFee = Math.round((course.monthlyFee * owedSeances / 4) * 100) / 100;

      if (cycleSessions.length === 4) {
        // Completed 4-séance cycle
        if (cyclePaid > cycleTargetFee && pastCyclesDebt > 0) {
          const excess = cyclePaid - cycleTargetFee;
          pastCyclesDebt = Math.max(0, pastCyclesDebt - excess);
          cyclePaid = cycleTargetFee;
        }
        const cycleDebt = Math.max(0, cycleTargetFee - cyclePaid);
        pastCyclesDebt += cycleDebt;
      } else {
        // In-progress cycle
        currentOpenCyclePaid = cyclePaid;
        currentOpenCycleTarget = cycleTargetFee;
        if (currentOpenCyclePaid > currentOpenCycleTarget && pastCyclesDebt > 0) {
          const excess = currentOpenCyclePaid - currentOpenCycleTarget;
          pastCyclesDebt = Math.max(0, pastCyclesDebt - excess);
          currentOpenCyclePaid = currentOpenCycleTarget;
        }
      }
    }

    // If totalCourseSessions is a multiple of 4 (e.g. 4, 8, 12), a cycle just completed.
    // The next session will open a brand-new cycle (e.g. Cycle 3, Séance 1/4).
    if (totalCourseSessions % 4 === 0 && totalCourseSessions > 0) {
      currentOpenCyclePaid = 0;
      currentOpenCycleTarget = course.monthlyFee;
    }

    const nextPastDebt = pastCyclesDebt;
    const nextCyclePaid = currentOpenCyclePaid;
    const nextCycleTarget = currentOpenCycleTarget;
    const nextCycleRemaining = Math.max(0, nextCycleTarget - nextCyclePaid);
    const totalOutstanding = Math.round((nextPastDebt + nextCycleRemaining) * 100) / 100;
    const isNextCycleCovered = nextCyclePaid >= nextCycleTarget;

    const completedPastDebt = pastCyclesDebt;
    const completedCyclePaid = (totalCourseSessions % 4 === 0 && totalCourseSessions > 0)
      ? course.monthlyFee
      : currentOpenCyclePaid;
    const completedCycleRemaining = Math.max(0, currentOpenCycleTarget - completedCyclePaid);

    return {
      completedSeancesCount,
      completedCycleNumber,
      completedSeanceInCycle,
      completedCyclePaid,
      completedCycleRemaining,
      completedPastDebt,

      nextSeanceIndex,
      nextCycleNumber,
      nextSeanceInCycle,
      nextCyclePaid,
      nextCycleTarget,
      nextCycleRemaining,
      nextPastDebt,

      totalOutstanding,
      isNextCycleCovered
    };
  };

  // Did this student pay the month in an earlier seance of the SAME cycle?
  const paidMonthEarlierInCycle = (sess: ExternalCourseSession, studentId: string) => {
    const all = sessions
      .filter(s => s.courseId === sess.courseId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const idx = all.findIndex(s => s.id === sess.id);
    if (idx < 0) return false;
    const cycleStart = Math.floor(idx / 4) * 4;
    for (let j = cycleStart; j < idx; j++) {
      if (all[j].seanceStatusMap?.[studentId] === 'paie_mois') return true;
    }
    return false;
  };

  const openNewSession = (course: ExternalCourse) => {
    setSelectedCourse(course);
    const dateStr = new Date().toISOString().split('T')[0];
    setSessionDate(dateStr);
    setEditingSessionId(null);

    const initialAttendance: Record<string, 'present' | 'absent'> = {};
    const initialPayment: Record<string, SeanceStudentStatus> = {};
    const initialAmounts: Record<string, number> = {};
    const initialLocks: Record<string, boolean> = {};

    course.enrolledStudents.forEach(s => {
      initialAttendance[s.studentId] = 'present';
      const cycleState = getStudentCycleState(course, s.studentId);

      if (cycleState.isNextCycleCovered && cycleState.nextPastDebt === 0) {
        initialPayment[s.studentId] = 'present';
        initialLocks[s.studentId] = true;
        initialAmounts[s.studentId] = 0;
      } else {
        initialPayment[s.studentId] = 'paie_mois';
        initialAmounts[s.studentId] = cycleState.totalOutstanding > 0 ? cycleState.totalOutstanding : cycleState.nextCycleTarget;
      }
    });

    setAttendanceMap(initialAttendance);
    setPaymentModeMap(initialPayment);
    setSeanceAmountMap(initialAmounts);
    setMonthPaidLockMap(initialLocks);
    setDisabledSeanceStudents({});
    setIsSessionModalOpen(true);
  };

  const openEditSession = (sess: ExternalCourseSession) => {
    if (!selectedCourse) return;
    setSessionDate(sess.date);
    setEditingSessionId(sess.id);
    const att: Record<string, 'present' | 'absent'> = {};
    const pay: Record<string, SeanceStudentStatus> = {};
    const amounts: Record<string, number> = {};
    const locks: Record<string, boolean> = {};
    const disabled: Record<string, boolean> = {};
    selectedCourse.enrolledStudents.forEach(s => {
      const status = sess.seanceStatusMap?.[s.studentId];
      const cycleState = getStudentCycleState(selectedCourse, s.studentId, editingSessionId || undefined);
      if (status === 'absent') {
        att[s.studentId] = 'absent';
      } else if (status === 'present' || status === 'paie_mois') {
        att[s.studentId] = 'present';
      } else if (!sess.seanceStatusMap) {
        // Legacy session (presentStudentIds only): restore from that list
        att[s.studentId] = (sess.presentStudentIds || []).includes(s.studentId) ? 'present' : 'absent';
      } else {
        // Enrolled now but not recorded in this seance (e.g. joined later):
        // keep them visible but locked — cannot be marked present or paid here
        att[s.studentId] = 'absent';
        disabled[s.studentId] = true;
      }
      if (status === 'paie_mois') {
        // This seance IS their payment point — keep it editable
        pay[s.studentId] = 'paie_mois';
        amounts[s.studentId] = sess.seanceAmountMap?.[s.studentId] ?? cycleState.totalOutstanding;
      } else if (cycleState.isNextCycleCovered && cycleState.nextPastDebt === 0 && !disabled[s.studentId]) {
        // Already paid the month in a previous seance of this cycle — lock it:
        // cannot be switched to "خلّص الشهر" again from a later seance
        pay[s.studentId] = 'present';
        locks[s.studentId] = true;
        amounts[s.studentId] = 0;
      } else {
        pay[s.studentId] = 'present';
        amounts[s.studentId] = 0;
      }
    });
    setAttendanceMap(att);
    setPaymentModeMap(pay);
    setSeanceAmountMap(amounts);
    setMonthPaidLockMap(locks);
    setDisabledSeanceStudents(disabled);
    setIsSessionModalOpen(true);
  };

  const handleSaveSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;

    // Derive combined seance status map from split attendance + payment controls
    const combined: Record<string, SeanceStudentStatus> = {};
    selectedCourse.enrolledStudents.forEach(s => {
      if (disabledSeanceStudents[s.studentId]) return; // joined after this seance — not recorded here
      const att = attendanceMap[s.studentId] || 'present';
      const pay = paymentModeMap[s.studentId] || 'paie_mois';
      const isLocked = monthPaidLockMap[s.studentId]; // Already paid the current cycle
      if (att === 'absent') {
        combined[s.studentId] = 'absent';
      } else if (pay === 'paie_mois' && isLocked) {
        // Already paid for this cycle (in this or a previous seance) — save as 'present' to avoid double-counting
        combined[s.studentId] = 'present';
      } else if (pay === 'paie_mois') {
        combined[s.studentId] = 'paie_mois';
      } else {
        combined[s.studentId] = 'present';
      }
    });

    const sessionStatusMap = Object.keys(combined).length > 0 ? combined : undefined;
    const derivedPresent = Object.entries(combined).filter(([, s]) => s !== 'absent').map(([id]) => id);
    const derivedMonthPaid = Object.fromEntries(Object.entries(combined).map(([id, s]) => [id, s === 'paie_mois' || s === 'present']));

    // Persist the actual amount collected for paie_mois students.
    // No cap at monthlyFee — payment may include debt from previous cycles.
    const seanceAmounts: Record<string, number> = {};
    Object.entries(seanceAmountMap).forEach(([id, amt]) => {
      if (combined[id] === 'paie_mois') {
        const raw = Number(amt) || 0;
        seanceAmounts[id] = Math.max(0, raw);
      }
    });

    const newSession: ExternalCourseSession = {
      id: editingSessionId || 'sess_' + crypto.randomUUID(),
      courseId: selectedCourse.id,
      date: sessionDate,
      presentStudentIds: derivedPresent,
      oneTimeStudents: [],
      monthPaidMap: derivedMonthPaid,
      seanceStatusMap: sessionStatusMap,
      seanceAmountMap: Object.keys(seanceAmounts).length > 0 ? seanceAmounts : undefined
    };

    if (editingSessionId) {
      onUpdateSessions(sessions.map(s => s.id === editingSessionId ? newSession : s));
    } else {
      onUpdateSessions([...sessions, newSession]);
    }

    // Record attendance + payments in the global register for external students of this course
    const courseStudentIds = selectedCourse.enrolledStudents.map(s => s.studentId);
    const regEntries = externalStudents.filter(e => courseStudentIds.includes(e.id));
    if (regEntries.length > 0) {
      const updatedReg = externalStudents.map(e => {
        const status = combined[e.id];
        if (!status) return e;
        const paidMois = status === 'paie_mois';
        const isPresent = status !== 'absent';
        const update: ExternalStudentRegister = { ...e };
        // On edit, replace the previously recorded payment/attendance for this session
        const basePayments = editingSessionId
          ? e.payments.filter(p => !(p.courseId === selectedCourse.id && p.date === sessionDate))
          : e.payments;
        const baseAttendance = editingSessionId
          ? e.attendance.filter(a => !(a.courseId === selectedCourse.id && a.date === sessionDate))
          : e.attendance;
        if (paidMois) {
          // For paie_mois, only record the month payment once (first session of the month);
          // locked students already paid the month in a previous session.
          const alreadyPaidMonth = monthPaidLockMap[e.id];
          if (!(paidMois && alreadyPaidMonth)) {
            update.payments = [...basePayments, {
              id: 'pay_' + crypto.randomUUID() + '_' + e.id,
              studentId: e.id,
              courseId: selectedCourse.id,
              courseName: `${selectedCourse.subject} (${selectedCourse.gradeLevel})`,
              schoolYear: selectedCourse.schoolYear || getCurrentAcademicYear(),
              amountPaid: Number(seanceAmounts[e.id]) || selectedCourse.monthlyFee,
              date: sessionDate,
              method: 'Espèces'
            }];
          } else {
            update.payments = basePayments;
          }
        } else {
          update.payments = basePayments;
        }
        update.attendance = [...baseAttendance, {
          id: 'att_' + crypto.randomUUID() + '_' + e.id,
          studentId: e.id,
          courseId: selectedCourse.id,
          courseName: `${selectedCourse.subject} (${selectedCourse.gradeLevel})`,
          date: sessionDate,
          status: isPresent ? 'present' : 'absent'
        }];
        return update;
      });
      onUpdateExternalStudents(updatedReg);
    }

    setIsSessionModalOpen(false);
    setEditingSessionId(null);
    toast.success(editingSessionId ? 'تم تحديث الحصة والـ Pointage بنجاح!' : 'تم تسجيل حضور وتفاصيل الجلسة بنجاح!');
  };

  const courseSessions = sessions.filter(s => s.courseId === selectedCourse?.id);

  // Map each seance to its 4-séance cycle (chronological order) for the grouped log
  const courseSessionsChrono = [...courseSessions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const seanceCycleInfo: Record<string, { cycle: number; seanceInCycle: number }> = {};
  courseSessionsChrono.forEach((s, i) => {
    seanceCycleInfo[s.id] = { cycle: Math.floor(i / 4) + 1, seanceInCycle: (i % 4) + 1 };
  });

  // Unique months (YYYY-MM) available in this course's session history, for the month filter
  const sessionMonths = Array.from(new Set(courseSessions.map(s => monthKey(s.date)))).sort().reverse();
  const filteredCourseSessions = (sessionMonthFilter === 'all'
    ? courseSessions
    : courseSessions.filter(s => monthKey(s.date) === sessionMonthFilter)
  ).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  // Group the filtered seances by cycle number, cycles ordered most recent first
  const cycleGroups = filteredCourseSessions.reduce<Record<number, ExternalCourseSession[]>>((acc, s) => {
    const cyc = seanceCycleInfo[s.id]?.cycle || 1;
    (acc[cyc] = acc[cyc] || []).push(s);
    return acc;
  }, {});
  const cycleNumbers = Object.keys(cycleGroups).map(Number).sort((a, b) => b - a);

  const filteredCourses = courses.filter(c => {
    if (filterYear !== 'all' && (c.schoolYear || '') !== filterYear) return false;
    if (filterTrimester !== 'all' && c.trimester !== filterTrimester) return false;
    if (filterGrade !== 'all' && c.gradeLevel !== filterGrade) return false;
    if (filterSubject !== 'all') {
      const cSub = (c.subject || '').toLowerCase();
      const fSub = filterSubject.toLowerCase();
      const match = cSub === fSub || cSub.includes(fSub) || fSub.includes(cSub);
      if (!match) {
        // Match on the Latin (French) name inside parentheses, e.g. "الرياضيات (Mathématiques)"
        const fLatin = (fSub.match(/\(([^)]*)\)/) || [])[1]?.toLowerCase();
        const cLatin = (cSub.match(/\(([^)]*)\)/) || [])[1]?.toLowerCase();
        if (fLatin && (cSub.includes(fLatin) || cLatin?.includes(fSub) || (cLatin && fLatin.includes(cLatin)))) {
          return true;
        }
      }
      return match;
    }
    return true;
  });

  // Filter options: shared app subjects + any subject actually used by courses
  const filterSubjectOptions = Array.from(new Set([
    ...getAppSubjects(settings),
    ...courses.map(c => c.subject).filter(Boolean)
  ]));

  // Global hors-liste register modal state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerYearFilter, setRegisterYearFilter] = useState('all');
  // Register pagination (8 per page)
  const [registerPage, setRegisterPage] = useState(1);

  const getRegYear = (reg: ExternalStudentRegister): string =>
    reg.schoolYear || reg.payments[reg.payments.length - 1]?.schoolYear || (reg.createdAt ? reg.createdAt.slice(0, 4) + '/' + (Number(reg.createdAt.slice(0, 4)) + 1) : getCurrentAcademicYear());

  const filteredRegister = externalStudents.filter(reg => {
    if (registerYearFilter !== 'all' && getRegYear(reg) !== registerYearFilter) return false;
    const q = registerSearch.trim().toLowerCase();
    if (!q) return true;
    return reg.name.toLowerCase().includes(q) || (reg.parentPhone || '').toLowerCase().includes(q) || reg.grade.toLowerCase().includes(q);
  });

  const registerYears = Array.from(new Set(externalStudents.map(s => getRegYear(s)))).sort();

  const handleAttachToCourse = (reg: ExternalStudentRegister) => {
    if (!selectedCourse) return;
    if (selectedCourse.enrolledStudents.some(s => s.studentId === reg.id)) {
      toast.info(`التلميذ (${reg.name}) مسجل بالفعل في هذا الكورس.`);
      return;
    }
    const newStudent: ExternalCourseStudent = {
      studentId: reg.id,
      studentName: reg.name,
      parentPhone: reg.parentPhone,
      isExternal: true,
      assurancePaid: reg.assurancePaid,
      assuranceAmount: reg.assuranceAmount,
      assuranceDate: reg.assuranceDate,
      enrolledAt: new Date().toISOString().split('T')[0]
    };
    const updatedCourse = {
      ...selectedCourse,
      enrolledStudents: [...selectedCourse.enrolledStudents, newStudent]
    };
    onUpdateCourses(courses.map(c => c.id === selectedCourse.id ? updatedCourse : c));
    setSelectedCourse(updatedCourse);
    toast.success(`تم إرفاق التلميذ (${reg.name}) بالكورس الحالي بنجاح!`);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white border border-[#E0EFF1] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
           <span className="px-3 py-1 bg-[#F2F8F9] text-[#14464E] text-xs font-bold rounded-lg border border-[#C3E0E4]/60">
               الدروس الخصوصية
             </span>
            <span className="text-xs text-slate-400 font-bold">الكورسات الخاصة بالسنتر</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-[#257C86]" />
            الكورسات الخاصة مع أساتذة خارجيين
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            تسجيل الدروس، تقسيم المستحقات بين الأستاذ والسنتر، وتتبّع الحضور وخلاص الشهر.
          </p>
        </div>

        <button
          onClick={openAddCourse}
          className="px-5 py-3 bg-[#257C86] hover:bg-[#1E6A73] text-white font-extrabold text-sm rounded-2xl transition shadow-md shadow-[#257C86]/20 flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus className="h-5 w-5" />
          إضافة كورس جديد
        </button>
      </div>

      {/* FILTERS BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 grid grid-cols-2 md:grid-cols-4 gap-3 no-print">
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-1">السنة الدراسية</label>
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer">
            <option value="all">كل السنوات</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-1">الثلاثي</label>
          <select value={filterTrimester} onChange={(e) => setFilterTrimester(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer">
            <option value="all">كل الأثلاث</option>
            <option value="Trimestre 1">Trimestre 1</option>
            <option value="Trimestre 2">Trimestre 2</option>
            <option value="Trimestre 3">Trimestre 3</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-1">المستوى التعليمي</label>
          <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer">
            <option value="all">كل المستويات</option>
            {EXTERNAL_GRADE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-1">المادة</label>
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer">
            <option value="all">كل المواد</option>
            {filterSubjectOptions.map(sub => <option key={sub} value={sub}>{sub}</option>)}
          </select>
        </div>
      </div>

      {/* Main Grid: Courses List & Details */}
      <div className={`grid grid-cols-1 gap-6 no-print ${sidebarCollapsed ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        
        {/* Left Column: Courses list */}
        <div className="space-y-4">
          <h3 className="font-extrabold text-slate-900 text-sm">الكورسات ({filteredCourses.length})</h3>
          
          <div className="space-y-3">
            {filteredCourses.length === 0 ? (
              <div className="p-5 bg-white rounded-3xl border border-dashed border-slate-300 text-center">
                <p className="text-xs text-slate-400 font-bold">{courses.length === 0 ? 'لا توجد دروس خصوصية بعد. اضغط لإضافة أول درس.' : 'لا توجد نتائج مطابقة.'}</p>
              </div>
            ) : (() => {
              const coursesPageSize = 10;
              const coursesTotalPages = Math.ceil(filteredCourses.length / coursesPageSize) || 1;
              const coursesCurrentPage = Math.min(Math.max(1, coursesListPage), coursesTotalPages);
              const paginatedCourses = filteredCourses.slice((coursesCurrentPage - 1) * coursesPageSize, coursesCurrentPage * coursesPageSize);
              return <>
                {paginatedCourses.map(c => {
              const isSelected = selectedCourse?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => { setSelectedCourse(c); setEnrolledPage(1); }}
                  className={`p-5 rounded-3xl border transition cursor-pointer ${
                    isSelected 
                      ? 'bg-[#F2F8F9]/60 border-[#A0CBCF] shadow-sm' 
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black uppercase text-[#14464E] bg-[#E0EFF1] px-2 py-0.5 rounded-md whitespace-nowrap">
                        {c.trimester} — {c.schoolYear}
                      </span>
                      <span className="block w-fit mt-1.5 text-[10px] font-black uppercase text-sky-800 bg-sky-100 px-2 py-0.5 rounded-md">
                        {c.subject}
                      </span>
                      <h4 className="text-base font-black text-slate-900 mt-1.5">{c.gradeLevel}</h4>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditCourse(c);
                      }}
                      className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setCourseDeletion(c);
                      }}
                      title="حذف الكورس"
                      className="p-1.5 hover:bg-red-100 rounded-lg text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1">
                    <p className="font-bold text-slate-800">👨‍🏫 الأستاذ الخارجي: {c.teacherName}</p>
                    <p className="font-mono text-slate-500 text-[11px]"><span dir="rtl">📞 هاتف: {c.teacherPhone}</span></p>
                  </div>

                  {/* Revenue Share badge */}
                  <div className="mt-3 p-2 bg-white rounded-xl border border-slate-200/80 flex justify-between text-[11px] font-bold">
                    <span className="text-emerald-700">الأستاذ: {c.teacherShare} د.ت</span>
                    <span className="text-[#14464E]">مناب السنتر: {c.centerShare} د.ت</span>
                  </div>
                </div>
              );
            })}
            {filteredCourses.length > 10 && (
              <div className="flex justify-center items-center gap-2 mt-3">
                <button onClick={() => setCoursesListPage(p => Math.max(1, p - 1))} disabled={coursesCurrentPage <= 1} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">◀ السابق</button>
                <span className="text-[10px] font-bold text-slate-500 mx-2">{coursesCurrentPage} / {coursesTotalPages}</span>
                <button onClick={() => setCoursesListPage(p => Math.min(coursesTotalPages, p + 1))} disabled={coursesCurrentPage >= coursesTotalPages} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">التالي ▶</button>
              </div>
            )}
            </>;
            })()}
          </div>
        </div>

        {/* Right Column: Active Course details, Enrolled Students & Sessions */}
        {selectedCourse ? (
          <div className={`space-y-6 ${sidebarCollapsed ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
            
            {/* Header info card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs font-bold text-[#17555F] whitespace-nowrap">{selectedCourse.trimester} — {selectedCourse.schoolYear}</span>
                  <h3 className="text-2xl font-black text-slate-900">{selectedCourse.gradeLevel} — {selectedCourse.subject}</h3>
                </div>
              </div>

              {/* Pricing breakdown summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-bold">رسوم التأمين المدرسي:</span>
                  <span className="font-extrabold text-slate-900">
                    {settings ? getFeesForYear(settings, selectedCourse.schoolYear || getCurrentAcademicYear()).fraisAssuranceCoursHorsTeenCenter : 50} د.ت
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-bold">الاشتراك الشهري:</span>
                  <span className="font-extrabold text-slate-900">{(selectedCourse.teacherShare || 0) + (selectedCourse.centerShare || 0)} د.ت</span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <span className="text-emerald-700 text-[10px] block font-bold">مناب الأستاذ:</span>
                  <span className="font-black text-emerald-800">{selectedCourse.teacherShare} د.ت</span>
                </div>
                <div className="p-3 bg-[#F2F8F9] rounded-2xl border border-[#C3E0E4]">
                  <span className="text-[#14464E] text-[10px] block font-bold">مناب السنتر:</span>
                  <span className="font-black text-[#103840]">{selectedCourse.centerShare} د.ت</span>
                </div>
              </div>
            </div>

            {/* Enrolled Students in this course */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 space-y-4 shadow-xs">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEnrolledCollapsed(c => !c)}
                  className="flex items-center gap-2 flex-row-reverse font-black text-slate-900 text-sm hover:text-[#257C86] cursor-pointer"
                >
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${enrolledCollapsed ? '' : 'rotate-180'}`} />
                  التلاميذ المسجلون ({selectedCourse.enrolledStudents.length})
                </button>
                
{/* Quick Add: hors-liste external student */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setExtYear(selectedCourse.schoolYear || getCurrentAcademicYear());
                      setIsExternalStudentModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-[#257C86] hover:bg-[#17555F] text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    تلميذ خارجي
                  </button>
                  <button
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="px-3 py-1.5 bg-[#3A93A0] hover:bg-[#17555F] text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <Users className="h-3.5 w-3.5" />
                    سجل التلاميذ الخارجيين
                  </button>
                </div>
              </div>

              {!enrolledCollapsed && (selectedCourse.enrolledStudents.length === 0 ? (
                <p className="text-xs text-slate-400">لا يوجد تلاميذ مسجلين حالياً في هذا الكورس.</p>
              ) : (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedCourse.enrolledStudents.slice((enrolledPage - 1) * 6, enrolledPage * 6).map(st => {
                    const cycleState = getStudentCycleState(selectedCourse, st.studentId);
                    return (
                      <div key={st.studentId} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-black text-slate-900 flex items-center gap-1.5 flex-wrap">
                              {st.studentName}
                              {st.isExternal && (
                                <span className="px-1.5 py-0.5 bg-[#E0EFF1] text-[#14464E] rounded-md text-[9px] font-black">خارجي</span>
                              )}
                              {st.assurancePaid ? (
                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-[9px] font-black" title="التأمين المدرسي مدفوع">
                                  تأمين ✓ ({st.assuranceAmount || 50} د.ت)
                                </span>
                              ) : st.isExternal ? (
                                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-md text-[9px] font-black" title="التأمين المدرسي غير مدفوع">
                                  تأمين ✗
                                </span>
                              ) : null}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono"><span dir="ltr">📞 هاتف الولي: {st.parentPhone || 'غير متوفر'}</span></p>
                          </div>

                          <button 
                            onClick={() => setStudentRemoval({ course: selectedCourse, studentName: st.studentName, studentId: st.studentId })}
                            className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                            title="إلغاء التسجيل"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* 4-Seance Cycle Financial Status */}
                        <div className="p-2 bg-white rounded-xl border border-slate-200 space-y-1 text-[11px]">
                          {cycleState.completedSeancesCount === 0 ? (
                            <span className="text-slate-400 font-bold">لم تبدأ بعد — في انتظار الحصة الأولى</span>
                          ) : (
                            <>
                              <div className="flex justify-between items-center font-bold">
                                <span className="text-[#103840]">
                                  🔄 الدورة {cycleState.completedCycleNumber} (الحصة {cycleState.completedSeanceInCycle}/4)
                                </span>
                                <span className={cycleState.completedCyclePaid >= cycleState.nextCycleTarget ? 'text-emerald-700 font-black' : 'text-slate-700'}>
                                  {cycleState.completedCyclePaid} / {cycleState.nextCycleTarget || selectedCourse.monthlyFee} د.ت
                                </span>
                              </div>
                              {cycleState.completedPastDebt > 0 && (
                                <div className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[10px] font-black flex justify-between">
                                  <span>⚠️ متأخرات دورات سابقة:</span>
                                  <span className="font-mono">{cycleState.completedPastDebt} د.ت</span>
                                </div>
                              )}
                              {cycleState.completedSeanceInCycle === 4 && cycleState.completedCyclePaid >= selectedCourse.monthlyFee && cycleState.completedPastDebt === 0 && (
                                <span className="inline-block text-[9px] font-bold text-emerald-600">✓ هذه الدورة مستوفاة بالكامل</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination: 6 students per page */}
                {selectedCourse.enrolledStudents.length > 6 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEnrolledPage(p => Math.max(1, p - 1))}
                      disabled={enrolledPage === 1}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-black text-[#103840] cursor-pointer"
                    >
                      السابق
                    </button>
                    <span className="text-xs font-bold text-slate-600">
                      الصفحة {enrolledPage} / {Math.ceil(selectedCourse.enrolledStudents.length / 6)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEnrolledPage(p => Math.min(Math.ceil(selectedCourse.enrolledStudents.length / 6), p + 1))}
                      disabled={enrolledPage >= Math.ceil(selectedCourse.enrolledStudents.length / 6)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-black text-[#103840] cursor-pointer"
                    >
                      التالي
                    </button>
                  </div>
                )}
                </>
              ))}
            </div>

            {/* History of sessions */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 space-y-4 shadow-xs">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <h4 className="font-black text-slate-900 text-sm">سجل الحصص والـ Pointage</h4>
                <div className="flex items-center gap-2">
                  {sessionMonths.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <select
                        value={sessionMonthFilter}
                        onChange={(e) => setSessionMonthFilter(e.target.value)}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold cursor-pointer"
                      >
                        <option value="all">كل الشهور</option>
                        {sessionMonths.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={() => openNewSession(selectedCourse)}
                    className="px-4 py-2.5 bg-[#257C86] hover:bg-[#17555F] text-white font-bold text-xs rounded-2xl transition cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <Calendar className="h-4 w-4 text-white" />
                    تسجيل حصّة حضور وتفقد
                  </button>
                </div>
              </div>

              {courseSessions.length === 0 ? (
                <p className="text-xs text-slate-400">لم يتم تسجيل حصص سابقة لهذا الكورس.</p>
              ) : filteredCourseSessions.length === 0 ? (
                <p className="text-xs text-slate-400">لا توجد حصص مسجلة في هذا الشهر.</p>
              ) : (
                <div className="space-y-3">
                  {cycleNumbers.map(cycNum => {
                    const cycSessions = cycleGroups[cycNum];
                    const cycCollapsed = collapsedCycles[cycNum] ?? true;
                    return (
                    <div key={cycNum} className="border border-slate-300 rounded-2xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setCollapsedCycles(p => ({ ...p, [cycNum]: !(p[cycNum] ?? true) }))}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-100 hover:bg-slate-200 font-black text-xs text-[#103840] cursor-pointer transition-colors"
                      >
                        <span className="flex items-center gap-2 flex-row-reverse">
                          <ChevronDown className={`h-4 w-4 transition-transform ${cycCollapsed ? '' : 'rotate-180'}`} />
                          الدورة {cycNum}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold">{cycSessions.length} حصص</span>
                      </button>
                      {!cycCollapsed && (
                        <div className="p-3 space-y-3">
                  {cycSessions.map(sess => {
                    const statuses = sess.seanceStatusMap || {};
                    // حاضر = all non-absent statuses (present, paie_mois)
                    const present = Object.values(statuses).filter(s => s !== 'absent').length;
                    const absent = Object.values(statuses).filter(s => s === 'absent').length;
                    const paidMois = Object.values(statuses).filter(s => s === 'paie_mois').length;
                    const hasStatusMap = Object.keys(statuses).length > 0;
                    const nameOf = (id: string) => selectedCourse.enrolledStudents.find(s => s.studentId === id)?.studentName || id;
                    const expanded = !!expandedSeances[sess.id];
                    return (
                    <div key={sess.id} className="p-4 bg-white rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex flex-wrap justify-between items-center gap-2 font-bold border-b pb-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedSeances(p => ({ ...p, [sess.id]: !p[sess.id] }))}
                            className={`p-1 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer transition-transform ${expanded ? 'rotate-180' : ''}`}
                            title={expanded ? 'إخفاء قائمة التلاميذ' : 'عرض قائمة التلاميذ'}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <span className="text-[#103840]">🗓️ تاريخ الحصة: {sess.date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasStatusMap && (
                            <span className="flex items-center gap-1.5 text-[10px]">
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg">✓ حاضر: {present}</span>
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-lg">✕ غائب: {absent}</span>
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-lg">خلّص الشهر: {paidMois}</span>
                            </span>
                          )}
                           <button
                             type="button"
                             onClick={() => openEditSession(sess)}
                             className="px-2.5 py-1 bg-slate-900 hover:bg-black text-white rounded-lg text-[10px] font-black cursor-pointer flex items-center gap-1"
                           >
                             <Edit3 className="h-3 w-3" />
                             تعديل الحصة
                           </button>
                           <button
                             type="button"
                             onClick={() => confirmDeleteSeance(sess)}
                             className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-[10px] font-black cursor-pointer flex items-center gap-1"
                             title="حذف الحصة"
                           >
                             <Trash2 className="h-3 w-3" />
                             حذف
                           </button>
                         </div>
                      </div>

                      {expanded ? (
                        hasStatusMap ? (
                        <div>
                          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                            {selectedCourse.enrolledStudents.map(st => {
                              const status = statuses[st.studentId];
                              const amt = sess.seanceAmountMap?.[st.studentId];
                              return (
                                <div key={st.studentId} className="px-3 py-1.5 flex justify-between items-center gap-2">
                                  <span className="font-bold text-slate-800">{st.studentName}</span>
                                  <span className="flex items-center gap-1.5">
                                    {status === 'present' && (paidMonthEarlierInCycle(sess, st.studentId)
                                      ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md font-black text-[10px]">✓ خلّص الشهر (سابقاً)</span>
                                      : <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-black text-[10px]">غير مدفوع</span>)}
                                    {status === 'absent' && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md font-black text-[10px]">✕ غائب</span>}
                                    {status === 'paie_mois' && (
                                      <span className="flex items-center gap-1">
                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md font-black text-[10px]">✓ خلّص الشهر {amt ? `(${amt} د.ت)` : ''}</span>
                                        <button
                                          type="button"
                                          onClick={() => setPrintingMonthReceipt({ sess, studentId: st.studentId })}
                                          className="p-1 bg-[#257C86] hover:bg-[#17555F] text-white rounded-md cursor-pointer transition"
                                          title="طباعة وصل خلاص الشهر"
                                        >
                                          <Printer className="h-3 w-3" />
                                        </button>
                                      </span>
                                    )}
                                    {!status && <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-md font-black text-[10px]">غير مسجّل بعد</span>}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        ) : (
                          <>
                            {Object.keys(sess.monthPaidMap || {}).length > 0 && (
                              <div className="text-[10px] font-bold text-blue-700 bg-blue-50 p-1.5 rounded">
                                غير مدفوعي الشهر: {Object.entries(sess.monthPaidMap || {}).filter(([, p]) => !p).length} تلميذ
                              </div>
                            )}
                            {(sess.presentStudentIds || []).length > 0 && (
                              <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 p-1.5 rounded">
                                الحاضرون ({sess.presentStudentIds.length}): {sess.presentStudentIds.map(id => nameOf(id)).join(', ')}
                              </div>
                            )}
                          </>
                        )
                      ) : (
                        sess.oneTimeStudents?.length > 0 && (
                          <div className="text-[10px] font-bold text-[#14464E] bg-[#F2F8F9] p-1.5 rounded">
                            حضور مؤقت خارجي ({sess.oneTimeStudents.length}): {sess.oneTimeStudents.map(o => o.name).join(', ')}
                          </div>
                        )
                      )}
                      
                      {expanded && sess.oneTimeStudents?.length > 0 && (
                        <div className="text-[10px] font-bold text-[#14464E] bg-[#F2F8F9] p-1.5 rounded">
                          حضور مؤقت خارجي ({sess.oneTimeStudents.length}): {sess.oneTimeStudents.map(o => o.name).join(', ')}
                        </div>
                      )}
                    </div>
                    );
                  })}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        ) : (
          

          <div className="lg:col-span-2 p-12 bg-white rounded-3xl border border-dashed border-slate-300 text-center text-slate-400 font-bold text-sm">
                             <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
               
                اختر كورساً من القائمة لعرض تفاصيله.
              </div>
        )}

      </div>

      {/* CREATE / EDIT COURSE MODAL */}
      <AnimatePresence>
        {isCourseModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-[#3A93A0]" />
                  <h3 className="text-lg font-black">
                    {editingCourseId ? 'تعديل الكورس' : 'إضافة كورس جديد'}
                  </h3>
                </div>

                <button 
                  onClick={() => setIsCourseModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCourse} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">السنة الدراسية</label>
                      <select
                        value={schoolYear}
                        onChange={(e) => setSchoolYear(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold cursor-pointer"
                      >
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">الثلاثي *</label>
                    <select
                      value={trimester} onChange={(e) => setTrimester(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                    >
                      <option value="Trimestre 1">الثلاثي الأول</option>
                      <option value="Trimestre 2">الثلاثي الثاني</option>
                      <option value="Trimestre 3">الثلاثي الثالث</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">المستوى التعليمي *</label>
                    <select
                      value={gradeBase}
                      onChange={(e) => setGradeBase(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold cursor-pointer"
                    >
                    {EXTERNAL_GRADE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">المادة *</label>
                  <div className="flex gap-2">
                    <select
                      value={subject} onChange={(e) => setSubject(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold cursor-pointer"
                    >
                      {appSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsAddingCourseSubject(!isAddingCourseSubject)}
                      className="px-3 py-2 bg-[#E0EFF1] hover:bg-[#C3E0E4] text-[#14464E] font-bold text-xs rounded-xl cursor-pointer shrink-0"
                    >
                      إضافة مادة
                    </button>
                  </div>
                  {isAddingCourseSubject && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={newCourseSubject}
                        onChange={(e) => setNewCourseSubject(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCourseSubject(); } }}
                        placeholder="اسم المادة الجديدة..."
                        className="flex-1 px-3 py-1.5 bg-white border border-[#A0CBCF] rounded-xl text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={handleAddCourseSubject}
                        className="px-3 py-1.5 bg-[#257C86] text-white font-bold text-xs rounded-xl cursor-pointer"
                      >
                        إضافة
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">اسم الأستاذ الخارجي *</label>
                    <input 
                      type="text" required value={teacherName} onChange={(e) => setTeacherName(e.target.value)} onBlur={(e) => setTeacherName(capitalizeFirst(e.target.value))}
                      placeholder="الأستاذ الهادي الوسلاتي"
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">رقم هاتف الأستاذ (8 أرقام)</label>
                    <input 
                      type="text" dir="ltr" value={teacherPhone} onChange={(e) => setTeacherPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="98765432"
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono text-right" maxLength={8}
                    />
                  </div>
                </div>

                {/* Financial Shares Configuration */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 space-y-3">
                  <span className="text-xs font-bold text-[#103840] block">💰 تقسيم مستحقات الاشتراك الشهري</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-emerald-700 block mb-1">مناب الأستاذ (د.ت) *</label>
                      <input 
                        type="number" required value={teacherShare} onFocus={(e) => e.target.select()} onChange={(e) => setTeacherShare(Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                        className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-[#14464E] block mb-1">مناب السنتر (د.ت) *</label>
                      <input 
                        type="number" required value={centerShare} onFocus={(e) => e.target.select()} onChange={(e) => setCenterShare(Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                        className="w-full px-3 py-2 bg-white border border-[#A0CBCF] rounded-xl text-xs font-bold text-[#103840]"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">الإجمالي الشهري للتلميذ = {teacherShare + centerShare} د.ت</p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsCourseModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl cursor-pointer"
                  >
                    حفظ الكورس
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RECORD SESSION & ATTENDANCE MODAL */}
      <AnimatePresence>
        {isSessionModalOpen && selectedCourse && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black">Pointage & خلاص الشهر — {selectedCourse.subject}</h3>
                  <p className="text-xs text-slate-300">الأستاذ: {selectedCourse.teacherName} {editingSessionId ? '— تعديل حصة' : ''}</p>
                </div>

                <button 
                  onClick={() => { setIsSessionModalOpen(false); setEditingSessionId(null); }}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveSession} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <label className="flex items-center gap-2 flex-1 min-w-[240px] text-xs font-black text-slate-700 cursor-pointer">
                    <Calendar className="h-4 w-4 text-[#257C86]" />
                    تاريخ الحصّة *
                    <DateField 
                      required value={sessionDate} onChange={(e) => setSessionDate(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                    />
                  </label>
                </div>

{/* Enrolled Students Attendance List */}
                <div className="space-y-3">
                  <h4 className="font-bold text-xs text-slate-800">الحضور وحالة الخلاص لكل تلميذ</h4>
                  
                  {selectedCourse.enrolledStudents.length === 0 ? (
                    <p className="text-xs text-slate-400">لا يوجد تلاميذ مسجلين رسمياً.</p>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3">التلميذ</th>
                            <th className="p-3 text-center">الحضور</th>
                            <th className="p-3 text-center">الدفع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedCourse.enrolledStudents.map(st => {
                            const att = attendanceMap[st.studentId] || 'present';
                            const pay = paymentModeMap[st.studentId] || 'paie_mois';
                            const disabled = !!disabledSeanceStudents[st.studentId];
                            const cycleState = getStudentCycleState(selectedCourse, st.studentId, editingSessionId || undefined);

                            return (
                              <tr key={st.studentId} className="hover:bg-slate-50/70">
                                <td className="p-3 font-black text-slate-900">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className={disabled ? 'text-slate-400' : att === 'absent' ? 'text-red-500' : 'text-emerald-600'}>
                                        {disabled ? '🔒' : att === 'absent' ? '✕' : '✓'}
                                      </span>
                                      <span className={disabled ? 'text-slate-400' : ''}>{st.studentName}</span>
                                      {disabled && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-md text-[9px] font-black">غير مسجّل بعد</span>}
                                    </div>
                                    {!disabled && (
                                      <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                                        <span className="px-1.5 py-0.5 bg-[#E0EFF1] text-[#14464E] rounded-md font-extrabold">
                                          الدورة {cycleState.nextCycleNumber} (الحصة {cycleState.nextSeanceInCycle}/4)
                                        </span>
                                        {cycleState.nextPastDebt > 0 && (
                                          <span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded-md font-black">
                                            ⚠️ دين سابق: {cycleState.nextPastDebt} د.ت
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3">
                                  {disabled ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-slate-100 text-slate-400 border border-slate-200">
                                        🔒 غير مسجّل في هذا التاريخ
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center gap-1">
                                      <div className="flex justify-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => setAttendanceMap({ ...attendanceMap, [st.studentId]: 'present' })}
                                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${att === 'present' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-emerald-50'}`}
                                        >
                                          حاضر
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setAttendanceMap({ ...attendanceMap, [st.studentId]: 'absent' })}
                                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${att === 'absent' ? 'bg-red-600 text-white border-red-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-red-50'}`}
                                        >
                                          غائب
                                        </button>
                                      </div>
                                      <span className="text-[9px] text-slate-400 font-bold">(بعد الخلاص، الغياب لا يُرجع المبلغ)</span>
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {disabled ? (
                                    <span className="inline-block px-2.5 py-1 rounded-xl text-[11px] font-black bg-slate-100 text-slate-400 border border-slate-200">
                                      —
                                    </span>
                                  ) : att === 'absent' ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-red-100 text-red-700 border border-red-200">
                                        ✕ غياب — لا دفع
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-bold">الغياب لا يُرجع المبلغ</span>
                                    </div>
                                  ) : monthPaidLockMap[st.studentId] ? (
                                    <div className="space-y-1">
                                      <span className="inline-block px-2.5 py-1 rounded-xl text-[11px] font-black bg-emerald-100 text-emerald-700 border border-emerald-300">
                                        ✓ مدفوع الشهر (سابقاً)
                                      </span>
                                      <div className="text-[9px] text-emerald-600 font-bold">{selectedCourse.monthlyFee} د.ت</div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1.5">
                                      <select
                                        value={pay}
                                        onChange={(e) => setPaymentModeMap({ ...paymentModeMap, [st.studentId]: e.target.value as SeanceStudentStatus })}
                                        className="px-2.5 py-1 rounded-xl text-[11px] font-bold border cursor-pointer bg-[#F2F8F9] text-[#14464E] border-[#A0CBCF]"
                                      >
                                        <option value="paie_mois">خلّص الشهر</option>
                                        <option value="present">حاضر (غير مدفوع)</option>
                                      </select>
                                      {pay === 'paie_mois' && (
                                        <div className="flex flex-col items-center gap-1">
                                          <div className="flex items-center justify-center gap-1">
                                            <input
                                              type="number"
                                              min="0"
                                              value={seanceAmountMap[st.studentId] ?? cycleState.totalOutstanding}
                                              onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setSeanceAmountMap({ ...seanceAmountMap, [st.studentId]: v });
                                              }}
                                              className="w-24 px-2 py-1 rounded-xl text-[11px] font-bold border border-[#A0CBCF] bg-[#F2F8F9] text-[#103840] text-center"
                                            />
                                            <span className="text-[10px] font-bold text-slate-500">د.ت</span>
                                          </div>
                                          {cycleState.nextPastDebt > 0 && (
                                            <span className="text-[9px] font-bold text-[#17555F]">
                                              (دين الدورة السابقة {cycleState.nextPastDebt} + الدورة الحالية {cycleState.nextCycleRemaining})
                                            </span>
                                          )}
                                          {cycleState.nextCycleRemaining > 0 && cycleState.nextPastDebt === 0 && (
                                            <span className="text-[9px] font-bold text-[#17555F]">
                                              (باقي {cycleState.nextCycleRemaining} د.ت من الدورة الحالية)
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => { setIsSessionModalOpen(false); setEditingSessionId(null); }}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl cursor-pointer"
                  >
                    {editingSessionId ? 'حفظ التعديلات' : 'تأكيد وتسجيل الحصّة'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* GLOBAL HORS-LIST REGISTER MODAL */}
      <AnimatePresence>
        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#3A93A0]" />
                  <h3 className="text-lg font-black">سجل التلاميذ الخارجيين</h3>
                </div>
                <button
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 border-b border-slate-100 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="relative sm:col-span-2">
                    <input
                      type="text"
                      value={registerSearch}
                      onChange={(e) => { setRegisterSearch(e.target.value); setRegisterPage(1); }}
                      placeholder="🔍 ابحث عن تلميذ بالاسم أو الهاتف أو المستوى..."
                      className="w-full px-4 h-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <select
                    value={registerYearFilter}
                    onChange={(e) => { setRegisterYearFilter(e.target.value); setRegisterPage(1); }}
                    className="w-full px-3 h-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <option value="all">كل السنوات الدراسية</option>
                    {registerYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                {selectedCourse && (
                  <p className="text-[10px] text-slate-400 font-bold mt-1">
                    الكورس الحالي: {selectedCourse.trimester} — {selectedCourse.gradeLevel} {selectedCourse.subject} — اضغط «إرفاق بالكورس» لتسجيل تلميذ مسبق.
                  </p>
                )}
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {filteredRegister.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    {registerSearch ? 'لا توجد نتائج مطابقة للبحث.' : 'لا يوجد تلاميذ خارجيين مسجلين بعد في النظام.'}
                  </div>
                ) : (
                  <>
                  <div className="divide-y divide-slate-100">
                    {filteredRegister.slice((registerPage - 1) * 8, registerPage * 8).map(reg => {
                      const alreadyEnrolled = selectedCourse?.enrolledStudents.some(s => s.studentId === reg.id);
                      return (
                      <div key={reg.id} className="p-4 space-y-3">
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <p className="font-black text-slate-900">{reg.name}</p>
                            <p className="text-xs text-slate-500">{reg.grade} — {getRegYear(reg)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono text-slate-400" dir="ltr">📞 {reg.parentPhone || 'غير متوفر'}</span>
                            <button
                              onClick={() => handleAttachToCourse(reg)}
                              disabled={alreadyEnrolled}
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer flex items-center gap-1 ${
                                alreadyEnrolled
                                  ? 'bg-emerald-100 text-emerald-700 cursor-default'
                                  : 'bg-[#257C86] hover:bg-[#17555F] text-white'
                              }`}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              {alreadyEnrolled ? 'مسجل ✓' : 'إرفاق بالكورس'}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          <span className={`px-2 py-0.5 rounded-md font-black ${reg.assurancePaid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            التأمين: {reg.assurancePaid ? `مدفوع (${reg.assuranceAmount} د.ت)` : 'غير مدفوع'}
                          </span>
                          {reg.assuranceDate && <span className="text-[10px] text-slate-400">تاريخ الخلاص: {reg.assuranceDate}</span>}
                          {reg.assurancePaid && (
                            <button
                              onClick={() => setPrintingAssuranceReceipt(reg)}
                              className="px-2.5 py-1 bg-[#257C86] text-white rounded-lg font-black text-[11px] flex items-center gap-1 hover:bg-[#17555F] transition cursor-pointer"
                              title="طباعة وصل التأمين"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              طباعة الوصل
                            </button>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>

                  {/* Register pagination: 8 students per page */}
                  {filteredRegister.length > 8 && (
                    <div className="p-4 flex items-center justify-center gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setRegisterPage(p => Math.max(1, p - 1))}
                        disabled={registerPage === 1}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-black text-[#103840] cursor-pointer"
                      >
                        السابق
                      </button>
                      <span className="text-xs font-bold text-slate-600">
                        الصفحة {registerPage} / {Math.ceil(filteredRegister.length / 8)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRegisterPage(p => Math.min(Math.ceil(filteredRegister.length / 8), p + 1))}
                        disabled={registerPage >= Math.ceil(filteredRegister.length / 8)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-black text-[#103840] cursor-pointer"
                      >
                        التالي
                      </button>
                    </div>
                  )}
                  </>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  إغلاق السجل
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ASSURANCE RECEIPT MODAL */}
      <AnimatePresence>
        {printingAssuranceReceipt && (() => {
          const reg = printingAssuranceReceipt;
          const receiptNumber = `ASS-${reg.id.replace(/\D/g, '').slice(-8) || reg.id}`;
          return (
            <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-8"
              >
                <div className="p-4 bg-slate-900 text-white flex justify-between items-center no-print">
                  <span className="font-bold text-sm">وصل خلاص التأمين المدرسي</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="px-4 py-2 bg-[#257C86] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="h-4 w-4" />
                      طباعة الوصل 🖨️
                    </button>
                    <button
                      onClick={() => setPrintingAssuranceReceipt(null)}
                      className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto">
                  <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col">
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-950">Teen Center — التأمين المدرسي (وصل خلاص)</h2>
                        <p className="text-[10px] text-slate-500 font-mono">رقم الوصل: {receiptNumber}</p>
                        {reg.assuranceDate && <p className="text-[10px] text-slate-400">تاريخ الخلاص: {reg.assuranceDate}</p>}
                      </div>
                      <div className="text-left font-mono font-bold text-xs bg-[#F2F8F9] p-2 rounded border border-[#A0CBCF]">
                        <p>الخدمة: <strong>التأمين المدرسي</strong></p>
                        <p className="text-[11px] text-[#103840] mt-0.5">السنة: {reg.schoolYear || '—'}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-bold">اسم التلميذ(ة):</span>
                        <span className="font-extrabold text-slate-900">{reg.name} ({reg.grade})</span>
                      </div>

                      <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-bold">هاتف الولي:</span>
                        <span dir="ltr" className="font-mono font-bold text-slate-800">{reg.parentPhone || 'غير متوفر'}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-300">
                          <span className="text-[10px] text-slate-600 block font-bold">قيمة التأمين:</span>
                          <span className="text-base font-black text-slate-900 font-mono">{reg.assuranceAmount || 0} د.ت</span>
                        </div>

                        <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-300">
                          <span className="text-[10px] text-emerald-800 block font-bold">المبلغ المقبوض:</span>
                          <span className="text-base font-black text-emerald-700 font-mono">{reg.assuranceAmount || 0} د.ت</span>
                        </div>
                      </div>

                      <div className="p-3 bg-[#F2F8F9] border border-[#C3E0E4] rounded-xl text-center">
                        <span className="text-[11px] font-black text-[#103840]">✓ تم خلاص التأمين المدرسي السنوي — شكراً لكم</span>
                      </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-slate-300">
                      <div className="flex justify-between items-center text-[10px] text-slate-500 mb-8">
                        <p>نشكركم على تأمين تلميذكم في Teen Center.</p>
                        <p className="font-bold text-slate-900">ختم وإدارة مركز Teen Center</p>
                      </div>
                      <div className="w-1/2 text-center mr-auto">
                        <div className="border-b-2 border-dotted border-slate-400 h-20 mb-1"></div>
                        <p className="text-[10px] text-slate-500 font-bold">ختم وإمضاء إدارة المركز</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* MONTH-PAYMENT RECEIPT MODAL */}
      <AnimatePresence>
        {printingMonthReceipt && selectedCourse && (() => {
          const { sess, studentId } = printingMonthReceipt;
          const student = selectedCourse.enrolledStudents.find(s => s.studentId === studentId);
          const reg = externalStudents.find(r => r.id === studentId);
          const amount = sess.seanceAmountMap?.[studentId] ?? selectedCourse.monthlyFee;
          const allSessions = sessions
            .filter(s => s.courseId === selectedCourse.id)
            .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
          const seanceIndex = Math.max(0, allSessions.findIndex(s => s.id === sess.id));
          const cycleNum = Math.floor(seanceIndex / 4) + 1;
          const seanceInCycle = (seanceIndex % 4) + 1;
          const receiptNumber = `PAY-${(sess.id + studentId).replace(/\D/g, '').slice(-8) || '00000000'}`;
          return (
            <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-8"
              >
                <div className="p-4 bg-slate-900 text-white flex justify-between items-center no-print">
                  <span className="font-bold text-sm">وصل خلاص الشهر</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="px-4 py-2 bg-[#257C86] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="h-4 w-4" />
                      طباعة الوصل 🖨️
                    </button>
                    <button
                      onClick={() => setPrintingMonthReceipt(null)}
                      className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto">
                  <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col">
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-950">Teen Center — خلاص الشهر (وصل)</h2>
                        <p className="text-[10px] text-slate-500 font-mono">رقم الوصل: {receiptNumber}</p>
                        <p className="text-[10px] text-slate-400">تاريخ الحصة: {sess.date}</p>
                      </div>
                      <div className="text-left font-mono font-bold text-xs bg-[#F2F8F9] p-2 rounded border border-[#A0CBCF]">
                        <p>الخدمة: <strong>دروس خصوصية</strong></p>
                        <p className="text-[11px] text-[#103840] mt-0.5">السنة: {selectedCourse.schoolYear || '—'}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-bold">اسم التلميذ(ة):</span>
                        <span className="font-extrabold text-slate-900">{student?.studentName || studentId} ({selectedCourse.gradeLevel})</span>
                      </div>

                      <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-bold">الكورس:</span>
                        <span className="font-bold text-slate-800">{selectedCourse.subject} — الأستاذ {selectedCourse.teacherName}</span>
                      </div>

                      <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-bold">هاتف الولي:</span>
                        <span dir="ltr" className="font-mono font-bold text-slate-800">{reg?.parentPhone || 'غير متوفر'}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-300">
                          <span className="text-[10px] text-slate-600 block font-bold">المبلغ المستحق (الدورة {cycleNum}):</span>
                          <span className="text-base font-black text-slate-900 font-mono">{selectedCourse.monthlyFee} د.ت</span>
                        </div>

                        <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-300">
                          <span className="text-[10px] text-emerald-800 block font-bold">المبلغ المقبوض:</span>
                          <span className="text-base font-black text-emerald-700 font-mono">{amount} د.ت</span>
                        </div>
                      </div>

                      <div className="p-3 bg-[#F2F8F9] border border-[#C3E0E4] rounded-xl text-center">
                        <span className="text-[11px] font-black text-[#103840]">
                          ✓ تم خلاص شهر الدورة {cycleNum} (الحصة {seanceInCycle}/4) — شكراً لكم
                        </span>
                      </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-slate-300">
                      <div className="flex justify-between items-center text-[10px] text-slate-500 mb-8">
                        <p>الغياب بعد الخلاص لا يُرجع المبلغ.</p>
                        <p className="font-bold text-slate-900">ختم وإدارة مركز Teen Center</p>
                      </div>
                      <div className="w-1/2 text-center mr-auto">
                        <div className="border-b-2 border-dotted border-slate-400 h-20 mb-1"></div>
                        <p className="text-[10px] text-slate-500 font-bold">ختم وإمضاء إدارة المركز</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* EXTERNAL STUDENT ENROLLMENT MODAL */}
      <AnimatePresence>
        {isExternalStudentModalOpen && selectedCourse && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-[#3A93A0]" />
                  <div>
                    <h3 className="text-lg font-black">تسجيل تلميذ خارجي</h3>
                    <p className="text-xs text-slate-300">في الكورس: {selectedCourse.subject} — {selectedCourse.gradeLevel}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsExternalStudentModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">اسم التلميذ الخارجي *</label>
                    <input
                      type="text" required value={extName} onChange={(e) => setExtName(e.target.value)} onBlur={(e) => setExtName(capitalizeFirst(e.target.value))}
                      placeholder="الاسم واللقب"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">هاتف الولي (8 أرقام)</label>
                  <input
                    type="text" dir="ltr" value={extPhone} onChange={(e) => setExtPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="98765432"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-right" maxLength={8}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">المستوى التعليمي</label>
                  <select
                    value={extGrade}
                    onChange={(e) => setExtGrade(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {EXTERNAL_GRADE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">السنة الدراسية</label>
                  <select
                    value={extYear}
                    onChange={(e) => setExtYear(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                <label className="flex items-center gap-3 p-3 bg-[#F2F8F9] rounded-2xl border border-[#C3E0E4] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extAssurance}
                    onChange={(e) => setExtAssurance(e.target.checked)}
                    className="h-4 w-4 accent-[#257C86]"
                  />
                  <div>
                    <p className="text-xs font-black text-[#103840]">التأمين المدرسي السنوي</p>
                    <p className="text-[10px] text-[#17555F] font-bold">
                      المبلغ: {(settings ? getFeesForYear(settings, extYear || selectedCourse?.schoolYear || schoolYear).fraisAssuranceCoursHorsTeenCenter : 50)} د.ت — يُخلّص مرة واحدة للسنة
                    </p>
                  </div>
                </label>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsExternalStudentModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleEnrollExternalStudent}
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#17555F] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <UserPlus className="h-4 w-4" />
                    تسجيل في الكورس
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REMOVE COURSE STUDENT CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={!!studentRemoval}
        title="إلغاء تسجيل تلميذ من الكورس"
        message={
          studentRemoval ? (
            <>
              هل أنت متأكد من إزالة التلميذ <strong>{studentRemoval.studentName}</strong> من هذا الكورس؟
              <p className="mt-2 text-[11px] text-slate-400 font-bold">يمكنك إعادة تسجيله في أي وقت لاحقاً.</p>
            </>
          ) : undefined
        }
        confirmLabel="نعم، أزل التسجيل"
        onConfirm={() => {
          if (studentRemoval) {
            handleRemoveStudent(studentRemoval.course, studentRemoval.studentId);
            setStudentRemoval(null);
          }
        }}
        onCancel={() => setStudentRemoval(null)}
      />

      {/* DELETE COURSE CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={!!courseDeletion}
        title="حذف الكورس"
        message={
          courseDeletion ? (
            <>
              هل أنت متأكد من حذف الكورس <strong>{courseDeletion.subject} — {courseDeletion.gradeLevel}</strong> نهائياً؟
              <p className="mt-2 text-[11px] text-slate-400 font-bold">سيتم حذف الكورس وجميع حصصه.</p>
            </>
          ) : undefined
        }
        confirmLabel="نعم، احذف الكورس"
        onConfirm={() => {
          if (courseDeletion) {
            const deletedId = courseDeletion.id;
            onUpdateCourses(courses.filter(c => c.id !== deletedId));
            onUpdateSessions(sessions.filter(s => s.courseId !== deletedId));
            if (selectedCourse?.id === deletedId) setSelectedCourse(courses.find(c => c.id !== deletedId) || null);
            toast.success(`تم حذف الكورس (${courseDeletion.subject} — ${courseDeletion.gradeLevel}) نهائياً.`);
            setCourseDeletion(null);
          }
        }}
         onCancel={() => setCourseDeletion(null)}
       />

      {/* DELETE SEANCE CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={!!seanceDeletion}
        title="حذف الحصة"
        message={
          seanceDeletion ? (
            <>
              هل أنت متأكد من حذف الحصة بتاريخ <strong>{seanceDeletion.sessionDate}</strong>؟
              <p className="mt-2 text-[11px] text-slate-400 font-bold">ستُحذف الحصة وبيانات حضورها وخلاصها.</p>
            </>
          ) : undefined
        }
        confirmLabel="نعم، احذف الحصة"
        onConfirm={handleDeleteSeance}
        onCancel={() => setSeanceDeletion(null)}
      />

     </div>
  );
}
