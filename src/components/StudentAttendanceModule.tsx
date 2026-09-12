import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ClipboardCheck,
  Search,
  UserCheck,
  UserX,
  Users
} from 'lucide-react';
import { Student, StudentAttendanceRecord, StudentAttendanceStatus } from '../types';
import { useToast } from './Toast';

interface StudentAttendanceModuleProps {
  students: Student[];
  attendance: StudentAttendanceRecord[];
  onUpdateAttendance: (records: StudentAttendanceRecord[]) => void;
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('ar-TN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export default function StudentAttendanceModule({ students, attendance, onUpdateAttendance }: StudentAttendanceModuleProps) {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(localDateString);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [draftStatus, setDraftStatus] = useState<Record<string, StudentAttendanceStatus>>({});
  const [saving, setSaving] = useState(false);

  const recordsForDate = useMemo(() => {
    const result: Record<string, StudentAttendanceStatus> = {};
    attendance
      .filter(record => record.date === selectedDate)
      .forEach(record => { result[record.studentId] = record.status; });
    return result;
  }, [attendance, selectedDate]);

  // A new day starts with every enrolled student marked present; the director can
  // mark absences before saving. Previously saved records always win.
  useEffect(() => {
    const next: Record<string, StudentAttendanceStatus> = {};
    students.forEach(student => {
      next[student.id] = recordsForDate[student.id] || 'present';
    });
    setDraftStatus(next);
  }, [students, recordsForDate]);

  const gradeOptions = useMemo(
    () => Array.from(new Set(students.map(student => student.grade).filter(Boolean))).sort(),
    [students]
  );

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter(student => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const matchesSearch = !query || fullName.includes(query) || (student.etablissement || '').toLowerCase().includes(query);
      return matchesSearch && (!gradeFilter || student.grade === gradeFilter);
    });
  }, [students, search, gradeFilter]);

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    students.forEach(student => {
      if (draftStatus[student.id] === 'absent') absent += 1;
      else present += 1;
    });
    return { present, absent };
  }, [draftStatus, students]);

  const setStatus = (studentId: string, status: StudentAttendanceStatus) => {
    setDraftStatus(current => ({ ...current, [studentId]: status }));
  };

  const savePointage = () => {
    setSaving(true);
    const now = new Date().toISOString();
    const existingForDate = new Map(
      attendance.filter(record => record.date === selectedDate).map(record => [record.studentId, record])
    );
    const newForDate = students.map(student => {
      const existing = existingForDate.get(student.id);
      return {
        id: existing?.id || `attendance_${student.id}_${selectedDate}`,
        studentId: student.id,
        date: selectedDate,
        status: draftStatus[student.id] || 'present',
        ...(existing?.notes ? { notes: existing.notes } : {}),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      } satisfies StudentAttendanceRecord;
    });
    const otherDates = attendance.filter(record => record.date !== selectedDate);
    onUpdateAttendance([...otherDates, ...newForDate]);
    setSaving(false);
    toast.success(`تم حفظ pointage التلاميذ ليوم ${selectedDate}.`);
  };

  const shiftDate = (days: number) => {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    setSelectedDate(localDateString(date));
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-[#257C86]/[0.06] text-[#1e626b] text-xs font-bold rounded-lg border border-[#257C86]/20">
                Pointage Élèves
              </span>
              <span className="text-xs text-slate-400 font-bold">الحضور والغياب اليومي</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-[#257C86]" />
              نظام تسجيل حضور التلاميذ
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              تسجيل حضور وغياب كل تلميذ يومياً في مؤسسة jardin.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:border-[#257C86]/40 hover:text-[#257C86] transition cursor-pointer"
            >
              اليوم السابق
            </button>
            <label className="relative flex items-center gap-2 px-3 py-2 bg-white border-2 border-[#257C86]/20 rounded-xl">
              <CalendarDays className="h-4 w-4 text-[#257C86]" />
              <input
                type="date"
                value={selectedDate}
                onChange={event => setSelectedDate(event.target.value)}
                className="bg-transparent text-sm font-black text-slate-800 outline-none cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:border-[#257C86]/40 hover:text-[#257C86] transition cursor-pointer"
            >
              اليوم التالي
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#257C86]/[0.05] border border-[#257C86]/15 px-4 py-3">
          <div>
            <p className="text-sm font-black text-[#1e626b]">{dateLabel(selectedDate)}</p>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">حدد حالة كل تلميذ ثم احفظ سجل اليوم.</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(localDateString())}
            className="text-xs font-black text-[#257C86] hover:text-[#1e626b] cursor-pointer"
          >
            العودة إلى اليوم
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/70 rounded-2xl p-4 shadow-lg shadow-slate-900/5 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 font-bold">إجمالي التلاميذ</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{students.length}</p>
          </div>
          <span className="p-3 rounded-xl bg-[#257C86]/10 text-[#257C86]"><Users className="h-5 w-5" /></span>
        </div>
        <div className="bg-[#257C86]/[0.06] border border-[#257C86]/20/70 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#1e626b] font-bold">حاضرون</p>
            <p className="text-2xl font-black text-[#1e626b] mt-1">{counts.present}</p>
          </div>
          <span className="p-3 rounded-xl bg-[#257C86]/10 text-[#1e626b]"><UserCheck className="h-5 w-5" /></span>
        </div>
        <div className="bg-red-50/60 border border-red-200/70 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-red-700 font-bold">غائبون</p>
            <p className="text-2xl font-black text-red-700 mt-1">{counts.absent}</p>
          </div>
          <span className="p-3 rounded-xl bg-red-100 text-red-700"><UserX className="h-5 w-5" /></span>
        </div>
      </div>

      <div className="bg-white border border-slate-200/70 rounded-3xl p-5 shadow-lg shadow-slate-900/5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900">قائمة التلاميذ — {dateLabel(selectedDate)}</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">كل تلميذ يبدأ بحالة حاضر ويمكن تحويله إلى غائب.</p>
          </div>
          <button
            type="button"
            onClick={savePointage}
            disabled={saving || students.length === 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#257C86] text-white rounded-xl text-xs font-black shadow-md shadow-[#257C86]/25 hover:shadow-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="h-4 w-4" />
            حفظ pointage اليوم
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="relative block">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث عن تلميذ..."
              className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-[#257C86]"
            />
          </label>
          <select
            value={gradeFilter}
            onChange={event => setGradeFilter(event.target.value)}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-[#257C86] cursor-pointer"
          >
            <option value="">كل المستويات</option>
            {gradeOptions.map(grade => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="py-12 text-center rounded-2xl bg-slate-50 border border-slate-100">
            <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-400">لا يوجد تلاميذ مطابقون للبحث.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredStudents.map(student => {
              const status = draftStatus[student.id] || 'present';
              return (
                <div key={student.id} className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-[#257C86]/30 transition">
                  <div className="h-10 w-10 rounded-xl bg-[#257C86]/10 text-[#257C86] flex items-center justify-center text-xs font-black shrink-0">
                    {`${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 truncate">{student.firstName} {student.lastName}</p>
                    <p className="text-[10px] font-bold text-slate-400 truncate">{student.grade || '—'}{student.etablissement ? ` · ${student.etablissement}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setStatus(student.id, 'present')}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer ${status === 'present' ? 'bg-[#257C86] text-white shadow-sm' : 'bg-[#257C86]/[0.06] text-[#1e626b] border border-[#257C86]/20 hover:bg-[#257C86]/10'}`}
                    >
                      حاضر
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(student.id, 'absent')}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer ${status === 'absent' ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'}`}
                    >
                      غائب
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
