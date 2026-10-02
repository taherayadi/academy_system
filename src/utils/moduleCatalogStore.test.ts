import { describe, it, expect, beforeEach } from 'vitest';
import {
  setModuleCatalog,
  patchModuleFlags,
  getModuleCatalog,
  subscribeModuleCatalog,
  resetModuleCatalogStore,
} from './moduleCatalogStore';
import type { ModuleCatalogPayload } from '../api';

const payload = (): ModuleCatalogPayload => ({
  modules: [
    { key: 'scolaire', label: 'Scolaire', labelAr: 'مدرسي', isBasic: true, isUnbilled: false, isHidden: false, allowedCenterTypes: [] },
    { key: 'cantine', label: 'Cantine', labelAr: 'المطعم', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: [] },
  ],
  centerTypes: [],
});

const moduleOf = (key: string) => getModuleCatalog().modules.find(m => m.key === key)!;

beforeEach(() => resetModuleCatalogStore());

describe('patchModuleFlags — server-confirmed flag updates', () => {
  it('applies the flags of the target module only and notifies once', () => {
    setModuleCatalog(payload());
    let notified = 0;
    const unsubscribe = subscribeModuleCatalog(() => { notified++; });

    patchModuleFlags('cantine', { isBasic: true });
    unsubscribe();

    expect(moduleOf('cantine').isBasic).toBe(true);
    expect(moduleOf('cantine').isUnbilled).toBe(false); // untouched
    expect(moduleOf('scolaire').isBasic).toBe(true);    // sibling untouched
    expect(notified).toBe(1);
  });

  it('leaves undefined flags alone', () => {
    setModuleCatalog(payload());
    patchModuleFlags('cantine', { isHidden: undefined, isUnbilled: true });
    expect(moduleOf('cantine').isUnbilled).toBe(true);
    expect(moduleOf('cantine').isHidden).toBe(false);
    expect(moduleOf('cantine').isBasic).toBe(false);
  });

  it('does not notify when the module is unknown (nothing changed)', () => {
    setModuleCatalog(payload());
    let notified = 0;
    const unsubscribe = subscribeModuleCatalog(() => { notified++; });
    patchModuleFlags('nope', { isBasic: true });
    unsubscribe();
    expect(notified).toBe(0);
  });
});
