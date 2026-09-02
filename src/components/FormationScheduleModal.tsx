import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  Save,
  X,
  Plus,
  Trash2,
  Loader2,
  CalendarRange
} from 'lucide-react';
import { Formation, FormationSeance } from '../types';
import { proposeFormationSchedule, FORMATION_WORK_DAYS } from '../utils/aiFormationSchedule';
import { useToast } from './Toast';

interface FormationScheduleModalProps {
  open: boolean;
  formation: Formation | null;
  apiKey?: string;
  centerName?: string;
  onClose: () => void;
  onSave: (schedule: FormationSeance[]) => void;
}

const TIME_OPTIONS: string[] = [];
for (let h = 8; h <= 17; h++) {
  for (const m of ['00', '30']) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}

const toMin = (t: string) => {
  const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

export default function FormationScheduleModal({
  open,
  formation,
  apiKey,
  centerName,
  onClose,
  onSave
}: FormationScheduleModalProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<FormationSeance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matieres = useMemo(() => (formation?.matieres || []).map(m => m.subject), [formation]);

  // Map matiere subject name -> matiere id (enrolledMatiereIds store ids)
  const matiereIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    (formation?.matieres || []).forEach(m => { map[m.subject] = m.id; });
    return map;
  }, [formation]);

  // Map student id -> student name
  const studentNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (formation?.students || []).forEach(s => { map[s.id] = s.studentName; });
    return map;
  }, [formation]);

  const studentsSummary = useMemo(() => {
    const matiereList = (formation?.matieres || []).map(m => m.subject);
    const students = formation?.students || [];
    return matiereList.map(m => {
      const count = students.filter(s =>
        s.isPack || (s.enrolledMatiereIds || []).includes(m)
      ).length;
      return { matiere: m, count };
    });
  }, [formation]);

  useEffect(() => {
    if (open) {
      setError(null);
      setLoading(false);
      setDraft(
        (Array.isArray(formation?.schedule) ? formation.schedule : []).map(s => ({
          ...s,
          id: s.id || crypto.randomUUID()
        }))
      );
    }
  }, [open, formation]);

  if (!open || !formation) return null;

  const handlePropose = async () => {
    if (matieres.length === 0) {
      toast.error('أضف مادة واحدة على الأقل في التكوين قبل طلب الاقتراح.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const proposals = await proposeFormationSchedule(formation, studentsSummary, apiKey, centerName);
      if (proposals.length === 0) {
        toast.error('لم يتمكن الذكاء الاصطناعي من إنشاء جدول.');
      } else {
        // Seed each seance with the students enrolled in that matiere. A pack
        // student (takes all matieres) is added to every seance of that matiere.
        setDraft(
          proposals.map(p => ({
            ...p,
            id: crypto.randomUUID(),
            students: enrolledStudentIdsForMatiere(p.matiere)
          }))
        );
        toast.success(`تم إنشاء ${proposals.length} حصة بالذكاء الاصطناعي`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الجدول.');
    } finally {
      setLoading(false);
    }
  };

  // Students enrolled in the given matiere (by its subject name)
  const enrolledStudentIdsForMatiere = (matiereName: string): string[] => {
    const matiereId = matiereIdByName[matiereName];
    if (!matiereId) return [];
    return (formation?.students || [])
      .filter(s => s.isPack || (s.enrolledMatiereIds || []).includes(matiereId))
      .map(s => s.id);
  };

  // A student cannot attend two seances that overlap on the same day
  const findStudentConflicts = (rows: FormationSeance[]) => {
    const out: { studentName: string; day: string; firstMatiere: string; secondMatiere: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        if (a.day !== b.day) continue;
        const aS = toMin(a.startTime), aE = toMin(a.endTime);
        const bS = toMin(b.startTime), bE = toMin(b.endTime);
        if (!(aS < bE && bS < aE)) continue;
        const shared = (a.students || []).filter(id => (b.students || []).includes(id));
        for (const id of shared) {
          out.push({
            studentName: studentNameById[id] || 'تلميذ',
            day: a.day,
            firstMatiere: a.matiere,
            secondMatiere: b.matiere
          });
        }
      }
    }
    return out;
  };

  const addStudentToRow = (id: string, studentId: string) => {
    setDraft(prev => prev.map(r => {
      if (r.id !== id) return r;
      const cur = r.students || [];
      if (cur.includes(studentId)) return r;
      return { ...r, students: [...cur, studentId] };
    }));
  };

  const removeStudentFromRow = (id: string, studentId: string) => {
    setDraft(prev => prev.map(r =>
      r.id === id ? { ...r, students: (r.students || []).filter(s => s !== studentId) } : r
    ));
  };

  const updateRow = (id: string, patch: Partial<FormationSeance>) => {
    setDraft(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setDraft(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        day: FORMATION_WORK_DAYS[0],
        startTime: '09:00',
        endTime: '10:30',
        matiere: matieres[0] || ''
      }
    ]);
  };

  const removeRow = (id: string) => {
    setDraft(prev => prev.filter(r => r.id !== id));
  };

  const handleSave = () => {
    if (draft.length === 0) {
      toast.error('الجدول فارغ. أضف حصصاً على الأقل.');
      return;
    }
    const valid = draft.filter(r => r.day && r.startTime && r.endTime && r.matiere);
    if (valid.length === 0) {
      toast.error('ادخل بيانات الحصص بشكل صحيح.');
      return;
    }
    const conflicts = findStudentConflicts(valid);
    if (conflicts.length > 0) {
      const names = [...new Set(conflicts.map(c => `${c.studentName} (${c.firstMatiere} ↔ ${c.secondMatiere} يوم ${c.day})`))];
      setError(
        'لا يمكن للتلميذ حضور حسبتين في نفس التوقيت:\n' +
        names.slice(0, 4).join('\n') +
        (names.length > 4 ? `\nو ${names.length - 4} أخرى...` : '')
      );
      return;
    }
    const distinctDays = new Set(valid.map(r => r.day)).size;
    onSave(valid);
    onClose();
    toast.success('تم حفظ جدول الحصص للتكوين');
    if (distinctDays === 1 && valid.length > 1) {
      toast.error('انتبه: جميع الحصص في نفس اليوم — يُفضَّل توزيعها على أيام الأسبوع.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <CalendarRange className="h-5 w-5 text-[#3A93A0]" />
            <div>
              <h3 className="text-sm font-black">جدول حصص التكوين</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-md">
                {formation.name}
                {formation.grade ? ` — ${formation.grade}` : ''}
                {formation.branch ? ` / ${formation.branch}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
          {/* Gemini propose button */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePropose}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#257C86] to-[#1d6169] hover:from-[#1E6A73] hover:to-[#17555F] text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? 'جاري الاقتراح بواسطة Gemini 3.6...' : 'اقتراح الجدول بواسطة Gemini'}
            </button>
            <span className="text-[10px] text-slate-400 font-bold">
              يوزّع الحصص على أيام الأسبوع حسب المواد وعدد التلاميذ
            </span>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-[11px] font-bold">
              {error}
            </div>
          )}

          {/* Editable rows */}
          <div className="space-y-2">
            {draft.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Sparkles className="h-5 w-5 text-[#257C86] mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-400">
                  لا توجد حصص بعد. اضغط "اقتراح الجدول بواسطة Gemini" أو أضف حصصاً يدوياً.
                </p>
              </div>
            ) : (
              draft.map((row) => (
                <div
                  key={row.id}
                  className="bg-slate-50 rounded-xl p-2 border border-slate-200 space-y-2"
                >
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={row.day}
                      onChange={e => updateRow(row.id, { day: e.target.value })}
                      className="col-span-3 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    >
                      {FORMATION_WORK_DAYS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <select
                      value={row.startTime}
                      onChange={e => {
                        const start = e.target.value;
                        updateRow(row.id, { startTime: start, endTime: row.endTime <= start ? (TIME_OPTIONS.find(t => t > start) || '17:00') : row.endTime });
                      }}
                      className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    >
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                      value={row.endTime}
                      onChange={e => updateRow(row.id, { endTime: e.target.value })}
                      className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    >
                      {TIME_OPTIONS.filter(t => t > row.startTime).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                      value={row.matiere}
                      onChange={e => {
                        const matiereName = e.target.value;
                        updateRow(row.id, {
                          matiere: matiereName,
                          students: matiereName ? enrolledStudentIdsForMatiere(matiereName) : (row.students || [])
                        });
                      }}
                      className="col-span-4 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    >
                      <option value="">المادة...</option>
                      {matieres.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeRow(row.id)}
                      className="col-span-1 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Student list for this seance */}
                  <div className="flex flex-wrap items-center gap-1.5 px-0.5">
                    <span className="text-[10px] font-black text-slate-400 shrink-0">التلاميذ:</span>
                    {(row.students || []).map(sid => (
                      <span
                        key={sid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F2F8F9] border border-[#C3E0E4] text-[#14464E] rounded-full text-[10px] font-bold"
                      >
                        {studentNameById[sid] || 'تلميذ'}
                        <button
                          onClick={() => removeStudentFromRow(row.id, sid)}
                          className="text-[#257C86] hover:text-red-500 cursor-pointer"
                          title="إزالة"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <select
                      value=""
                      onChange={e => { if (e.target.value) addStudentToRow(row.id, e.target.value); }}
                      className="text-[10px] font-bold bg-white border border-slate-200 rounded-full px-2 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    >
                      <option value="">+ إضافة تلميذ</option>
                      {(formation?.students || [])
                        .filter(s => !(row.students || []).includes(s.id))
                        .map(s => <option key={s.id} value={s.id}>{s.studentName}</option>)}
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F2F8F9] text-[#14464E] border border-[#C3E0E4] rounded-xl text-[11px] font-bold hover:bg-[#E0EFF1] transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            إضافة حصة
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={draft.length === 0}
            className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            حفظ الجدول
          </button>
        </div>
      </motion.div>
    </div>
  );
}
