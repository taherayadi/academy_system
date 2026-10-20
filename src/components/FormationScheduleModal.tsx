import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  Save,
  X,
  Plus,
  Trash2,
  CalendarRange,
  DoorOpen,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { Formation, FormationSeance, Salle } from '../types';
import { FORMATION_WORK_DAYS } from '../utils/formationSchedule';
import { useToast } from './Toast';

interface FormationScheduleModalProps {
  open: boolean;
  formation: Formation | null;
  onClose: () => void;
  onSave: (schedule: FormationSeance[]) => void;
  // Salles gérées par le centre (gestion des salles) + TOUTES les formations :
  // la disponibilité d'une salle est déduite des grilles horaires qui la
  // mentionnent (même jour, créneaux qui se chevauchent).
  salles?: Salle[];
  allFormations?: Formation[];
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

const overlaps = (aS: number, aE: number, bS: number, bE: number) => !isNaN(aS) && !isNaN(aE) && aS < bE && bS < aE;

// Deux plages de DATES (YYYY-MM-DD, comparable lexicographiquement) se
// chevauchent si chaque début précède la fin de l'autre. Une salle n'est
// occupée que si les DEUX formations tournent à la même période : samedi 9h
// dans la salle A pour un formation du 10/10 au 20/10 reste libre pour un
// formation du 25/10 au 30/10, même jour même heure.
const dateRangesOverlap = (aStart?: string, aEnd?: string, bStart?: string, bEnd?: string) => {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
};

export default function FormationScheduleModal({
  open,
  formation,
  onClose,
  onSave,
  salles,
  allFormations
}: FormationScheduleModalProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<FormationSeance[]>([]);
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

  // Map salle id -> salle record (capacités, noms)
  const salleById = useMemo(() => {
    const map: Record<string, Salle> = {};
    (salles || []).forEach(s => { map[s.id] = s; });
    return map;
  }, [salles]);

  useEffect(() => {
    if (open) {
      setError(null);
      setDraft(
        (Array.isArray(formation?.schedule) ? formation.schedule : []).map(s => ({
          ...s,
          id: s.id || crypto.randomUUID()
        }))
      );
    }
  }, [open, formation]);

  if (!open || !formation) return null;

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
        if (!overlaps(aS, aE, bS, bE)) continue;
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

  /**
   * Disponibilité d'UNE salle pour UNE ligne du brouillon :
   * occupée si (a) une AUTRE ligne du même brouillon l'utilise avec un
   * créneau qui se chevauche le même jour, ou (b) une séance d'un AUTRE
   * formation du centre l'occupe (détayée par le nom du formation).
   */
  const salleOccupiersFor = (row: FormationSeance): { formationName: string; matiere?: string }[] => {
    if (!row.salle || !row.day) return [];
    const out: { formationName: string; matiere?: string }[] = [];
    // a) conflits internes au brouillon courant
    (draft || []).forEach(other => {
      if (other.id === row.id || !other.salle || other.salle !== row.salle || other.day !== row.day) return;
      if (!overlaps(toMin(row.startTime), toMin(row.endTime), toMin(other.startTime), toMin(other.endTime))) return;
      out.push({ formationName: formation.name || 'هذا التكوين', matiere: other.matiere });
    });
    // b) séances des AUTRES formations — uniquement celles dont la PÉRIODE
    // (start_date → end_date) chevauche celle du formation courant.
    (allFormations || []).forEach(f => {
      if (f.id === formation.id) return;
      if (!dateRangesOverlap(formation.startDate, formation.endDate, f.startDate, f.endDate)) return;
      (Array.isArray(f.schedule) ? f.schedule : []).forEach(s => {
        if (!s.salle || s.salle !== row.salle || s.day !== row.day) return;
        if (!overlaps(toMin(row.startTime), toMin(row.endTime), toMin(s.startTime), toMin(s.endTime))) return;
        out.push({ formationName: f.name || 'تكوين', matiere: s.matiere });
      });
    });
    return out;
  };

  const isSalleFree = (row: FormationSeance): boolean => salleOccupiersFor(row).length === 0;

  // Conflits de salle sur l'ensemble du brouillon (bloquant à l'enregistrement).
  const findSalleConflicts = (rows: FormationSeance[]) => {
    const out: { salle: string; day: string; occupier: string }[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.salle || !row.day) continue;
      for (const occ of salleOccupiersFor(row)) {
        const key = `${row.salle}|${row.day}|${occ.formationName}|${occ.matiere || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          salle: salleById[row.salle]?.name || 'قاعة',
          day: row.day,
          occupier: `${occ.formationName}${occ.matiere ? ` (${occ.matiere})` : ''}`
        });
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
        matiere: matieres[0] || '',
        salle: ''
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
    // Une salle occupée au même créneau ne peut pas être réservée deux fois.
    const salleConflicts = findSalleConflicts(valid);
    if (salleConflicts.length > 0) {
      const lines = salleConflicts.slice(0, 4).map(c => `قاعة ${c.salle} — يوم ${c.day} (مستأجرة من طرف ${c.occupier})`);
      setError(
        'توفر القاعات:\n' +
        lines.join('\n') +
        (salleConflicts.length > 4 ? `\nو ${salleConflicts.length - 4} أخرى...` : '')
      );
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
    onSave(valid.map(r => ({ ...r, salle: r.salle || undefined })));
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
            <CalendarRange className="h-5 w-5 text-brand-500" />
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
          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-[11px] font-bold whitespace-pre-line">
              {error}
            </div>
          )}

          {(salles || []).length === 0 && (
            <div className="px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-bold">
              لم تُسجَّل أي قاعة بعد — يمكنك إدارة القاعات من وحدة «إدارة القاعات» ثم اختيارها هنا.
            </div>
          )}

          {/* Editable rows */}
          <div className="space-y-2">
            {draft.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Sparkles className="h-5 w-5 text-brand-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-400">
                  لا توجد حصص بعد. أضف حصصاً يدوياً باستخدام الزر أدناه.
                </p>
              </div>
            ) : (
              draft.map((row) => {
                const occupiers = salleOccupiersFor(row);
                const salleRecord = row.salle ? salleById[row.salle] : null;
                const studentsCount = (row.students || []).length;
                const overCapacity = !!salleRecord && salleRecord.capacity > 0 && studentsCount > salleRecord.capacity;
                return (
                <div
                  key={row.id}
                  className="bg-slate-50 rounded-xl p-2 border border-slate-200 space-y-2"
                >
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={row.day}
                      onChange={e => updateRow(row.id, { day: e.target.value })}
                      className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-600"
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
                      className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                      value={row.endTime}
                      onChange={e => updateRow(row.id, { endTime: e.target.value })}
                      className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-600"
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
                      className="col-span-3 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      <option value="">المادة...</option>
                      {matieres.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={row.salle || ''}
                      onChange={e => updateRow(row.id, { salle: e.target.value || undefined })}
                      className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-600"
                      title="القاعة"
                    >
                      <option value="">القاعة...</option>
                      {(salles || []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeRow(row.id)}
                      className="col-span-1 p-1.5 text-red-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Salle availability indicator */}
                  {row.salle && (
                    <div className="flex flex-wrap items-center gap-1.5 px-0.5">
                      {occupiers.length > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded-full text-[10px] font-black">
                          <AlertTriangle className="h-3 w-3" />
                          القاعة {salleRecord?.name || ''} مشغولة في هذا التوقيت — {occupiers.map(o => `${o.formationName}${o.matiere ? ` (${o.matiere})` : ''}`).join(' / ')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-[10px] font-black">
                          <CheckCircle2 className="h-3 w-3" />
                          القاعة {salleRecord?.name || ''} متوفرة في هذا التوقيت
                        </span>
                      )}
                      {overCapacity && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-[10px] font-black">
                          <DoorOpen className="h-3 w-3" />
                          انتبه: سعة القاعة {salleRecord!.capacity} أقل من عدد التلاميذ ({studentsCount})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Student list for this seance */}
                  <div className="flex flex-wrap items-center gap-1.5 px-0.5">
                    <span className="text-[10px] font-black text-slate-400 shrink-0">التلاميذ:</span>
                    {(row.students || []).map(sid => (
                      <span
                        key={sid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 border border-brand-200 text-brand-800 rounded-full text-[10px] font-bold"
                      >
                        {studentNameById[sid] || 'تلميذ'}
                        <button
                          onClick={() => removeStudentFromRow(row.id, sid)}
                          className="text-brand-600 hover:text-red-500 cursor-pointer"
                          title="إزالة"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <select
                      value=""
                      onChange={e => { if (e.target.value) addStudentToRow(row.id, e.target.value); }}
                      className="text-[10px] font-bold bg-white border border-slate-200 rounded-full px-2 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      <option value="">+ إضافة تلميذ</option>
                      {(formation?.students || [])
                        .filter(s => !(row.students || []).includes(s.id))
                        .map(s => <option key={s.id} value={s.id}>{s.studentName}</option>)}
                    </select>
                  </div>
                </div>
                );
              })
            )}
          </div>

          <button
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-50 text-brand-800 border border-brand-200 rounded-xl text-[11px] font-bold hover:bg-brand-100 transition cursor-pointer"
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
            className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            حفظ الجدول
          </button>
        </div>
      </motion.div>
    </div>
  );
}
