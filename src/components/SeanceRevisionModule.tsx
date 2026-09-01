import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
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
  GraduationCap,
  ClipboardCheck,
  ChevronDown
} from 'lucide-react';
import { RevisionSeance, RevisionSeanceStudent, CenterSettings, EXTERNAL_GRADE_OPTIONS, getAppSubjects, getCurrentAcademicYear } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import DateField from './DateField';
import { capitalizeFirst } from '../utils/format';

interface SeanceRevisionModuleProps {
  revisions: RevisionSeance[];
  onUpdateRevisions: (list: RevisionSeance[]) => void;
  settings?: CenterSettings;
  onUpdateSettings?: (newSettings: CenterSettings) => void;
  sidebarCollapsed?: boolean;
}

const YEARS = ['2022/2023', '2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'];

export default function SeanceRevisionModule({
  revisions,
  onUpdateRevisions,
  settings,
  onUpdateSettings,
  sidebarCollapsed
}: SeanceRevisionModuleProps) {
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(revisions[0]?.id || null);
  const selected = revisions.find(r => r.id === selectedId) || null;

  // Seance form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schoolYear, setSchoolYear] = useState(getCurrentAcademicYear());
  const [trimester, setTrimester] = useState('Trimestre 1');
  const [gradeBase, setGradeBase] = useState('Collège 7ème Année');
  const [subject, setSubject] = useState('Mathématiques');
  const [teacherName, setTeacherName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [seanceDate, setSeanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [teacherShare, setTeacherShare] = useState(70);
  const [centerShare, setCenterShare] = useState(10);

  // Add new matière state
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubject, setNewSubject] = useState('');

  // Add student to seance state
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [stName, setStName] = useState('');
  const [stPhone, setStPhone] = useState('');
  const [stPaid, setStPaid] = useState(false);

  // Pointage (attendance + payment) modal state
  const [isPointageOpen, setIsPointageOpen] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [paymentMap, setPaymentMap] = useState<Record<string, boolean>>({});

  // Confirmations
  const [deletion, setDeletion] = useState<RevisionSeance | null>(null);
  const [studentRemoval, setStudentRemoval] = useState<{ seance: RevisionSeance; studentId: string; studentName: string } | null>(null);

  // Filters
  const [filterYear, setFilterYear] = useState('all');
  const [filterTrimester, setFilterTrimester] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');

  // Students list collapsed (default: expanded)
  const [studentsCollapsed, setStudentsCollapsed] = useState(false);

  const appSubjects = getAppSubjects(settings);
  const seanceFee = teacherShare + centerShare;

  const filteredRevisions = revisions.filter(r => {
    if (filterYear !== 'all' && r.schoolYear !== filterYear) return false;
    if (filterTrimester !== 'all' && r.trimester !== filterTrimester) return false;
    if (filterGrade !== 'all' && r.gradeLevel !== filterGrade) return false;
    if (filterSubject !== 'all') {
      const cSub = (r.subject || '').toLowerCase();
      const fSub = filterSubject.toLowerCase();
      if (cSub !== fSub && !cSub.includes(fSub) && !fSub.includes(cSub)) {
        const latinMatch = cSub.match(/\(([^)]*)\)/);
        if (!latinMatch || !latinMatch[1].toLowerCase().includes(fSub)) return false;
      }
    }
    return true;
  });

  const filterSubjectOptions = Array.from(new Set([
    ...appSubjects,
    ...revisions.map(r => r.subject).filter(Boolean)
  ]));

  const handleAddSubject = () => {
    if (!newSubject.trim() || !settings || !onUpdateSettings) return;
    const sub = newSubject.trim();
    if (!appSubjects.includes(sub)) {
      onUpdateSettings({ ...settings, subjects: [...appSubjects, sub] });
    }
    setSubject(sub);
    setNewSubject('');
    setIsAddingSubject(false);
  };

  const openAdd = () => {
    setEditingId(null);
    setSchoolYear(getCurrentAcademicYear());
    setTrimester('Trimestre 1');
    setGradeBase('Collège 7ème Année');
    setSubject('Mathématiques');
    setTeacherName('');
    setTeacherPhone('');
    setSeanceDate(new Date().toISOString().split('T')[0]);
    setTeacherShare(70);
    setCenterShare(10);
    setIsModalOpen(true);
  };

  const openEdit = (r: RevisionSeance) => {
    setEditingId(r.id);
    setSchoolYear(r.schoolYear);
    setTrimester(r.trimester);
    setGradeBase(r.gradeLevel);
    setSubject(r.subject);
    setTeacherName(r.teacherName);
    setTeacherPhone(r.teacherPhone);
    setSeanceDate(r.date);
    setTeacherShare(r.teacherShare);
    setCenterShare(r.centerShare);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName.trim()) {
      toast.error('أدخل اسم الأستاذ الخارجي.');
      return;
    }
    if (editingId) {
      const updated = revisions.map(r => r.id === editingId ? { ...r, schoolYear, trimester, gradeLevel: gradeBase, subject, teacherName: teacherName.trim(), teacherPhone, date: seanceDate, teacherShare, centerShare } : r);
      onUpdateRevisions(updated);
      toast.success('تم تحديث حصة المراجعة بنجاح!');
    } else {
      const newRev: RevisionSeance = {
        id: 'rev_' + crypto.randomUUID(),
        schoolYear,
        trimester,
        gradeLevel: gradeBase,
        subject,
        teacherName: teacherName.trim(),
        teacherPhone,
        date: seanceDate,
        teacherShare,
        centerShare,
        students: []
      };
      onUpdateRevisions([...revisions, newRev]);
      setSelectedId(newRev.id);
      toast.success('تم إنشاء حصة المراجعة بنجاح!');
    }
    setIsModalOpen(false);
  };

  const handleAddStudent = () => {
    if (!selected) return;
    if (!stName.trim()) {
      toast.error('أدخل اسم التلميذ.');
      return;
    }
    const newStudent: RevisionSeanceStudent = {
      studentId: 'rev_st_' + crypto.randomUUID(),
      studentName: stName.trim(),
      parentPhone: stPhone.trim(),
      paidSeance: stPaid,
      present: true
    };
    const updated = revisions.map(r => r.id === selected.id ? { ...r, students: [...r.students, newStudent] } : r);
    onUpdateRevisions(updated);
    setStName('');
    setStPhone('');
    setStPaid(false);
    setIsStudentModalOpen(false);
    toast.success(`تمت إضافة التلميذ (${newStudent.studentName}) إلى الحصة!`);
  };

  const handleToggleStudentPaid = (seance: RevisionSeance, studentId: string) => {
    const updated = revisions.map(r => r.id === seance.id ? { ...r, students: r.students.map(s => s.studentId === studentId ? { ...s, paidSeance: !s.paidSeance } : s) } : r);
    onUpdateRevisions(updated);
  };

  const openPointage = (seance: RevisionSeance) => {
    const att: Record<string, 'present' | 'absent'> = {};
    const pay: Record<string, boolean> = {};
    seance.students.forEach(s => { att[s.studentId] = s.present ? 'present' : 'absent'; pay[s.studentId] = s.paidSeance; });
    setAttendanceMap(att);
    setPaymentMap(pay);
    setSeanceDate(seance.date);
    setIsPointageOpen(true);
  };

  const handleSavePointage = () => {
    if (!selected) return;
    const updatedStudents = selected.students.map(s => ({
      ...s,
      present: (attendanceMap[s.studentId] || 'present') === 'present',
      paidSeance: !!paymentMap[s.studentId]
    }));
    const updated = revisions.map(r => r.id === selected.id ? { ...r, students: updatedStudents, date: seanceDate } : r);
    onUpdateRevisions(updated);
    setIsPointageOpen(false);
    toast.success('تم تسجيل الحضور والدفع لحصة المراجعة!');
  };

  // Financial totals for the selected seance
  const paidCount = selected ? selected.students.filter(s => s.paidSeance).length : 0;
  const presentCount = selected ? selected.students.filter(s => s.present).length : 0;
  const profTotal = paidCount * (selected?.teacherShare || 0);
  const centerTotal = paidCount * (selected?.centerShare || 0);
  const collectedTotal = paidCount * (selected ? selected.teacherShare + selected.centerShare : 0);

  return (
    <div className="space-y-6">

      {/* Header Banner */}
      <div className="bg-white border border-[#E0EFF1] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-[#F2F8F9] text-[#14464E] text-xs font-bold rounded-lg border border-[#C3E0E4]/60">
              حصة المراجعة
            </span>
            <span className="text-xs text-slate-400 font-bold">حصص مراجعة واحدة مع أساتذة خارجيين</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-[#257C86]" />
            حصص المراجعة مع الأساتذة الخارجيين
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            حصة مراجعة واحدة، تقسيم المستحقات بين الأستاذ والسنتر، وتسجيل الحضور والدفع.
          </p>
        </div>

        <button
          onClick={openAdd}
          className="px-5 py-3 bg-[#257C86] hover:bg-[#1E6A73] text-white font-extrabold text-sm rounded-2xl transition shadow-md shadow-[#257C86]/20 flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus className="h-5 w-5" />
          إضافة حصة مراجعة
        </button>
      </div>

      {/* Filters - Full Width */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs no-print">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#257C86]/30">
            <option value="all">كل السنوات</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterTrimester} onChange={e => setFilterTrimester(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#257C86]/30">
            <option value="all">كل الأثلاث</option>
            <option value="Trimestre 1">Trimestre 1</option>
            <option value="Trimestre 2">Trimestre 2</option>
            <option value="Trimestre 3">Trimestre 3</option>
          </select>
          <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#257C86]/30">
            <option value="all">كل المستويات</option>
            {EXTERNAL_GRADE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#257C86]/30">
            <option value="all">كل المواد</option>
            {filterSubjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Main Grid */}
      <div className={`grid grid-cols-1 gap-6 no-print ${sidebarCollapsed ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>

        {/* Left Column: seances list */}
        <div className="space-y-4">

          <h3 className="font-extrabold text-slate-900 text-sm">حصص المراجعة ({filteredRevisions.length})</h3>

          <div className="space-y-3">
            {filteredRevisions.length === 0 && (
              <div className="p-5 bg-white rounded-3xl border border-dashed border-slate-300 text-center">
                <p className="text-xs text-slate-400 font-bold">{revisions.length === 0 ? 'لا توجد حصص مراجعة بعد.' : 'لا توجد نتائج مطابقة.'}</p>
              </div>
            )}
            {filteredRevisions.map(r => {
              const isSelected = selectedId === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`p-5 rounded-3xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#F2F8F9]/60 border-[#A0CBCF] shadow-sm'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-[#14464E] bg-[#E0EFF1] px-2 py-0.5 rounded-md whitespace-nowrap">
                          {r.trimester} — {r.schoolYear}
                        </span>
                        <span className="text-[10px] font-black uppercase text-sky-800 bg-sky-100 px-2 py-0.5 rounded-md">
                          {r.subject}
                        </span>
                      </div>
                      <h4 className="text-base font-black text-slate-900">{r.gradeLevel}</h4>
                      <p className="text-[10px] text-slate-400 font-mono" dir="ltr">📅 {r.date}</p>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletion(r); }}
                        title="حذف الحصة"
                        className="p-1.5 hover:bg-red-100 rounded-lg text-red-500 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1">
                    <p className="font-bold text-slate-800">👨‍🏫 الأستاذ الخارجي: {r.teacherName}</p>
                    <p className="font-mono text-slate-500 text-[11px]"><span dir="rtl">📞 هاتف: {r.teacherPhone || '—'}</span></p>
                  </div>

                  <div className="mt-3 p-2 bg-white rounded-xl border border-slate-200/80 flex justify-between text-[11px] font-bold">
                    <span className="text-emerald-700">الأستاذ: {r.teacherShare} د.ت</span>
                    <span className="text-[#14464E]">مناب السنتر: {r.centerShare} د.ت</span>
                    <span className="text-slate-400">التلاميذ: {r.students.length}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: selected seance details */}
        {selected ? (
          <div className={`space-y-6 ${sidebarCollapsed ? 'lg:col-span-3' : 'lg:col-span-2'}`}>

            {/* Header info card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs font-bold text-[#17555F] whitespace-nowrap">{selected.trimester} — {selected.schoolYear}</span>
                  <h3 className="text-2xl font-black text-slate-900">{selected.gradeLevel} — {selected.subject}</h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5" dir="ltr">📅 {selected.date}</p>
                </div>
                <button
                  onClick={() => openPointage(selected)}
                  className="px-4 py-2 bg-[#257C86] hover:bg-[#17555F] text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  تسجيل الحضور والدفع
                </button>
              </div>

              {/* Pricing breakdown summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-bold">رسوم الحصة الواحدة:</span>
                  <span className="font-extrabold text-slate-900">{selected.teacherShare + selected.centerShare} د.ت</span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <span className="text-emerald-700 text-[10px] block font-bold">مناب الأستاذ:</span>
                  <span className="font-black text-emerald-800">{selected.teacherShare} د.ت</span>
                </div>
                <div className="p-3 bg-[#F2F8F9] rounded-2xl border border-[#C3E0E4]">
                  <span className="text-[#14464E] text-[10px] block font-bold">مناب السنتر:</span>
                  <span className="font-black text-[#103840]">{selected.centerShare} د.ت</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-bold">تاريخ الحصة:</span>
                  <span className="font-black text-slate-900 font-mono text-[11px]" dir="ltr">{selected.date}</span>
                </div>
              </div>
            </div>

            {/* Students list */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 space-y-4 shadow-xs">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStudentsCollapsed(c => !c)}
                  className="flex items-center gap-2 flex-row-reverse font-black text-slate-900 text-sm hover:text-[#257C86] cursor-pointer"
                >
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${studentsCollapsed ? '' : 'rotate-180'}`} />
                  <Users className="h-4 w-4 text-[#257C86]" />
                  التلاميذ الخارجيون ({selected.students.length})
                </button>
                <button
                  onClick={() => setIsStudentModalOpen(true)}
                  className="px-3 py-1.5 bg-[#257C86] hover:bg-[#17555F] text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  إضافة تلميذ
                </button>
              </div>

              {!studentsCollapsed && (selected.students.length === 0 ? (
                <p className="text-xs text-slate-400">لا يوجد تلاميذ في هذه الحصة بعد. أضف التلاميذ الخارجيين الذين سيحضرونها.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3 text-right">التلميذ</th>
                        <th className="p-3 text-center">الحضور</th>
                        <th className="p-3 text-center">دفع الحصة</th>
                        <th className="p-3 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selected.students.map(st => (
                        <tr key={st.studentId} className="hover:bg-slate-50/70">
                          <td className="p-3 font-black text-slate-900">
                            <div className="flex items-start gap-2">
                              <span className="w-4 shrink-0 text-center">{st.present ? '✓' : '✕'}</span>
                              <div className="space-y-1">
                                <p className="flex items-center gap-1.5 flex-wrap">{st.studentName}
                                  <span className="px-1.5 py-0.5 bg-[#E0EFF1] text-[#14464E] rounded-md text-[9px] font-black">خارجي</span>
                                </p>
                                <p className="text-[10px] text-slate-400 font-bold"><span className="text-slate-500">📞 هاتف الولي:</span> <span className="font-mono">{st.parentPhone || '—'}</span></p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-xl text-[11px] font-black border ${st.present ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                              {st.present ? 'حاضر' : 'غائب'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleToggleStudentPaid(selected, st.studentId)}
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-black border cursor-pointer transition ${st.paidSeance ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                            >
                              {st.paidSeance ? `✓ دفع ${selected.teacherShare + selected.centerShare} د.ت` : 'لم يدفع'}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setStudentRemoval({ seance: selected, studentId: st.studentId, studentName: st.studentName })}
                              className="p-1.5 hover:bg-red-100 rounded-lg text-red-400 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            {/* Totals card at the bottom of the page */}
            <div className="bg-white rounded-3xl p-6 border border-[#C3E0E4] shadow-xs space-y-3">
              <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-[#257C86]" />
                إجمالي مستحقات الحصة
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-bold">التلاميذ الذين دفعوا:</span>
                  <span className="font-black text-slate-900">{paidCount} / {selected.students.length}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-bold">الحاضرون:</span>
                  <span className="font-black text-slate-900">{presentCount} / {selected.students.length}</span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <span className="text-emerald-700 text-[10px] block font-bold">إجمالي مناب الأستاذ:</span>
                  <span className="font-black text-emerald-800">{profTotal} د.ت</span>
                </div>
                <div className="p-3 bg-[#F2F8F9] rounded-2xl border border-[#C3E0E4]">
                  <span className="text-[#14464E] text-[10px] block font-bold">إجمالي مناب السنتر:</span>
                  <span className="font-black text-[#103840]">{centerTotal} د.ت</span>
                </div>
              </div>
              <div className="p-3 bg-[#F2F8F9] rounded-2xl border border-[#C3E0E4] flex justify-between items-center">
                <span className="text-[#14464E] text-[11px] font-black">المبلغ الإجمالي المحصّل:</span>
                <span className="font-black text-[#103840] text-sm">{collectedTotal} د.ت</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 p-12 bg-white rounded-3xl border border-dashed border-slate-300 text-center text-slate-400 font-bold text-sm">
           
              <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              اختر حصة مراجعة أو أضف واحدة جديدة.
           
          </div>

         
        )}
      </div>

      {/* SEANCE MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-[#3A93A0]" />
                  <div>
                    <h3 className="text-lg font-black">{editingId ? 'تعديل حصة مراجعة' : 'إضافة حصة مراجعة'}</h3>
                    <p className="text-xs text-slate-300">حصة مراجعة واحدة</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">السنة الدراسية *</label>
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
                      value={trimester}
                      onChange={(e) => setTrimester(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold cursor-pointer"
                    >
                      <option value="Trimestre 1">الثلاثي الأول</option>
                      <option value="Trimestre 2">الثلاثي الثاني</option>
                      <option value="Trimestre 3">الثلاثي الثالث</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
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

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">تاريخ الحصة *</label>
                    <DateField
                      required value={seanceDate} onChange={(e) => setSeanceDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">المادة *</label>
                  <div className="flex gap-2">
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold cursor-pointer"
                    >
                      {appSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsAddingSubject(!isAddingSubject)}
                      className="px-3 py-2 bg-[#E0EFF1] hover:bg-[#C3E0E4] text-[#14464E] font-bold text-xs rounded-xl cursor-pointer shrink-0"
                    >
                      إضافة مادة
                    </button>
                  </div>
                    {isAddingSubject && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={newSubject}
                          onChange={(e) => setNewSubject(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubject(); } }}
                          placeholder="اسم المادة الجديدة..."
                          className="flex-1 px-3 py-1.5 bg-white border border-[#A0CBCF] rounded-xl text-xs font-bold"
                        />
                        <button
                          type="button"
                          onClick={handleAddSubject}
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
                  <span className="text-xs font-bold text-[#103840] block">💰 تقسيم مستحقات الحصة الواحدة</span>
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
                  <p className="text-[10px] text-slate-400">إجمالي رسوم حصة المراجعة للتلميذ = {seanceFee} د.ت</p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl cursor-pointer"
                  >
                    {editingId ? 'حفظ التعديلات' : 'إنشاء الحصة'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD STUDENT MODAL */}
      <AnimatePresence>
        {isStudentModalOpen && selected && (
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
                    <h3 className="text-lg font-black">إضافة تلميذ إلى الحصة</h3>
                    <p className="text-xs text-slate-300">{selected.subject} — {selected.gradeLevel}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsStudentModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">اسم التلميذ *</label>
                    <input
                      type="text" value={stName} onChange={(e) => setStName(e.target.value)} onBlur={(e) => setStName(capitalizeFirst(e.target.value))}
                      placeholder="الاسم واللقب"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">هاتف الولي (8 أرقام)</label>
                  <input
                    type="text" dir="ltr" value={stPhone} onChange={(e) => setStPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="98765432"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-right" maxLength={8}
                  />
                </div>

                <label className="flex items-center gap-3 p-3 bg-[#F2F8F9] rounded-2xl border border-[#C3E0E4] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stPaid}
                    onChange={(e) => setStPaid(e.target.checked)}
                    className="h-4 w-4 accent-[#257C86]"
                  />
                  <div>
                    <p className="text-xs font-black text-[#103840]">دفع حصة المراجعة</p>
                    <p className="text-[10px] text-[#17555F] font-bold">المبلغ: {seanceFee} د.ت — يُدفع مرة واحدة للحصة</p>
                  </div>
                </label>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsStudentModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleAddStudent}
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#17555F] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <UserPlus className="h-4 w-4" />
                    إضافة التلميذ
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* POINTAGE MODAL */}
      <AnimatePresence>
        {isPointageOpen && selected && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black">تسجيل الحضور والدفع — {selected.subject}</h3>
                  <p className="text-xs text-slate-300">الأستاذ: {selected.teacherName}</p>
                </div>

                <button
                  onClick={() => setIsPointageOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <label className="flex items-center gap-2 flex-1 min-w-[240px] text-xs font-black text-slate-700 cursor-pointer">
                    <Calendar className="h-4 w-4 text-[#257C86]" />
                    تاريخ الحصّة *
                    <DateField
                      required value={seanceDate} onChange={(e) => setSeanceDate(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                    />
                  </label>
                </div>

                {selected.students.length === 0 ? (
                  <p className="text-xs text-slate-400">لا يوجد تلاميذ مسجلين في هذه الحصة بعد.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-3">التلميذ</th>
                          <th className="p-3 text-center">الحضور</th>
                          <th className="p-3 text-center">دفع الحصة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selected.students.map(st => {
                          const att = attendanceMap[st.studentId] || 'present';
                          const paid = !!paymentMap[st.studentId];
                          return (
                            <tr key={st.studentId} className="hover:bg-slate-50/70">
                              <td className="p-3 font-black text-slate-900">
                                <div className="flex items-start gap-2">
                                  <span className={`w-4 shrink-0 text-center ${att === 'absent' ? 'text-red-500' : 'text-emerald-600'}`}>
                                    {att === 'absent' ? '✕' : '✓'}
                                  </span>
                                  <div className="space-y-1">
                                    <p className="flex items-center gap-1.5 flex-wrap">
                                      {st.studentName}
                                      <span className="px-1.5 py-0.5 bg-[#E0EFF1] text-[#14464E] rounded-md text-[9px] font-black">خارجي</span>
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-bold"><span className="text-slate-500">📞 هاتف الولي:</span> <span className="font-mono">{st.parentPhone || '—'}</span></p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3">
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
                                {att === 'absent' && (
                                  <p className="text-center text-[9px] text-slate-400 font-bold mt-1">الغياب لا يُرجع المبلغ</p>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <div className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={() => setPaymentMap({ ...paymentMap, [st.studentId]: !paid })}
                                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${paid ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-emerald-50'}`}
                                  >
                                    {paid ? `✓ دفع ${selected.teacherShare + selected.centerShare} د.ت` : 'لم يدفع'}
                                  </button>
                                  {att === 'absent' && paid && (
                                    <p className="text-[9px] text-slate-400 font-bold">غائب لكن دفع</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsPointageOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePointage}
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    حفظ الحضور والدفع
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE SEANCE CONFIRMATION */}
      <ConfirmDialog
        open={!!deletion}
        title="حذف حصة المراجعة"
        message={
          deletion ? (
            <>
              هل أنت متأكد من حذف حصة المراجعة <strong>{deletion.subject} — {deletion.gradeLevel}</strong> نهائياً؟
              <p className="mt-2 text-[11px] text-slate-400 font-bold">سيتم حذف الحصة وجميع بيانات تلاميذها.</p>
            </>
          ) : undefined
        }
        confirmLabel="نعم، احذف الحصة"
        onConfirm={() => {
          if (deletion) {
            onUpdateRevisions(revisions.filter(r => r.id !== deletion.id));
            if (selectedId === deletion.id) setSelectedId(null);
            toast.success('تم حذف حصة المراجعة نهائياً.');
            setDeletion(null);
          }
        }}
        onCancel={() => setDeletion(null)}
      />

      {/* REMOVE STUDENT CONFIRMATION */}
      <ConfirmDialog
        open={!!studentRemoval}
        title="إزالة تلميذ من الحصة"
        message={
          studentRemoval ? (
            <>
              هل أنت متأكد من إزالة التلميذ <strong>{studentRemoval.studentName}</strong> من هذه الحصة؟
              <p className="mt-2 text-[11px] text-slate-400 font-bold">يمكنك إعادة إضافته في أي وقت لاحقاً.</p>
            </>
          ) : undefined
        }
        confirmLabel="نعم، أزل التلميذ"
        onConfirm={() => {
          if (studentRemoval) {
            const updated = revisions.map(r => r.id === studentRemoval.seance.id ? { ...r, students: r.students.filter(s => s.studentId !== studentRemoval.studentId) } : r);
            onUpdateRevisions(updated);
            setStudentRemoval(null);
          }
        }}
        onCancel={() => setStudentRemoval(null)}
      />

    </div>
  );
}
