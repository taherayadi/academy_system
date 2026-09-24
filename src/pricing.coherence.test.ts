/**
 * Feature 006 — US3: commercial coherence (matrix C10).
 *
 * One catalog story across surfaces, presets, derivation and module reality.
 * The novel cross-check is the phantom-key assertion: a module listed (and
 * sellable) that no sidebar tab can enable is exactly the "listed but not
 * buildable" failure no per-feature suite catches.
 */
import { createElement } from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import LandingPage from './components/LandingPage';
import RenewalModule from './components/RenewalModule';
import {
  ALL_MODULES,
  ADDON_MODULES,
  BASE_MODULES,
  BASE_KEYS,
  PLAN_PRESET_MODULES,
  modulesForPlan,
  derivePlanFromModules
} from './utils/pricing';
import { TAB_MODULE } from './App';
import { FORMATION_CONFIG, makeCenter } from './testing/programConfig';

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
    submitDemoRequestApi: vi.fn().mockResolvedValue(undefined),
    fetchRenewalRequestsApi: vi.fn().mockResolvedValue({ requests: [], history: [] })
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

const NEW_KEYS = ['activites', 'competences'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a description by a distinctive prefix (some surfaces append a badge). */
const descriptionPrefix = (desc: string) => new RegExp(escapeRe(desc.slice(0, 24)));

describe('C10 — landing and renewal render one shared catalog', () => {
  it('the landing simulator renders every catalog entry with its label and description', async () => {
    render(createElement(LandingPage, { onOpenLogin: vi.fn() }));
    // the landing shows the catalog in several sections, so the label repeats
    await screen.findAllByText(ALL_MODULES[0].label);
    for (const m of ALL_MODULES) {
      expect(screen.getAllByText(m.label).length, `landing must list ${m.key}`).toBeGreaterThan(0);
      expect(screen.getAllByText(descriptionPrefix(m.description)).length, `landing must describe ${m.key}`).toBeGreaterThan(0);
    }
  });

  it('the renewal module renders exactly the same entry set', async () => {
    render(createElement(RenewalModule, { center: makeCenter(FORMATION_CONFIG) }));
    await screen.findByText(ALL_MODULES[0].label);
    for (const m of ALL_MODULES) {
      expect(screen.getAllByText(m.label).length, `renewal must list ${m.key}`).toBeGreaterThan(0);
    }
    // both surfaces partition the same catalog the same way
    expect(BASE_MODULES.length + ADDON_MODULES.length).toBe(ALL_MODULES.length);
  });

  it('partitions the catalog into disjoint base and add-on sets', () => {
    const baseKeys = BASE_MODULES.map(m => m.key);
    const addonKeys = ADDON_MODULES.map(m => m.key);
    expect([...baseKeys].sort()).toEqual([...BASE_KEYS].sort());
    expect(baseKeys.some(k => addonKeys.includes(k))).toBe(false);
    expect([...baseKeys, ...addonKeys].sort()).toEqual(ALL_MODULES.map(m => m.key).sort());
  });

  it('every catalog key maps to a real enableable module — no phantom entries', () => {
    const enableable = new Set(Object.values(TAB_MODULE));
    for (const m of ALL_MODULES) {
      expect(enableable.has(m.key), `catalog key '${m.key}' has no tab that can enable it`).toBe(true);
    }
  });
});

describe('C10 — presets and derivation agree with the catalog', () => {
  it('starter excludes both new modules; growth and pro include them', () => {
    expect(PLAN_PRESET_MODULES.starter).not.toContain('activites');
    expect(PLAN_PRESET_MODULES.starter).not.toContain('competences');
    for (const key of NEW_KEYS) {
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
