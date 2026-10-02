import { describe, it, expect, beforeEach } from 'vitest';
import {
  CENTER_TYPES,
  CENTER_TYPE_LABEL,
  normalizeCenterType,
  isModuleAllowedForCenterType,
  SELECTABLE_MODULE_KEYS,
  BASIC_MODULE_KEYS,
  BASE_MODULE_KEYS,
  ALL_MODULES,
  isModuleHidden,
  isBaseModule,
  calculateModuleTotal,
} from './constants';
import { setModuleCatalog, resetModuleCatalogStore } from '../../utils/moduleCatalogStore';

// Mirrors the seeded DB catalog (modules + center_types + center_type_modules):
// the helpers must derive EVERYTHING from this payload — no hardcoded lists.
const DB_MODULES = [
  { key: 'scolaire', label: 'Scolaire', labelAr: 'مدرسي', isBasic: true, isUnbilled: false, isHidden: false, allowedCenterTypes: [] as string[] },
  { key: 'finance', label: 'Finance', labelAr: 'مالية', isBasic: true, isUnbilled: false, isHidden: false, allowedCenterTypes: [] as string[] },
  { key: 'studentTimeSheets', label: 'Emplois du temps', labelAr: 'سجل الدوام', isBasic: true, isUnbilled: true, isHidden: false, allowedCenterTypes: [] as string[] },
  { key: 'etude', label: 'Étude', labelAr: 'مراجعة مشرفة', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: ['garderie', 'formation'] },
  { key: 'coursParticuliers', label: 'Cours particuliers', labelAr: 'دروس خاصة', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: ['garderie', 'formation'] },
  { key: 'revision', label: 'Révision', labelAr: 'مراجعة الامتحانات', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: ['garderie', 'formation'] },
  { key: 'formations', label: 'Formations', labelAr: 'دورات', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: ['garderie', 'formation'] },
  { key: 'cantine', label: 'Cantine', labelAr: 'مقصف / وجبات', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: [] as string[] },
  { key: 'transport', label: 'Transport', labelAr: 'نقل', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: [] as string[] },
  { key: 'events', label: 'Événements', labelAr: 'مناسبات', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: [] as string[] },
  { key: 'staff', label: 'Personnel', labelAr: 'الموظفون', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: [] as string[] },
  { key: 'activites', label: 'Activités', labelAr: 'أنشطة وبرنامج', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: [] as string[] },
  { key: 'competences', label: 'Compétences', labelAr: 'مهارات ومستويات', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: [] as string[] },
  { key: 'bibliotheque', label: 'Bibliothèque', labelAr: 'مكتبة', isBasic: false, isUnbilled: true, isHidden: true, allowedCenterTypes: [] as string[] },
];

const DB_CENTER_TYPES = [
  { key: 'creche', label: 'Crèche', labelAr: 'حضانة', hint: 'الرضّع · ما قبل الروضة' },
  { key: 'jardin', label: "Jardin d'enfants", labelAr: 'روضة أطفال', hint: 'ما قبل المدرسي · الروضات' },
  { key: 'garderie', label: 'Garderie', labelAr: 'دار الرعاية', hint: 'حضانة نهارية · رعاية بعد الدرس' },
  { key: 'formation', label: 'Centre de formation', labelAr: 'مركز تدريب', hint: 'دعم · دروس · دورات' },
];

beforeEach(() => {
  resetModuleCatalogStore();
  setModuleCatalog({ modules: DB_MODULES, centerTypes: DB_CENTER_TYPES });
});

describe('normalizeCenterType — canonical center types', () => {
  it('maps the 4 canonical keys to themselves', () => {
    expect(normalizeCenterType('creche')).toBe('creche');
    expect(normalizeCenterType('jardin')).toBe('jardin');
    expect(normalizeCenterType('garderie')).toBe('garderie');
    expect(normalizeCenterType('formation')).toBe('formation');
  });

  it('is accent-insensitive (« Crèche » → creche)', () => {
    expect(normalizeCenterType('Crèche')).toBe('creche');
    expect(normalizeCenterType('crèche enfants')).toBe('creche');
  });

  it('recognizes DB variants for all four types', () => {
    expect(normalizeCenterType("Jardin d'enfant")).toBe('jardin');
    expect(normalizeCenterType('Garderie de jour')).toBe('garderie');
    expect(normalizeCenterType('Centre de formation')).toBe('formation');
  });

  it('returns "" for empty and missing values', () => {
    expect(normalizeCenterType('')).toBe('');
    expect(normalizeCenterType(undefined)).toBe('');
  });

  it('passes an unknown type through (normalised) instead of dropping it', () => {
    // Unknown values must survive: a type added to the DB keeps working
    // without a code change (see normalizeCenterType).
    expect(normalizeCenterType('école primaire')).toBe('ecole primaire');
  });
});

describe('CENTER_TYPES — derived from the DB catalog', () => {
  it('contains exactly the 4 supported types', () => {
    expect(CENTER_TYPES().map(ct => ct.key)).toEqual(['creche', 'jardin', 'garderie', 'formation']);
  });

  it('exposes the DB Arabic label and hint for every type', () => {
    for (const ct of CENTER_TYPES()) {
      expect(CENTER_TYPE_LABEL()[ct.key]).toBe(DB_CENTER_TYPES.find(x => x.key === ct.key)?.labelAr);
      expect(ct.hint).toBeTruthy();
    }
  });
});

describe('module catalog accessors — derived from the DB payload', () => {
  it('SELECTABLE_MODULE_KEYS excludes only the hidden module', () => {
    expect(SELECTABLE_MODULE_KEYS()).not.toContain('bibliotheque');
    expect(SELECTABLE_MODULE_KEYS()).toContain('etude');
    expect(SELECTABLE_MODULE_KEYS().length).toBe(DB_MODULES.length - 1);
  });

  it('BASIC_MODULE_KEYS / BASE_MODULE_KEYS mirror the isBasic rows', () => {
    expect(BASIC_MODULE_KEYS()).toEqual(['scolaire', 'finance', 'studentTimeSheets']);
    expect(BASE_MODULE_KEYS()).toEqual(['scolaire', 'finance']);
    expect(isBaseModule('studentTimeSheets')).toBe(true);
    expect(isBaseModule('etude')).toBe(false);
  });

  it('ALL_MODULES carries the DB Arabic labels', () => {
    const scolaire = ALL_MODULES().find(m => m.key === 'scolaire');
    expect(scolaire?.label).toBe('مدرسي');
  });

  it('isModuleHidden reads the isHidden flag', () => {
    expect(isModuleHidden('bibliotheque')).toBe(true);
    expect(isModuleHidden('etude')).toBe(false);
  });
});

describe('isModuleAllowedForCenterType — the DB eligibility matrix', () => {
  it('allows base modules for every type (and untyped centers)', () => {
    for (const key of ['scolaire', 'finance', 'studentTimeSheets']) {
      expect(isModuleAllowedForCenterType(key, 'creche')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'jardin')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'garderie')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'formation')).toBe(true);
      expect(isModuleAllowedForCenterType(key, '')).toBe(true);
    }
  });

  it('forbids school-support modules for creche and jardin (center_type_modules rows)', () => {
    for (const key of ['etude', 'coursParticuliers', 'revision', 'formations']) {
      expect(isModuleAllowedForCenterType(key, 'creche')).toBe(false);
      expect(isModuleAllowedForCenterType(key, 'jardin')).toBe(false);
      expect(isModuleAllowedForCenterType(key, 'garderie')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'formation')).toBe(true);
    }
  });

  it('allows universal modules (empty allowedCenterTypes) for every type', () => {
    for (const key of ['cantine', 'transport', 'events', 'staff', 'activites', 'competences']) {
      expect(isModuleAllowedForCenterType(key, 'creche')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'jardin')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'garderie')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'formation')).toBe(true);
    }
  });

  it('keeps the removed Library module forbidden everywhere', () => {
    expect(isModuleAllowedForCenterType('bibliotheque', 'garderie')).toBe(false);
    expect(isModuleAllowedForCenterType('bibliotheque', 'formation')).toBe(false);
  });

  it('stays permissive for legacy untyped centers', () => {
    expect(isModuleAllowedForCenterType('etude', '')).toBe(true);
  });

  it('rejects unknown module keys for typed centers', () => {
    expect(isModuleAllowedForCenterType('moduleFantome', 'creche')).toBe(false);
  });
});

describe('calculateModuleTotal — unbilled modules from the DB never count', () => {
  const prices: Record<string, number> = { scolaire: 30, finance: 25, etude: 15, bibliotheque: 12, studentTimeSheets: 99 };

  it('skips isUnbilled rows even when enabled', () => {
    expect(calculateModuleTotal(['scolaire', 'finance', 'studentTimeSheets'], prices)).toBe(55);
    expect(calculateModuleTotal(['scolaire', 'finance', 'bibliotheque'], prices)).toBe(55);
  });

  it('sums every billed module', () => {
    expect(calculateModuleTotal(['scolaire', 'finance', 'etude'], prices)).toBe(70);
  });
});
