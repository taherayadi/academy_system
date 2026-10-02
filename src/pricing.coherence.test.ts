/**
 * Landing catalog coherence — the public pricing simulator is the only
 * commercial surface in this deployment. The catalog now comes from the D1
 * tables (`modules`, `center_types`, `center_type_modules`, `module_prices`)
 * via GET /api/public-pricing; these cross-checks verify the partition, the
 * presets, the derivation and the type-compatibility coverage against that
 * DB-served catalog.
 */
import { createElement } from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import LandingPage from './components/LandingPage';
import {
  allModules,
  addonModules,
  baseModules,
  BASE_KEYS,
  planPresetModules,
  modulesForPlan,
  derivePlanFromModules
} from './utils/pricing';
import { isModuleCompatible, moduleCenterTypes } from './utils/centerType';
import { setCatalog, __resetCatalogForTests } from './utils/catalog';
import type { Catalog } from './utils/catalog';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchPublicPricingApi: vi.fn().mockResolvedValue({
      schoolYear: '2026/2027',
      prices: [
        { module_key: 'scolaire', price: 100 }, { module_key: 'finance', price: 50 },
        { module_key: 'studentTimeSheets', price: 0 }, { module_key: 'etude', price: 80 },
        { module_key: 'coursParticuliers', price: 60 }, { module_key: 'revision', price: 40 },
        { module_key: 'formations', price: 40 }, { module_key: 'cantine', price: 30 },
        { module_key: 'transport', price: 30 }, { module_key: 'events', price: 20 },
        { module_key: 'staff', price: 70 }, { module_key: 'activites', price: 45 },
        { module_key: 'competences', price: 45 }
      ],
      modules: [
        { key: 'scolaire', label: 'Scolaire & Notes', labelAr: 'الدراسة والنقاط', icon: 'GraduationCap', description: 'Fiches élèves, notes, moyennes et bulletins par trimestre.', features: ['Fiches élèves complètes : parents, fratries, autorisations', 'Notes par trimestre — devoirs et synthèses', 'Moyennes automatiques et élèves à risque', 'Réinscriptions rapides depuis une année précédente'], mock: 'bulletin', isBasic: true, isUnbilled: false, isHidden: false },
        { key: 'finance', label: 'Finance & Paiements', labelAr: 'المالية والمدفوعات', icon: 'DollarSign', description: 'Reçus, encaissements, chèques et statistiques de revenus.', features: ['Carnet de paiements par élève avec reçus', 'Répartition des revenus par service', 'Gestion des chèques et de leur encaissement', 'Dépenses et synthèses financières mensuelles'], mock: 'revenue', isBasic: true, isUnbilled: false, isHidden: false },
        { key: 'studentTimeSheets', label: 'Jd. Horaires', labelAr: 'جداول الأوقات', icon: 'Clock', description: 'Pointage journalier des entrées/sorties des élèves — offert avec la base.', features: [], mock: '', isBasic: true, isUnbilled: true, isHidden: false },
        { key: 'etude', label: 'Étude Surveillée', labelAr: 'الدراسة المراقبة', icon: 'BookOpen', description: 'Planning hebdomadaire, présences, horaires.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false },
        { key: 'coursParticuliers', label: 'Cours Particuliers', labelAr: 'دروس خصوصية', icon: 'Users', description: 'Cours 1-à-1, tarification, enseignants.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false },
        { key: 'revision', label: 'Révision Examens', labelAr: 'مراجعة الامتحانات', icon: 'Award', description: 'Séances de révision, groupes, présences.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false },
        { key: 'formations', label: 'Formations', labelAr: 'التكوينات', icon: 'Sparkles', description: 'Ateliers, stages vacances, plannings.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false },
        { key: 'cantine', label: 'Cantine & Repas', labelAr: 'المطعم والوجبات', icon: 'Utensils', description: 'Menus hebdomadaires, abonnements, pointage.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false },
        { key: 'transport', label: 'Transport Scolaire', labelAr: 'النقل المدرسي', icon: 'Bus', description: 'Circuits, feuilles de route, chauffeurs.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false },
        { key: 'events', label: 'Événements & Sorties', labelAr: 'الفعاليات والخروجات', icon: 'Calendar', description: 'Inscriptions, sorties scolaires.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false },
        { key: 'staff', label: 'Personnel & Salaires', labelAr: 'الطاقم والرواتب', icon: 'ShieldCheck', description: 'Équipe, paie, pointages, congés.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false },
        { key: 'activites', label: 'Activités & Planning', labelAr: 'الأنشطة والبرنامج', icon: 'Shapes', description: 'Planning hebdomadaire des activités : motricité, art, musique, jeu.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false },
        { key: 'competences', label: 'Compétences & Skills', labelAr: 'الكفاءات والمهارات', icon: 'Brain', description: 'Catalogue de compétences et évaluations par enfant avec rapport imprimable.', features: [], mock: '', isBasic: false, isUnbilled: false, isHidden: false }
      ],
      centerTypes: [
        { key: 'jardin', label: "Jardin d'enfants", labelAr: 'روضة أطفال', hint: '', hintAr: '' },
        { key: 'creche', label: 'Crèche', labelAr: 'حضانة', hint: '', hintAr: '' },
        { key: 'garderie', label: 'Garderie', labelAr: 'حراسة أطفال', hint: '', hintAr: '' },
        { key: 'formation', label: 'Centre de formation', labelAr: 'مركز تكوين', hint: '', hintAr: '' }
      ],
      moduleCenterTypes: {
        scolaire: ['jardin', 'creche', 'garderie', 'formation'],
        finance: ['jardin', 'creche', 'garderie', 'formation'],
        studentTimeSheets: ['jardin', 'creche', 'garderie', 'formation'],
        etude: ['garderie', 'formation'],
        coursParticuliers: ['garderie', 'formation'],
        revision: ['garderie', 'formation'],
        formations: ['garderie', 'formation'],
        cantine: ['jardin', 'creche', 'garderie', 'formation'],
        transport: ['jardin', 'creche', 'garderie', 'formation'],
        events: ['jardin', 'creche', 'garderie', 'formation'],
        staff: ['jardin', 'creche', 'garderie', 'formation'],
        activites: ['jardin', 'creche', 'garderie', 'formation'],
        competences: ['jardin', 'creche', 'garderie', 'formation']
      }
    }),
    fetchActiveAdvertisementsApi: vi.fn().mockResolvedValue([]),
    submitDemoRequestApi: vi.fn().mockResolvedValue(undefined)
  };
});

/** Mirror of the mocked payload, installed as the active catalog for pure tests. */
const MOCK_CATALOG: Catalog = {
  schoolYear: '2026/2027',
  prices: { scolaire: 100, finance: 50, studentTimeSheets: 0, etude: 80, coursParticuliers: 60, revision: 40, formations: 40, cantine: 30, transport: 30, events: 20, staff: 70, activites: 45, competences: 45 },
  modules: [],
  centerTypes: [],
  moduleCenterTypes: {},
};

beforeAll(async () => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } root = null; rootMargin = ''; thresholds: number[] = []; }
  (globalThis as any).IntersectionObserver = IO;
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!(globalThis as any).matchMedia) {
    (globalThis as any).matchMedia = () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  }
  // Build the pure-test catalog from the same mocked payload the component gets.
  const { fetchPublicPricingApi } = await import('./api');
  const p = await fetchPublicPricingApi();
  MOCK_CATALOG.modules = p.modules;
  MOCK_CATALOG.centerTypes = p.centerTypes;
  MOCK_CATALOG.moduleCenterTypes = p.moduleCenterTypes;
});

beforeEach(() => {
  localStorage.clear();
  cleanup();
  setCatalog(MOCK_CATALOG);
});

afterEach(() => {
  __resetCatalogForTests();
});

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a description by a distinctive prefix (some surfaces append a badge). */
const descriptionPrefix = (desc: string) => new RegExp(escapeRe(desc.slice(0, 24)));

describe('C10 — the landing renders one shared catalog', () => {
  it('the landing simulator renders every catalog entry with its label and description', async () => {
    render(createElement(LandingPage, { onOpenLogin: vi.fn() }));
    // the landing shows the catalog in several sections, so the label repeats
    await screen.findAllByText(allModules()[0].label);
    for (const m of allModules()) {
      expect(screen.getAllByText(m.label).length, `landing must list ${m.key}`).toBeGreaterThan(0);
      expect(screen.getAllByText(descriptionPrefix(m.description)).length, `landing must describe ${m.key}`).toBeGreaterThan(0);
    }
  });

  it('the availability line reflects center_type_modules, not every type', async () => {
    render(createElement(LandingPage, { onOpenLogin: vi.fn() }));
    await screen.findAllByText(allModules()[0].label);
    // The matrix serves etude/coursParticuliers/revision/formations to
    // garderie/formation ONLY, and the all-type modules to all four types.
    const lines = screen.getAllByText(/Disponible :/).map(el => el.textContent || '');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some(l => /Disponible : Garderie · Centre de formation/.test(l))).toBe(true);
    expect(lines.some(l => /Disponible : Jardin d'enfants · Crèche · Garderie · Centre de formation/.test(l))).toBe(true);
  });

  it('partitions the catalog into disjoint base and add-on sets', () => {
    const baseKeys = baseModules().map(m => m.key);
    const addonKeys = addonModules().map(m => m.key);
    expect([...baseKeys].sort()).toEqual([...BASE_KEYS].sort());
    expect(baseKeys.some(k => addonKeys.includes(k))).toBe(false);
    expect([...baseKeys, ...addonKeys].sort()).toEqual(allModules().map(m => m.key).sort());
  });
});

describe('C10 — presets and derivation agree with the catalog', () => {
  it('starter = base only; growth = base + one add-on; pro = whole catalog', () => {
    const baseKeys = [...BASE_KEYS];
    const addonKeys = addonModules().map(m => m.key);
    // starter is exactly the base keys
    expect([...planPresetModules('starter')].sort()).toEqual(baseKeys.sort());
    // growth is the base plus exactly one add-on
    const growth = planPresetModules('growth');
    expect(growth.length).toBe(baseKeys.length + 1);
    for (const key of baseKeys) expect(growth, `growth keeps base ${key}`).toContain(key);
    expect(addonKeys, 'growth adds an add-on').toContain(growth.find(k => !baseKeys.includes(k)));
    // pro is the whole catalog
    expect([...planPresetModules('pro')].sort()).toEqual(allModules().map(m => m.key).sort());
    // no preset references a key the catalog does not sell
    const catalogKeys = new Set(allModules().map(m => m.key));
    for (const tier of ['starter', 'growth', 'pro']) {
      for (const key of planPresetModules(tier)) {
        expect(catalogKeys.has(key), `${tier} presets '${key}' which is not in the catalog`).toBe(true);
      }
    }
  });

  it('derives the tier from the selection for representative combinations', () => {
    expect(derivePlanFromModules([...BASE_KEYS])).toBe('starter');
    expect(derivePlanFromModules([...BASE_KEYS, 'activites'])).toBe('growth');
    expect(derivePlanFromModules([...BASE_KEYS, 'competences'])).toBe('growth');
    expect(derivePlanFromModules([...BASE_KEYS, 'cantine'])).toBe('growth');
    expect(derivePlanFromModules(allModules().map(m => m.key))).toBe('pro');
  });

  it('every tier preset is itself a valid selection for its tier', () => {
    expect(derivePlanFromModules(planPresetModules('starter'))).toBe('starter');
    expect(derivePlanFromModules(planPresetModules('growth'))).toBe('growth');
    expect(derivePlanFromModules(planPresetModules('pro'))).toBe('pro');
  });

  it('modulesForPlan falls back to starter for unknown plans', () => {
    expect(modulesForPlan('starter')).toEqual(planPresetModules('starter'));
    expect(modulesForPlan(undefined)).toEqual(planPresetModules('starter'));
    expect(modulesForPlan('mystery')).toEqual(planPresetModules('starter'));
    expect(modulesForPlan('pro')).toEqual(planPresetModules('pro'));
  });
});

// ─── Type-aware derivation coherence ───────────────────────────────────────

describe('C10 — type-aware derivation', () => {
  it('freezes the no-type derivation verdicts as the baseline', () => {
    expect(derivePlanFromModules([...BASE_KEYS])).toBe('starter');
    expect(derivePlanFromModules([...BASE_KEYS, 'activites'])).toBe('growth');
    expect(derivePlanFromModules([...BASE_KEYS, 'competences'])).toBe('growth');
    expect(derivePlanFromModules(allModules().map(m => m.key))).toBe('pro');
  });

  it('every filtered preset derives its own tier for creche (preset = applicable set)', () => {
    for (const tier of ['starter', 'growth', 'pro']) {
      const filtered = modulesForPlan(tier, 'creche');
      expect(derivePlanFromModules(filtered, 'creche'), `tier ${tier}`).toBe(tier);
    }
  });

  it('modulesForPlan(pro, creche) ⊆ catalog with only isModuleCompatible-compatible keys', () => {
    const catalogKeys = allModules().map(m => m.key);
    for (const key of modulesForPlan('pro', 'creche')) {
      expect(catalogKeys, key).toContain(key);
      expect(isModuleCompatible(key, 'creche'), `${key} must be creche-compatible`).toBe(true);
    }
    for (const study of ['etude', 'coursParticuliers', 'revision', 'formations']) {
      expect(modulesForPlan('pro', 'creche'), study).not.toContain(study);
    }
  });

  it('the compatibility matrix covers every catalog key — no drift', () => {
    for (const m of allModules()) {
      expect(Array.isArray(moduleCenterTypes[m.key]) && moduleCenterTypes[m.key].length > 0, `moduleCenterTypes entry for ${m.key}`).toBe(true);
    }
  });
});
