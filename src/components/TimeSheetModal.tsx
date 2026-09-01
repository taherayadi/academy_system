import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock,
  Calendar,
  Save,
  Trash2,
  Plus,
  X,
  Search,
  CheckSquare,
  Square,
  Edit3,
  AlertCircle
} from 'lucide-react';
import {
  StudentTimeSheet,
  Student,
  TimeSheetSlot,
  TimesheetDay,
  TIMESHEET_DAYS,
  DEFAULT_ACADEMIC_YEARS,
  EXTERNAL_GRADE_LEVELS,
  getTimesheetBranches,
  getTimeSlotsForDay
} from '../types';
import { useToast } from './Toast';

interface TimeSheetModalProps {
  timeSheets: StudentTimeSheet[];
  students: Student[];
  onSaveTimeSheet: (sheets: StudentTimeSheet[]) => void;
  onUpdateStudents: (students: Student[]) => void;
  onClose: () => void;
  editingTimeSheet?: StudentTimeSheet | null;
}

const GRADE_LEVELS = EXTERNAL_GRADE_LEVELS.map(g => g.level);

const TIME_OPTIONS: string[] = [];
for (let h = 7; h <= 20; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 20) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`);
}

function getSheetDisplayName(ts: StudentTimeSheet): string {
  let name = `${ts.establishmentName} - ${ts.schoolYear}`;
  if (ts.gradeLevel) name += ` / ${ts.gradeLevel}`;
  if (ts.branch) name += ` / ${ts.branch}`;
  if (ts.className) name += ` / ${ts.className}`;
  return name;
}

function getAssignedCount(tsId: string, students: Student[]): number {
  return students.filter(s => s.timeSheetId === tsId).length;
}

export default function TimeSheetModal({
  timeSheets,
  students,
  onSaveTimeSheet,
  onUpdateStudents,
  onClose,
  editingTimeSheet
}: TimeSheetModalProps) {
  const toast = useToast();
  const [tsSchoolYear, setTsSchoolYear] = useState(editingTimeSheet?.schoolYear || DEFAULT_ACADEMIC_YEARS[3]);
  const [tsEstablishment, setTsEstablishment] = useState(editingTimeSheet?.establishmentName || '');
  const [tsGradeLevel, setTsGradeLevel] = useState(editingTimeSheet?.gradeLevel || GRADE_LEVELS[0]);
  const [tsBranch, setTsBranch] = useState(editingTimeSheet?.branch || '');
  const [tsClassName, setTsClassName] = useState(editingTimeSheet?.className || '');
  const [tsSchedule, setTsSchedule] = useState<TimeSheetSlot[]>(() =>
    (editingTimeSheet?.weeklySchedule || []).map(s => ({ ...s, id: s.id || crypto.randomUUID() }))
  );
  const [editingId, setEditingId] = useState<string | null>(editingTimeSheet?.id || null);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const tsBranches = useMemo(() => getTimesheetBranches(tsGradeLevel), [tsGradeLevel]);

  const handleAddSlot = (day: TimesheetDay) => {
    setTsSchedule(prev => [...prev, { day, startTime: '08:00', endTime: '10:00', id: crypto.randomUUID() }]);
  };

  const handleDeleteSlot = (slotId: string) => {
    setTsSchedule(prev => prev.filter(s => s.id !== slotId));
  };

  const handleUpdateSlot = (slotId: string, field: 'startTime' | 'endTime', value: string) => {
    setTsSchedule(prev => prev.map(s => s.id === slotId ? { ...s, [field]: value } : s));
  };

  const resetForm = () => {
    setTsSchoolYear(DEFAULT_ACADEMIC_YEARS[3]);
    setTsEstablishment('');
    setTsGradeLevel(GRADE_LEVELS[0]);
    setTsBranch('');
    setTsClassName('');
    setTsSchedule([]);
    setEditingId(null);
  };

  const handleSaveCreate = () => {
    if (!tsEstablishment.trim()) return;
    const now = new Date().toISOString();
    if (editingId) {
      const existing = timeSheets.find(ts => ts.id === editingId);
      if (!existing) return;
      const updated: StudentTimeSheet = {
        ...existing,
        schoolYear: tsSchoolYear,
        establishmentName: tsEstablishment,
        gradeLevel: tsGradeLevel,
        branch: tsBranch || undefined,
        className: tsClassName || undefined,
        weeklySchedule: tsSchedule,
        updatedAt: now
      };
      onSaveTimeSheet(timeSheets.map(ts => ts.id === updated.id ? updated : ts));
      toast.success('تم تعديل جدول التوقيت بنجاح');
    } else {
      const newSheet: StudentTimeSheet = {
        id: crypto.randomUUID(),
        schoolYear: tsSchoolYear,
        establishmentName: tsEstablishment,
        gradeLevel: tsGradeLevel,
        branch: tsBranch || undefined,
        className: tsClassName || undefined,
        weeklySchedule: tsSchedule,
        createdAt: now,
        updatedAt: now
      };
      onSaveTimeSheet([...timeSheets, newSheet]);
      toast.success('تم إنشاء جدول التوقيت بنجاح');
    }
    resetForm();
    onClose();
  };

  const handleEdit = (ts: StudentTimeSheet) => {
    setEditingId(ts.id);
    setTsSchoolYear(ts.schoolYear);
    setTsEstablishment(ts.establishmentName);
    setTsGradeLevel(ts.gradeLevel);
    setTsBranch(ts.branch || '');
    setTsClassName(ts.className || '');
    setTsSchedule(ts.weeklySchedule.map(s => ({ ...s, id: s.id || crypto.randomUUID() })));
  };

  const handleDelete = (tsId: string) => {
    const remaining = timeSheets.filter(ts => ts.id !== tsId);
    const updatedStudents = students.map(s =>
      s.timeSheetId === tsId ? { ...s, timeSheetId: undefined } : s
    );
    onSaveTimeSheet(remaining);
    onUpdateStudents(updatedStudents);
    toast.success('تم حذف جدول التوقيت');
    setDeleteConfirmId(null);
    if (editingId === tsId) resetForm();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden my-8"
      >
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#3A93A0]" />
            <h3 className="text-lg font-black">إدارة جداول التوقيت</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <div className="space-y-5">
            <div className="border-t border-slate-100 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">السنة الدراسية *</label>
                  <select
                    value={tsSchoolYear}
                    onChange={e => setTsSchoolYear(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                  >
                    {DEFAULT_ACADEMIC_YEARS.map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">اسم المؤسسة *</label>
                  <input
                    type="text"
                    value={tsEstablishment}
                    onChange={e => setTsEstablishment(e.target.value)}
                    placeholder="مثال: المعهد الثانوي"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">المستوى الدراسي</label>
                  <select
                    value={tsGradeLevel}
                    onChange={e => { setTsGradeLevel(e.target.value); setTsBranch(''); }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                  >
                    {GRADE_LEVELS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                {tsBranches.length > 0 && (
                  <div>
                    <label className="text-xs font-black text-slate-700 block mb-1">الشعبة</label>
                    <select
                      value={tsBranch}
                      onChange={e => setTsBranch(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    >
                      <option value="">-- اختر الشعبة --</option>
                      {tsBranches.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="text-xs font-black text-slate-700 block mb-1">اسم القسم (اختياري)</label>
                <input
                  type="text"
                  value={tsClassName}
                  onChange={e => setTsClassName(e.target.value)}
                  placeholder="مثال: 1، 2، 3 أو أ، ب، ج"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                />
              </div>

              <div className="mt-4">
                <label className="text-xs font-black text-slate-700 block mb-2">الجدول الأسبوعي</label>
                <div className="space-y-3">
                  {TIMESHEET_DAYS.map(day => {
                    const daySlots = tsSchedule.filter(s => s.day === day);
                    return (
                      <div key={day} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-black text-slate-700">{day}</span>
                          <button
                            type="button"
                            onClick={() => handleAddSlot(day)}
                            className="text-[10px] font-bold text-[#257C86] hover:text-[#1E6A73] flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                            إضافة حصّة
                          </button>
                        </div>
                        {daySlots.length === 0 ? (
                          <p className="text-[10px] text-slate-400 font-bold">لا توجد حصص</p>
                        ) : (
                          <div className="space-y-1.5">
                            {daySlots.map(slot => (
                              <div key={slot.id} className="flex items-center gap-2">
                                <select
                                  value={slot.startTime}
                                  onChange={e => handleUpdateSlot(slot.id, 'startTime', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                                >
                                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <span className="text-[10px] text-slate-400 font-bold">—</span>
                                <select
                                  value={slot.endTime}
                                  onChange={e => handleUpdateSlot(slot.id, 'endTime', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                                >
                                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSlot(slot.id)}
                                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
          >
            إلغاء
          </button>
          <button
            onClick={handleSaveCreate}
            disabled={!tsEstablishment.trim()}
            className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {editingId ? 'حفظ التعديلات' : 'إنشاء الجدول'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}