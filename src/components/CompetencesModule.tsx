import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Edit3, X, Printer, Users, LayoutGrid, List, HandMetal, MessageSquare, Footprints } from 'lucide-react';
import { Skill, SkillEvaluation, SkillDomain, SkillLevel } from '../types';
import { useToast } from './Toast';
import {
  validateSkill,
  LEVEL_CHIP_CLASS,
  evaluatorMode,
  heatmapBuckets,
  evaluatorDisplay
} from '../utils/skills';

interface CompetencesModuleProps {
  catalog: Skill[];
  evaluations: SkillEvaluation[];
  onUpdateDoc: (doc: { catalog: Skill[]; evaluations: SkillEvaluation[] }) => void;
  students: { id: string; firstName: string; lastName: string; grade?: string }[];
  currentUserRole?: string;
  /** Staff list sourcing the evaluator roster (same list as Étude). */
  staff?: { id: string; firstName: string; lastName: string }[];
  /** Staff-entitlement discriminator (FR-023): roster picker when true, free text otherwise. */
  canUseRoster: boolean;
}

const DOMAINS: SkillDomain[] = ['langage', 'motricite', 'social', 'autonomie'];

const DOMAIN_LABELS: Record<SkillDomain, string> = {
  langage: 'اللغة والتواصل',
  motricite: 'المهارات الحركية',
  social: 'الاجتماعي والعاطفي',
  autonomie: 'الاستقلالية'
};

const DOMAIN_ICONS: Record<SkillDomain, React.ReactNode> = {
  langage: <MessageSquare className="h-4 w-4" />,
  motricite: <Footprints className="h-4 w-4" />,
  social: <Users className="h-4 w-4" />,
  autonomie: <HandMetal className="h-4 w-4" />
};

const DOMAIN_CLASS: Record<SkillDomain, string> = {
  langage: 'bg-sky-100 text-sky-800 border-sky-300',
  motricite: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  social: 'bg-amber-100 text-amber-800 border-amber-300',
  autonomie: 'bg-violet-100 text-violet-800 border-violet-300'
};

const LEVELS: SkillLevel[] = ['non_evalue', 'emergent', 'en_cours', 'acquis'];

const LEVEL_LABELS: Record<SkillLevel, string> = {
  non_evalue: 'غير مقيَّم',
  emergent: 'مبتدئ',
  en_cours: 'قيد التقدم',
  acquis: 'مكتسب'
};

/** Neutral print shading for the report (research R6/R8). */
const LEVEL_PRINT_SHADE: Record<SkillLevel, string> = {
  non_evalue: 'bg-white',
  emergent: 'bg-amber-100',
  en_cours: 'bg-sky-100',
  acquis: 'bg-emerald-100'
};

/** Current-session evaluator sentinel (no staff row exists for the signed-in user). */
const SELF_EVALUATOR_ID = '__me__';
const SELF_EVALUATOR_LABEL = 'أنا (المستخدم الحالي)';

const emptySkillForm = (): Omit<Skill, 'id' | 'createdAt'> => ({
  domain: 'langage',
  label: ''
});

export default function CompetencesModule({ catalog, evaluations, onUpdateDoc, students, staff = [], canUseRoster }: CompetencesModuleProps) {
  const { error, success } = useToast();
  const [view, setView] = useState<'catalog' | 'evaluation' | 'heatmap'>('catalog');
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [skillForm, setSkillForm] = useState(emptySkillForm());
  const [skillError, setSkillError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [evalForm, setEvalForm] = useState<Record<string, { level: SkillLevel; evaluatorStaffId: string; evaluatorName: string; evaluatedAt: string }>>({});
  /** T018: print report is state-toggled, never always-mounted. */
  const [printStudentId, setPrintStudentId] = useState<string | null>(null);

  const mode = evaluatorMode(canUseRoster);

  const studentName = (id: string) => {
    const s = students.find(st => st.id === id);
    return s ? `${s.firstName} ${s.lastName}` : '?';
  };

  const openSkillCreate = (domain: SkillDomain = 'langage') => {
    setSkillForm({ domain, label: '' });
    setEditingSkillId(null);
    setSkillError(null);
    setSkillModalOpen(true);
  };

  const openSkillEdit = (s: Skill) => {
    setSkillForm({ domain: s.domain, label: s.label, ageFrom: s.ageFrom, ageTo: s.ageTo });
    setEditingSkillId(s.id);
    setSkillError(null);
    setSkillModalOpen(true);
  };

  /** FR-002: validateSkill gates the save and surfaces an inline blocking message. */
  const handleSkillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSkill(skillForm)) {
      let message = 'بيانات المهارة غير صالحة';
      if (!skillForm.label || skillForm.label.trim() === '') {
        message = 'يرجى إدخال اسم المهارة';
      } else if (!DOMAINS.includes(skillForm.domain)) {
        message = 'يرجى اختيار مجال المهارة';
      } else if (
        skillForm.ageFrom != null && skillForm.ageTo != null &&
        Number(skillForm.ageFrom) > Number(skillForm.ageTo)
      ) {
        message = 'العمر الأدنى يجب أن يكون أصغر من أو يساوي العمر الأقصى';
      } else if ((skillForm.ageFrom != null && skillForm.ageFrom < 0) || (skillForm.ageTo != null && skillForm.ageTo < 0)) {
        message = 'العمر لا يمكن أن يكون سالبًا';
      }
      setSkillError(message);
      error(message);
      return;
    }
    setSkillError(null);
    if (editingSkillId) {
      onUpdateDoc({
        catalog: catalog.map(s => s.id === editingSkillId ? { ...s, ...skillForm } : s),
        evaluations
      });
      success('تم تحديث المهارة بنجاح');
    } else {
      onUpdateDoc({
        catalog: [...catalog, { ...skillForm, id: 'skl_' + crypto.randomUUID(), createdAt: new Date().toISOString() }],
        evaluations
      });
      success('تمت إضافة المهارة بنجاح');
    }
    setSkillModalOpen(false);
  };

  /** FR-022 cascade: removing a skill removes only its evaluations. */
  const handleSkillDelete = (id: string) => {
    const removed = catalog.find(s => s.id === id);
    onUpdateDoc({
      catalog: catalog.filter(s => s.id !== id),
      evaluations: evaluations.filter(ev => ev.skillId !== id)
    });
    success(removed ? `تم حذف المهارة "${removed.label}" وكل تقييماتها` : 'تم حذف المهارة');
  };

  const openEvaluation = (studentId: string) => {
    setSelectedStudentId(studentId);
    setEvalForm({});
    setView('evaluation');
  };

  const latestFor = (studentId: string, skillId: string): SkillEvaluation | undefined => {
    return evaluations
      .filter(ev => ev.studentId === studentId && ev.skillId === skillId)
      .sort((a, b) => (b.evaluatedAt || '').localeCompare(a.evaluatedAt || ''))[0];
  };

  const setEval = (skillId: string, patch: Partial<{ level: SkillLevel; evaluatorStaffId: string; evaluatorName: string; evaluatedAt: string }>) => {
    setEvalForm(prev => ({
      ...prev,
      [skillId]: {
        level: 'non_evalue',
        evaluatorStaffId: '',
        evaluatorName: '',
        evaluatedAt: new Date().toISOString().slice(0, 10),
        ...prev[skillId],
        ...patch
      }
    }));
  };

  const handleSaveEvaluations = () => {
    if (!selectedStudentId) return;
    const entries = Object.entries(evalForm);
    if (entries.length === 0) {
      error('لا توجد تعديلات لحفظها');
      return;
    }
    // FR-006/FR-023: exactly one evaluator discriminator per entitlement mode
    for (const [, v] of entries) {
      if (v.level === 'non_evalue') continue;
      if (mode === 'roster' && !v.evaluatorStaffId) {
        error('يرجى اختيار المقيّم من القائمة');
        return;
      }
      if (mode === 'freetext' && !(v.evaluatorName || '').trim()) {
        error('يرجى إدخال اسم المقيّم');
        return;
      }
    }
    let next = [...evaluations];
    for (const [skillId, v] of entries) {
      if (v.level === 'non_evalue') continue;
      // R3 latest-save-wins: replace any previous evaluation for this pair
      next = next.filter(ev => !(ev.studentId === selectedStudentId && ev.skillId === skillId));
      next.push({
        id: 'ev_' + crypto.randomUUID(),
        studentId: selectedStudentId,
        skillId,
        level: v.level,
        ...(mode === 'roster'
          ? { evaluatedByStaffId: v.evaluatorStaffId, evaluatedByName: undefined }
          : { evaluatedByName: v.evaluatorName.trim(), evaluatedByStaffId: undefined }),
        evaluatedAt: v.evaluatedAt || new Date().toISOString().slice(0, 10)
      });
    }
    onUpdateDoc({ catalog, evaluations: next });
    success('تم حفظ التقييمات بنجاح');
    setEvalForm({});
  };

  /** US3: view-only derivations — rows = children bucketed by class label (unassigned last). */
  const heatmap = useMemo(
    () => heatmapBuckets(students, catalog, evaluations),
    [students, catalog, evaluations]
  );

  const heatmapGroups = useMemo(
    () => Array.from(new Set(heatmap.rows.map(r => r.group))),
    [heatmap]
  );

  /** Explicit neutral cell: never evaluated or explicitly marked "non évalué". */
  const isNeutralLevel = (level: SkillLevel | null) => !level || level === 'non_evalue';

  const resolveEvaluator = (ev?: SkillEvaluation): string => {
    if (!ev) return '';
    if (ev.evaluatedByStaffId === SELF_EVALUATOR_ID) return SELF_EVALUATOR_LABEL;
    return evaluatorDisplay(ev, staff);
  };

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const printStudent = students.find(s => s.id === printStudentId);

  /** T018: mounting the report triggers the browser print dialog. */
  useEffect(() => {
    if (!printStudentId) return;
    const t = setTimeout(() => {
      try {
        if (typeof window !== 'undefined' && typeof window.print === 'function') window.print();
      } catch {
        /* printing is unavailable in this environment */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [printStudentId]);

  const PrintReport = () => {
    if (!printStudent) return null;
    const hasAnyEvaluation = catalog.some(sk => !!latestFor(printStudent.id, sk.id));
    return (
      <div data-testid="print-report" className="hidden print:block print-area bg-white p-6 text-slate-900" dir="rtl">
        <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
          <h1 className="text-xl font-black">تقرير المهارات والكفايات</h1>
          <p className="text-sm font-bold mt-1">{studentName(printStudent.id)}</p>
          <p className="text-xs text-slate-600">{printStudent.grade || ''}</p>
        </div>
        {!hasAnyEvaluation ? (
          <p data-testid="print-empty" className="text-sm font-bold text-slate-500 text-center py-6">
            لا توجد تقييمات لهذا الطفل بعد.
          </p>
        ) : (
          DOMAINS.map(d => {
            const skills = catalog.filter(s => s.domain === d);
            if (skills.length === 0) return null;
            return (
              <div key={d} className="mb-4">
                <h2 className="text-sm font-black border-b border-slate-400 pb-1 mb-2">{DOMAIN_LABELS[d]}</h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-500">
                      <th className="text-right font-bold py-1">المهارة</th>
                      <th className="font-bold py-1 w-24">المستوى</th>
                      <th className="font-bold py-1 w-32">المقيّم</th>
                      <th className="font-bold py-1 w-24">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skills.map(sk => {
                      const ev = latestFor(printStudent.id, sk.id);
                      const level: SkillLevel = ev?.level || 'non_evalue';
                      return (
                        <tr key={sk.id} className="border-b border-slate-200">
                          <td className="py-1.5 font-bold">{sk.label}</td>
                          <td className="py-1.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded border ${LEVEL_PRINT_SHADE[level]} border-slate-300 font-bold`}>
                              {LEVEL_LABELS[level]}
                            </span>
                          </td>
                          <td className="py-1.5 text-center">{resolveEvaluator(ev) || '—'}</td>
                          <td className="py-1.5 text-center">{ev?.evaluatedAt ? ev.evaluatedAt.slice(0, 10) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
        <p className="text-[10px] text-slate-500 mt-4 text-left">تاريخ الطباعة: {new Date().toLocaleDateString('ar-TN')}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PrintReport />

      {/* Screen UI */}
      <div className="print:hidden space-y-6">
        {/* Module banner */}
        <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
          <div>
            <span className="px-3 py-1 bg-brand-600/[0.06] text-brand-700 text-xs font-bold rounded-lg border border-brand-600/20">
              المهارات والكفايات
            </span>
            <h2 className="text-2xl font-black text-slate-900 mt-2">المهارات والكفايات</h2>
            <p className="text-slate-500 text-xs mt-1">
              كتالوج المهارات حسب المجالات الأربعة، تقييم الأطفال، وخريطة التحكم حسب الفئة.
            </p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setView('catalog')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition ${view === 'catalog' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <List className="h-3 w-3" /> الكتالوج
            </button>
            <button
              onClick={() => { setView('evaluation'); }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition ${view === 'evaluation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users className="h-3 w-3" /> التقييم
            </button>
            <button
              onClick={() => setView('heatmap')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition ${view === 'heatmap' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutGrid className="h-3 w-3" /> خريطة الصف
            </button>
          </div>
        </div>

        {/* Print status / dismissal (screen only) */}
        {printStudentId && printStudent && (
          <div className="no-print flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2">
            <span className="text-[11px] font-bold text-emerald-800">
              تقرير {studentName(printStudent.id)} جاهز للطباعة
            </span>
            <button
              onClick={() => setPrintStudentId(null)}
              className="px-3 py-1.5 bg-white border border-emerald-200 text-emerald-800 rounded-xl text-[11px] font-black cursor-pointer"
            >
              إغلاق التقرير
            </button>
          </div>
        )}

        {/* Catalog view */}
        {view === 'catalog' && (
          <div className="space-y-4">
            {DOMAINS.map(d => {
              const skills = catalog.filter(s => s.domain === d);
              return (
                <div key={d} className="bg-white rounded-3xl border border-slate-200/70 p-4 shadow-lg shadow-slate-900/5">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-black ${DOMAIN_CLASS[d]}`}>
                      {DOMAIN_ICONS[d]} {DOMAIN_LABELS[d]} ({skills.length})
                    </span>
                    <button
                      onClick={() => openSkillCreate(d)}
                      className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-black rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> مهارة
                    </button>
                  </div>
                  {skills.length === 0 ? (
                    <p className="text-xs text-slate-400 font-bold text-center py-3">لا توجد مهارات في هذا المجال بعد</p>
                  ) : (
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {skills.map(s => (
                        <div key={s.id} data-testid="skill-card" className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                          <span className="text-xs font-bold text-slate-700 truncate">
                            {s.label}
                            {s.ageFrom != null && s.ageTo != null && (
                              <span className="text-slate-400 font-semibold mr-1"> ({s.ageFrom}–{s.ageTo} شهر)</span>
                            )}
                          </span>
                          <span className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => openSkillEdit(s)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-brand-600/[0.06] cursor-pointer" title="تعديل">
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleSkillDelete(s.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer" title="حذف">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Evaluation view */}
        {view === 'evaluation' && (
          <div className="space-y-4">
            {students.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200/70 p-8 text-center shadow-lg shadow-slate-900/5">
                <p className="text-sm font-bold text-slate-500">لا يوجد تلاميذ مسجلون</p>
                <p className="text-xs text-slate-400 mt-1">سجّل تلميذًا أولًا ثم عد لتقييم مهاراته.</p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200/70 p-4 shadow-lg shadow-slate-900/5">
                <label className="text-xs font-bold text-slate-600 block mb-1">الطفل</label>
                <select
                  aria-label="الطفل"
                  value={selectedStudentId || ''}
                  onChange={(e) => { setSelectedStudentId(e.target.value || null); setEvalForm({}); }}
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                >
                  <option value="">-- اختر طفلًا --</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>

                {selectedStudent && (
                  <div className="mt-4 space-y-2">
                    {catalog.length === 0 ? (
                      <p className="text-xs text-slate-400 font-bold text-center py-3">
                        الكتالوج فارغ — أضف مهارات أولًا من تبويب الكتالوج.
                      </p>
                    ) : (
                      DOMAINS.map(d => {
                        const skills = catalog.filter(s => s.domain === d);
                        if (skills.length === 0) return null;
                        return (
                          <div key={d}>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-black my-1 ${DOMAIN_CLASS[d]}`}>
                              {DOMAIN_ICONS[d]} {DOMAIN_LABELS[d]}
                            </span>
                            {skills.map(sk => {
                              const existing = latestFor(selectedStudent.id, sk.id);
                              const form = evalForm[sk.id];
                              const currentLevel = form?.level || existing?.level || 'non_evalue';
                              return (
                                <div key={sk.id} className="flex flex-wrap items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                                  <span className="text-xs font-bold text-slate-700 min-w-[140px] flex-1 truncate">{sk.label}</span>
                                  <span
                                    data-testid="level-chip"
                                    className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-black ${LEVEL_CHIP_CLASS[currentLevel]}`}
                                  >
                                    {LEVEL_LABELS[currentLevel]}
                                  </span>
                                  <select
                                    aria-label={`المستوى ${sk.label}`}
                                    value={currentLevel}
                                    onChange={(e) => setEval(sk.id, { level: e.target.value as SkillLevel })}
                                    className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer"
                                  >
                                    {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                                  </select>
                                  {mode === 'roster' ? (
                                    <select
                                      aria-label="المقيّم"
                                      value={form?.evaluatorStaffId ?? existing?.evaluatedByStaffId ?? ''}
                                      onChange={(e) => setEval(sk.id, { evaluatorStaffId: e.target.value })}
                                      className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer"
                                    >
                                      <option value="">-- المقيّم --</option>
                                      <option value={SELF_EVALUATOR_ID}>{SELF_EVALUATOR_LABEL}</option>
                                      {staff.map(st => (
                                        <option key={st.id} value={st.id}>{st.firstName} {st.lastName}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      aria-label="المقيّم"
                                      value={form?.evaluatorName ?? existing?.evaluatedByName ?? ''}
                                      onChange={(e) => setEval(sk.id, { evaluatorName: e.target.value })}
                                      placeholder="اسم المقيّم"
                                      className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold w-32"
                                    />
                                  )}
                                  <input
                                    type="date"
                                    aria-label="تاريخ التقييم"
                                    value={form?.evaluatedAt || existing?.evaluatedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10)}
                                    onChange={(e) => setEval(sk.id, { evaluatedAt: e.target.value })}
                                    className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    )}
                    {catalog.length > 0 && (
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={handleSaveEvaluations}
                          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black cursor-pointer"
                        >
                          حفظ التقييمات
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Heatmap view — rows = children bucketed by class label, columns = skills by domain */}
        {view === 'heatmap' && (
          <div className="bg-white rounded-3xl border border-slate-200/70 p-4 shadow-lg shadow-slate-900/5 overflow-x-auto">
            <span className="text-xs font-black text-slate-500">خريطة التحكم حسب الفئة</span>
            {heatmap.rows.length === 0 || heatmap.columns.length === 0 ? (
              <p className="text-xs text-slate-400 font-bold text-center py-6">
                لا توجد بيانات كافية — أضف مهارات وتلاميذ لتظهر الخريطة.
              </p>
            ) : (
              <table data-testid="heatmap-table" className="mt-3 text-[11px] border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className="p-2 text-right font-black text-slate-600">الطفل</th>
                    {DOMAINS.map(d => {
                      const cols = heatmap.columns.filter(c => c.domain === d);
                      if (cols.length === 0) return null;
                      return (
                        <th key={d} colSpan={cols.length} className="p-1 font-black text-slate-500">
                          <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-black ${DOMAIN_CLASS[d]}`}>
                            {DOMAIN_LABELS[d]}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                  <tr>
                    {heatmap.columns.map(c => (
                      <th key={c.skillId} className="p-2 font-black text-slate-600 whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapGroups.map(g => (
                    <React.Fragment key={g}>
                      <tr data-testid="heatmap-group">
                        <td colSpan={heatmap.columns.length + 1} className="pt-3 pb-1">
                          <span className="inline-flex px-2 py-0.5 rounded-lg border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-600">
                            {g}
                          </span>
                        </td>
                      </tr>
                      {heatmap.rows.filter(r => r.group === g).map(r => (
                        <tr key={r.studentId} data-testid="heatmap-row">
                          <td className="p-2 font-bold text-slate-700 whitespace-nowrap">{r.studentName}</td>
                          {r.cells.map(cell => {
                            const neutral = isNeutralLevel(cell.level);
                            return (
                              <td key={cell.skillId} className="p-1">
                                <div
                                  data-testid="heatmap-cell"
                                  data-level={neutral ? 'none' : cell.level}
                                  className={`h-7 min-w-[52px] rounded-lg border border-slate-200 flex items-center justify-center text-[10px] ${neutral ? 'bg-white text-slate-300' : `${LEVEL_CHIP_CLASS[cell.level as SkillLevel]} font-black`}`}
                                >
                                  {neutral ? '—' : LEVEL_LABELS[cell.level as SkillLevel]}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Evaluation print trigger (visible only when a child is selected) */}
        {view === 'evaluation' && selectedStudent && (
          <div className="flex justify-end">
            <button
              onClick={() => setPrintStudentId(selectedStudent.id)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" /> طباعة التقرير
            </button>
          </div>
        )}
      </div>

      {/* Skill create/edit dialog */}
      {skillModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 bg-brand-600 text-white flex justify-between items-center">
              <h3 className="text-base font-black">{editingSkillId ? 'تعديل المهارة' : 'مهارة جديدة'}</h3>
              <button onClick={() => setSkillModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-300" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSkillSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="skill-label" className="text-xs font-bold text-slate-600 block mb-1">اسم المهارة *</label>
                <input
                  id="skill-label"
                  type="text"
                  value={skillForm.label}
                  onChange={(e) => setSkillForm({ ...skillForm, label: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-600"
                  placeholder="مثال: يتعرف على الحروف"
                />
              </div>
              <div>
                <label htmlFor="skill-domain" className="text-xs font-bold text-slate-600 block mb-1">المجال *</label>
                <select
                  id="skill-domain"
                  value={skillForm.domain}
                  onChange={(e) => setSkillForm({ ...skillForm, domain: e.target.value as SkillDomain })}
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                >
                  {DOMAINS.map(d => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="skill-age-from" className="text-xs font-bold text-slate-600 block mb-1">العمر من (شهر)</label>
                  <input
                    id="skill-age-from"
                    type="number"
                    min={0}
                    value={skillForm.ageFrom ?? ''}
                    onChange={(e) => setSkillForm({ ...skillForm, ageFrom: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label htmlFor="skill-age-to" className="text-xs font-bold text-slate-600 block mb-1">العمر إلى (شهر)</label>
                  <input
                    id="skill-age-to"
                    type="number"
                    min={0}
                    value={skillForm.ageTo ?? ''}
                    onChange={(e) => setSkillForm({ ...skillForm, ageTo: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>
              {skillError && (
                <p data-testid="skill-error" className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {skillError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSkillModalOpen(false)}
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
