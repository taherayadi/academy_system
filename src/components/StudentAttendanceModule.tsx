import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarX,
  Check,
  ClipboardCheck,
  Search,
  UserCheck,
  UserX,
  Users
} from 'lucide-react';
import { Student, StudentAttendanceRecord, StudentAttendanceStatus } from '../types';
import { hasSchoolLevel } from '../utils/centerType';
import { useToast } from './Toast';

interface StudentAttendanceModuleProps {
  students: Student[];
  attendance: StudentAttendanceRecord[];
  onUpdateAttendance: (records: StudentAttendanceRecord[]) => void;
  /** Revision C (remark 1): crèche/jardin hide the « كل المستويات » grade filter. */
  centerType?: string;
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

function isSundayDate(date: string): boolean {
  const parsed = new Date(`${date}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.getDay() === 0;
}

// أسماء الأشهر بالعربية التونسية (مطابقة لأسماء المالية: جانفي، فيفري…)
const MONTH_NAMES_AR = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

// الأسبوع يبدأ بالسبت — العمود الثاني (index 1) هو الأحد (مغلق دائماً)
const WEEKDAYS_AR = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

export default function StudentAttendanceModule({ students, attendance, onUpdateAttendance, centerType }: StudentAttendanceModuleProps) {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(localDateString);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [draftStatus, setDraftStatus] = useState<Record<string, StudentAttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  // الشهر المعروض في التقويم (مستقل عن اليوم المحدد حتى يتنقل المدير بحرية)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  const sundaySelected = isSundayDate(selectedDate);

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

  // ملخص كل يوم محفوظ → نقطة خضراء (كلهم حاضرون) أو حمراء (غياب) على التقويم
  const attendanceByDate = useMemo(() => {
    const map: Record<string, { present: number; absent: number }> = {};
    attendance.forEach(record => {
      const entry = map[record.date] || { present: 0, absent: 0 };
      if (record.status === 'absent') entry.absent += 1;
      else entry.present += 1;
      map[record.date] = entry;
    });
    return map;
  }, [attendance]);

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

  // ─── بناء شبكة التقويم (السبت أول عمود) ────────────────────────────────
  const calendarCells = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0 = الأحد
    const startCol = (firstDow + 1) % 7; // السبت = العمود 0
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: ({ day: number; col: number } | null)[] = [];
    for (let i = 0; i < startCol; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, col: (startCol + d - 1) % 7 });
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const selectDay = (day: number, col: number) => {
    if (col === 1) return; // الأحد مغلق دائماً
    setSelectedDate(localDateString(new Date(viewYear, viewMonth, day)));
  };

  const goToday = () => {
    const now = new Date();
    setSelectedDate(localDateString(now));
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  const todayStr = localDateString();

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-brand-600/[0.06] text-brand-700 text-xs font-bold rounded-lg border border-brand-600/20">
            Pointage Élèves
          </span>
          <span className="text-xs text-slate-400 font-bold">الحضور والغياب اليومي</span>
        </div>
        <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-brand-600" />
          نظام تسجيل حضور التلاميذ
        </h2>
        <p className="text-slate-500 text-xs mt-1">
          اختر يوماً من التقويم ثم سجّل حضور وغياب التلاميذ — الأحد مغلق دائماً.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* ─── التقويم الشهري ─── */}
        <div className="bg-white border border-slate-200/70 rounded-3xl p-4 shadow-lg shadow-slate-900/5">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="الشهر السابق"
              className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:border-brand-600/40 hover:text-brand-600 transition cursor-pointer"
            >
              <span className="sr-only">الشهر السابق</span>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <div className="text-center">
              <p className="text-sm font-black text-slate-900">{MONTH_NAMES_AR[viewMonth]} {viewYear}</p>
              <button
                type="button"
                onClick={goToday}
                className="text-[10px] font-black text-brand-600 hover:text-brand-700 cursor-pointer"
              >
                العودة إلى اليوم
              </button>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="الشهر التالي"
              className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:border-brand-600/40 hover:text-brand-600 transition cursor-pointer"
            >
              <span className="sr-only">الشهر التالي</span>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS_AR.map(w => (
              <div key={w} className="text-center text-[10px] font-black text-slate-400 py-1">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, idx) => {
              if (!cell) return <div key={`blank_${idx}`} className="aspect-square rounded-xl" />;
              const dateStr = localDateString(new Date(viewYear, viewMonth, cell.day));
              const isSunday = cell.col === 1;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const summary = attendanceByDate[dateStr];
              const hasAbsence = !!summary && summary.absent > 0;
              const hasRecords = !!summary && (summary.present + summary.absent) > 0;
              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isSunday}
                  onClick={() => selectDay(cell.day, cell.col)}
                  aria-disabled={isSunday}
                  title={isSunday ? 'الأحد — مغلق' : (hasAbsence ? `${summary.absent} غائبون` : undefined)}
                  className={`relative aspect-square rounded-xl text-xs font-black flex flex-col items-center justify-center transition
                    ${isSunday
                      ? 'bg-slate-50 text-slate-300 cursor-not-allowed line-through decoration-slate-300'
                      : isSelected
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                        : isToday
                          ? 'bg-brand-600/[0.08] text-brand-700 ring-1 ring-brand-600/40 hover:bg-brand-600/15 cursor-pointer'
                          : 'text-slate-700 hover:bg-slate-100 cursor-pointer'}`}
                >
                  <span>{cell.day}</span>
                  {hasRecords && !isSunday && (
                    <span className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${hasAbsence ? 'bg-red-500' : 'bg-brand-500'}`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-center gap-4 text-[10px] font-bold text-slate-400">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> كلهم حاضرون</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> غياب مسجل</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> الأحد مغلق</span>
          </div>
        </div>

        {/* ─── لوحة اليوم المحدد ─── */}
        <div className="space-y-6">
          <div className={`rounded-3xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${sundaySelected ? 'bg-slate-50 border-slate-200' : 'bg-brand-600/[0.05] border-brand-600/15'}`}>
            <div className="flex items-start gap-2">
              {sundaySelected ? (
                <CalendarX className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
              ) : (
                <CalendarDays className="h-5 w-5 text-brand-600 mt-0.5 shrink-0" />
              )}
              <div>
                <p className={`text-sm font-black ${sundaySelected ? 'text-slate-500' : 'text-brand-700'}`}>{dateLabel(selectedDate)}</p>
                {sundaySelected ? (
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5">الأحد مغلق — لا يمكن تسجيل الحضور في هذا اليوم.</p>
                ) : (
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5">حدد حالة كل تلميذ ثم احفظ سجل اليوم.</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={savePointage}
              disabled={saving || students.length === 0 || sundaySelected}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black shadow-md shadow-brand-600/25 hover:shadow-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Check className="h-4 w-4" />
              حفظ pointage اليوم
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200/70 rounded-2xl p-4 shadow-lg shadow-slate-900/5 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500 font-bold">إجمالي التلاميذ</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{students.length}</p>
              </div>
              <span className="p-3 rounded-xl bg-brand-600/10 text-brand-600"><Users className="h-5 w-5" /></span>
            </div>
            <div className="bg-brand-600/[0.06] border border-brand-600/20/70 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-brand-700 font-bold">حاضرون</p>
                <p className="text-2xl font-black text-brand-700 mt-1">{counts.present}</p>
              </div>
              <span className="p-3 rounded-xl bg-brand-600/10 text-brand-700"><UserCheck className="h-5 w-5" /></span>
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
            <div>
              <h3 className="text-base font-black text-slate-900">قائمة التلاميذ — {dateLabel(selectedDate)}</h3>
              <p className="text-xs text-slate-400 font-bold mt-1">كل تلميذ يبدأ بحالة حاضر ويمكن تحويله إلى غائب.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="relative block">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="ابحث عن تلميذ..."
                  className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-brand-600"
                />
              </label>
              {hasSchoolLevel(centerType) && (
                <select
                  value={gradeFilter}
                  onChange={event => setGradeFilter(event.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-brand-600 cursor-pointer"
                >
                  <option value="">كل المستويات</option>
                  {gradeOptions.map(grade => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              )}
            </div>

            {filteredStudents.length === 0 ? (
              <div className="py-12 text-center rounded-2xl bg-slate-50 border border-slate-100">
                <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-400">لا يوجد تلاميذ مطابقون للبحث.</p>
              </div>
            ) : (
              <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${sundaySelected ? 'opacity-50 pointer-events-none' : ''}`}>
                {filteredStudents.map(student => {
                  const status = draftStatus[student.id] || 'present';
                  return (
                    <div key={student.id} className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-brand-600/30 transition">
                      <div className="h-10 w-10 rounded-xl bg-brand-600/10 text-brand-600 flex items-center justify-center text-xs font-black shrink-0">
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
                          disabled={sundaySelected}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer ${status === 'present' ? 'bg-brand-600 text-white shadow-sm' : 'bg-brand-600/[0.06] text-brand-700 border border-brand-600/20 hover:bg-brand-600/10'}`}
                        >
                          حاضر
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(student.id, 'absent')}
                          disabled={sundaySelected}
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
      </div>
    </div>
  );
}
