import { describe, it, expect } from 'vitest';
import {
  LEGACY_CONFIG,
  PRE_PROGRAM_MODULES,
  CRECHE_COMPOSED_CONFIG,
  C5_RESTRICTED_CONFIG,
  makeCenter,
  makeConfig,
  makeProgram,
  makeUser
} from './programConfig';
import type { CenterTenant, UserAccount } from '../types';

describe('programConfig factory (006 R2)', () => {
  it('defaults to the legacy passthrough: unknown type, empty modules, admin', () => {
    expect(makeConfig()).toEqual({ type: undefined, enabledModules: [], role: 'admin' });
    expect(LEGACY_CONFIG).toEqual({ type: undefined, enabledModules: [], role: 'admin' });
  });

  it('applies each override (type, modules, role) independently', () => {
    expect(makeConfig({ type: 'creche' }).type).toBe('creche');
    expect(makeConfig({ enabledModules: ['etude'] }).enabledModules).toEqual(['etude']);
    expect(makeConfig({ role: 'restricted_admin' }).role).toBe('restricted_admin');
    // unknown type values pass through verbatim (legacy passthrough)
    expect(makeConfig({ type: 'maternelle-1998' }).type).toBe('maternelle-1998');
  });

  it('builds the exact CenterTenant shape the app shell consumes', () => {
    const center: CenterTenant = makeCenter();
    expect(center.centerType).toBeUndefined();
    expect(center.enabledModules).toEqual([]);
    expect(center.plan).toBe('growth');
    expect(center.status).toBe('active');
    expect(typeof center.id).toBe('string');
    expect(typeof center.createdAt).toBe('number');
    expect(JSON.parse(JSON.stringify(center))).toEqual(center);
  });

  it('carries the composed type and module list into the tenant', () => {
    const center = makeCenter(CRECHE_COMPOSED_CONFIG);
    expect(center.centerType).toBe('creche');
    expect(center.enabledModules).toEqual([...PRE_PROGRAM_MODULES, 'activites', 'competences']);
    // no staff entitlement → the staff-lite derivation applies in App
    expect(center.enabledModules).not.toContain('staff');
    expect(center.enabledModules).toContain('etude');
  });

  it('builds the exact UserAccount shape, defaulting to admin', () => {
    const user: UserAccount = makeUser();
    expect(user.role).toBe('admin');
    expect(user.email).toBeTruthy();
    expect(typeof user.name).toBe('string');
    expect(typeof user.description).toBe('string');
    expect(makeUser('restricted_admin').role).toBe('restricted_admin');
  });

  it('makeProgram returns the login pair with the config role applied', () => {
    const { center, user, config } = makeProgram(C5_RESTRICTED_CONFIG);
    expect(user.role).toBe('restricted_admin');
    expect(center.centerType).toBe('creche');
    expect(center.enabledModules).toEqual(['etude', 'activites']);
    expect(config.type).toBe('creche');
    expect(config.enabledModules).toEqual(['etude', 'activites']);
  });

  it('copies the module list so callers cannot mutate the matrix rows', () => {
    const a = makeCenter(CRECHE_COMPOSED_CONFIG);
    (a.enabledModules as string[]).push('staff');
    expect(CRECHE_COMPOSED_CONFIG.enabledModules).not.toContain('staff');
    expect(makeCenter(CRECHE_COMPOSED_CONFIG).enabledModules).not.toContain('staff');
  });
});
