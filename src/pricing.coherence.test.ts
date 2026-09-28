/**
 * Landing catalog coherence — the public pricing simulator is the only
 * commercial surface in this deployment. The cross-checks that matter here:
 * the base/add-on partition stays disjoint, presets derive their own tiers,
 * and the type-compatibility matrix covers every catalog key.
 */
import { createElement } from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import LandingPage from './components/LandingPage';
import {
  ALL_MODULES,
  ADDON_MODULES,
  BASE_MODULES,
  BASE_KEYS,
  PLAN_PRESET_MODULES,
  modulesForPlan,
  derivePlanFromModules
} from './utils/pricing';
import { isModuleCompatible, moduleCenterTypes } from './utils/centerType';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchPublicModulePricesApi: vi.fn().mockResolvedValue({
      scolaire: 100, finance: 50, studentTimeSheets: 0, etude: 80, coursParticuliers: 60,
      revision: 40, formations: 40, cantine: 30, transport: 30, events: 20, staff: 70,
      activites: 45, competences: 45
    }),
    fetchActiveAdvertisementsApi: vi.fn().mockResolvedValue([]),
    submitDemoRequestApi: vi.fn().mockResolvedValue(undefined)
  };
});

beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } root = null; rootMargin = ''; thresholds: number[] = []; }
  (globalThis as any).IntersectionObserver = IO;
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!(globalThis as any).matchMedia) {
    (globalThis as any).matchMedia = () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  }
});

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a description by a distinctive prefix (some surfaces append a badge). */
const descriptionPrefix = (desc: string) => new RegExp(escapeRe(desc.slice(0, 24)));

describe('C10 — the landing renders one shared catalog', () => {
  it('the landing simulator renders every catalog entry with its label and description', async () => {
    render(createElement(LandingPage, { onOpenLogin: vi.fn() }));
    // the landing shows the catalog in several sections, so the label repeats
    await screen.findAllByText(ALL_MODULES[0].label);
    for (const m of ALL_MODULES) {
      expect(screen.getAllByText(m.label).length, `landing must list ${m.key}`).toBeGreaterThan(0);
      expect(screen.getAllByText(descriptionPrefix(m.description)).length, `landing must describe ${m.key}`).toBeGreaterThan(0);
    }
  });

  it('partitions the catalog into disjoint base and add-on sets', () => {
    const baseKeys = BASE_MODULES.map(m => m.key);
    const addonKeys = ADDON_MODULES.map(m => m.key);
    expect([...baseKeys].sort()).toEqual([...BASE_KEYS].sort());
    expect(baseKeys.some(k => addonKeys.includes(k))).toBe(false);
    expect([...baseKeys, ...addonKeys].sort()).toEqual(ALL_MODULES.map(m => m.key).sort());
  });
});

describe('C10 — presets and derivation agree with the catalog', () => {
  it('starter excludes both growth/pro modules; growth and pro include them', () => {
    expect(PLAN_PRESET_MODULES.starter).not.toContain('activites');
    expect(PLAN_PRESET_MODULES.starter).not.toContain('competences');
    for (const key of ['activites', 'competences']) {
      expect(PLAN_PRESET_MODULES.growth, `growth must preset ${key}`).toContain(key);
      expect(PLAN_PRESET_MODULES.pro, `pro must preset ${key}`).toContain(key);
    }
    // the base tier stays exactly the base keys
    expect([...PLAN_PRESET_MODULES.starter].sort()).toEqual([...BASE_KEYS].sort());
    // pro is the whole catalog
    expect([...PLAN_PRESET_MODULES.pro].sort()).toEqual(ALL_MODULES.map(m => m.key).sort());
    // no preset references a key the catalog does not sell
    const catalogKeys = new Set(ALL_MODULES.map(m => m.key));
    for (const [tier, keys] of Object.entries(PLAN_PRESET_MODULES)) {
      for (const key of keys) {
        expect(catalogKeys.has(key), `${tier} presets '${key}' which is not in the catalog`).toBe(true);
      }
    }
  });

  it('derives the tier from the selection for representative combinations', () => {
    expect(derivePlanFromModules([...BASE_KEYS])).toBe('starter');
    expect(derivePlanFromModules([...BASE_KEYS, 'activites'])).toBe('growth');
    expect(derivePlanFromModules([...BASE_KEYS, 'competences'])).toBe('growth');
    expect(derivePlanFromModules([...BASE_KEYS, 'cantine'])).toBe('growth');
    expect(derivePlanFromModules(ALL_MODULES.map(m => m.key))).toBe('pro');
  });

  it('every tier preset is itself a valid selection for its tier', () => {
    expect(derivePlanFromModules(PLAN_PRESET_MODULES.starter)).toBe('starter');
    expect(derivePlanFromModules(PLAN_PRESET_MODULES.growth)).toBe('growth');
    expect(derivePlanFromModules(PLAN_PRESET_MODULES.pro)).toBe('pro');
  });

  it('modulesForPlan falls back to starter for unknown plans', () => {
    expect(modulesForPlan('starter')).toEqual(PLAN_PRESET_MODULES.starter);
    expect(modulesForPlan(undefined)).toEqual(PLAN_PRESET_MODULES.starter);
    expect(modulesForPlan('mystery')).toEqual(PLAN_PRESET_MODULES.starter);
    expect(modulesForPlan('pro')).toEqual(PLAN_PRESET_MODULES.pro);
  });
});

// ─── Type-aware derivation coherence ───────────────────────────────────────

describe('C10 — type-aware derivation', () => {
  it('freezes the no-type derivation verdicts as the baseline', () => {
    expect(derivePlanFromModules([...BASE_KEYS])).toBe('starter');
    expect(derivePlanFromModules([...BASE_KEYS, 'activites'])).toBe('growth');
    expect(derivePlanFromModules([...BASE_KEYS, 'competences'])).toBe('growth');
    expect(derivePlanFromModules(ALL_MODULES.map(m => m.key))).toBe('pro');
  });

  it('every filtered preset derives its own tier for creche (preset = applicable set)', () => {
    for (const [tier, preset] of Object.entries(PLAN_PRESET_MODULES) as [string, string[]][]) {
      const filtered = modulesForPlan(tier, 'creche');
      expect(derivePlanFromModules(filtered, 'creche'), `tier ${tier}`).toBe(tier);
    }
  });

  it('modulesForPlan(pro, creche) ⊆ catalog with only isModuleCompatible-compatible keys', () => {
    const catalogKeys = ALL_MODULES.map(m => m.key);
    for (const key of modulesForPlan('pro', 'creche')) {
      expect(catalogKeys, key).toContain(key);
      expect(isModuleCompatible(key, 'creche'), `${key} must be creche-compatible`).toBe(true);
    }
    for (const study of ['etude', 'coursParticuliers', 'revision', 'formations']) {
      expect(modulesForPlan('pro', 'creche'), study).not.toContain(study);
    }
  });

  it('the compatibility matrix covers every catalog key — no drift', () => {
    for (const m of ALL_MODULES) {
      expect(Array.isArray(moduleCenterTypes[m.key]), `moduleCenterTypes entry for ${m.key}`).toBe(true);
    }
  });
});
