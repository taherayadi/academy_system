import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit3, X, Layers, MapPin } from 'lucide-react';
import { Activity, ActivityCategory } from '../types';
import { useToast } from './Toast';

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

const CATEGORY_CHIP_CLASS: Record<ActivityCategory, string> = {
  motricite: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  art: 'bg-violet-100 text-violet-800 border-violet-300',
  musique: 'bg-sky-100 text-sky-800 border-sky-300',
  jeu: 'bg-amber-100 text-amber-800 border-amber-300'
};

const CATEGORY_TEST_ID: Record<ActivityCategory, string> = {
  motricite: 'bg-emerald',
  art: 'bg-violet',
  musique: 'bg-sky',
  jeu: 'bg-amber'
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

export default function ActivitiesModule({ activities, onUpdateActivities, staff = [] }: ActivitiesModuleProps) {
  const { error, success } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [groupBy, setGroupBy] = useState<'levelClass' | 'location'>('levelClass');

  const staffName = (id?: string) => {
    if (!id) return undefined;
    const st = staff.find(s => s.id === id);
    return st ? `${st.firstName} ${st.lastName}` : undefined;
  };

  const openCreate = () => {
    setForm(emptyForm());
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (a: Activity) => {
    setForm({
      title: a.title,
      category: a.category,
      weekday: a.weekday ?? 0,
      timeStart: a.timeStart,
      timeEnd: a.timeEnd,
      location: a.location || '',
      levelClass: a.levelClass || '',
      staffId: a.staffId || ''
    });
    setEditingId(a.id);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // FR-015: title required, category required, weekday-or-date, timeStart < timeEnd
    if (!form.title.trim()) {
      error('يرجى إدخال عنوان النشاط');
      return;
    }
    if (!CATEGORIES.includes(form.category)) {
      error('يرجى اختيار فئة النشاط');
      return;
    }
    if (timeToMinutes(form.timeStart) >= timeToMinutes(form.timeEnd)) {
      error('وقت البداية يجب أن يسبق وقت النهاية');
      return;
    }
    if (editingId) {
      onUpdateActivities(activities.map(a => a.id === editingId ? { ...a, ...form } : a));
      success('تم تحديث النشاط بنجاح');
    } else {
      const created: Activity = {
        ...form,
        id: 'act_' + crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };
      onUpdateActivities([...activities, created]);
      success('تمت إضافة النشاط بنجاح');
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    onUpdateActivities(activities.filter(a => a.id !== id));
    success('تم حذف النشاط');
  };

  /** Click-to-move fallback for touch devices (research R3). */
  const [moveSourceId, setMoveSourceId] = useState<string | null>(null);
  const handleDayClick = (day: number) => {
    if (moveSourceId == null) return;
    onUpdateActivities(activities.map(a => a.id === moveSourceId ? { ...a, weekday: day } : a));
    setMoveSourceId(null);
    success('تم نقل النشاط');
  };
  const handleDrop = (day: number, e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    onUpdateActivities(activities.map(a => a.id === id ? { ...a, weekday: day } : a));
    success('تم نقل النشاط');
  };

  /** Grouping labels (view-only, research R4): by class or by location. */
  const groupedChips = useMemo(() => {
    const groups = new Map<string, Activity[]>();
    for (const a of activities) {
      const key = groupBy === 'levelClass' ? (a.levelClass || 'بدون فئة') : (a.location || 'بدون مكان');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    // 'بدون …' group last, alphabetical otherwise
    return Array.from(groups.entries()).sort(([ka], [kb]) => {
      const unassigned = (k: string) => k.startsWith('بدون') ? 1 : 0;
      if (unassigned(ka) !== unassigned(kb)) return unassigned(ka) - unassigned(kb);
      return ka.localeCompare(kb);
    });
  }, [activities, groupBy]);

  const Chip = ({ a }: { a: Activity }) => (
    <div
      data-category={CATEGORY_TEST_ID[a.category] || a.category}
      draggable
      onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/plain', a.id)}
      onClick={() => setMoveSourceId(moveSourceId === a.id ? null : a.id)}
      className={`${CATEGORY_CHIP_CLASS[a.category]} border rounded-lg px-2 py-1 text-[10px] font-bold cursor-grab active:cursor-grabbing select-none group relative`}
      title={`${a.timeStart} - ${a.timeEnd}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate">{a.title}</span>
        <span className="font-mono text-[9px] opacity-70 shrink-0">{a.timeStart}</span>
      </div>
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

  return (
    <div className="space-y-6" dir="rtl">
      {/* Module banner */}
      <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-brand-600/[0.06] text-brand-700 text-xs font-bold rounded-lg border border-brand-600/20">
              الأنشطة والبرنامج
            </span>
            <span className="text-xs text-slate-400 font-bold">حركية · فنون · موسيقى · ألعاب</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2">الأنشطة والبرنامج الأسبوعي</h2>
          <p className="text-slate-500 text-xs mt-1">
            تخطيط الأنشطة عبر أيام الأسبوع مع تلوين حسب الفئة.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Grouping toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setGroupBy('levelClass')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition ${groupBy === 'levelClass' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Layers className="h-3 w-3" />
              حسب الفئة
            </button>
            <button
              onClick={() => setGroupBy('location')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition ${groupBy === 'location' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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

      {/* Grouped listing (view-only summary above the grid) */}
      {activities.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/70 p-4 shadow-lg shadow-slate-900/5 no-print">
          <span className="text-xs font-black text-slate-500 flex items-center gap-1.5">
            {groupBy === 'levelClass' ? <Layers className="h-3.5 w-3.5 text-brand-600" /> : <MapPin className="h-3.5 w-3.5 text-brand-600" />}
            تجميع {groupBy === 'levelClass' ? 'حسب الفئة' : 'حسب المكان'} ({groupedChips.length} مجموعات)
          </span>
          <div className="mt-2 space-y-1.5">
            {groupedChips.map(([group, acts]) => (
              <div key={group} className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                <span className="min-w-[110px] truncate">{group}</span>
                <span className="text-slate-400">{acts.length} أنشطة</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {WEEK_DAYS.map((label, day) => {
          const dayActivities = activities.filter(a => a.weekday === day);
          return (
            <div
              key={day}
              data-day-column={day}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(day, e)}
              onClick={() => handleDayClick(day)}
              className={`bg-white rounded-2xl border p-2.5 min-h-[180px] space-y-1.5 transition ${
                moveSourceId != null ? 'border-brand-600/50 bg-brand-600/[0.04]' : 'border-slate-200/70'
              }`}
            >
              <div className="text-[11px] font-black text-slate-500 text-center pb-1.5 border-b border-slate-100">
                {label}
              </div>
              {dayActivities.map(a => <Chip key={a.id} a={a} />)}
            </div>
          );
        })}
      </div>

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
              <div>
                <label htmlFor="act-title" className="text-xs font-bold text-slate-600 block mb-1">العنوان *</label>
                <input
                  id="act-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-600"
                  placeholder="مثال: ورقة رسم"
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
              </div>
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
                  <label className="text-xs font-bold text-slate-600 block mb-1">المكان</label>
                  <input
                    type="text"
                    value={form.location || ''}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                    placeholder="مثال: قاعة النشاط"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">القسم</label>
                  <input
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
                  <label className="text-xs font-bold text-slate-600 block mb-1">المشرف</label>
                  <select
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