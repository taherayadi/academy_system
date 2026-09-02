import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap,
  Users,
  Phone,
  Plus,
  Calendar,
  DollarSign,
  Trash2,
  Edit3,
  UserPlus,
  X,
  CheckCircle2,
  BookOpen,
  Tag,
  Search,
  CreditCard,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Printer,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import {
  Formation,
  FormationMatiere,
  FormationStudent,
  FormationSeance,
  CenterSettings,
  getAppSubjects,
  getCurrentAcademicYear,
  DEFAULT_ACADEMIC_YEARS,
  EXTERNAL_GRADE_LEVELS,
  getTimesheetBranches
} from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import DateField from './DateField';
import FormationScheduleModal from './FormationScheduleModal';
import { FORMATION_WORK_DAYS } from '../utils/aiFormationSchedule';

interface FormationModuleProps {
  formations: Formation[];
  onUpdateFormations: (formations: Formation[]) => void;
  settings?: CenterSettings | null;
  onUpdateSettings?: (newSettings: CenterSettings) => void;
  sidebarCollapsed?: boolean;
}

export default function FormationModule({
  formations,
  onUpdateFormations,
  settings,
  onUpdateSettings,
  sidebarCollapsed
}: FormationModuleProps) {
  const toast = useToast();

  // Selection & filtering
  const [selectedId, setSelectedId] = useState<string | null>(formations[0]?.id || null);
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [searchFormation, setSearchFormation] = useState<string>('');
  const [searchStudent, setSearchStudent] = useState<string>('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'paid' | 'advance' | 'unpaid'>('all');

  // Modal states
  const [isFormationModalOpen, setIsFormationModalOpen] = useState<boolean>(false);
  const [editingFormationId, setEditingFormationId] = useState<string | null>(null);

  // Formation form state
  const [formName, setFormName] = useState<string>('');
  const [formSchoolYear, setFormSchoolYear] = useState<string>(getCurrentAcademicYear());
  const [formStartDate, setFormStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formEndDate, setFormEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formPackPrice, setFormPackPrice] = useState<number>(100);
  const [formGrade, setFormGrade] = useState<string>(EXTERNAL_GRADE_LEVELS[0].level);
  const [formBranch, setFormBranch] = useState<string>('');
  const [selectedSubjectNames, setSelectedSubjectNames] = useState<string[]>([]);
  const [isAddingSubject, setIsAddingSubject] = useState<boolean>(false);
  const [newSubjectInput, setNewSubjectInput] = useState<string>('');

  // Student modal states
  const [isStudentModalOpen, setIsStudentModalOpen] = useState<boolean>(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  // Student form state
  const [stName, setStName] = useState<string>('');
  const [stPhone, setStPhone] = useState<string>('');
  const [stIsPack, setStIsPack] = useState<boolean>(true);
  const [stSelectedMatiereIds, setStSelectedMatiereIds] = useState<string[]>([]);
  const [stTotalRequired, setStTotalRequired] = useState<number>(100);
  const [stDiscount, setStDiscount] = useState<number>(0);
  const [stAmountPaid, setStAmountPaid] = useState<number>(100);
  const [stPaymentMethod, setStPaymentMethod] = useState<'espece' | 'cheque'>('espece');
  const [stChequeNumber, setStChequeNumber] = useState<string>('');
  const [stChequeDate, setStChequeDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [stIsAdvance, setStIsAdvance] = useState<boolean>(false);
  const [stNotes, setStNotes] = useState<string>('');

  // Confirmations
  const [deleteFormationTarget, setDeleteFormationTarget] = useState<Formation | null>(null);
  const [deleteStudentTarget, setDeleteStudentTarget] = useState<{ formation: Formation; student: FormationStudent } | null>(null);

  // Receipt printing
  const [printingStudent, setPrintingStudent] = useState<{ formation: Formation; student: FormationStudent } | null>(null);
  const [printingSchedule, setPrintingSchedule] = useState<Formation | null>(null);

  // Formation weekly schedule (Gemini aide)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);

  // Refund (student quit the formation after paying)
  const [refundTarget, setRefundTarget] = useState<{ formation: Formation; student: FormationStudent } | null>(null);
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundReason, setRefundReason] = useState<string>('');

  const availableSubjects = getAppSubjects(settings || undefined);

  const formBranches = useMemo(() => getTimesheetBranches(formGrade), [formGrade]);

  // Filtered formations
  const filteredFormations = useMemo(() => {
    return formations.filter(f => {
      if (filterYear !== 'all' && f.schoolYear !== filterYear) return false;
      if (filterGrade !== 'all' && (f.grade || '') !== filterGrade) return false;
      if (filterBranch !== 'all' && (f.branch || '') !== filterBranch) return false;
      if (searchFormation.trim()) {
        const q = searchFormation.toLowerCase();
        return f.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [formations, filterYear, filterGrade, filterBranch, searchFormation]);

  // Currently selected formation
  const selectedFormation = useMemo(() => {
    return formations.find(f => f.id === selectedId) || filteredFormations[0] || null;
  }, [formations, selectedId, filteredFormations]);

  // Keep selectedId valid
  React.useEffect(() => {
    if (selectedFormation && selectedFormation.id !== selectedId) {
      setSelectedId(selectedFormation.id);
    }
  }, [selectedFormation, selectedId]);

  // Filtered students inside selected formation
  const filteredStudents = useMemo(() => {
    if (!selectedFormation) return [];
    return (selectedFormation.students || []).filter(s => {
      if (searchStudent.trim()) {
        const q = searchStudent.toLowerCase();
        const matchName = s.studentName.toLowerCase().includes(q);
        const matchPhone = s.parentPhone.toLowerCase().includes(q);
        if (!matchName && !matchPhone) return false;
      }
      if (studentStatusFilter !== 'all') {
        const remaining = s.remainingBalance;
        const paid = s.amountPaid;
        if (studentStatusFilter === 'paid' && remaining > 0) return false;
        if (studentStatusFilter === 'advance' && (paid <= 0 || remaining <= 0)) return false;
        if (studentStatusFilter === 'unpaid' && paid > 0) return false;
      }
      return true;
    });
  }, [selectedFormation, searchStudent, studentStatusFilter]);

  // Pagination for students (10 by 10)
  const [studentPage, setStudentPage] = useState<number>(1);
  const pageSize = 10;

  // Reset page when selected formation or filter changes
  React.useEffect(() => {
    setStudentPage(1);
  }, [selectedId, searchStudent, studentStatusFilter]);

  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const validPage = Math.min(Math.max(1, studentPage), totalPages);
  const paginatedStudents = useMemo(() => {
    return filteredStudents.slice((validPage - 1) * pageSize, validPage * pageSize);
  }, [filteredStudents, validPage, pageSize]);

  // Formation Stats
  const formationStats = useMemo(() => {
    if (!selectedFormation) return { count: 0, totalPaid: 0, totalRemaining: 0, totalRequired: 0 };
    const students = selectedFormation.students || [];
    const count = students.length;
    // Amount effectively collected per student:
    //  - never count money still held in an uncashed cheque
    //  - subtract any refund already given back
    const totalPaid = students.reduce((sum, s) => {
      if (s.paymentMethod === 'cheque' && s.chequePaid !== true) return sum;
      return sum + Math.max(0, (s.amountPaid || 0) - (s.refundAmount || 0));
    }, 0);
    const totalRemaining = students.reduce((sum, s) => {
      const netRequired = Math.max(0, (s.totalRequired || 0) - (s.discount || 0));
      if (s.paymentMethod === 'cheque' && s.chequePaid !== true) {
        return sum + Math.max(0, netRequired - (s.refundAmount || 0));
      }
      return sum + Math.max(0, netRequired - (s.amountPaid || 0) + (s.refundAmount || 0));
    }, 0);
    const totalRequired = students.reduce((sum, s) => sum + (s.totalRequired || 0), 0);
    return { count, totalPaid, totalRemaining, totalRequired };
  }, [selectedFormation]);

  // ------------------- Formation Modal Handlers -------------------

  const openCreateFormationModal = () => {
    setEditingFormationId(null);
    setFormName('');
    setFormSchoolYear(getCurrentAcademicYear());
    setFormStartDate(new Date().toISOString().split('T')[0]);
    setFormEndDate(new Date().toISOString().split('T')[0]);
    setFormPackPrice(100);
    setFormGrade(EXTERNAL_GRADE_LEVELS[0].level);
    setFormBranch('');
    setSelectedSubjectNames(availableSubjects.slice(0, 1));
    setIsAddingSubject(false);
    setNewSubjectInput('');
    setIsFormationModalOpen(true);
  };

  const openEditFormationModal = (f: Formation) => {
    setEditingFormationId(f.id);
    setFormName(f.name);
    setFormSchoolYear(f.schoolYear);
    setFormStartDate(f.startDate);
    setFormEndDate(f.endDate);
    setFormPackPrice(f.packPrice);
    setFormGrade(f.grade || EXTERNAL_GRADE_LEVELS[0].level);
    setFormBranch(f.branch || '');
    setSelectedSubjectNames(f.matieres.map(m => m.subject));
    setIsAddingSubject(false);
    setNewSubjectInput('');
    setIsFormationModalOpen(true);
  };

  const toggleSubjectSelection = (sub: string) => {
    if (selectedSubjectNames.includes(sub)) {
      setSelectedSubjectNames(selectedSubjectNames.filter(s => s !== sub));
    } else {
      setSelectedSubjectNames([...selectedSubjectNames, sub]);
    }
  };

  const handleAddNewSubject = () => {
    const trimmed = newSubjectInput.trim();
    if (!trimmed) {
      toast.error('يرجى كتابة اسم المادة الجديدة');
      return;
    }
    // Save into global settings if not present
    if (settings && onUpdateSettings && !availableSubjects.includes(trimmed)) {
      onUpdateSettings({
        ...settings,
        subjects: [...availableSubjects, trimmed]
      });
    }
    if (!selectedSubjectNames.includes(trimmed)) {
      setSelectedSubjectNames([...selectedSubjectNames, trimmed]);
    }
    setNewSubjectInput('');
    setIsAddingSubject(false);
  };

  const handleSaveFormation = () => {
    if (!formName.trim()) {
      toast.error('يرجى إدخال اسم التكوين');
      return;
    }
    if (selectedSubjectNames.length === 0) {
      toast.error('يرجى اختيار مادة واحدة على الأقل في التكوين');
      return;
    }
    if (formPackPrice < 0) {
      toast.error('سعر الباك لا يمكن أن يكون سالباً');
      return;
    }

    const now = new Date().toISOString();
    const editingFormation = formations.find(f => f.id === editingFormationId);

    const matieresList: FormationMatiere[] = selectedSubjectNames.map(subName => {
      const existing = editingFormation?.matieres.find(m => m.subject === subName);
      return existing || { id: crypto.randomUUID(), subject: subName };
    });

    if (editingFormationId) {
      const updatedList = formations.map(f => {
        if (f.id === editingFormationId) {
          return {
            ...f,
            name: formName.trim(),
            schoolYear: formSchoolYear,
            startDate: formStartDate,
            endDate: formEndDate,
            packPrice: formPackPrice,
            grade: formGrade,
            branch: formBranch || undefined,
            matieres: matieresList
          };
        }
        return f;
      });
      onUpdateFormations(updatedList);
      toast.success('تم تعديل التكوين بنجاح');
    } else {
      const newFormation: Formation = {
        id: 'form_' + crypto.randomUUID(),
        name: formName.trim(),
        schoolYear: formSchoolYear,
        startDate: formStartDate,
        endDate: formEndDate,
        packPrice: formPackPrice,
        grade: formGrade,
        branch: formBranch || undefined,
        matieres: matieresList,
        students: [],
        createdAt: now
      };
      onUpdateFormations([newFormation, ...formations]);
      setSelectedId(newFormation.id);
      toast.success('تم إنشاء التكوين بنجاح');
    }

    setIsFormationModalOpen(false);
  };

  const handleDeleteFormation = (f: Formation) => {
    const updated = formations.filter(item => item.id !== f.id);
    onUpdateFormations(updated);
    if (selectedId === f.id) {
      setSelectedId(updated[0]?.id || null);
    }
    setDeleteFormationTarget(null);
    toast.success('تم حذف التكوين بنجاح');
  };

  const handleSaveFormationSchedule = (schedule: FormationSeance[]) => {
    if (!selectedFormation) return;
    const updated = formations.map(f =>
      f.id === selectedFormation.id ? { ...f, schedule } : f
    );
    onUpdateFormations(updated);
  };

  // ------------------- Student Modal Handlers -------------------

  const openAddStudentModal = () => {
    if (!selectedFormation) return;
    setEditingStudentId(null);
    setStName('');
    setStPhone('');
    setStIsPack(true);
    setStSelectedMatiereIds(selectedFormation.matieres.map(m => m.id));
    setStTotalRequired(selectedFormation.packPrice);
    setStDiscount(0);
    setStAmountPaid(selectedFormation.packPrice);
    setStPaymentMethod('espece');
    setStChequeNumber('');
    setStChequeDate(new Date().toISOString().split('T')[0]);
    setStIsAdvance(false);
    setStNotes('');
    setIsStudentModalOpen(true);
  };

  const openEditStudentModal = (student: FormationStudent) => {
    if (!selectedFormation) return;
    setEditingStudentId(student.id);
    setStName(student.studentName);
    setStPhone(student.parentPhone);
    setStIsPack(student.isPack);
    setStSelectedMatiereIds(student.enrolledMatiereIds || []);
    setStTotalRequired(student.totalRequired);
    setStDiscount(student.discount);
    setStAmountPaid(student.amountPaid);
    setStPaymentMethod(student.paymentMethod);
    setStChequeNumber(student.chequeNumber || '');
    setStChequeDate(student.chequeDate || new Date().toISOString().split('T')[0]);
    setStIsAdvance(student.isAdvance);
    setStNotes(student.notes || '');
    setIsStudentModalOpen(true);
  };

  const handleAddRestPayment = (student: FormationStudent) => {
    if (!selectedFormation) return;
    if (student.paymentMethod === 'cheque' && student.chequePaid !== true) {
      toast.error('لا يمكن استكمال الدفع بشيك لم يتم تحصيله بعد.');
      return;
    }
    const netRequired = Math.max(0, (student.totalRequired || 0) - (student.discount || 0));
    const rest = Math.max(0, netRequired - (student.amountPaid || 0));
    if (rest <= 0) {
      toast.error('لا يوجد مبلغ متبقٍ لاستكماله');
      return;
    }
    openEditStudentModal({ ...student, amountPaid: netRequired });
    toast.success(`المبلغ المتبقي: ${rest} د.ت — أكّد لاستكمال الدفع`);
  };

  const handleToggleMatiereSelection = (matiereId: string) => {
    setStSelectedMatiereIds(prev => {
      if (prev.includes(matiereId)) {
        return prev.filter(id => id !== matiereId);
      } else {
        return [...prev, matiereId];
      }
    });
  };

  const handleSaveStudent = () => {
    if (!selectedFormation) return;
    if (!stName.trim()) {
      toast.error('يرجى إدخال اسم التلميذ');
      return;
    }
    const cleanPhone = stPhone.trim();
    if (!/^\d{8}$/.test(cleanPhone)) {
      toast.error('يرجى إدخال رقم هاتف الولي متكون من 8 أرقام بالضبط');
      return;
    }
    if (!stIsPack && stSelectedMatiereIds.length === 0) {
      toast.error('يرجى اختيار مادة واحدة على الأقل');
      return;
    }
    if (stPaymentMethod === 'cheque' && !stChequeNumber.trim()) {
      toast.error('يرجى إدخال رقم الشيك');
      return;
    }

    const netRequired = Math.max(0, stTotalRequired - stDiscount);
    const remaining = Math.max(0, netRequired - stAmountPaid);
    const isAdv = stAmountPaid > 0 && remaining > 0;
    const now = new Date().toISOString();

    const studentRecord: FormationStudent = {
      id: editingStudentId || ('fst_' + crypto.randomUUID()),
      studentName: stName.trim(),
      parentPhone: cleanPhone,
      isPack: stIsPack,
      enrolledMatiereIds: stIsPack ? selectedFormation.matieres.map(m => m.id) : stSelectedMatiereIds,
      amountPaid: stAmountPaid,
      totalRequired: stTotalRequired,
      remainingBalance: remaining,
      paymentMethod: stPaymentMethod,
      chequeNumber: stPaymentMethod === 'cheque' ? stChequeNumber.trim() : undefined,
      chequeDate: stPaymentMethod === 'cheque' ? stChequeDate : undefined,
      // Preserve chequePaid status when editing (don't reset to false when editing payment info)
      chequePaid: editingStudentId
        ? (selectedFormation.students.find(s => s.id === editingStudentId)?.chequePaid ?? false)
        : false,
      discount: stDiscount,
      isAdvance: isAdv || stIsAdvance,
      paidAt: stAmountPaid > 0 ? (editingStudentId ? (selectedFormation.students.find(s => s.id === editingStudentId)?.paidAt || now) : now) : undefined,
      notes: stNotes.trim() || undefined,
      enrolledAt: editingStudentId ? (selectedFormation.students.find(s => s.id === editingStudentId)?.enrolledAt || now) : now
    };

    const updatedFormations = formations.map(f => {
      if (f.id === selectedFormation.id) {
        let updatedStudents: FormationStudent[];
        if (editingStudentId) {
          updatedStudents = (f.students || []).map(s => s.id === editingStudentId ? studentRecord : s);
        } else {
          updatedStudents = [studentRecord, ...(f.students || [])];
        }
        return { ...f, students: updatedStudents };
      }
      return f;
    });

    onUpdateFormations(updatedFormations);
    setIsStudentModalOpen(false);
    toast.success(editingStudentId ? 'تم تحديث بيانات التلميذ بنجاح' : 'تم تسجيل التلميذ في التكوين بنجاح');
  };

  const handleDeleteStudent = () => {
    if (!deleteStudentTarget) return;
    const { formation, student } = deleteStudentTarget;
    const updatedFormations = formations.map(f => {
      if (f.id === formation.id) {
        return {
          ...f,
          students: (f.students || []).filter(s => s.id !== student.id)
        };
      }
      return f;
    });
    onUpdateFormations(updatedFormations);
    setDeleteStudentTarget(null);
    toast.success('تم حذف التلميذ من التكوين');
  };

  const openRefundModal = (student: FormationStudent) => {
    if (!selectedFormation) return;
    // A refund can only be given from a paid amount; a cheque that is not yet
    // cashed/collected cannot be refunded.
    if (student.paymentMethod === 'cheque' && student.chequePaid !== true) {
      toast.error('لا يمكن استرجاع مبلغ مدفوع بشيك لم يتم تحصيله بعد.');
      return;
    }
    setRefundTarget({ formation: selectedFormation, student });
    setRefundAmount(student.refundAmount ?? student.amountPaid);
    setRefundReason(student.refundReason || '');
  };

  const handleConfirmRefund = () => {
    if (!refundTarget) return;
    const { formation, student } = refundTarget;
    if (student.paymentMethod === 'cheque' && student.chequePaid !== true) {
      toast.error('لا يمكن استرجاع مبلغ مدفوع بشيك لم يتم تحصيله بعد.');
      return;
    }
    const amt = Math.max(0, refundAmount);
    if (amt <= 0) {
      toast.error('يرجى إدخال مبلغ الاسترجاع');
      return;
    }
    if (amt > student.amountPaid) {
      toast.error('لا يمكن استرجاع مبلغ أكبر من المبلغ المدفوع');
      return;
    }
    const netPaid = student.amountPaid - amt;
    const updatedFormations = formations.map(f => {
      if (f.id === formation.id) {
        return {
          ...f,
          students: (f.students || []).map(s =>
            s.id === student.id
              ? {
                  ...s,
                  refundAmount: amt,
                  refundReason: refundReason.trim() || undefined,
                  refundedAt: new Date().toISOString(),
                  // After a full refund the student no longer owes anything
                  remainingBalance: amt >= student.amountPaid ? 0 : s.remainingBalance
                }
              : s
          )
        };
      }
      return f;
    });
    onUpdateFormations(updatedFormations);
    setRefundTarget(null);
    toast.success(`تم تسجيل استرجاع ${amt} د.ت للتلميذ (${student.studentName})`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Module Banner (Library-style Top Header) */}
      <div className="bg-white border border-[#E0EFF1] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-[#F2F8F9] text-[#14464E] text-xs font-bold rounded-lg border border-[#C3E0E4]/60">
              التكوينات
            </span>
            <span className="text-xs text-slate-400 font-bold">الدورات والبرامج التكوينية</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-[#257C86]" />
            إدارة التكوينات والدورات التدريبية
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            برامج تكوينية متكاملة، مواد متعددة، تسجيل التلاميذ ومتابعة الاستخلاص المالي.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {/* New Formation Button */}
          <button
            onClick={openCreateFormationModal}
            className="px-4 py-2.5 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            تكوين جديد
          </button>
        </div>
      </div>

      {/* Main Grid: Left List (Formations) & Right Panel (Detail & Students) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* Left Formations List */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200/80 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-[#257C86]" />
              قائمة التكوينات ({filteredFormations.length})
            </span>
          </div>

          {/* Filter bar: school year, grade, branch */}
          <div className="grid grid-cols-3 gap-2">
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              title="السنة الدراسية"
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
            >
              <option value="all">السنة: الكل</option>
              {DEFAULT_ACADEMIC_YEARS.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>

            <select
              value={filterGrade}
              onChange={e => { setFilterGrade(e.target.value); setFilterBranch('all'); }}
              title="المستوى الدراسي"
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
            >
              <option value="all">المستوى: الكل</option>
              {EXTERNAL_GRADE_LEVELS.map(g => (
                <option key={g.level} value={g.level}>{g.level}</option>
              ))}
            </select>

            {filterGrade !== 'all' && getTimesheetBranches(filterGrade).length > 0 ? (
              <select
                value={filterBranch}
                onChange={e => setFilterBranch(e.target.value)}
                title="الشعبة"
                className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
              >
                <option value="all">الشعبة: الكل</option>
                {getTimesheetBranches(filterGrade).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            ) : (
              <div className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200/60 text-center">الشعبة</div>
            )}
          </div>

          {/* Search formation */}
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchFormation}
              onChange={e => setSearchFormation(e.target.value)}
              placeholder="بحث عن تكوين..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
            />
          </div>

          {/* Formations Cards */}
          <div className="space-y-2.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5 no-scrollbar">
            {filteredFormations.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-xs font-bold text-slate-400">لا توجد تكوينات مسجلة</p>
                <button
                  onClick={openCreateFormationModal}
                  className="mt-3 px-3 py-1.5 bg-[#257C86]/10 text-[#257C86] rounded-xl text-xs font-extrabold hover:bg-[#257C86]/20 transition cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  إنشاء أول تكوين
                </button>
              </div>
            ) : (
              filteredFormations.map(f => {
                const isSelected = selectedFormation?.id === f.id;
                const studentCount = (f.students || []).length;
                const matieresCount = (f.matieres || []).length;

                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-right relative ${
                      isSelected
                        ? 'bg-[#F2F8F9] border-[#257C86] shadow-sm ring-1 ring-[#257C86]/30'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="text-xs font-black text-slate-900 leading-snug line-clamp-1">
                        {f.name}
                      </h3>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                        {f.schoolYear}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold mb-1.5">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      <span>{f.startDate} ← {f.endDate}</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-[#F2F8F9] text-[#14464E] border border-[#C3E0E4] rounded-lg">
                        {f.grade || '—'}
                      </span>
                      {f.branch && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg">
                          {f.branch}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2 font-bold text-slate-600">
                        <span>{matieresCount} مواد</span>
                        <span>•</span>
                        <span className="text-[#257C86] font-extrabold">{studentCount} تلميذ</span>
                      </div>
                      <span className="font-mono font-black text-[#257C86] bg-white px-2 py-0.5 rounded-md border border-[#C3E0E4]">
                        {f.packPrice} د.ت
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Panel */}
        <div className="lg:col-span-8 space-y-5">
          {selectedFormation ? (
            <>
              {/* Formation Overview Card */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black text-slate-900">{selectedFormation.name}</h2>
                      <span className="px-2.5 py-0.5 bg-[#F2F8F9] text-[#257C86] border border-[#C3E0E4] rounded-lg text-[10px] font-black">
                        {selectedFormation.schoolYear}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-400 mt-1 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      الفترة: من {selectedFormation.startDate} إلى {selectedFormation.endDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsScheduleModalOpen(true)}
                      className="px-3 py-1.5 bg-[#257C86]/10 hover:bg-[#257C86]/20 text-[#257C86] font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      جدول الحصص
                    </button>
                    <button
                      onClick={() => openEditFormationModal(selectedFormation)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      تعديل
                    </button>
                    <button
                      onClick={() => setDeleteFormationTarget(selectedFormation)}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </button>
                  </div>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/60">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">سعر الباك الكامل</span>
                    <span className="font-mono text-base font-black text-slate-900">{selectedFormation.packPrice} د.ت</span>
                  </div>
                  <div className="bg-[#F2F8F9] rounded-2xl p-3 border border-[#C3E0E4]">
                    <span className="text-[11px] font-bold text-[#14464E] block mb-1">عدد التلاميذ</span>
                    <span className="font-mono text-base font-black text-[#257C86]">{formationStats.count}</span>
                  </div>
                  <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-200/70">
                    <span className="text-[11px] font-bold text-emerald-700 block mb-1">المستخلص فعلياً</span>
                    <span className="font-mono text-base font-black text-emerald-800">{formationStats.totalPaid} د.ت</span>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200/70">
                    <span className="text-[11px] font-bold text-amber-700 block mb-1">المتبقي للدفع</span>
                    <span className="font-mono text-base font-black text-amber-800">{formationStats.totalRemaining} د.ت</span>
                  </div>
                </div>

                {/* Matieres in this Formation */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-black text-slate-700 block">المواد المدرجة في هذا التكوين:</span>
                  <div className="flex flex-wrap gap-2">
                    {selectedFormation.matieres.map(m => (
                      <span
                        key={m.id}
                        className="px-3 py-1 bg-white text-slate-800 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5"
                      >
                        <Tag className="h-3 w-3 text-[#257C86]" />
                        {m.subject}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Weekly schedule (Gemini aide) */}
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700">جدول الحصص الأسبوعي:</span>
                    <button
                      onClick={() => setIsScheduleModalOpen(true)}
                      className="text-[11px] font-bold text-[#257C86] hover:text-[#1E6A73] cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {selectedFormation.schedule?.length ? 'تعديل بالذكاء الاصطناعي' : 'إنشاء / اقتراح بالذكاء الاصطناعي'}
                    </button>
                    <button
                      onClick={() => setPrintingSchedule(selectedFormation)}
                      disabled={!selectedFormation.schedule?.length}
                      className="text-[11px] font-bold text-[#257C86] hover:text-[#1E6A73] cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      طباعة (A4 أفقي)
                    </button>
                  </div>
                  {(selectedFormation.schedule || []).length === 0 ? (
                    <p className="text-[11px] text-slate-400 font-bold">
                      لا يوجد جدول بعد. اضغط "جدول الحصص" لتوليد اقتراح أسبوعي حسب المواد وعدد التلاميذ.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {FORMATION_WORK_DAYS.map(day => {
                        const daySeances = (selectedFormation.schedule || []).filter(s => s.day === day);
                        return (
                          <div key={day} className="bg-[#F2F8F9] rounded-xl p-2.5 border border-[#C3E0E4]">
                            <span className="text-[11px] font-black text-[#14464E] block mb-1.5">{day}</span>
                            {daySeances.length === 0 ? (
                              <span className="text-[10px] text-slate-400 font-bold">—</span>
                            ) : (
                              <div className="space-y-1">
                                {daySeances.map(se => (
                                  <div key={se.id} className="bg-white rounded-lg border border-[#C3E0E4] p-2 space-y-1">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="font-black text-slate-800">{se.matiere}</span>
                                      <span className="font-mono text-[10px] text-slate-500">{se.startTime} - {se.endTime}</span>
                                    </div>
                                    {(se.students || []).length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {se.students!.map(sid => (
                                          <span
                                            key={sid}
                                            className="px-1.5 py-0.5 bg-[#F2F8F9] border border-[#C3E0E4] text-[#14464E] rounded-full text-[9px] font-bold"
                                          >
                                            {(selectedFormation.students.find(s => s.id === sid)?.studentName) || 'تلميذ'}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Students Section */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Users className="h-4 w-4 text-[#257C86]" />
                      التلاميذ المسجلون في التكوين ({filteredStudents.length})
                    </h3>
                    <p className="text-xs font-bold text-slate-400 mt-0.5">
                      قائمة التلاميذ، المواد المختارة وتفاصيل استخلاص الرسوم
                    </p>
                  </div>

                  <button
                    onClick={openAddStudentModal}
                    className="px-4 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <UserPlus className="h-4 w-4" />
                    تسجيل تلميذ جديد
                  </button>
                </div>

                {/* Filter & Search Students */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchStudent}
                      onChange={e => setSearchStudent(e.target.value)}
                      placeholder="بحث باسم التلميذ أو رقم الهاتف..."
                      className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                    {(['all', 'paid', 'advance', 'unpaid'] as const).map(st => {
                      const labels = { all: 'الكل', paid: 'خالص', advance: 'دفعة أولى', unpaid: 'غير خالص' };
                      return (
                        <button
                          key={st}
                          onClick={() => setStudentStatusFilter(st)}
                          className={`px-3 py-1 text-[11px] font-extrabold rounded-lg transition cursor-pointer flex-1 sm:flex-initial ${
                            studentStatusFilter === st
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {labels[st]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Students Table */}
                <div className="overflow-auto max-h-[60vh] rounded-2xl border border-slate-100 no-scrollbar">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 text-slate-500 font-black border-b border-slate-100">
                        <th className="p-3">التلميذ</th>
                        <th className="p-3">المواد</th>
                        <th className="p-3 text-center">المطلوب</th>
                        <th className="p-3 text-center">تخفيض</th>
                        <th className="p-3 text-center">المدفوع</th>
                        <th className="p-3 text-center">المتبقي</th>
                        <th className="p-3">طريقة الدفع</th>
                        <th className="p-3 text-center">الحالة</th>
                        <th className="p-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                            لا يوجد تلاميذ مطابقين لمعايير البحث
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map(st => {
                          const isFullyPaid = st.remainingBalance <= 0;
                          const isAdvance = st.amountPaid > 0 && st.remainingBalance > 0;
                          const isUnpaid = st.amountPaid === 0;
                          const hasRefund = (st.refundAmount ?? 0) > 0;

                          // Resolve chosen matieres names
                          const allFormationMatieres = selectedFormation.matieres || [];
                          const chosenMatieres = st.isPack
                            ? allFormationMatieres
                            : allFormationMatieres.filter(m => (st.enrolledMatiereIds || []).includes(m.id));

                          return (
                            <tr key={st.id} className="hover:bg-slate-50/60 transition">
                              {/* Student name & phone */}
                              <td className="p-3">
                                <span className="font-bold text-slate-900 block">{st.studentName}</span>
                                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-0.5 font-mono">
                                  <Phone className="h-2.5 w-2.5" />
                                  {st.parentPhone}
                                </span>
                              </td>

                              {/* Matieres count with hover tooltip */}
                              <td className="p-3">
                                <div className="relative group inline-block">
                                  <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-help ${
                                    st.isPack
                                      ? 'bg-[#F2F8F9] text-[#257C86] border border-[#C3E0E4]'
                                      : 'bg-purple-50 text-purple-700 border border-purple-200'
                                  }`}>
                                    {st.isPack ? 'باك كامل' : `مواد مختارة (${chosenMatieres.length})`}
                                  </span>
                                  <div className="absolute z-20 right-0 top-full mt-1 w-48 hidden group-hover:block">
                                    <div className="bg-slate-900 text-white text-[10px] font-bold rounded-xl px-3 py-2 shadow-lg">
                                      {chosenMatieres.length === 0 ? (
                                        'لا يوجد مواد مختارة'
                                      ) : (
                                        <ul className="space-y-0.5">
                                          {chosenMatieres.map(m => (
                                            <li key={m.id}>{m.subject}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Total Required */}
                              <td className="p-3 text-center font-mono font-bold text-slate-700">
                                {st.totalRequired} د.ت
                              </td>

                              {/* Discount */}
                              <td className="p-3 text-center font-mono font-bold text-slate-500">
                                {st.discount > 0 ? (
                                  <span className="text-amber-600">-{st.discount} د.ت</span>
                                ) : (
                                  '—'
                                )}
                              </td>

                              {/* Amount Paid */}
                              <td className="p-3 text-center font-mono font-black text-emerald-700">
                                {st.amountPaid} د.ت
                              </td>

                              {/* Remaining Balance */}
                              <td className="p-3 text-center font-mono font-black">
                                {st.remainingBalance > 0 ? (
                                  <span className="text-red-600">{st.remainingBalance} د.ت</span>
                                ) : (
                                  <span className="text-slate-300">0 د.ت</span>
                                )}
                              </td>

                              {/* Payment Method */}
                              <td className="p-3">
                                <div className="text-[11px] font-bold">
                                  {st.paymentMethod === 'espece' ? (
                                    <span className="text-slate-600 flex items-center gap-1">
                                      <Banknote className="h-3 w-3 text-emerald-600" />
                                      نقداً
                                    </span>
                                  ) : (
                                    <span className="text-slate-800 flex items-center gap-1">
                                      <CreditCard className="h-3 w-3 text-blue-600" />
                                      شيك
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Payment Status Badge */}
                              <td className="p-3 text-center">
                                {hasRefund ? (
                                  <span className="px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-black inline-block" title={`سبب الاسترجاع: ${st.refundReason || 'غير مدون'}`}>
                                    مسترجع ({st.refundAmount!} د.ت)
                                  </span>
                                ) : isFullyPaid && (
                                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-black inline-block">
                                    خالص ✓
                                  </span>
                                )}
                                {!hasRefund && isAdvance && (
                                  <span className="px-2.5 py-0.5 bg-[#F2F8F9] text-[#14464E] border border-[#C3E0E4] rounded-full text-[10px] font-black inline-block">
                                    دفعة أولى
                                  </span>
                                )}
                                {!hasRefund && isUnpaid && (
                                  <span className="px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-black inline-block">
                                    غير خالص
                                  </span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => openRefundModal(st)}
                                    title={hasRefund ? 'تعديل الاسترجاع' : 'استرجاع (الانسحاب من التكوين)'}
                                    className="p-1 text-slate-400 hover:text-[#257C86] hover:bg-[#F2F8F9] rounded-lg transition cursor-pointer"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setPrintingStudent({ formation: selectedFormation, student: st })}
                                    title="طباعة وصل التكوين"
                                    className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </button>
                                  {isAdvance && !hasRefund && (
                                    <button
                                      onClick={() => handleAddRestPayment(st)}
                                      title="استكمال الدفع (يدفع المبلغ المتبقي)"
                                      className="p-1 text-[#257C86] hover:text-[#1E6A73] hover:bg-[#F2F8F9] rounded-lg transition cursor-pointer"
                                    >
                                      <DollarSign className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => openEditStudentModal(st)}
                                    title="تعديل"
                                    className="p-1 text-slate-400 hover:text-[#257C86] hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteStudentTarget({ formation: selectedFormation, student: st })}
                                    title="حذف"
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
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

                {/* Pagination footer */}
                {filteredStudents.length > pageSize && (
                  <div className="flex items-center justify-between px-2 pt-3 pb-1 border-t border-slate-100">
                    <button
                      onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                      disabled={validPage <= 1}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                      السابق
                    </button>
                    <span className="text-[11px] font-extrabold text-slate-500">
                      صفحة {validPage} / {totalPages} &nbsp;•&nbsp; {filteredStudents.length} تلميذ
                    </span>
                    <button
                      onClick={() => setStudentPage(p => Math.min(totalPages, p + 1))}
                      disabled={validPage >= totalPages}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      التالي
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center shadow-xs">
              <GraduationCap className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-black text-slate-700">لم يتم اختيار أي تكوين</h3>
              <p className="text-xs font-bold text-slate-400 mt-1">
                اختر تكويناً من القائمة الجانبية أو قم بإنشاء تكوين جديد
              </p>
              <button
                onClick={openCreateFormationModal}
                className="mt-4 px-4 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                إنشاء تكوين جديد
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT FORMATION                                            */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isFormationModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden my-8"
            >
              {/* Modal Header */}
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <GraduationCap className="h-5 w-5 text-[#3A93A0]" />
                  <h3 className="text-base font-black">
                    {editingFormationId ? 'تعديل بيانات التكوين' : 'إنشاء دورة تكوينية جديدة'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsFormationModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Name */}
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">
                    اسم التكوين / الدورة *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="مثال: دورة المراجعة المكثفة للباكالوريا (رياضيات + علوم)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                  />
                </div>

                {/* Grade & Branch */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black text-slate-700 block mb-1">المستوى الدراسي</label>
                    <select
                      value={formGrade}
                      onChange={e => { setFormGrade(e.target.value); setFormBranch(''); }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    >
                      {EXTERNAL_GRADE_LEVELS.map(g => (
                        <option key={g.level} value={g.level}>{g.level}</option>
                      ))}
                    </select>
                  </div>

                  {formBranches.length > 0 && (
                    <div>
                      <label className="text-xs font-black text-slate-700 block mb-1">الشعبة</label>
                      <select
                        value={formBranch}
                        onChange={e => setFormBranch(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      >
                        <option value="">-- اختر الشعبة --</option>
                        {formBranches.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* School Year & Pack Price */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black text-slate-700 block mb-1">السنة الدراسية *</label>
                    <select
                      value={formSchoolYear}
                      onChange={e => setFormSchoolYear(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    >
                      {DEFAULT_ACADEMIC_YEARS.map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-black text-slate-700 block mb-1">سعر الباك الكامل (د.ت) *</label>
                    <input
                      type="number"
                      min="0"
                      value={formPackPrice}
                      onChange={e => setFormPackPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    />
                  </div>
                </div>

                {/* Dates with proper onChange event handler */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black text-slate-700 block mb-1">تاريخ البداية *</label>
                    <DateField
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black text-slate-700 block mb-1">تاريخ النهاية *</label>
                    <DateField
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    />
                  </div>
                </div>

                {/* Matieres section — EXACT STAFF MODULE CHIPS PATTERN */}
                <div className="space-y-3 p-4 bg-[#F2F8F9]/60 rounded-2xl border border-[#C3E0E4]">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-[#103840] block flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-[#257C86]" />
                      المواد المشمولة في التكوين (اختيار مادة أو أكثر):
                    </label>
                    
                    <button
                      type="button"
                      onClick={() => setIsAddingSubject(!isAddingSubject)}
                      className="text-[11px] font-bold text-[#17555F] hover:text-[#103840] bg-[#E0EFF1] hover:bg-[#d0e5e8] px-2.5 py-1 rounded-lg transition cursor-pointer"
                    >
                      + إضافة مادة جديدة
                    </button>
                  </div>

                  {isAddingSubject && (
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={newSubjectInput}
                        onChange={(e) => setNewSubjectInput(e.target.value)}
                        placeholder="اسم مادة جديدة..."
                        className="flex-1 px-3 py-1.5 bg-white border border-[#A0CBCF] rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      />
                      <button
                        type="button"
                        onClick={handleAddNewSubject}
                        className="px-3.5 py-1.5 bg-[#257C86] hover:bg-[#1E6A73] text-white font-bold text-xs rounded-xl cursor-pointer"
                      >
                        إضافة
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1 max-h-48 overflow-y-auto">
                    {availableSubjects.map((sub) => {
                      const isSelected = selectedSubjectNames.includes(sub);
                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => toggleSubjectSelection(sub)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#257C86] text-white border-[#257C86] shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected ? '✓ ' : ''}{sub}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormationModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveFormation}
                  className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  حفظ التكوين
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT STUDENT                                                 */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isStudentModalOpen && selectedFormation && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden my-8"
            >
              {/* Header */}
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <UserPlus className="h-5 w-5 text-[#3A93A0]" />
                  <div>
                    <h3 className="text-base font-black">
                      {editingStudentId ? 'تعديل تسجيل التلميذ' : 'تسجيل تلميذ جديد في التكوين'}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                      {selectedFormation.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsStudentModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Student Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black text-slate-700 block mb-1">اسم ولقب التلميذ *</label>
                    <input
                      type="text"
                      value={stName}
                      onChange={e => setStName(e.target.value)}
                      placeholder="اسم التلميذ الكامل"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black text-slate-700 block mb-1">هاتف الولي * (8 أرقام)</label>
                    <input
                      type="text"
                      required
                      value={stPhone}
                      onChange={e => setStPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="98765432"
                      maxLength={8}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    />
                  </div>
                </div>

                {/* Enrollment Type (Pack vs Selection) */}
                <div className="bg-[#F2F8F9] p-4 rounded-2xl border border-[#C3E0E4] space-y-3">
                  <label className="text-xs font-black text-[#14464E] block">نوع التسجيل في التكوين *</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                      <input
                        type="radio"
                        name="enrollmentType"
                        checked={stIsPack}
                        onChange={() => {
                          setStIsPack(true);
                          setStSelectedMatiereIds(selectedFormation.matieres.map(m => m.id));
                          setStTotalRequired(selectedFormation.packPrice);
                          setStAmountPaid(Math.max(0, selectedFormation.packPrice - stDiscount));
                        }}
                        className="w-4 h-4 accent-[#257C86]"
                      />
                      <span>باك كامل (جميع المواد)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                      <input
                        type="radio"
                        name="enrollmentType"
                        checked={!stIsPack}
                        onChange={() => setStIsPack(false)}
                        className="w-4 h-4 accent-[#257C86]"
                      />
                      <span>اختيار مواد محددة</span>
                    </label>
                  </div>

                  {/* If custom selection, show checkboxes */}
                  {!stIsPack && (
                    <div className="pt-2 border-t border-[#C3E0E4]/60 space-y-2">
                      <span className="text-[11px] font-bold text-slate-600 block">حدد المواد التي سيدرسها التلميذ:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedFormation.matieres.map(m => {
                          const isChecked = stSelectedMatiereIds.includes(m.id);
                          return (
                            <label
                              key={m.id}
                              className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                                isChecked
                                  ? 'bg-white border-[#257C86] text-[#14464E] shadow-2xs'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleMatiereSelection(m.id)}
                                className="w-4 h-4 accent-[#257C86] rounded"
                              />
                              <span className="truncate">{m.subject}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Financials (Total, Discount, Paid, Remaining) */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4 text-[#257C86]" />
                    الرسوم والاستخلاص المالي
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">المبلغ المطلوب (د.ت) *</label>
                      <input
                        type="number"
                        min="0"
                        value={stTotalRequired}
                        onChange={e => {
                          const req = Number(e.target.value);
                          setStTotalRequired(req);
                          setStAmountPaid(Math.max(0, req - stDiscount));
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">التخفيض / Remise (د.ت)</label>
                      <input
                        type="number"
                        min="0"
                        value={stDiscount}
                        onChange={e => {
                          const disc = Number(e.target.value);
                          setStDiscount(disc);
                          setStAmountPaid(Math.max(0, stTotalRequired - disc));
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">المبلغ المدفوع حالياً (د.ت) *</label>
                      <input
                        type="number"
                        min="0"
                        value={stAmountPaid}
                        onChange={e => setStAmountPaid(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono text-emerald-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      />
                    </div>
                  </div>

                  {/* Summary row */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs font-bold">
                    <span className="text-slate-500">
                      الصافي المستحق: <span className="font-mono font-black text-slate-800">{Math.max(0, stTotalRequired - stDiscount)} د.ت</span>
                    </span>
                    <span className="text-slate-500">
                      المتبقي للدفع: <span className={`font-mono font-black ${Math.max(0, stTotalRequired - stDiscount - stAmountPaid) > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {Math.max(0, stTotalRequired - stDiscount - stAmountPaid)} د.ت
                      </span>
                    </span>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-700 block">طريقة الدفع *</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={stPaymentMethod === 'espece'}
                        onChange={() => setStPaymentMethod('espece')}
                        className="w-4 h-4 accent-[#257C86]"
                      />
                      <span className="flex items-center gap-1">
                        <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                        نقداً (Espèce)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={stPaymentMethod === 'cheque'}
                        onChange={() => setStPaymentMethod('cheque')}
                        className="w-4 h-4 accent-[#257C86]"
                      />
                      <span className="flex items-center gap-1">
                        <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                        شيك (Chèque)
                      </span>
                    </label>
                  </div>

                  {/* Cheque details */}
                  {stPaymentMethod === 'cheque' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-blue-50/50 rounded-2xl border border-blue-200/70">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">رقم الشيك *</label>
                        <input
                          type="text"
                          value={stChequeNumber}
                          onChange={e => setStChequeNumber(e.target.value)}
                          placeholder="مثال: 1234567"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">تاريخ الشيك</label>
                        <DateField
                          value={stChequeDate}
                          onChange={(e) => setStChequeDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">ملاحظات إضافية</label>
                  <textarea
                    rows={2}
                    value={stNotes}
                    onChange={e => setStNotes(e.target.value)}
                    placeholder="ملاحظات حول التسجيل أو اتفاقيات الدفع..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86] resize-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStudentModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveStudent}
                  className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {editingStudentId ? 'تحديث البيانات' : 'تأكيد التسجيل'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* CONFIRMATION DIALOGS                                                      */}
      {/* ========================================================================= */}
      <ConfirmDialog
        open={!!deleteFormationTarget}
        title="تأكيد حذف التكوين"
        danger={true}
        confirmLabel="نعم، حذف التكوين"
        cancelLabel="إلغاء"
        message={
          <span>
            هل أنت متأكد من رغبتك في حذف التكوين <strong>{deleteFormationTarget?.name}</strong>؟
            <br />
            سيتم حذف جميع سجلات تسجيل التلاميذ المرتبطة بهذا التكوين نهائياً.
          </span>
        }
        onConfirm={() => deleteFormationTarget && handleDeleteFormation(deleteFormationTarget)}
        onCancel={() => setDeleteFormationTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteStudentTarget}
        title="تأكيد إلغاء تسجيل التلميذ"
        danger={true}
        confirmLabel="نعم، إلغاء التسجيل"
        cancelLabel="إلغاء"
        message={
          <span>
            هل أنت متأكد من رغبتك في إلغاء تسجيل التلميذ <strong>{deleteStudentTarget?.student.studentName}</strong> من التكوين؟
          </span>
        }
        onConfirm={handleDeleteStudent}
        onCancel={() => setDeleteStudentTarget(null)}
      />

      {/* Refund modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8"
          >
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="h-5 w-5 text-[#257C86]" />
                <div>
                  <h3 className="text-base font-black">
                    {refundTarget?.student.refundAmount ? 'تعديل الاسترجاع' : 'استرجاع / انسحاب من التكوين'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                    {refundTarget?.student.studentName} — {refundTarget?.formation.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRefundTarget(null)}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">المبلغ المدفوع</span>
                <span className="font-mono font-black text-slate-900">{refundTarget?.student.amountPaid} د.ت</span>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">مبلغ الاسترجاع *</label>
                <input
                  type="number"
                  value={refundAmount || ''}
                  onChange={e => setRefundAmount(Math.max(0, Number(e.target.value)))}
                  max={refundTarget?.student.amountPaid}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#257C86]/30"
                />
                <p className="text-[10px] font-bold text-slate-400 mt-1">
                  الحد الأقصى: {refundTarget?.student.amountPaid} د.ت
                </p>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">سبب الاسترجاع</label>
                <textarea
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  rows={3}
                  placeholder="مثال: انسحاب التلميذ من التكوين..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#257C86]/30 resize-none"
                />
              </div>

              <button
                onClick={handleConfirmRefund}
                className="w-full px-4 py-2.5 bg-[#257C86] hover:bg-[#1E6A73] text-white text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                تأكيد الاسترجاع
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Receipt print overlay */}
      {printingStudent && (() => {
        const { formation, student } = printingStudent;
        const chosenMatieres = student.isPack
          ? (formation.matieres || [])
          : (formation.matieres || []).filter(m => (student.enrolledMatiereIds || []).includes(m.id));
        const netRequired = Math.max(0, student.totalRequired - student.discount);
        const fullyPaid = student.remainingBalance <= 0;
        const printHasRefund = (student.refundAmount ?? 0) > 0;
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center no-print shrink-0">
                <h3 className="text-sm font-black">وصل تسجيل في تكوين</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="h-4 w-4" />
                    طباعة الوصل 🖨️
                  </button>
                  <button
                    onClick={() => setPrintingStudent(null)}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-black rounded-xl transition cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto p-4 bg-slate-50">
                <div className="print-area print-one p-8 bg-white text-slate-900 border-2 border-slate-300 rounded-2xl mx-auto my-4 text-xs font-sans flex flex-col">
                  {/* Header */}
                  <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
                    <div>
                      <p className="text-lg font-black text-[#257C86]">{settings?.centerName || 'المركز'}</p>
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">وصل تسجيل في تكوين</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-black">الوسم: <span className="font-mono">{formation.name}</span></p>
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">الموسم الدراسي: {formation.schoolYear}</p>
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">التاريخ: {new Date().toLocaleDateString('ar-TN')}</p>
                    </div>
                  </div>

                  {/* Student info */}
                  <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-200">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">التلميذ(ة)</p>
                      <p className="font-extrabold text-slate-900 mt-0.5">{student.studentName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">هاتف الولي</p>
                      <p className="font-bold text-slate-800 mt-0.5 font-mono" dir="ltr">{student.parentPhone}</p>
                    </div>
                  </div>

                  {/* Matieres */}
                  <div className="py-3 border-b border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 mb-1.5">
                      {student.isPack ? 'المواد المشمولة (باك كامل)' : `المواد المختارة (${chosenMatieres.length})`}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {chosenMatieres.map(m => (
                        <span key={m.id} className="px-2 py-1 bg-[#F2F8F9] text-[#257C86] border border-[#C3E0E4] rounded-lg text-[10px] font-extrabold">
                          {m.subject}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Amounts */}
                  <div className="py-3 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500">المبلغ الكامل</span>
                      <span className="font-mono font-black">{student.totalRequired} د.ت</span>
                    </div>
                    {student.discount > 0 && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[11px] font-bold text-slate-500">التخفيض</span>
                        <span className="font-mono font-black text-amber-600">-{student.discount} د.ت</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] font-bold text-slate-500">المبلـــــغ الصافي</span>
                      <span className="font-mono font-black text-slate-900">{netRequired} د.ت</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] font-bold text-slate-500">المدفوع</span>
                      <span className="font-mono font-black text-emerald-600">{student.amountPaid} د.ت</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] font-bold text-slate-500">المتبقي</span>
                      <span className={`font-mono font-black ${student.remainingBalance > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {student.remainingBalance} د.ت
                      </span>
                    </div>
                    {printHasRefund && (
                      <div className="flex items-center justify-between mt-1 pt-2 border-t border-dashed border-slate-200">
                        <span className="text-[11px] font-bold text-red-600">المسترجع</span>
                        <span className="font-mono font-black text-red-600">-{student.refundAmount} د.ت</span>
                      </div>
                    )}
                  </div>

                  {/* Payment method */}
                  <div className="py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500">طريقة الدفع</span>
                    <span className="font-extrabold text-slate-900">
                      {student.paymentMethod === 'espece'
                        ? 'نقداً'
                        : 'بشيك'}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="py-3 flex items-center justify-center">
                    {printHasRefund ? (
                      <span className="px-4 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[11px] font-black">
                        مسترجع ({student.refundAmount!} د.ت)
                      </span>
                    ) : (
                      <span className={`px-4 py-1.5 rounded-full text-[11px] font-black ${fullyPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : student.amountPaid > 0 ? 'bg-[#F2F8F9] text-[#14464E] border border-[#C3E0E4]' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {fullyPaid ? 'خالص ✓' : student.amountPaid > 0 ? 'دفعة أولى' : 'غير خالص'}
                      </span>
                    )}
                  </div>

                  {/* Signature */}
                  <div className="print-footer mt-4 pt-4 border-t border-dashed border-slate-300 flex items-end justify-between">
                    <p className="text-[10px] text-slate-400 font-bold">شكراً لثقتكم بنا</p>
                    <p className="text-[10px] font-black text-slate-600">الختم والإمضاء</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Schedule print overlay (A4 landscape) */}
      {printingSchedule && (() => {
        const f = printingSchedule;
        const matiereNameById = (id: string) => (f.matieres || []).find(m => m.id === id)?.name;
        const allStudents = f.students || [];
        const studentsForSeance = (matiere: string) => {
          const matched = allStudents.filter(st =>
            st.isPack || (st.enrolledMatiereIds || []).some(id => matiereNameById(id) === matiere)
          );
          return matched.length ? matched : allStudents;
        };
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center no-print shrink-0">
                <h3 className="text-sm font-black">طباعة جدول الحصص</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="h-4 w-4" />
                    طباعة (A4 أفقي) 🖨️
                  </button>
                  <button
                    onClick={() => setPrintingSchedule(null)}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-black rounded-xl transition cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto p-4 bg-slate-50">
                <div className="print-area print-landscape p-6 bg-white text-slate-900 border border-slate-300 rounded-2xl mx-auto my-4 text-xs font-sans">
                  <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3 mb-4">
                    <div>
                      <p className="text-lg font-black text-[#257C86]">{settings?.centerName || 'المركز'}</p>
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">جدول حصص أسبوعي — تكوين: {f.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-black">الموسم الدراسي: {f.schoolYear}</p>
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">من {f.startDate} إلى {f.endDate}</p>
                    </div>
                  </div>

                  <table className="w-full border-collapse text-right">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 p-2">اليوم</th>
                        <th className="border border-slate-300 p-2">التوقيت</th>
                        <th className="border border-slate-300 p-2">المادة</th>
                        <th className="border border-slate-300 p-2">الأستاذ / التلاميذ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FORMATION_WORK_DAYS.map(day => {
                        const daySeances = (f.schedule || [])
                          .filter(s => s.day === day)
                          .sort((a, b) => a.startTime.localeCompare(b.startTime));
                        if (daySeances.length === 0) {
                          return (
                            <tr key={day}>
                              <td className="border border-slate-300 p-2 font-bold">{day}</td>
                              <td className="border border-slate-300 p-2 text-slate-400" colSpan={3}>لا حصص</td>
                            </tr>
                          );
                        }
                        return daySeances.map((s, idx) => (
                          <tr key={`${day}-${idx}`}>
                            {idx === 0 ? (
                              <td className="border border-slate-300 p-2 font-bold align-top" rowSpan={daySeances.length}>{day}</td>
                            ) : null}
                            <td className="border border-slate-300 p-2 font-mono whitespace-nowrap">{s.startTime} - {s.endTime}</td>
                            <td className="border border-slate-300 p-2">{s.matiere}</td>
                            <td className="border border-slate-300 p-2 align-top">
                              <div className="font-bold">الأستاذ: ........................................</div>
                              <div className="mt-1 space-y-0.5">
                                {studentsForSeance(s.matiere).map((st, si) => (
                                  <div key={st.id ?? si}>• {st.studentName}</div>
                                ))}
                              </div>
                              <div className="mt-1 text-slate-400">تلاميذ إضافيون: ........................................</div>
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>

                  <div className="print-footer mt-4 pt-4 border-t border-dashed border-slate-300 flex items-end justify-between">
                    <p className="text-[10px] text-slate-400 font-bold">شكراً لثقتكم بنا</p>
                    <p className="text-[10px] font-black text-slate-600">الختم والإمضاء</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Formation Weekly Schedule (Gemini aide) */}
      <FormationScheduleModal
        open={isScheduleModalOpen}
        formation={selectedFormation}
        apiKey={settings?.geminiApiKey}
        centerName={settings?.centerName}
        onClose={() => setIsScheduleModalOpen(false)}
        onSave={handleSaveFormationSchedule}
      />

    </div>
  );
}
