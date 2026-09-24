import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import CompetencesModule from './CompetencesModule';
import { Skill, SkillEvaluation, SkillDomain, SkillLevel } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: (_t, prop) => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const skill = (id: string, domain: SkillDomain, label: string): Skill => ({
  id, domain, label
});

const evaluation = (
  id: string,
  studentId: string,
  skillId: string,
  level: SkillLevel,
  extra: Partial<SkillEvaluation> = {}
): SkillEvaluation => ({
  id, studentId, skillId, level, evaluatedAt: '2026-09-01', ...extra
});

const baseProps = {
  catalog: [] as Skill[],
  evaluations: [] as SkillEvaluation[],
  onUpdateDoc: vi.fn(),
  students: [] as any[],
  currentUserRole: 'admin' as const,
  canUseRoster: false
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
  baseProps.onUpdateDoc = vi.fn();
});

/** Switch to the evaluation view and pick a child. */
function openEvaluation(studentId = 'st1') {
  fireEvent.click(screen.getByRole('button', { name: /التقييم/ }));
  fireEvent.change(screen.getByLabelText('الطفل'), { target: { value: studentId } });
}

/** Open the heatmap view. */
function openHeatmap() {
  fireEvent.click(screen.getByRole('button', { name: /خريطة/ }));
}

/** The heatmap row whose cells belong to the named child. */
function heatmapRow(name: string): HTMLElement {
  const row = screen.getAllByTestId('heatmap-row').find(r => (r.textContent || '').includes(name));
  if (!row) throw new Error(`heatmap row not found for ${name}`);
  return row;
}

describe('CompetencesModule — US1 catalog', () => {
  it('groups catalog skills under the four domains', () => {
    render(<CompetencesModule
      {...baseProps}
      catalog={[
        skill('s1', 'langage', 'Vocabulaire'),
        skill('s2', 'motricite', 'Sauter'),
        skill('s3', 'social', 'Partager'),
        skill('s4', 'autonomie', 'S\'habiller')
      ]}
    />);
    expect(screen.getByText(/لغة|لغوي/)).toBeTruthy();
    expect(screen.getByText(/حركي/)).toBeTruthy();
    expect(screen.getByText(/اجتماعي/)).toBeTruthy();
    expect(screen.getByText(/استقلال/)).toBeTruthy();
  });

  it('blocks a skill with an empty label with an inline message and no save call', () => {
    const onUpdateDoc = vi.fn();
    render(<CompetencesModule {...baseProps} onUpdateDoc={onUpdateDoc} />);
    fireEvent.click(screen.getAllByRole('button', { name: /مهارة/ })[0]);
    fireEvent.change(screen.getByLabelText(/اسم المهارة/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    expect(screen.getByTestId('skill-error').textContent).toContain('يرجى إدخال اسم المهارة');
    expect(onUpdateDoc).not.toHaveBeenCalled();
  });

  it('blocks an inverted age range with an inline message and no save call', () => {
    const onUpdateDoc = vi.fn();
    render(<CompetencesModule {...baseProps} onUpdateDoc={onUpdateDoc} />);
    fireEvent.click(screen.getAllByRole('button', { name: /مهارة/ })[0]);
    fireEvent.change(screen.getByLabelText(/اسم المهارة/), { target: { value: 'Trier' } });
    fireEvent.change(screen.getByLabelText(/العمر من/), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText(/العمر إلى/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    expect(screen.getByTestId('skill-error').textContent).toContain('العمر الأدنى');
    expect(onUpdateDoc).not.toHaveBeenCalled();
  });

  it('adds a valid skill with a generated id', () => {
    const onUpdateDoc = vi.fn();
    render(<CompetencesModule {...baseProps} onUpdateDoc={onUpdateDoc} />);
    fireEvent.click(screen.getAllByRole('button', { name: /مهارة/ })[0]);
    fireEvent.change(screen.getByLabelText(/اسم المهارة/), { target: { value: 'Trier' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    expect(onUpdateDoc).toHaveBeenCalledTimes(1);
    const doc = onUpdateDoc.mock.calls[0][0];
    expect(doc.catalog.length).toBe(1);
    expect(doc.catalog[0].label).toBe('Trier');
    expect(doc.catalog[0].id).toBeTruthy();
  });

  it('edits a skill in place', () => {
    const onUpdateDoc = vi.fn();
    render(<CompetencesModule
      {...baseProps}
      onUpdateDoc={onUpdateDoc}
      catalog={[skill('s1', 'langage', 'Vocabulaire')]}
    />);
    fireEvent.click(screen.getAllByTitle('تعديل')[0]);
    fireEvent.change(screen.getByLabelText(/اسم المهارة/), { target: { value: 'Vocabulaire avancé' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    const doc = onUpdateDoc.mock.calls[0][0];
    expect(doc.catalog.length).toBe(1);
    expect(doc.catalog[0].id).toBe('s1');
    expect(doc.catalog[0].label).toBe('Vocabulaire avancé');
  });

  it('removing a skill cascades its evaluations only', () => {
    const onUpdateDoc = vi.fn();
    render(<CompetencesModule
      {...baseProps}
      onUpdateDoc={onUpdateDoc}
      catalog={[skill('s1', 'langage', 'Vocabulaire'), skill('s2', 'motricite', 'Sauter')]}
      evaluations={[
        evaluation('e1', 'st1', 's1', 'acquis'),
        evaluation('e2', 'st1', 's2', 'emergent')
      ]}
    />);
    fireEvent.click(screen.getAllByTitle('حذف')[0]);
    const doc = onUpdateDoc.mock.calls[0][0];
    expect(doc.catalog.map((s: Skill) => s.id)).toEqual(['s2']);
    expect(doc.evaluations.map((e: SkillEvaluation) => e.id)).toEqual(['e2']);
  });
});

describe('CompetencesModule — US2 evaluations', () => {
  it('renders a roster select for the evaluator when canUseRoster is true', () => {
    render(<CompetencesModule
      {...baseProps}
      canUseRoster={true}
      catalog={[skill('s1', 'langage', 'Vocabulaire')]}
      students={[{ id: 'st1', firstName: 'Amine', lastName: 'Ben' } as any]}
    />);
    openEvaluation();
    const select = screen.getAllByLabelText('المقيّم')[0] as unknown as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
  });

  it('renders a free-text input for the evaluator when canUseRoster is false', () => {
    render(<CompetencesModule
      {...baseProps}
      canUseRoster={false}
      catalog={[skill('s1', 'langage', 'Vocabulaire')]}
      students={[{ id: 'st1', firstName: 'Amine', lastName: 'Ben' } as any]}
    />);
    openEvaluation();
    const input = screen.getAllByLabelText('المقيّم')[0] as unknown as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
  });

  it('persists an evaluation with level, evaluator and today\'s date', () => {
    const onUpdateDoc = vi.fn();
    render(<CompetencesModule
      {...baseProps}
      onUpdateDoc={onUpdateDoc}
      catalog={[skill('s1', 'langage', 'Vocabulaire')]}
      students={[{ id: 'st1', firstName: 'Amine', lastName: 'Ben' } as any]}
    />);
    openEvaluation();
    const select = screen.getByLabelText('المستوى Vocabulaire') as unknown as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'acquis' } });
    // evaluator required per FR-023
    fireEvent.change(screen.getAllByLabelText('المقيّم')[0], { target: { value: 'Mme Salma' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ التقييمات/ }));
    expect(onUpdateDoc).toHaveBeenCalled();
    const doc = onUpdateDoc.mock.calls[0][0];
    expect(doc.evaluations.length).toBe(1);
    expect(doc.evaluations[0]).toMatchObject({
      studentId: 'st1',
      skillId: 's1',
      level: 'acquis',
      evaluatedByName: 'Mme Salma'
    });
    expect(doc.evaluations[0].evaluatedAt).toBe(new Date().toISOString().slice(0, 10));
  });

  it('re-evaluating the same child-skill replaces the previous entry (latest wins)', () => {
    const onUpdateDoc = vi.fn();
    render(<CompetencesModule
      {...baseProps}
      onUpdateDoc={onUpdateDoc}
      catalog={[skill('s1', 'langage', 'Vocabulaire')]}
      students={[{ id: 'st1', firstName: 'Amine', lastName: 'Ben' } as any]}
      evaluations={[evaluation('e1', 'st1', 's1', 'emergent', { evaluatedByName: 'Mme Salma', evaluatedAt: '2026-09-01' })]}
    />);
    openEvaluation();
    fireEvent.change(screen.getByLabelText('المستوى Vocabulaire'), { target: { value: 'acquis' } });
    fireEvent.change(screen.getAllByLabelText('المقيّم')[0], { target: { value: 'Mme Salma' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ التقييمات/ }));
    const doc = onUpdateDoc.mock.calls[0][0];
    // exactly one current evaluation for the pair, at the new level
    expect(doc.evaluations.length).toBe(1);
    expect(doc.evaluations[0].level).toBe('acquis');
  });

  it('renders evaluated skills grouped by domain with the stored level', () => {
    render(<CompetencesModule
      {...baseProps}
      catalog={[skill('s1', 'langage', 'Vocabulaire'), skill('s2', 'motricite', 'Sauter')]}
      students={[{ id: 'st1', firstName: 'Amine', lastName: 'Ben' } as any]}
      evaluations={[evaluation('e1', 'st1', 's1', 'acquis')]}
    />);
    openEvaluation();
    // domain headers both present
    expect(screen.getByText(/اللغة والتواصل/)).toBeTruthy();
    expect(screen.getByText(/المهارات الحركية/)).toBeTruthy();
    // the stored level is preselected and surfaced as its chip
    const levelSelect = screen.getByLabelText('المستوى Vocabulaire') as unknown as HTMLSelectElement;
    expect(levelSelect.value).toBe('acquis');
    const unevaluated = screen.getByLabelText('المستوى Sauter') as unknown as HTMLSelectElement;
    expect(unevaluated.value).toBe('non_evalue');
  });
});

describe('CompetencesModule — US3 heatmap + report', () => {
  const students = [
    { id: 'st1', firstName: 'Amine', lastName: 'Ben', grade: 'PS' } as any,
    { id: 'st2', firstName: 'Sara', lastName: 'Ali', grade: 'PS' } as any,
    { id: 'st3', firstName: 'Zizo', lastName: 'Karim' } as any
  ];

  it('buckets heatmap rows by class label with the unassigned group last', () => {
    render(<CompetencesModule
      {...baseProps}
      catalog={[skill('s1', 'langage', 'Vocabulaire'), skill('s2', 'motricite', 'Sauter')]}
      students={students}
      evaluations={[evaluation('e1', 'st1', 's1', 'acquis')]}
    />);
    openHeatmap();
    const groups = screen.getAllByTestId('heatmap-group').map(g => g.textContent);
    expect(groups).toEqual(['PS', 'غير مُسند']);
    // columns = one per catalog skill, grouped by domain
    const table = screen.getByTestId('heatmap-table');
    expect(within(table).getByText('Vocabulaire')).toBeTruthy();
    expect(within(table).getByText('Sauter')).toBeTruthy();
    expect(within(table).getByText('اللغة والتواصل')).toBeTruthy();
    expect(within(table).getByText('المهارات الحركية')).toBeTruthy();
  });

  it('renders a neutral cell for an unevaluated pair and the stored level otherwise', () => {
    render(<CompetencesModule
      {...baseProps}
      catalog={[skill('s1', 'langage', 'Vocabulaire'), skill('s2', 'motricite', 'Sauter')]}
      students={students}
      evaluations={[evaluation('e1', 'st1', 's1', 'acquis')]}
    />);
    openHeatmap();
    // evaluated pair carries its level
    const evaluated = within(heatmapRow('Amine Ben')).getAllByTestId('heatmap-cell');
    expect(evaluated[0].getAttribute('data-level')).toBe('acquis');
    // never-evaluated pair is neutral — no level colour, explicit dash
    expect(evaluated[1].getAttribute('data-level')).toBe('none');
    expect(evaluated[1].textContent).toBe('—');
    expect(evaluated[1].className).not.toMatch(/emerald|amber|sky/);
    // a child with no evaluations at all is fully neutral
    const untouched = within(heatmapRow('Zizo Karim')).getAllByTestId('heatmap-cell');
    expect(untouched.every(c => c.getAttribute('data-level') === 'none')).toBe(true);
  });

  it('prints the per-child report with level, evaluator and date once toggled', () => {
    render(<CompetencesModule
      {...baseProps}
      catalog={[skill('s1', 'langage', 'Vocabulaire'), skill('s2', 'motricite', 'Sauter')]}
      students={students}
      evaluations={[evaluation('e1', 'st1', 's1', 'acquis', { evaluatedByName: 'Mme Salma', evaluatedAt: '2026-09-10' })]}
    />);
    // report is state-toggled: nothing mounted before the trigger
    expect(screen.queryByTestId('print-report')).toBeNull();
    openEvaluation('st1');
    fireEvent.click(screen.getByRole('button', { name: /طباعة التقرير/ }));
    const report = screen.getByTestId('print-report');
    expect(within(report).getByText(/تقرير المهارات والكفايات/)).toBeTruthy();
    expect(within(report).getByText('Amine Ben')).toBeTruthy();
    expect(within(report).getByText('Vocabulaire')).toBeTruthy();
    expect(within(report).getByText('مكتسب')).toBeTruthy();
    expect(within(report).getByText('Mme Salma')).toBeTruthy();
    expect(within(report).getByText('2026-09-10')).toBeTruthy();
    // the unevaluated skill still appears, at the neutral level
    expect(within(report).getByText('Sauter')).toBeTruthy();
    expect(within(report).getAllByText('غير مقيَّم').length).toBe(1);
  });

  it('shows an explicit empty state for a child with no evaluations', () => {
    render(<CompetencesModule
      {...baseProps}
      catalog={[skill('s1', 'langage', 'Vocabulaire')]}
      students={students}
    />);
    openEvaluation('st3');
    fireEvent.click(screen.getByRole('button', { name: /طباعة التقرير/ }));
    const report = screen.getByTestId('print-report');
    expect(within(report).getByTestId('print-empty').textContent).toContain('لا توجد تقييمات');
  });

  it('resolves a roster evaluator name from the staff list in the report', () => {
    render(<CompetencesModule
      {...baseProps}
      canUseRoster={true}
      staff={[{ id: 'stf_1', firstName: 'Mohamed', lastName: 'Ali' }]}
      catalog={[skill('s1', 'langage', 'Vocabulaire')]}
      students={students}
      evaluations={[evaluation('e1', 'st1', 's1', 'en_cours', { evaluatedByStaffId: 'stf_1', evaluatedByName: undefined, evaluatedAt: '2026-09-12' })]}
    />);
    openEvaluation('st1');
    fireEvent.click(screen.getByRole('button', { name: /طباعة التقرير/ }));
    const report = screen.getByTestId('print-report');
    expect(within(report).getByText('Mohamed Ali')).toBeTruthy();
    expect(within(report).getByText('قيد التقدم')).toBeTruthy();
  });
});
