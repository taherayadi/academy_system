import { describe, it, expect } from 'vitest';
import { ALL_MODULES, PLAN_PRESET_MODULES, derivePlanFromModules, modulesForPlan, applicableModuleKeys, BASE_KEYS } from './pricing';

const NEW_KEYS = ['activites', 'competences'];

describe('pricing catalog: new modules (US8)', () => {
  it('lists both new modules in ALL_MODULES', () => {
    const keys = ALL_MODULES.map(m => m.key);
    expect(keys).toContain('activites');
    expect(keys).toContain('competences');
  });

  it('excludes both new modules from the starter preset', () => {
    expect(PLAN_PRESET_MODULES.starter.some(k => NEW_KEYS.includes(k))).toBe(false);
  });

  it('includes both new modules in the growth and pro presets', () => {
    for (const preset of ['growth', 'pro'] as const) {
      for (const key of NEW_KEYS) {
        expect(PLAN_PRESET_MODULES[preset], `${preset} must include ${key}`).toContain(key);
      }
    }
  });

  it('derives growth for base + the two new modules, pro for the full set', () => {
    const basePlusNew = [...BASE_KEYS, 'activites', 'competences'];
    expect(derivePlanFromModules(basePlusNew)).toBe('growth');
    expect(derivePlanFromModules(ALL_MODULES.map(m => m.key))).toBe('pro');
  });
});

// ─── Revision C (remark 7): type-aware plan derivation ────────────────────

const ALL_KEYS = ALL_MODULES.map(m => m.key);

/** The 9 modules applicable to crèche/jardin per the remarks matrix (catalog order). */
const CRECHE_KEYS = [
  'scolaire', 'finance', 'studentTimeSheets',            // base
  'cantine', 'transport', 'events', 'staff', 'activites', 'competences'
];

describe('applicableModuleKeys (revision C, remark 7)', () => {
  it('offers crèche exactly the 9 type-compatible keys — never the study modules', () => {
    expect(applicableModuleKeys('creche')).toEqual(CRECHE_KEYS);
    expect(applicableModuleKeys('jardin')).toEqual(CRECHE_KEYS);
    for (const study of ['etude', 'coursParticuliers', 'revision', 'formations']) {
      expect(applicableModuleKeys('creche'), study).not.toContain(study);
    }
  });

  it('offers garderie/formation the full catalog', () => {
    expect(applicableModuleKeys('garderie')).toEqual(ALL_KEYS);
    expect(applicableModuleKeys('formation')).toEqual(ALL_KEYS);
  });

  it('falls back to the full catalog for unknown/empty/null types (legacy passthrough)', () => {
    expect(applicableModuleKeys(undefined)).toEqual(ALL_KEYS);
    expect(applicableModuleKeys(null)).toEqual(ALL_KEYS);
    expect(applicableModuleKeys('')).toEqual(ALL_KEYS);
    expect(applicableModuleKeys('mystery')).toEqual(ALL_KEYS);
  });
});

describe('derivePlanFromModules with a center type (revision C, remark 7)', () => {
  it('derives Pro for a crèche selecting all applicable modules', () => {
    expect(derivePlanFromModules(CRECHE_KEYS, 'creche')).toBe('pro');
    expect(derivePlanFromModules(CRECHE_KEYS, 'jardin')).toBe('pro');
  });

  it('derives Growth for a crèche with any addon, Basic for base only', () => {
    expect(derivePlanFromModules([...BASE_KEYS, 'cantine'], 'creche')).toBe('growth');
    expect(derivePlanFromModules([...BASE_KEYS], 'creche')).toBe('starter');
  });

  it('keeps the full-catalog verdict for school-bearing types', () => {
    expect(derivePlanFromModules(ALL_KEYS, 'formation')).toBe('pro');
    expect(derivePlanFromModules(ALL_KEYS, 'garderie')).toBe('pro');
  });

  it('freezes the no-type verdicts (FR-006 baseline: byte-identical to pre-revision-C)', () => {
    expect(derivePlanFromModules([...BASE_KEYS])).toBe('starter');
    expect(derivePlanFromModules([...BASE_KEYS, 'activites'])).toBe('growth');
    expect(derivePlanFromModules([...BASE_KEYS, 'competences'])).toBe('growth');
    expect(derivePlanFromModules([...BASE_KEYS, 'cantine'])).toBe('growth');
    expect(derivePlanFromModules(ALL_KEYS)).toBe('pro');
    // The crèche-all-applicable selection must NOT derive pro without a type —
    // the legacy global comparison is preserved when no type is given.
    expect(derivePlanFromModules(CRECHE_KEYS)).toBe('growth');
  });
});

describe('modulesForPlan with a center type (revision C, remark 7)', () => {
  it('filters the Pro preset to the type-applicable set', () => {
    expect(modulesForPlan('pro', 'creche')).toEqual(CRECHE_KEYS);
    expect(modulesForPlan('pro', 'formation')).toEqual(ALL_KEYS);
  });

  it('filters the Growth preset (drops study modules for crèche)', () => {
    expect(modulesForPlan('growth', 'creche')).toEqual([...BASE_KEYS, 'activites', 'competences']);
    expect(modulesForPlan('growth', 'formation')).toEqual(PLAN_PRESET_MODULES.growth);
  });

  it('keeps the starter preset and the fallbacks unchanged', () => {
    expect(modulesForPlan('starter', 'creche')).toEqual(PLAN_PRESET_MODULES.starter);
    expect(modulesForPlan('mystery', 'creche')).toEqual(PLAN_PRESET_MODULES.starter);
    expect(modulesForPlan(undefined, 'creche')).toEqual(PLAN_PRESET_MODULES.starter);
  });

  it('returns today\'s presets verbatim when no type is given (FR-006 baseline)', () => {
    expect(modulesForPlan('starter')).toEqual(PLAN_PRESET_MODULES.starter);
    expect(modulesForPlan('growth')).toEqual(PLAN_PRESET_MODULES.growth);
    expect(modulesForPlan('pro')).toEqual(PLAN_PRESET_MODULES.pro);
    expect(modulesForPlan(undefined)).toEqual(PLAN_PRESET_MODULES.starter);
    expect(modulesForPlan('mystery')).toEqual(PLAN_PRESET_MODULES.starter);
  });
});
