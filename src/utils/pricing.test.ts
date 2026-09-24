import { describe, it, expect } from 'vitest';
import { ALL_MODULES, PLAN_PRESET_MODULES, derivePlanFromModules, BASE_KEYS } from './pricing';

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
