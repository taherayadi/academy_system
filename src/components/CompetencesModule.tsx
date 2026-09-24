import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit3, X, Printer, Users, LayoutGrid, List, Palette, HandMetal, MessageSquare, Footprints } from 'lucide-react';
import { Skill, SkillEvaluation, SkillDomain, SkillLevel } from '../types';
import { useToast } from './Toast';

interface CompetencesModuleProps {
  catalog: Skill[];
  evaluations: SkillEvaluation[];
  onUpdateDoc: (doc: { catalog: Skill[]; evaluations: SkillEvaluation[] }) => void;
  students: { id: string; firstName: string; lastName: string; grade?: string }[];
  currentUserRole?: string;
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

const LEVEL_CLASS: Record<SkillLevel, string> = {
  non_evalue: 'bg-slate-100 text-slate-500 border-slate-200',
  emergent: 'bg-red-100 text-red-700 border-red-200',
  en_cours: 'bg-amber-100 text-amber-700 border-amber-200',
  acquis: 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

/** Neutral print shading for the heatmap (research R6/R8). */
const LEVEL_PRINT_SHADE: Record<SkillLevel, string> = {
  non_evalue: 'bg-white',
  emergent: 'bg-red-100',
  en_cours: 'bg-amber-100',
  acquis: 'bg-emerald-100'
};

const emptySkillForm = (): Omit<Skill, 'id' | 'createdAt'> => ({
  domain: 'langage',
  label: ''
});

export default function CompetencesModule({ catalog, evaluations, onUpdateDoc, students, canUseRoster }: CompetencesModuleProps) {
  const { error, success } = useToast();
  const [view, setView] = useState<'catalog' | 'evaluation' | 'heatmap'>('catalog');
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [skillForm, setSkillForm] = useState(emptySkillForm());
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [evalForm, setEvalForm] = useState<Record<string, { level: SkillLevel; evaluatorStaffId: string; evaluatorName: string; evaluatedAt: string }>>({});

  const studentName = (id: string) => {
    const s = students.find(st => st.id === id);
    return s ? `${s.firstName} ${s.lastName}` : '?';
  };

  const openSkillCreate = (domain: SkillDomain = 'langage') => {
    setSkillForm({ domain, label: '' });
    setEditingSkillId(null);
    setSkillModalOpen(true);
  };

  const openSkillEdit = (s: Skill) => {
    setSkillForm({ domain: s.domain, label: s.label });
    setEditingSkillId(s.id);
    setSkillModalOpen(true);
  };

  const handleSkillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillForm.label.trim()) {
      error('يرجى إدخال اسم المهارة');
      return;
    }
    if (!DOMAINS.includes(skillForm.domain)) {
      error('يرجى اختيار مجال المهارة');
      return;
    }
    if (
      skillForm.ageFrom != null && skillForm.ageTo != null &&
      Number(skillForm.ageFrom) > Number(skillForm.ageTo)
    ) {
      error('العمر الأدنى يجب أن يكون أصغر من أو يساوي العمر الأقصى');
      return;
    }
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
    // FR-023: exactly one evaluator discriminator per entitlement mode
    for (const [, v] of entries) {
      if (v.level === 'non_evalue') continue;
      if (canUseRoster && !v.evaluatorStaffId) {
        error('يرجى اختيار المقيّم من القائمة');
        return;
      }
      if (!canUseRoster && !(v.evaluatorName || '').trim()) {
        error('يرجى إدخال اسم المقيّم');
        return;
      }
    }
    let next = [...evaluations];
    for (const [skillId, v] of entries) {
      if (v.level === 'non_evalue') continue;
      // latest-save-wins: replace any previous evaluation for this pair
      next = next.filter(ev => !(ev.studentId === selectedStudentId && ev.skillId === skillId));
      next.push({
        id: 'ev_' + crypto.randomUUID(),
        studentId: selectedStudentId,
        skillId,
        level: v.level,
        ...(canUseRoster
          ? { evaluatedByStaffId: v.evaluatorStaffId, evaluatedByName: undefined }
          : { evaluatedByName: v.evaluatorName.trim(), evaluatedByStaffId: undefined }),
        evaluatedAt: v.evaluatedAt || new Date().toISOString().slice(0, 10)
      });
    }
    onUpdateDoc({ catalog, evaluations: next });
    success('تم حفظ التقييمات بنجاح');
    setEvalForm({});
  };

  /** US3: per-class mastery heatmap. */
  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) set.add(s.grade || 'غير مُسند');
    return Array.from(set).sort();
  }, [students]);

  const heatmapCell = (cls: string, skillId: string): SkillLevel | 'empty' => {
    const ids = students.filter(s => (s.grade || 'غير مُسند') === cls).map(s => s.id);
    const levels = ids
      .map(id => latestFor(id, skillId)?.level)
      .filter((l): l is SkillLevel => !!l && l !== 'non_evalue');
    if (levels.length === 0) return 'empty';
    // majority level, tie broken by the more advanced level
    const order: Record<SkillLevel, number> = { non_evalue: 0, emergent: 1, en_cours: 2, acquis: 3 };
    const counts = new Map<SkillLevel, number>();
    for (const l of levels) counts.set(l, (counts.get(l) || 0) + 1);
    let best: SkillLevel = 'non_evalue';
    let bestCount = 0;
    for (const [l, c] of counts.entries()) {
      if (c > bestCount || (c === bestCount && order[l] > order[best])) {
        best = l; bestCount = c;
      }
    }
    return best;
  };

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  const PrintReport = () => {
    if (!selectedStudent) return null;
    return (
      <div className="hidden print:block print-area bg-white p-6 text-slate-900" dir="rtl">
        <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
          <h1 className="text-xl font-black">تقرير المهارات والكفايات</h1>
          <p className="text-sm font-bold mt-1">{studentName(selectedStudent.id)}</p>
          <p className="text-xs text-slate-600">{selectedStudent.grade || ''}</p>
        </div>
        {DOMAINS.map(d => {
          const skills = catalog.filter(s => s.domain === d);
          if (skills.length === 0) return null;
          return (
            <div key={d} className="mb-4">
              <h2 className="text-sm font-black border-b border-slate-400 pb-1 mb-2">{DOMAIN_LABELS[d]}</h2>
              <table className="w-full text-xs">
                <tbody>
                  {skills.map(sk => {
                    const ev = latestFor(selectedStudent.id, sk.id);
                    const level: SkillLevel = ev?.level || 'non_evalue';
                    return (
                      <tr key={sk.id} className="border-b border-slate-200">
                        <td className="py-1.5 font-bold">{sk.label}</td>
                        <td className="py-1.5 w-32 text-center font-bold border border-slate-300 px-2">
                          <span className={`inline-block px-2 py-0.5 rounded border ${LEVEL_PRINT_SHADE[level]} border-slate-300`}>
                            {LEVEL_LABELS[level]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
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
              كتالوج المهارات حسب المجالات الأربعة، تقييم الأطفال، وخريطة التحكم الصفية.
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
                                  <select
                                    aria-label={`المستوى ${sk.label}`}
                                    value={currentLevel}
                                    onChange={(e) => setEval(sk.id, { level: e.target.value as SkillLevel })}
                                    className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer"
                                  >
                                    {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                                  </select>
                                  {canUseRoster ? (
                                    <select
                                      aria-label="المقيّم"
                                      value={form?.evaluatorStaffId || ''}
                                      onChange={(e) => setEval(sk.id, { evaluatorStaffId: e.target.value })}
                                      className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer"
                                    >
                                      <option value="">-- المقيّم --</option>
                                      <option value="__me__">أنا (المستخدم الحالي)</option>
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      aria-label="المقيّم"
                                      value={form?.evaluatorName || ''}
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

        {/* Heatmap view */}
        {view === 'heatmap' && (
          <div className="bg-white rounded-3xl border border-slate-200/70 p-4 shadow-lg shadow-slate-900/5 overflow-x-auto">
            <span className="text-xs font-black text-slate-500">خريطة التحكم الصفية (حسب الفئة)</span>
            {classes.length === 0 || catalog.length === 0 ? (
              <p className="text-xs text-slate-400 font-bold text-center py-6">
                لا توجد بيانات كافية — أضف مهارات وتقييمات لتظهر الخريطة.
              </p>
            ) : (
              <table className="mt-3 text-[11px] border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-right font-black text-slate-600">المهارة</th>
                    {classes.map(c => <th key={c} className="p-2 font-black text-slate-600">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DOMAINS.map(d => {
                    const skills = catalog.filter(s => s.domain === d);
                    if (skills.length === 0) return null;
                    return (
                      <>
                        <tr key={`h-${d}`}>
                          <td colSpan={classes.length + 1} className="pt-3 pb-1">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-black ${DOMAIN_CLASS[d]}`}>
                              {DOMAIN_LABELS[d]}
                            </span>
                          </td>
                        </tr>
                        {skills.map(sk => (
                          <tr key={sk.id}>
                            <td className="p-2 font-bold text-slate-700 whitespace-nowrap">{sk.label}</td>
                            {classes.map(c => {
                              const cell = heatmapCell(c, sk.id);
                              const cls = cell === 'empty' ? 'bg-white text-slate-300' : `${LEVEL_CLASS[cell]} font-black`;
                              return (
                                <td key={c} className="p-1">
                                  <div className={`h-7 min-w-[52px] rounded-lg border border-slate-200 flex items-center justify-center text-[10px] ${cls}`}>
                                    {cell === 'empty' ? '—' : LEVEL_LABELS[cell]}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Evaluation print button (visible only when a child is selected) */}
        {view === 'evaluation' && selectedStudent && (
          <div className="flex justify-end">
            <button
              onClick={() => window.print()}
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
