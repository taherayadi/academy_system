import { describe, it, expect } from 'vitest';
import {
  CENTER_TYPES,
  hasSchoolLevel,
  hasStudyModules,
  moduleCenterTypes,
  isModuleCompatible,
  incompatibleModules,
} from './centerType';
import { ALL_MODULES, applicableModuleKeys } from './pricing';

describe('CENTER_TYPES', () => {
  it('lists the four accepted types in order', () => {
    expect(CENTER_TYPES).toEqual(['jardin', 'creche', 'garderie', 'formation']);
  });
});

describe('hasSchoolLevel', () => {
  it('is true for school-bearing types', () => {
    expect(hasSchoolLevel('garderie')).toBe(true);
    expect(hasSchoolLevel('formation')).toBe(true);
  });

  it('is false for early-childhood types', () => {
    expect(hasSchoolLevel('creche')).toBe(false);
    expect(hasSchoolLevel('jardin')).toBe(false);
  });

  it('defaults to true (legacy visibility) for unknown/empty values', () => {
    expect(hasSchoolLevel(undefined)).toBe(true);
    expect(hasSchoolLevel(null)).toBe(true);
    expect(hasSchoolLevel('')).toBe(true);
    expect(hasSchoolLevel('unknown-legacy-type')).toBe(true);
  });
});

describe('hasStudyModules', () => {
  it('is true for school-bearing types', () => {
    expect(hasStudyModules('garderie')).toBe(true);
    expect(hasStudyModules('formation')).toBe(true);
  });

  it('is false for early-childhood types', () => {
    expect(hasStudyModules('creche')).toBe(false);
    expect(hasStudyModules('jardin')).toBe(false);
  });

  it('defaults to true (legacy visibility) for unknown/empty values', () => {
    expect(hasStudyModules(undefined)).toBe(true);
    expect(hasStudyModules(null)).toBe(true);
    expect(hasStudyModules('')).toBe(true);
    expect(hasStudyModules('invented-value')).toBe(true);
  });
});

// ── Revision B (T017): module × center-type compatibility ─────────────────

describe('moduleCenterTypes', () => {
  it('covers every catalog key (no phantom gaps in either direction)', () => {
    const catalogKeys = ALL_MODULES.map(m => m.key);
    for (const key of catalogKeys) {
      expect(moduleCenterTypes[key], `catalog key ${key} has no compatibility entry`).toBeTruthy();
    }
  });

  it('matches the remarks matrix: study modules are garderie/formation only', () => {
    for (const key of ['etude', 'coursParticuliers', 'revision', 'formations']) {
      expect(isModuleCompatible(key, 'creche')).toBe(false);
      expect(isModuleCompatible(key, 'jardin')).toBe(false);
      expect(isModuleCompatible(key, 'garderie')).toBe(true);
      expect(isModuleCompatible(key, 'formation')).toBe(true);
    }
  });

  it('matches the remarks matrix: core addons serve all four types', () => {
    for (const key of ['cantine', 'transport', 'events', 'staff', 'activites', 'competences']) {
      for (const type of CENTER_TYPES) {
        expect(isModuleCompatible(key, type), `${key} × ${type}`).toBe(true);
      }
    }
  });

  it('keeps base modules all-types', () => {
    for (const key of ['scolaire', 'studentTimeSheets', 'finance']) {
      for (const type of CENTER_TYPES) {
        expect(isModuleCompatible(key, type), `${key} × ${type}`).toBe(true);
      }
    }
  });

  it('defaults to compatible for unknown/empty/legacy types (passthrough)', () => {
    expect(isModuleCompatible('etude', undefined)).toBe(true);
    expect(isModuleCompatible('etude', null)).toBe(true);
    expect(isModuleCompatible('etude', '')).toBe(true);
    expect(isModuleCompatible('etude', 'legacy-unknown')).toBe(true);
  });

  it('treats an unknown module key as incompatible with known types', () => {
    expect(isModuleCompatible('phantom_key', 'creche')).toBe(false);
    expect(isModuleCompatible('phantom_key', undefined)).toBe(true);
  });
});

describe('incompatibleModules', () => {
  it('returns incompatible keys in selection order', () => {
    const selection = ['cantine', 'revision', 'etude', 'staff', 'coursParticuliers'];
    expect(incompatibleModules(selection, 'creche')).toEqual(['revision', 'etude', 'coursParticuliers']);
  });

  it('returns an empty list when everything is compatible', () => {
    expect(incompatibleModules(['cantine', 'events'], 'jardin')).toEqual([]);
    expect(incompatibleModules([], 'creche')).toEqual([]);
  });

  it('never blocks for unknown/empty types (legacy passthrough)', () => {
    expect(incompatibleModules(['etude', 'revision'], undefined)).toEqual([]);
    expect(incompatibleModules(['etude', 'revision'], '')).toEqual([]);
  });

  it('applicableModuleKeys agrees with isModuleCompatible for every type (no drift, revision C)', () => {
    for (const type of CENTER_TYPES) {
      const expected = ALL_MODULES.map(m => m.key).filter(key => isModuleCompatible(key, type));
      expect(applicableModuleKeys(type), `type ${type}`).toEqual(expected);
    }
    // passthrough: unknown types get the full catalog
    expect(applicableModuleKeys(undefined)).toEqual(ALL_MODULES.map(m => m.key));
  });
});
