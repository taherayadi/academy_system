import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit3, X, Layers, MapPin, CalendarDays, Puzzle } from 'lucide-react';
import { Activity, ActivityCategory } from '../types';
import { useToast } from './Toast';
import { TIME_BANDS, bandIndexFor, bandStartTime, CATEGORY_COLORS, validateActivity, groupActivities, GroupByKey } from '../utils/planner';

interface ActivitiesModuleProps {
  activities: Activity[];
  onUpdateActivities: (activities: Activity[]) => void;
  staff?: { id: string; firstName: string; lastName: string }[];
}

/** Display order Monday → Sunday. Stored weekday: 0 = Monday … 6 = Sunday. */
const WEEK_DAYS = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  motricite: 'حركية',
  art: 'فنون',
  musique: 'موسيقى',
  jeu: 'ألعاب'
};

/** Full Tailwind chip classes derived from the pure palette prefix (004 T011). */
const CHIP_CLASS: Record<ActivityCategory, string> = {
  motricite: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  art: 'bg-violet-100 text-violet-800 border-violet-300',
  musique: 'bg-amber-100 text-amber-800 border-amber-300',
  jeu: 'bg-sky-100 text-sky-800 border-sky-300'
};

const CATEGORIES: ActivityCategory[] = ['motricite', 'art', 'musique', 'jeu'];

const timeToMinutes = (t: string): number => {
  const [h, m] = (t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const emptyForm = (): Omit<Activity, 'id' | 'createdAt'> => ({
  title: '',
  category: 'motricite',
  weekday: 0,
  timeStart: '09:00',
  timeEnd: '10:00',
  location: '',
  levelClass: '',
  staffId: ''
});

type ViewMode = 'week' | GroupByKey;

export default function ActivitiesModule({ activities, onUpdateActivities, staff = [] }: ActivitiesModuleProps) {
  const { error, success } = useToast();
  const [view, setView] = useState<ViewMode>('week');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [inlineError, setInlineError] = useState<string>('');
  /** Tap-select fallback state: id of the chip being moved (research R3). */
  const [moveSourceId, setMoveSourceId] = useState<string | null>(null);

  const staffName = (id?: string) => {
    if (!id) return undefined;
    const st = staff.find(s => s.id === id);
    return st ? `${st.firstName} ${st.lastName}` : undefined;
  };

  const openCreate = () => {
    setForm(emptyForm());
    setEditingId(null);
    setInlineError('');
    setModalOpen(true);
  };

  const openEdit = (a: Activity) => {
    setForm({
      title: a.title,
      category: a.category,
      weekday: a.date ? 0 : (a.weekday ?? 0),
      date: a.date || '',
      timeStart: a.timeStart,
      timeEnd: a.timeEnd,
      location: a.location || '',
      levelClass: a.levelClass || '',
      staffId: a.staffId || ''
    });
    setEditingId(a.id);
    setInlineError('');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError('');
    // FR-015 / data-model predicate — validated client-side with inline blocking.
    const candidate: Partial<Activity> = {
      ...form,
      // In weekly mode strip an empty date so the predicate sees weekday only.
      date: form.date ? form.date : undefined
    };
    if (!validateActivity(candidate)) {
      if (!form.title.trim()) setInlineError('يرجى إدخال عنوان النشاط');
      else if (timeToMinutes(form.timeStart) >= timeToMinutes(form.timeEnd)) setInlineError('وقت البداية يجب أن يسبق وقت النهاية');
      else setInlineError('يرجى اختيار اليوم أو التاريخ بشكل صحيح');
      return;
    }
    const clean: Activity = {
      ...(form as Activity),
      id: editingId || 'act_' + crypto.randomUUID(),
      date: form.date || undefined,
      createdAt: editingId ? undefined : new Date().toISOString()
    } as Activity;
    if (editingId) {
      onUpdateActivities(activities.map(a => a.id === editingId ? { ...a, ...clean, id: a.id, createdAt: a.createdAt } : a));
      success('تم تحديث النشاط بنجاح');
    } else {
      onUpdateActivities([...activities, clean]);
      success('تمت إضافة النشاط بنجاح');
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    onUpdateActivities(activities.filter(a => a.id !== id));
    success('تم حذف النشاط');
  };

  /** Apply a move to the given day (and optionally band-snapped start). */
  const applyMove = (id: string, day: number) => {
    const src = activities.find(a => a.id === id);
    if (!src) return;
    if (src.date) {
      // Dated activities move by recomputing the date's weekday — keep the date,
      // shift it so it lands on the requested weekday column (nearest future).
      const d = new Date(src.date + 'T00:00:00');
      const current = (d.getDay() + 6) % 7; // JS: 0=Sun → 0=Mon
      const delta = (day - current + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      const next = d.toISOString().slice(0, 10);
      onUpdateActivities(activities.map(a => a.id === id ? { ...a, date: next } : a));
    } else {
      onUpdateActivities(activities.map(a => a.id === id ? { ...a, weekday: day } : a));
    }
    success('تم نقل النشاط');
  };

  const handleDrop = (day: number, e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    applyMove(id, day);
  };

  const handleDayClick = (day: number) => {
    if (moveSourceId == null) return;
    applyMove(moveSourceId, day);
    setMoveSourceId(null);
  };

  /** Grouped sections for the class/location views (view-only). */
  const grouped = useMemo(
    () => view === 'week' ? [] : groupActivities(activities, view),
    [activities, view]
  );

  const Chip = ({ a }: { a: Activity }) => (
    <div
      data-category={CATEGORY_COLORS[a.category] || a.category}
      draggable={view === 'week'}
      onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/plain', a.id)}
      onClick={(e) => {
        if (view !== 'week') return;
        e.stopPropagation();
        setMoveSourceId(moveSourceId === a.id ? null : a.id);
      }}
      className={`${CHIP_CLASS[a.category]} border rounded-lg px-2 py-1 text-[10px] font-bold cursor-grab active:cursor-grabbing select-none group relative ${
        moveSourceId === a.id ? 'ring-2 ring-brand-600' : ''
      }`}
      title={`${a.timeStart} - ${a.timeEnd}${a.location ? ` · ${a.location}` : ''}${staffName(a.staffId) ? ` · ${staffName(a.staffId)}` : ''}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate">{a.title}</span>
        <span className="font-mono text-[9px] opacity-70 shrink-0">{a.timeStart}</span>
      </div>
      {(a.levelClass || staffName(a.staffId)) && (
        <div className="text-[9px] opacity-70 truncate">
          {a.levelClass}{a.levelClass && staffName(a.staffId) ? ' · ' : ''}{staffName(a.staffId) || ''}
        </div>
      )}
      <div className="hidden group-hover:flex items-center justify-end gap-0.5 mt-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); openEdit(a); }}
          className="p-0.5 rounded hover:bg-white/70 cursor-pointer"
          title="تعديل"
          aria-label={`تعديل ${a.title}`}
        >
          <Edit3 className="h-2.5 w-2.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
          className="p-0.5 rounded hover:bg-white/70 cursor-pointer"
          title="حذف"
          aria-label={`حذف ${a.title}`}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );

  /** Week grid: dated activities render under their own header column. */
  const datedActivities = activities.filter(a => !!a.date);
  const datedDates = useMemo(
    () => Array.from(new Set(datedActivities.map(a => a.date as string))).sort(),
    [datedActivities]
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Module banner */}
      <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <span className="px-3 py-1 bg-brand-600/[0.06] text-brand-700 text-xs font-bold rounded-lg border border-brand-600/20">
            الأنشطة والبرنامج
          </span>
          {/* Revision C (remark 4): icon before the title text, outside the green badge. */}
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <Puzzle className="h-6 w-6 text-brand-600" />
            الأنشطة والبرنامج الأسبوعي
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            تخطيط الأنشطة عبر أيام الأسبوع مع تلوين حسب الفئة.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 3-way grouping toggle: week ↔ class ↔ location */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setView('week')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition ${view === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <CalendarDays className="h-3 w-3" />
              الأسبوع
            </button>
            <button
              onClick={() => setView('class')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition ${view === 'class' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Layers className="h-3 w-3" />
              حسب الفئة
            </button>
            <button
              onClick={() => setView('location')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition ${view === 'location' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <MapPin className="h-3 w-3" />
              حسب المكان
            </button>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            نشاط جديد
          </button>
        </div>
      </div>

      {moveSourceId != null && (
        <div className="bg-brand-600/[0.06] border border-brand-600/20 rounded-2xl px-4 py-2.5 text-xs font-bold text-brand-700 no-print">
          يتم النقل: اضغط على عمود اليوم الهدف (أو أسقط النشاط عليه)
        </div>
      )}

      {/* ── Week view: rows = half-hour bands, columns = days ── */}
      {view === 'week' && (
        <div className="bg-white rounded-3xl border border-slate-200/70 p-3 shadow-lg shadow-slate-900/5 overflow-x-auto">
          <table className="w-full border-collapse min-w-[720px]">
            <thead>
              <tr>
                <th className="w-14 p-1 text-[10px] font-black text-slate-400">الساعة</th>
                {WEEK_DAYS.map((d, i) => <th key={d} className="p-1 text-[11px] font-black text-slate-600">{d}</th>)}
                {datedDates.map(d => (
                  <th key={d} className="p-1 text-[11px] font-black text-brand-700 border-l border-slate-100">
                    <span className="font-mono">{d}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_BANDS.map((band, bi) => (
                <tr key={band.start} className={bi % 2 === 0 ? 'bg-slate-50/60' : ''}>
                  <td className="p-1 text-[9px] font-mono text-slate-400 text-center">{band.label}</td>
                  {WEEK_DAYS.map((_, day) => {
                    const cell = activities.filter(a =>
                      !a.date && (a.weekday ?? 0) === day && bandIndexFor(a.timeStart) === bi
                    );
                    return (
                      <td key={day} className="p-0.5 align-top">
                        <div
                          data-band={band.start}
                          data-day-column={day}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleDrop(day, e)}
                          onClick={() => handleDayClick(day)}
                          className={`min-h-[36px] space-y-1 rounded-lg transition ${moveSourceId != null ? 'cursor-pointer hover:bg-brand-600/[0.04]' : ''}`}
                        >
                          {cell.map(a => <Chip key={a.id} a={a} />)}
                        </div>
                      </td>
                    );
                  })}
                  {datedDates.map(d => {
                    const cell = activities.filter(a => a.date === d && bandIndexFor(a.timeStart) === bi);
                    return (
                      <td key={d} className="p-0.5 align-top border-l border-slate-100">
                        <div
                          data-band={band.start}
                          data-day-column={`date:${d}`}
                          className="min-h-[36px] space-y-1"
                        >
                          {cell.map(a => <Chip key={a.id} a={a} />)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-400 font-bold mt-2">
            الأنشطة المؤرَّخة (مناسبات لمرة واحدة) تظهر في أعمدة خاصة بتواريخها.
          </p>
        </div>
      )}

      {/* ── Grouped views: class / location sections ── */}
      {view !== 'week' && (
        <div className="space-y-3">
          {grouped.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200/70 p-8 text-center shadow-lg shadow-slate-900/5">
              <p className="text-sm font-bold text-slate-500">لا توجد أنشطة بعد</p>
            </div>
          ) : (
            grouped.map(g => (
              <div key={g.key} className="bg-white rounded-3xl border border-slate-200/70 p-4 shadow-lg shadow-slate-900/5">
                <span className="text-xs font-black text-slate-500 flex items-center gap-1.5">
                  {view === 'class' ? <Layers className="h-3.5 w-3.5 text-brand-600" /> : <MapPin className="h-3.5 w-3.5 text-brand-600" />}
                  {g.key} <span className="text-slate-400">({g.items.length})</span>
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {g.items.map(a => <Chip key={a.id} a={a} />)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create / edit dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8">
            <div className="p-5 bg-brand-600 text-white flex justify-between items-center">
              <h3 className="text-base font-black">{editingId ? 'تعديل النشاط' : 'نشاط جديد'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-300" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {inlineError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-xs font-bold" role="alert">
                  {inlineError}
                </div>
              )}
              <div>
                <label htmlFor="act-title" className="text-xs font-bold text-slate-600 block mb-1">العنوان *</label>
                <input
                  id="act-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-600"
                  placeholder="مثال: ورشة رسم"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="act-category" className="text-xs font-bold text-slate-600 block mb-1">الفئة *</label>
                  <select
                    id="act-category"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as ActivityCategory })}
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                {/* Weekday-or-date toggle (FR-015): weekly vs single occurrence */}
                <div>
                  <label htmlFor="act-daymode" className="text-xs font-bold text-slate-600 block mb-1">التكرار</label>
                  <select
                    id="act-daymode"
                    value={form.date ? 'date' : 'weekly'}
                    onChange={(e) => setForm(e.target.value === 'date' ? { ...form, date: new Date().toISOString().slice(0, 10) } : { ...form, date: undefined, weekday: 0 })}
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <option value="weekly">أسبوعي (يوم ثابت)</option>
                    <option value="date">تاريخ واحد</option>
                  </select>
                </div>
              </div>
              {form.date ? (
                <div>
                  <label htmlFor="act-date" className="text-xs font-bold text-slate-600 block mb-1">التاريخ *</label>
                  <input
                    id="act-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="act-weekday" className="text-xs font-bold text-slate-600 block mb-1">اليوم *</label>
                  <select
                    id="act-weekday"
                    value={form.weekday}
                    onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {WEEK_DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="act-start" className="text-xs font-bold text-slate-600 block mb-1">من *</label>
                  <input
                    id="act-start"
                    type="time"
                    value={form.timeStart}
                    onChange={(e) => setForm({ ...form, timeStart: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="act-end" className="text-xs font-bold text-slate-600 block mb-1">إلى *</label>
                  <input
                    id="act-end"
                    type="time"
                    value={form.timeEnd}
                    onChange={(e) => setForm({ ...form, timeEnd: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="act-location" className="text-xs font-bold text-slate-600 block mb-1">المكان</label>
                  <input
                    id="act-location"
                    type="text"
                    value={form.location || ''}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                    placeholder="مثال: قاعة النشاط"
                  />
                </div>
                <div>
                  <label htmlFor="act-class" className="text-xs font-bold text-slate-600 block mb-1">القسم</label>
                  <input
                    id="act-class"
                    type="text"
                    value={form.levelClass || ''}
                    onChange={(e) => setForm({ ...form, levelClass: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                    placeholder="مثال: القسم الصغير"
                  />
                </div>
              </div>
              {staff.length > 0 && (
                <div>
                  <label htmlFor="act-staff" className="text-xs font-bold text-slate-600 block mb-1">المشرف</label>
                  <select
                    id="act-staff"
                    value={form.staffId || ''}
                    onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <option value="">-- بدون مشرف --</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black cursor-pointer"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
