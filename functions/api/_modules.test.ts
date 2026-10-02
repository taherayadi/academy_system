import { describe, it, expect } from 'vitest';
import {
  normalizeCenterType,
  isValidCenterType,
  loadModuleCatalog,
  isBaseModuleInCatalog,
  isModuleHiddenInCatalog,
  isModuleAllowedInCatalog,
  normalizeEnabledModulesInCatalog,
  ineligibleModulesInCatalog,
  type ModuleCatalog,
} from './_modules';

// ─── DB fixture data (mirrors the seeded modules + center_type_modules rows) ─
const BOOTSTRAP_MODULE_KEYS = [
  'scolaire', 'finance', 'etude', 'coursParticuliers', 'revision',
  'formations', 'cantine', 'transport', 'events',
  'studentTimeSheets', 'staff', 'activites', 'competences',
];
const BOOTSTRAP_BASE_KEYS = ['scolaire', 'finance', 'studentTimeSheets'];
const BOOTSTRAP_UNBILLED = new Set(['studentTimeSheets', 'bibliotheque']);
const BOOTSTRAP_SCHOOL_SUPPORT = ['etude', 'coursParticuliers', 'revision', 'formations'];
const ALL_CENTER_TYPES = ['creche', 'jardin', 'garderie', 'formation'] as const;
const BOOTSTRAP_MODULE_CENTER_TYPES: Record<string, readonly string[]> = {
  ...Object.fromEntries(
    BOOTSTRAP_MODULE_KEYS
      .filter(k => !BOOTSTRAP_SCHOOL_SUPPORT.includes(k))
      .map(k => [k, [...ALL_CENTER_TYPES]])
  ),
  ...Object.fromEntries(BOOTSTRAP_SCHOOL_SUPPORT.map(k => [k, ['garderie', 'formation']])),
};

describe('normalizeCenterType (server twin)', () => {
  it('maps canonical keys and DB variants, accent-insensitively', () => {
    expect(normalizeCenterType('creche')).toBe('creche');
    expect(normalizeCenterType('Crèche')).toBe('creche');
    expect(normalizeCenterType('garderie')).toBe('garderie');
    expect(normalizeCenterType("Jardin d'enfant")).toBe('jardin');
    expect(normalizeCenterType('Centre de formation')).toBe('formation');
    // Unknown types pass through (trimmed + lowercased) so new DB types work automatically
    expect(normalizeCenterType('primaire')).toBe('primaire');
    expect(normalizeCenterType('')).toBe('');
    expect(normalizeCenterType('other')).toBe('');
  });
});

describe('isValidCenterType — sync non-empty guard', () => {
  it('accepts any non-empty string (DB is the authoritative gate via isValidCenterTypeInDb)', () => {
    expect(isValidCenterType('creche')).toBe(true);
    expect(isValidCenterType('jardin')).toBe(true);
    expect(isValidCenterType('garderie')).toBe(true);
    expect(isValidCenterType('formation')).toBe(true);
    expect(isValidCenterType('garderie ')).toBe(true); // trimmed by isValidCenterType
    expect(isValidCenterType('maternelle')).toBe(true); // passes sync; DB rejects unknown
    expect(isValidCenterType('')).toBe(false);
    expect(isValidCenterType(null)).toBe(false);
  });
});

describe('module catalog', () => {
  it('contains the two new modules and never the Library', () => {
    expect(BOOTSTRAP_MODULE_KEYS).toContain('activites');
    expect(BOOTSTRAP_MODULE_KEYS).toContain('competences');
    expect(BOOTSTRAP_MODULE_KEYS).not.toContain('bibliotheque');
  });

  it('keeps Library unbilled so legacy prices never re-enter a total', () => {
    expect(BOOTSTRAP_UNBILLED.has('bibliotheque')).toBe(true);
    expect(BOOTSTRAP_UNBILLED.has('studentTimeSheets')).toBe(true);
  });
});

// ─── DB-driven catalog ──────────────────────────────────────────────────────
// Mirrors the real DB state: 14 module rows with isBasic on the 3 base keys,
// center_type_modules eligibility seeded per type (school-support modules are
// absent from creche/jardin rows).
const fakeDb = {
  prepare(sql: string) {
    const stmt = {
      bind() { return stmt; },
      async first() { return null; },
      async all() {
        if (sql.includes('FROM modules')) {
          return {
            results: BOOTSTRAP_MODULE_KEYS.map(k => ({
              key: k,
              isBasic: BOOTSTRAP_BASE_KEYS.includes(k) ? 1 : 0,
            })),
          };
        }
        if (sql.includes('FROM center_type_modules')) {
          const rows: Array<{ center_type: string; module_key: string }> = [];
          for (const [key, types] of Object.entries(BOOTSTRAP_MODULE_CENTER_TYPES)) {
            for (const t of types as readonly string[]) rows.push({ center_type: t, module_key: key });
          }
          // Base modules are implicitly universal (isBasic) — not listed.
          return { results: rows };
        }
        return { results: [] };
      },
    };
    return stmt;
  },
} as unknown as D1Database;

const withCatalog = async (
  run: (catalog: ModuleCatalog) => void
) => run(await loadModuleCatalog(fakeDb));

describe('loadModuleCatalog — DB rows', () => {
  it('reads the module keys and the isBasic flags from the DB', async () => {
    await withCatalog(catalog => {
      expect(catalog.keys).toEqual(expect.arrayContaining(BOOTSTRAP_MODULE_KEYS));
      for (const base of BOOTSTRAP_BASE_KEYS) {
        expect(isBaseModuleInCatalog(catalog, base)).toBe(true);
      }
      expect(isBaseModuleInCatalog(catalog, 'etude')).toBe(false);
      expect(isBaseModuleInCatalog(catalog, 'cantine')).toBe(false);
    });
  });

  it('eligibility comes from center_type_modules rows', async () => {
    await withCatalog(catalog => {
      expect(isModuleAllowedInCatalog(catalog, 'etude', 'creche')).toBe(false);
      expect(isModuleAllowedInCatalog(catalog, 'etude', 'garderie')).toBe(true);
      expect(isModuleAllowedInCatalog(catalog, 'cantine', 'creche')).toBe(true);
      expect(isModuleAllowedInCatalog(catalog, 'cantine', 'jardin')).toBe(true);
    });
  });

  it('base modules pass everywhere and the Library never does', async () => {
    await withCatalog(catalog => {
      for (const key of BOOTSTRAP_BASE_KEYS) {
        expect(isModuleAllowedInCatalog(catalog, key, 'creche')).toBe(true);
        expect(isModuleAllowedInCatalog(catalog, key, 'formation')).toBe(true);
      }
      expect(isModuleAllowedInCatalog(catalog, 'bibliotheque', 'garderie')).toBe(false);
    });
  });

  it('untyped centers stay permissive', async () => {
    await withCatalog(catalog => {
      expect(isModuleAllowedInCatalog(catalog, 'etude', '')).toBe(true);
    });
  });
});

// Regression: the catalog sat behind a 60s in-process TTL, so a flag written
// by POST /api/platform-billing (update-module-flags) was invisible to the
// next GET /api/modules — the Tarifs chips looked unchanged after a
// successful toggle.
describe('loadModuleCatalog — always fresh', () => {
  const dbWith = (basicKeys: string[]) => ({
    prepare(sql: string) {
      const stmt = {
        bind() { return stmt; },
        async first() { return null; },
        async all() {
          if (sql.includes('FROM modules')) {
            return {
              results: BOOTSTRAP_MODULE_KEYS.map(k => ({
                key: k,
                label: k,
                label_ar: k,
                isBasic: basicKeys.includes(k) ? 1 : 0,
                isUnbilled: k === 'studentTimeSheets' ? 1 : 0,
                isHidden: 0,
              })),
            };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  }) as unknown as D1Database;

  it('a flag changed between two calls is visible to the second one', async () => {
    const before = await loadModuleCatalog(dbWith(BOOTSTRAP_BASE_KEYS));
    expect(isBaseModuleInCatalog(before, 'cantine')).toBe(false);

    // … the platform admin presses « أساسي » on cantine …
    const after = await loadModuleCatalog(dbWith([...BOOTSTRAP_BASE_KEYS, 'cantine']));

    expect(isBaseModuleInCatalog(after, 'cantine')).toBe(true);
    expect(isBaseModuleInCatalog(after, 'scolaire')).toBe(true);
  });

  it('hiding a module is visible to the very next read', async () => {
    const visible = await loadModuleCatalog(dbWith(BOOTSTRAP_BASE_KEYS));
    expect(visible.hiddenKeys.size).toBe(0);
    // Same shape, but the row now carries isHidden = 1 via a different key set:
    const hiddenDb = {
      prepare(sql: string) {
        const stmt = {
          bind() { return stmt; },
          async first() { return null; },
          async all() {
            if (sql.includes('FROM modules')) {
              return {
                results: BOOTSTRAP_MODULE_KEYS.map(k => ({
                  key: k, label: k, label_ar: k,
                  isBasic: BOOTSTRAP_BASE_KEYS.includes(k) ? 1 : 0,
                  isUnbilled: 0,
                  isHidden: k === 'cantine' ? 1 : 0,
                })),
              };
            }
            return { results: [] };
          },
        };
        return stmt;
      },
    } as unknown as D1Database;
    const after = await loadModuleCatalog(hiddenDb);
    expect(isModuleHiddenInCatalog(after, 'cantine')).toBe(true);
    expect(isModuleHiddenInCatalog(after, 'transport')).toBe(false);
  });
});

describe('normalizeEnabledModulesInCatalog — plan preset × center type', () => {
  const baseSorted = [...BOOTSTRAP_BASE_KEYS].sort();

  it('starter/basic always collapses to base only', async () => {
    await withCatalog(async catalog => {
      expect(normalizeEnabledModulesInCatalog(catalog, ['etude', 'cantine'], 'starter', 'formation').sort()).toEqual(baseSorted);
      expect(normalizeEnabledModulesInCatalog(catalog, ['etude', 'cantine'], 'basic', 'garderie').sort()).toEqual(baseSorted);
    });
  });

  it('trial keeps the modules picked in the form (it is stored as plan=starter)', async () => {
    await withCatalog(async catalog => {
      const modules = normalizeEnabledModulesInCatalog(catalog, ['cantine', 'transport', 'etude'], 'trial', 'jardin');
      expect(modules).toContain('cantine');
      expect(modules).toContain('transport');
      expect(modules).not.toContain('etude'); // center-type eligibility still applies
      for (const key of BOOTSTRAP_BASE_KEYS) expect(modules).toContain(key);
    });
  });

  it('pro preset is scoped to the center type', async () => {
    await withCatalog(async catalog => {
      const formationPro = normalizeEnabledModulesInCatalog(catalog, undefined, 'pro', 'formation');
      const jardinPro = normalizeEnabledModulesInCatalog(catalog, undefined, 'pro', 'jardin');
      expect(formationPro).toContain('etude');
      expect(formationPro).toContain('activites');
      expect(jardinPro).not.toContain('etude');
      expect(jardinPro).toContain('activites');
      for (const key of BOOTSTRAP_BASE_KEYS) {
        expect(formationPro).toContain(key);
        expect(jardinPro).toContain(key);
      }
    });
  });

  it('growth keeps caller modules but prunes type-ineligible ones', async () => {
    await withCatalog(async catalog => {
      const modules = normalizeEnabledModulesInCatalog(catalog, ['etude', 'cantine', 'transport'], 'growth', 'jardin');
      expect(modules).toContain('cantine');
      expect(modules).toContain('transport');
      expect(modules).not.toContain('etude');
    });
  });

  it('legacy untyped centers keep the permissive behavior', async () => {
    await withCatalog(async catalog => {
      const modules = normalizeEnabledModulesInCatalog(catalog, ['etude', 'cantine'], 'growth', '');
      expect(modules).toContain('etude');
      expect(modules).toContain('cantine');
    });
  });
});

describe('ineligibleModulesInCatalog — the 400-decision helper', () => {
  it('lists only the explicitly-requested forbidden modules', async () => {
    await withCatalog(async catalog => {
      expect(ineligibleModulesInCatalog(catalog, ['etude', 'cantine', 'revision'], 'jardin')).toEqual(['etude', 'revision']);
      expect(ineligibleModulesInCatalog(catalog, ['cantine', 'activites'], 'creche')).toEqual([]);
    });
  });

  it('never flags base modules', async () => {
    await withCatalog(async catalog => {
      expect(ineligibleModulesInCatalog(catalog, ['scolaire', 'finance', 'studentTimeSheets'], 'creche')).toEqual([]);
    });
  });

  it('untyped centers are never rejected', async () => {
    await withCatalog(async catalog => {
      expect(ineligibleModulesInCatalog(catalog, ['etude', 'anything'], '')).toEqual([]);
    });
  });
});
