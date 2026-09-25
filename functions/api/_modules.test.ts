import { describe, it, expect } from 'vitest';
import {
  ALL_MODULE_KEYS,
  REQUIRED_MODULE_KEYS,
  UNBILLED_MODULE_KEYS,
  MODULE_CENTER_TYPES,
  normalizeCenterType,
  isValidCenterType,
  isModuleAllowedForCenterType,
  normalizeEnabledModules,
  ineligibleModules,
} from './_modules';

describe('normalizeCenterType (server twin)', () => {
  it('maps canonical keys and DB variants, accent-insensitively', () => {
    expect(normalizeCenterType('creche')).toBe('creche');
    expect(normalizeCenterType('Crèche')).toBe('creche');
    expect(normalizeCenterType('garderie')).toBe('garderie');
    expect(normalizeCenterType("Jardin d'enfant")).toBe('jardin');
    expect(normalizeCenterType('Centre de formation')).toBe('formation');
    expect(normalizeCenterType('école')).toBe('');
  });
});

describe('isValidCenterType — the API whitelist', () => {
  it('accepts the 4 canonical keys only', () => {
    expect(isValidCenterType('creche')).toBe(true);
    expect(isValidCenterType('jardin')).toBe(true);
    expect(isValidCenterType('garderie')).toBe(true);
    expect(isValidCenterType('formation')).toBe(true);
    expect(isValidCenterType('garderie ')).toBe(true); // trimmed
    expect(isValidCenterType('maternelle')).toBe(false);
    expect(isValidCenterType('')).toBe(false);
    expect(isValidCenterType(null)).toBe(false);
  });
});

describe('module catalog', () => {
  it('contains the two new modules and never the Library', () => {
    expect(ALL_MODULE_KEYS).toContain('activites');
    expect(ALL_MODULE_KEYS).toContain('competences');
    expect(ALL_MODULE_KEYS).not.toContain('bibliotheque');
  });

  it('keeps Library unbilled so legacy prices never re-enter a total', () => {
    expect(UNBILLED_MODULE_KEYS.has('bibliotheque')).toBe(true);
    expect(UNBILLED_MODULE_KEYS.has('studentTimeSheets')).toBe(true);
  });
});

describe('MODULE_CENTER_TYPES / isModuleAllowedForCenterType', () => {
  it('matches the remark matrix for school-support modules', () => {
    expect(MODULE_CENTER_TYPES['etude']).toEqual(['garderie', 'formation']);
    expect(isModuleAllowedForCenterType('etude', 'creche')).toBe(false);
    expect(isModuleAllowedForCenterType('etude', 'jardin')).toBe(false);
    expect(isModuleAllowedForCenterType('etude', 'garderie')).toBe(true);
    expect(isModuleAllowedForCenterType('etude', 'formation')).toBe(true);
  });

  it('marks the new modules universal', () => {
    expect(MODULE_CENTER_TYPES['activites']).toContain('creche');
    expect(MODULE_CENTER_TYPES['competences']).toContain('formation');
  });

  it('base modules are allowed everywhere, Library nowhere', () => {
    for (const key of REQUIRED_MODULE_KEYS) {
      expect(isModuleAllowedForCenterType(key, 'creche')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'formation')).toBe(true);
    }
    expect(isModuleAllowedForCenterType('bibliotheque', 'garderie')).toBe(false);
  });

  it('legacy untyped centers stay permissive', () => {
    expect(isModuleAllowedForCenterType('etude', '')).toBe(true);
  });
});

describe('normalizeEnabledModules — plan preset × center type', () => {
  const baseSorted = [...REQUIRED_MODULE_KEYS].sort();

  it('starter/basic always collapses to base only', () => {
    expect(normalizeEnabledModules(['etude', 'cantine'], 'starter', 'formation').sort()).toEqual(baseSorted);
    expect(normalizeEnabledModules(['etude', 'cantine'], 'basic', 'garderie').sort()).toEqual(baseSorted);
  });

  it('pro preset is scoped to the center type', () => {
    const formationPro = normalizeEnabledModules(undefined, 'pro', 'formation');
    const jardinPro = normalizeEnabledModules(undefined, 'pro', 'jardin');
    expect(formationPro).toContain('etude');
    expect(formationPro).toContain('activites');
    expect(jardinPro).not.toContain('etude');
    expect(jardinPro).toContain('activites');
    for (const key of REQUIRED_MODULE_KEYS) {
      expect(formationPro).toContain(key);
      expect(jardinPro).toContain(key);
    }
  });

  it('growth keeps caller modules but prunes type-ineligible ones', () => {
    const modules = normalizeEnabledModules(['etude', 'cantine', 'transport'], 'growth', 'jardin');
    expect(modules).toContain('cantine');
    expect(modules).toContain('transport');
    expect(modules).not.toContain('etude');
  });

  it('legacy untyped centers keep the permissive behavior', () => {
    const modules = normalizeEnabledModules(['etude', 'cantine'], 'growth', '');
    expect(modules).toContain('etude');
    expect(modules).toContain('cantine');
  });
});

describe('ineligibleModules — the 400-decision helper', () => {
  it('lists only the explicitly-requested forbidden modules', () => {
    expect(ineligibleModules(['etude', 'cantine', 'revision'], 'jardin')).toEqual(['etude', 'revision']);
    expect(ineligibleModules(['cantine', 'activites'], 'creche')).toEqual([]);
  });

  it('never flags base modules', () => {
    expect(ineligibleModules(['scolaire', 'finance', 'studentTimeSheets'], 'creche')).toEqual([]);
  });

  it('untyped centers are never rejected', () => {
    expect(ineligibleModules(['etude', 'anything'], '')).toEqual([]);
  });
});
