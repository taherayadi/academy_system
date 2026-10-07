import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCatalogSnapshot,
  setCatalogSnapshot,
  moduleKeys,
  moduleCatalogEmpty,
  isModuleKey,
  normalizeModuleKeys,
  ensureCatalogLoaded,
  __resetCatalogForTests,
} from './catalogStore';
import { fetchCatalogApi } from '../api';

// La graine globale (vitest.setup.ts) est en place ; ces tests jouent avec
// des payloads volontairement différents.
const PAYLOAD = {
  modules: [
    { key: 'scolaire', label: 'Scolaire', labelAr: '', isBasic: 1, isUnbilled: 0, isHidden: 0, icon: 'GraduationCap', description: 'd', features: '[]' },
    { key: 'finance', label: 'Finance', labelAr: '', isBasic: true, isUnbilled: false, isHidden: false, icon: '', description: '', features: ['a', 'b'] },
  ],
  centerTypes: [{ key: 'creche', label: 'Crèche', labelAr: '', hint: '', hintAr: '' }],
  centerTypeModules: [{ centerType: 'creche', moduleKey: 'scolaire' }],
};

beforeEach(() => {
  __resetCatalogForTests();
});

describe('setCatalogSnapshot', () => {
  it('accepts a well-formed payload and normalizes DB shapes', () => {
    expect(setCatalogSnapshot(PAYLOAD)).toBe(true);
    const snap = getCatalogSnapshot();
    expect(snap.modules).toHaveLength(2);
    expect(snap.modules[0]).toMatchObject({ key: 'scolaire', isBasic: true, isUnbilled: false, isHidden: false });
    expect(snap.modules[1].features).toEqual(['a', 'b']);
    expect(snap.centerTypes[0].key).toBe('creche');
    expect(snap.centerTypeModuleKeys).toEqual([{ centerType: 'creche', moduleKey: 'scolaire' }]);
  });

  it('rejects a degenerate payload (empty modules) without touching the snapshot', () => {
    setCatalogSnapshot(PAYLOAD);
    const before = getCatalogSnapshot();
    expect(setCatalogSnapshot({ modules: [], centerTypes: [], centerTypeModules: [] })).toBe(false);
    expect(getCatalogSnapshot()).toBe(before);
  });

  it('drops rows without keys', () => {
    expect(setCatalogSnapshot({ modules: [{ key: '', label: 'x' }], centerTypes: [], centerTypeModules: [] })).toBe(false);
    expect(setCatalogSnapshot({ modules: [{ key: 'm1', label: 'M1' }], centerTypes: [], centerTypeModules: undefined })).toBe(true);
    expect(moduleKeys()).toEqual(['m1']);
  });
});

describe('key helpers read the live snapshot', () => {
  it('isModuleKey / moduleKeys reflect exactly what the API delivered', () => {
    expect(moduleCatalogEmpty()).toBe(true);
    expect(isModuleKey('scolaire')).toBe(false);
    setCatalogSnapshot(PAYLOAD);
    expect(moduleCatalogEmpty()).toBe(false);
    expect(isModuleKey('scolaire')).toBe(true);
    expect(isModuleKey('phantom')).toBe(false);
    expect(moduleKeys()).toEqual(['scolaire', 'finance']);
  });

  it('normalizeModuleKeys dedupes and trims, tolerating unknown keys', () => {
    expect(normalizeModuleKeys([' a ', 'a', '', 'b', 3])).toEqual(['a', 'b', '3']);
    expect(normalizeModuleKeys('not-an-array')).toEqual([]);
    expect(normalizeModuleKeys(undefined)).toEqual([]);
  });
});

describe('ensureCatalogLoaded', () => {
  it('fetches once and populates the store from /api/catalog', async () => {
    const spy = vi.mocked(fetchCatalogApi);
    spy.mockResolvedValue(PAYLOAD as any);
    await ensureCatalogLoaded();
    await ensureCatalogLoaded();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(moduleKeys()).toEqual(['scolaire', 'finance']);
  });

  it('never throws on API failure and leaves the store empty', async () => {
    const spy = vi.mocked(fetchCatalogApi);
    spy.mockRejectedValueOnce(new Error('network down'));
    await expect(ensureCatalogLoaded()).resolves.toBeUndefined();
    expect(moduleCatalogEmpty()).toBe(true);
  });
});
