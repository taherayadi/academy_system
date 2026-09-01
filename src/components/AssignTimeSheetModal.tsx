import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Search,
  CheckSquare,
  Square,
  Users,
  UserCheck,
  UserMinus,
  UserPlus
} from 'lucide-react';
import {
  StudentTimeSheet,
  Student,
  TimesheetDay,
  TIMESHEET_DAYS
} from '../types';
import { useToast } from './Toast';

interface AssignTimeSheetModalProps {
  timeSheet: StudentTimeSheet;
  students: Student[];
  onAssign: (studentIds: string[]) => void;
  onUnassign: (studentIds: string[]) => void;
  onClose: () => void;
}

const TIMESHEET_DAYS_AR = ['الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function AssignTimeSheetModal({
  timeSheet,
  students,
  onAssign,
  onUnassign,
  onClose
}: AssignTimeSheetModalProps) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'assigned' | 'add'>('assigned');

  // Students already assigned to THIS timesheet (must also match school year)
  const assignedStudents = useMemo(() =>
    students.filter(s =>
      s.timeSheetId === timeSheet.id &&
      (s.academicYear ?? '') === timeSheet.schoolYear
    ),
    [students, timeSheet.id, timeSheet.schoolYear]
  );

  // Students eligible to be added:
  // - same school year as the timesheet
  // - same grade level
  // - not yet assigned to any timesheet
  const eligibleStudents = useMemo(() =>
    students.filter(s =>
      (s.academicYear ?? '') === timeSheet.schoolYear &&
      s.grade === timeSheet.gradeLevel &&
      !s.timeSheetId
    ),
    [students, timeSheet.gradeLevel, timeSheet.schoolYear]
  );

  const filteredAssigned = useMemo(() => {
    if (!search.trim()) return assignedStudents;
    const q = search.toLowerCase();
    return assignedStudents.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
    );
  }, [assignedStudents, search]);

  const filteredEligible = useMemo(() => {
    if (!search.trim()) return eligibleStudents;
    const q = search.toLowerCase();
    return eligibleStudents.filter(s =>
      `${s.firstName} ${s.lastName} ${s.grade}`.toLowerCase().includes(q)
    );
  }, [eligibleStudents, search]);

  const handleAssign = () => {
    const checkedIds = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    if (checkedIds.length === 0) return;
    onAssign(checkedIds);
    toast.success(`تم إسناد جدول التوقيت لـ ${checkedIds.length} تلميذ`);
    setChecked({});
    onClose();
  };

  const handleRemoveStudent = (studentId: string, name: string) => {
    onUnassign([studentId]);
    toast.success(`تم إلغاء إسناد جدول التوقيت للتلميذ ${name}`);
  };

  const toggleAll = (value: boolean) => {
    const newChecked: Record<string, boolean> = {};
    filteredEligible.forEach(s => { newChecked[s.id] = value; });
    setChecked(newChecked);
  };

  const toggleOne = (id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#3A93A0]" />
            <h3 className="text-lg font-black">إسناد جدول التوقيت</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* Timesheet Info */}
          <div className="bg-[#F2F8F9] border border-[#C3E0E4] rounded-xl p-4 mb-4">
            <p className="text-xs font-bold text-[#14464E]">
              <span className="font-black">{timeSheet.establishmentName} - {timeSheet.schoolYear}</span>
              {' '}— {timeSheet.gradeLevel}
              {timeSheet.branch ? ` / ${timeSheet.branch}` : ''}
              {timeSheet.className ? ` / ${timeSheet.className}` : ''}
            </p>
            <p className="text-[10px] text-slate-500 font-bold mt-1">
              {assignedStudents.length} تلميذ مُسند · {timeSheet.weeklySchedule.length} حصة أسبوعية
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setActiveTab('assigned'); setSearch(''); setChecked({}); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
                activeTab === 'assigned'
                  ? 'bg-[#257C86] text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              التلاميذ المُسندون ({assignedStudents.length})
            </button>
            <button
              onClick={() => { setActiveTab('add'); setSearch(''); setChecked({}); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
                activeTab === 'add'
                  ? 'bg-[#257C86] text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              إضافة تلاميذ ({eligibleStudents.length})
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث باسم التلميذ..."
              className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
            />
          </div>

          {/* Tab: Assigned Students */}
          {activeTab === 'assigned' && (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {filteredAssigned.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-400 font-bold">
                  {search ? 'لا يوجد تلاميذ بهذا الاسم' : 'لا يوجد تلاميذ مُسندون لهذا الجدول'}
                </p>
              ) : (
                filteredAssigned.map(st => (
                  <div
                    key={st.id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-900">{st.firstName} {st.lastName}</span>
                      <span className="text-[10px] text-slate-400 mr-2 ml-2">{st.grade}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveStudent(st.id, `${st.firstName} ${st.lastName}`)}
                      className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-[10px] font-bold cursor-pointer transition shrink-0"
                    >
                      <UserMinus className="h-3 w-3" />
                      إلغاء الإسناد
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab: Add Students */}
          {activeTab === 'add' && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => toggleAll(true)}
                  className="px-3 py-1.5 bg-[#F2F8F9] hover:bg-[#E0EFF1] text-[#14464E] border border-[#C3E0E4] rounded-xl text-[10px] font-bold cursor-pointer flex items-center gap-1"
                >
                  <CheckSquare className="h-3 w-3" />
                  تحديد الكل
                </button>
                <button
                  onClick={() => toggleAll(false)}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-[10px] font-bold cursor-pointer flex items-center gap-1"
                >
                  <Square className="h-3 w-3" />
                  إلغاء تحديد الكل
                </button>
                <span className="text-[10px] text-slate-400 font-bold mr-2">
                  {checkedCount} محدد
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {filteredEligible.length === 0 ? (
                  <p className="p-4 text-center text-xs text-slate-400 font-bold">
                    {search ? 'لا يوجد تلاميذ بهذا الاسم' : 'لا يوجد تلاميذ متاحون (نفس المستوى وغير مُسندين)'}
                  </p>
                ) : (
                  filteredEligible.map(st => (
                    <label
                      key={st.id}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition ${
                        checked[st.id] ? 'bg-[#F2F8F9]' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!checked[st.id]}
                        onChange={() => toggleOne(st.id)}
                        className="w-4 h-4 accent-[#257C86] rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-slate-900">{st.firstName} {st.lastName}</span>
                        <span className="text-[10px] text-slate-400 mr-2 ml-2">{st.grade}</span>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
          {activeTab === 'add' && (
            <button
              onClick={handleAssign}
              disabled={checkedCount === 0}
              className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserCheck className="h-4 w-4" />
              إسناد للتحديد ({checkedCount})
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}