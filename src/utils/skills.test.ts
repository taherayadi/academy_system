import { describe, it, expect } from 'vitest';
import { validateSkill, LEVEL_COLORS, LEVEL_ORDER, evaluatorMode, heatmapBuckets, evaluatorDisplay, UNASSIGNED_GROUP } from './skills';
import { Skill, SkillEvaluation, SkillLevel } from '../types';

const valid: Partial<Skill> = { domain: 'langage', label: 'Vocabulaire' };

const evaluation = (id: string, studentId: string, skillId: string, level: SkillLevel, evaluatedAt = '2026-09-01'): SkillEvaluation => ({
  id, studentId, skillId, level, evaluatedByStaffId: 'stf_1', evaluatedAt
});

const children = [
  { id: 's1', firstName: 'Amine', lastName: 'Ben', grade: 'PS' },
  { id: 's2', firstName: 'Sara', lastName: 'Ali', grade: 'PS' },
  { id: 's3', firstName: 'Zizo', lastName: 'Karim' } // unassigned
];

const skills: Skill[] = [
  { id: 'k1', domain: 'langage', label: 'Vocabulaire' },
  { id: 'k2', domain: 'motricite', label: 'Sauter' }
];

describe('validateSkill', () => {
  it('accepts a minimal valid skill', () => {
    expect(validateSkill(valid)).toBe(true);
  });

  it('accepts an age range with ageTo === ageFrom and ≥ 0', () => {
    expect(validateSkill({ ...valid, ageFrom: 0, ageTo: 0 })).toBe(true);
    expect(validateSkill({ ...valid, ageFrom: 12, ageTo: 36 })).toBe(true);
  });

  it('rejects an empty or whitespace label', () => {
    expect(validateSkill({ ...valid, label: '' })).toBe(false);
    expect(validateSkill({ ...valid, label: '   ' })).toBe(false);
    expect(validateSkill({ ...valid, label: undefined })).toBe(false);
  });

  it('rejects a domain outside the enum', () => {
    expect(validateSkill({ ...valid, domain: 'science' as any })).toBe(false);
    expect(validateSkill({ ...valid, domain: undefined })).toBe(false);
  });

  it('rejects a negative ageFrom', () => {
    expect(validateSkill({ ...valid, ageFrom: -1 })).toBe(false);
  });

  it('rejects an inverted age range (ageTo < ageFrom)', () => {
    expect(validateSkill({ ...valid, ageFrom: 24, ageTo: 12 })).toBe(false);
  });

  it('rejects a negative ageTo', () => {
    expect(validateSkill({ ...valid, ageTo: -5 })).toBe(false);
  });

  it('accepts ageTo without ageFrom (independent optionals)', () => {
    expect(validateSkill({ ...valid, ageTo: 24 })).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(validateSkill(null as any)).toBe(false);
  });
});

describe('LEVEL_COLORS', () => {
  it('covers exactly the four-level enum with the fixed palette', () => {
    expect(LEVEL_ORDER).toEqual(['non_evalue', 'emergent', 'en_cours', 'acquis']);
    expect(Object.keys(LEVEL_COLORS).sort()).toEqual([...LEVEL_ORDER].sort());
    expect(LEVEL_COLORS.non_evalue).toBe('bg-neutral');
    expect(LEVEL_COLORS.emergent).toBe('bg-amber');
    expect(LEVEL_COLORS.en_cours).toBe('bg-sky');
    expect(LEVEL_COLORS.acquis).toBe('bg-emerald');
  });
});

describe('evaluatorMode', () => {
  it('returns roster when staff is entitled, freetext otherwise', () => {
    expect(evaluatorMode(true)).toBe('roster');
    expect(evaluatorMode(false)).toBe('freetext');
  });
});

describe('heatmapBuckets', () => {
  it('groups rows alphabetically with the unassigned group last', () => {
    const { rows } = heatmapBuckets(children, skills, []);
    // One row per child: the two PS children share the first group, unassigned last
    expect(rows.map(r => r.group)).toEqual(['PS', 'PS', UNASSIGNED_GROUP]);
    expect(rows[0].studentId).toBe('s1'); // PS children in input order within group
    expect(rows[2].studentId).toBe('s3');
  });

  it('builds columns in catalog order grouped by domain', () => {
    const { columns } = heatmapBuckets(children, skills, []);
    expect(columns.map(c => c.skillId)).toEqual(['k1', 'k2']);
    expect(columns.map(c => c.domain)).toEqual(['langage', 'motricite']);
  });

  it('holds the latest evaluation per pair and null when unevaluated', () => {
    const evals = [
      evaluation('e1', 's1', 'k1', 'emergent', '2026-09-01'),
      evaluation('e2', 's1', 'k1', 'acquis', '2026-09-15') // later save wins
    ];
    const { rows } = heatmapBuckets(children, skills, evals);
    expect(rows[0].cells[0].level).toBe('acquis');
    expect(rows[0].cells[1].level).toBeNull(); // never evaluated → neutral
  });

  it('never mutates the inputs', () => {
    const evals = [evaluation('e1', 's1', 'k1', 'acquis')];
    const childrenSnap = JSON.parse(JSON.stringify(children));
    const evalsSnap = [...evals];
    heatmapBuckets(children, skills, evals);
    expect(children).toEqual(childrenSnap);
    expect(evals).toEqual(evalsSnap);
  });
});

describe('evaluatorDisplay', () => {
  const staff = [{ id: 'stf_1', firstName: 'Mohamed', lastName: 'Ali' }];

  it('resolves a live staff reference to the roster name', () => {
    expect(evaluatorDisplay({ evaluatedByStaffId: 'stf_1' }, staff)).toBe('Mohamed Ali');
  });

  it('renders empty (without breaking) for a deleted staff reference', () => {
    expect(evaluatorDisplay({ evaluatedByStaffId: 'stf_gone' }, staff)).toBe('');
  });

  it('renders free-text as stored and empty when neither is set', () => {
    expect(evaluatorDisplay({ evaluatedByName: 'Mme Salma' })).toBe('Mme Salma');
    expect(evaluatorDisplay({})).toBe('');
  });
});
