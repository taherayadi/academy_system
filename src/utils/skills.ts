/**
 * Pure helpers for the Compétences & Skills module (feature 005).
 *
 * No React, no fetching, no storage — pure functions over plain data so the
 * truth tables test in isolation. The heatmap and report derivations read the
 * child's class label at render time (never stored on the evaluation).
 */

import { Skill, SkillEvaluation, SkillDomain, SkillLevel } from '../types';

const DOMAIN_ENUM: SkillDomain[] = ['langage', 'motricite', 'social', 'autonomie'];

/**
 * Validation predicate (data-model): label non-empty, domain in enum,
 * ageFrom absent-or-≥0, ageTo absent-or-≥ageFrom.
 */
export function validateSkill(s: Partial<Skill>): boolean {
  if (!s || typeof s !== 'object') return false;
  if (!s.label || s.label.trim() === '') return false;
  if (!s.domain || !DOMAIN_ENUM.includes(s.domain)) return false;
  if (s.ageFrom != null && (!Number.isFinite(s.ageFrom) || s.ageFrom < 0)) return false;
  if (s.ageTo != null && (!Number.isFinite(s.ageTo) || s.ageTo < 0)) return false;
  if (s.ageFrom != null && s.ageTo != null && s.ageTo < s.ageFrom) return false;
  return true;
}

/**
 * Fixed level palette (data-model derivation): non évalué = neutral,
 * émergent = amber, en cours = sky, acquis = emerald. Prefixes compose with
 * the Tailwind shade suffixes at the call site.
 */
export const LEVEL_COLORS: Record<SkillLevel, string> = {
  non_evalue: 'bg-neutral',
  emergent: 'bg-amber',
  en_cours: 'bg-sky',
  acquis: 'bg-emerald'
};

/** Full Tailwind chip classes per level (neutral explicitly gray, never colored). */
export const LEVEL_CHIP_CLASS: Record<SkillLevel, string> = {
  non_evalue: 'bg-slate-100 text-slate-500 border-slate-200',
  emergent: 'bg-amber-100 text-amber-800 border-amber-200',
  en_cours: 'bg-sky-100 text-sky-800 border-sky-200',
  acquis: 'bg-emerald-100 text-emerald-800 border-emerald-200'
};

export const LEVEL_ORDER: SkillLevel[] = ['non_evalue', 'emergent', 'en_cours', 'acquis'];

/** Evaluator control mode per staff entitlement (FR-006 XOR discriminator). */
export function evaluatorMode(staffEnabled: boolean): 'roster' | 'freetext' {
  return staffEnabled ? 'roster' : 'freetext';
}

/** Canonical unassigned-group label (Arabic UI). */
export const UNASSIGNED_GROUP = 'غير مُسند';

export interface HeatmapCell {
  studentId: string;
  skillId: string;
  /** Latest level for the pair, or null when never evaluated (neutral cell). */
  level: SkillLevel | null;
}

export interface HeatmapRow {
  /** Class label the row is bucketed under ('غير مُسند' when absent). */
  group: string;
  studentId: string;
  studentName: string;
  cells: HeatmapCell[];
}

export interface HeatmapColumn {
  skillId: string;
  label: string;
  domain: SkillDomain;
}

/**
 * Heatmap derivations (view-only): rows = children bucketed by their current
 * class label (alphabetical, 'unassigned' last); columns = catalog skills in
 * catalog order grouped by domain. Cells hold the latest evaluation per
 * (studentId, skillId) pair or null when unevaluated. No input is mutated.
 */
export function heatmapBuckets(
  children: { id: string; firstName: string; lastName: string; grade?: string }[],
  skills: Skill[],
  evaluations: SkillEvaluation[]
): { columns: HeatmapColumn[]; rows: HeatmapRow[] } {
  const latest = new Map<string, SkillEvaluation>();
  for (const ev of evaluations) {
    const key = `${ev.studentId}::${ev.skillId}`;
    const prev = latest.get(key);
    if (!prev || String(ev.evaluatedAt || '').localeCompare(String(prev.evaluatedAt || '')) >= 0) {
      latest.set(key, ev);
    }
  }

  const columns: HeatmapColumn[] = skills.map(s => ({ skillId: s.id, label: s.label, domain: s.domain }));

  const rows: HeatmapRow[] = children.map(c => ({
    group: c.grade && String(c.grade).trim() !== '' ? String(c.grade).trim() : UNASSIGNED_GROUP,
    studentId: c.id,
    studentName: `${c.firstName} ${c.lastName}`,
    cells: skills.map(s => {
      const ev = latest.get(`${c.id}::${s.id}`);
      return { studentId: c.id, skillId: s.id, level: ev ? ev.level : null };
    })
  }));

  const unassigned = rows.filter(r => r.group === UNASSIGNED_GROUP);
  const assigned = rows.filter(r => r.group !== UNASSIGNED_GROUP).sort((a, b) => a.group.localeCompare(b.group));
  return { columns, rows: [...assigned, ...unassigned] };
}

/**
 * Evaluator display resolution: a staff reference resolves to the roster name
 * when the staff member still exists; a deleted reference renders as stored
 * without breaking (spec edge case). Free-text renders as stored.
 */
export function evaluatorDisplay(
  ev: Pick<SkillEvaluation, 'evaluatedByStaffId' | 'evaluatedByName'>,
  staff?: { id: string; firstName: string; lastName: string }[]
): string {
  if (ev.evaluatedByName && ev.evaluatedByName.trim() !== '') return ev.evaluatedByName;
  if (ev.evaluatedByStaffId) {
    const st = (staff || []).find(s => s.id === ev.evaluatedByStaffId);
    return st ? `${st.firstName} ${st.lastName}` : '';
  }
  return '';
}
