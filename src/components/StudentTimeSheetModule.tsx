import { useState, useRef } from 'react';
import { Plus, Trash2, Users, Edit3, AlertCircle, Clock } from 'lucide-react';
import { Student, StudentTimeSheet } from '../types';
import { useToast } from './Toast';
import { AnimatePresence, motion } from 'motion/react';
import TimeSheetModal from './TimeSheetModal';
import AssignTimeSheetModal from './AssignTimeSheetModal';
import TimeSheetViewDialog from './TimeSheetViewDialog';

interface StudentTimeSheetModuleProps {
  students: Student[];
  studentTimeSheets: StudentTimeSheet[];
  onUpdateStudentTimeSheets: (sheets: StudentTimeSheet[]) => void;
  onUpdateStudent: (student: Student) => void;
  onUpdateStudents: (students: Student[]) => void;
}

export default function StudentTimeSheetModule({
  students,
  studentTimeSheets,
  onUpdateStudentTimeSheets,
  onUpdateStudent,
  onUpdateStudents,
}: StudentTimeSheetModuleProps) {
  const toast = useToast();
  const studentsRef = useRef(students);
  studentsRef.current = students;

  // TimeSheet modal state
  const [isTimeSheetModalOpen, setIsTimeSheetModalOpen] = useState(false);
  const [editingTimeSheet, setEditingTimeSheet] = useState<StudentTimeSheet | null>(null);

  // Assign TimeSheet modal state
  const [assignTimeSheet, setAssignTimeSheet] = useState<StudentTimeSheet | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Delete TimeSheet confirmation state
  const [deleteTimeSheet, setDeleteTimeSheet] = useState<StudentTimeSheet | null>(null);

  // Read-only timesheet view state
  const [viewTimeSheetStudent, setViewTimeSheetStudent] = useState<Student | null>(null);

  // TimeSheet list search + pagination
  const [timeSheetYear, setTimeSheetYear] = useState('');
  const [timeSheetEtab, setTimeSheetEtab] = useState('');
  const [timeSheetGrade, setTimeSheetGrade] = useState('');
  const [timeSheetPage, setTimeSheetPage] = useState(1);
  const TIMESHEET_PAGE_SIZE = 9;

  return (
    <div className="space-y-6">

      {/* Header Banner */}
      <div className="bg-white border border-[#E0EFF1] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-[#F2F8F9] text-[#14464E] text-xs font-bold rounded-lg border border-[#C3E0E4]/60">
              جداول التوقيت
            </span>
            <span className="text-xs text-slate-400 font-bold">الجداول الزمنية الأسبوعية للتلاميذ</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <Clock className="h-6 w-6 text-[#257C86]" />
            إدارة جداول التوقيت الأسبوعية
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            إنشاء وتعديل جداول التوقيت الأسبوعية وإسنادها للتلاميذ حسب المؤسسة والمستوى.
          </p>
        </div>
      </div>

      {/* TimeSheets List */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 no-print space-y-4">
        {/* Header row: add button */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-black text-slate-900">
            إدارة جداول التوقيت الأسبوعية للتلاميذ ({studentTimeSheets.length})
          </span>
          <button
            onClick={() => { setEditingTimeSheet(null); setIsTimeSheetModalOpen(true); }}
            className="px-4 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer shadow-md"
          >
            <Plus className="h-4 w-4" />
            إضافة جدول توقيت
          </button>
        </div>

        {studentTimeSheets.length > 0 && (
          <>
            {/* Filter selects */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-0.5">السنة الدراسية</label>
                <select
                  value={timeSheetYear}
                  onChange={(e) => { setTimeSheetYear(e.target.value); setTimeSheetPage(1); }}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]/30 cursor-pointer"
                >
                  <option value="">كل السنوات</option>
                  {Array.from(new Set(studentTimeSheets.map(ts => ts.schoolYear).filter(Boolean))).sort().map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-0.5">المؤسسة</label>
                <select
                  value={timeSheetEtab}
                  onChange={(e) => { setTimeSheetEtab(e.target.value); setTimeSheetPage(1); }}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]/30 cursor-pointer"
                >
                  <option value="">كل المؤسسات</option>
                  {Array.from(new Set(studentTimeSheets.map(ts => ts.establishmentName).filter(Boolean))).sort().map(e => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-0.5">المستوى</label>
                <select
                  value={timeSheetGrade}
                  onChange={(e) => { setTimeSheetGrade(e.target.value); setTimeSheetPage(1); }}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]/30 cursor-pointer"
                >
                  <option value="">كل المستويات</option>
                  {Array.from(new Set(studentTimeSheets.map(ts => ts.gradeLevel).filter(Boolean))).sort().map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            {(() => {
              const filtered = studentTimeSheets.filter(ts =>
                (!timeSheetYear || ts.schoolYear === timeSheetYear) &&
                (!timeSheetEtab || ts.establishmentName === timeSheetEtab) &&
                (!timeSheetGrade || ts.gradeLevel === timeSheetGrade)
              );
              const totalPages = Math.max(1, Math.ceil(filtered.length / TIMESHEET_PAGE_SIZE));
              const safePage = Math.min(timeSheetPage, totalPages);
              const pageItems = filtered.slice((safePage - 1) * TIMESHEET_PAGE_SIZE, safePage * TIMESHEET_PAGE_SIZE);

              return (
                <>
                  {filtered.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-2xl">
                      <p className="text-sm text-slate-400 font-bold">لا توجد جداول مطابقة للفلاتر المحددة</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {pageItems.map(ts => {
                         const assignedCount = students.filter(s => s.timeSheetId === ts.id).length;
                          return (
                            <div
                              key={ts.id}
                              className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-[#C3E0E4] hover:shadow-md transition-all duration-200"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-black text-[#14464E] truncate">
                                    {ts.establishmentName} - {ts.schoolYear}
                                  </p>
                                  <p className="text-xs text-slate-500 font-bold mt-1">
                                    {ts.gradeLevel}{ts.branch ? ` / ${ts.branch}` : ''}{ts.className ? ` / ${ts.className}` : ''}
                                  </p>
                                  <p className="text-xs text-[#257C86] font-bold mt-1 flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {assignedCount} تلميذ مُسنَد
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => { setAssignTimeSheet(ts); setIsAssignModalOpen(true); }}
                                    className="p-2 text-[#257C86] hover:bg-[#F2F8F9] rounded-xl transition cursor-pointer"
                                    title="إسناد للتلاميذ"
                                  >
                                    <Users className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => { setEditingTimeSheet(ts); setIsTimeSheetModalOpen(true); }}
                                    className="p-2 text-[#257C86] hover:bg-[#F2F8F9] rounded-xl transition cursor-pointer"
                                    title="تعديل"
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteTimeSheet(ts)}
                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                                    title="حذف"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <p className="text-xs text-slate-400 font-bold">
                            صفحة {safePage} من {totalPages} ({filtered.length} جدول)
                          </p>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setTimeSheetPage(Math.max(1, safePage - 1))}
                              disabled={safePage <= 1}
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-[#257C86] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F2F8F9] transition cursor-pointer"
                            >
                              السابق
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                              <button
                                key={p}
                                onClick={() => setTimeSheetPage(p)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                                  p === safePage
                                    ? 'bg-[#257C86] text-white'
                                    : 'bg-white border border-slate-200 text-slate-500 hover:bg-[#F2F8F9]'
                                }`}
                              >
                                {p}
                              </button>
                            ))}
                            <button
                              onClick={() => setTimeSheetPage(Math.min(totalPages, safePage + 1))}
                              disabled={safePage >= totalPages}
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-[#257C86] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F2F8F9] transition cursor-pointer"
                            >
                              التالي
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      {/* READ-ONLY TIMESHEET VIEW OVERLAY */}
      {viewTimeSheetStudent && (() => {
        const ts = studentTimeSheets.find(t => t.id === viewTimeSheetStudent.timeSheetId);
        if (!ts) return null;
        return (
          <TimeSheetViewDialog
            key={ts.id}
            timeSheet={ts}
            studentName={`${viewTimeSheetStudent.firstName} ${viewTimeSheetStudent.lastName}`}
            onClose={() => setViewTimeSheetStudent(null)}
          />
        );
      })()}

      {isTimeSheetModalOpen && (
        <TimeSheetModal
          timeSheets={studentTimeSheets}
          students={students}
          onSaveTimeSheet={onUpdateStudentTimeSheets}
          onUpdateStudents={(updated) => {
            for (const u of updated) onUpdateStudent(u);
          }}
          onClose={() => { setIsTimeSheetModalOpen(false); setEditingTimeSheet(null); }}
          editingTimeSheet={editingTimeSheet}
        />
      )}

      {isAssignModalOpen && assignTimeSheet && (
        <AssignTimeSheetModal
          timeSheet={assignTimeSheet}
          students={students}
          onAssign={(studentIds) => {
            const currentStudents = studentsRef.current;
            const updatedStudents = currentStudents.map(s =>
              studentIds.includes(s.id) ? { ...s, timeSheetId: assignTimeSheet.id } : s
            );
            onUpdateStudents(updatedStudents);
            toast.success(`تم إسناد جدول التوقيت لـ ${studentIds.length} تلميذ`);
          }}
          onUnassign={(studentIds) => {
            const currentStudents = studentsRef.current;
            const updatedStudents = currentStudents.map(s =>
              studentIds.includes(s.id) ? { ...s, timeSheetId: undefined } : s
            );
            onUpdateStudents(updatedStudents);
          }}
          onClose={() => { setIsAssignModalOpen(false); setAssignTimeSheet(null); }}
        />
      )}

      {deleteTimeSheet && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8"
          >
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <h3 className="text-lg font-black">تأكيد الحذف</h3>
              </div>
            </div>
            <div className="p-6 text-center">
              <p className="text-slate-700 font-bold mb-4">
                هل أنت متأكد من حذف جدول التوقيت "<span className="text-[#257C86]">{deleteTimeSheet.establishmentName} - {deleteTimeSheet.schoolYear}</span>"؟
              </p>
              <p className="text-slate-500 text-sm mb-6">سيتم إلغاء إسناد هذا الجدول من جميع التلاميذ المسندين إليه.</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setDeleteTimeSheet(null)}
                  className="px-5 py-2 bg-slate-100 text-slate-700 font-bold text-sm rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  onClick={() => {
                    const currentStudents = studentsRef.current;
                    const remaining = studentTimeSheets.filter(t => t.id !== deleteTimeSheet.id);
                    const updatedStudents = currentStudents.map(s =>
                      s.timeSheetId === deleteTimeSheet.id ? { ...s, timeSheetId: undefined } : s
                    );
                    onUpdateStudentTimeSheets(remaining);
                    onUpdateStudents(updatedStudents);
                    toast.success('تم حذف جدول التوقيت');
                    setDeleteTimeSheet(null);
                  }}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-sm rounded-xl cursor-pointer"
                >
                  تأكيد الحذف
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
