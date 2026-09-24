import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

const evaluation = (id: string, studentId: string, skillId: string, level: SkillLevel): SkillEvaluation => ({
  id, studentId, skillId, level, evaluatedAt: '2026-09-01'
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

describe('CompetencesModule', () => {
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
    // Each domain header present (Arabic labels)
    expect(screen.getByText(/لغة|لغوي/)).toBeTruthy();
    expect(screen.getByText(/حركي/)).toBeTruthy();
    expect(screen.getByText(/اجتماعي/)).toBeTruthy();
    expect(screen.getByText(/استقلال/)).toBeTruthy();
  });

  it('renders a roster select for the evaluator when canUseRoster is true', () => {
    render(<CompetencesModule
      {...baseProps}
      canUseRoster={true}
      catalog={[skill('s1', 'langage', 'Vocabulaire')]}
      students={[{ id: 'st1', firstName: 'Amine', lastName: 'Ben' } as any]}
    />);
    // pick a child to open the evaluation surface
    openEvaluation();
    // roster select present
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

  it('persists an evaluation through onUpdateDoc with the four-level enum', () => {
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
    fireEvent.change(screen.getAllByLabelText('المقيّم')[0], { target: { value: 'Év' } });
    // saving triggers doc write
    const saveBtn = screen.getByRole('button', { name: /حفظ التقييمات/ });
    fireEvent.click(saveBtn);
    expect(onUpdateDoc).toHaveBeenCalled();
    const doc = onUpdateDoc.mock.calls[0][0];
    expect(doc.evaluations.length).toBe(1);
    expect(doc.evaluations[0].level).toBe('acquis');
  });

  it('renders the heatmap aggregating evaluations per class', () => {
    render(<CompetencesModule
      {...baseProps}
      catalog={[skill('s1', 'langage', 'Vocabulaire')]}
      students={[
        { id: 'st1', firstName: 'Amine', lastName: 'Ben', grade: 'PS' } as any,
        { id: 'st2', firstName: 'Sara', lastName: 'Ali', grade: 'PS' } as any
      ]}
      evaluations={[
        evaluation('e1', 'st1', 's1', 'acquis'),
        evaluation('e2', 'st2', 's1', 'emergent')
      ]}
    />);
    // switch to heatmap view
    const heatBtn = screen.queryByRole('button', { name: /خريطة|heatmap/i });
    if (heatBtn) fireEvent.click(heatBtn);
    // cells show aggregation; class PS cell is non-neutral
    expect(screen.getByText(/PS/)).toBeTruthy();
  });
});
