/**
 * Composed program configurations (feature 006).
 *
 * One definition of every configuration the cross-feature verification matrix
 * (specs/006-cross-feature-verification/data-model.md) exercises, so the composed
 * suites and the matrix stay in lockstep.
 *
 * Defaults are deliberately the **legacy passthrough**: no center type and an
 * empty module list — the behavior every pre-program center keeps (FR-004).
 */

import type { CenterTenant, UserAccount } from '../types';

export interface ProgramConfig {
  /** Center type, including `undefined` (legacy) and unknown values. */
  type?: string;
  /** Enabled module keys; `[]` is the legacy passthrough. */
  enabledModules: string[];
  /** Account role — the only restriction layer carried by the session. */
  role: UserAccount['role'];
}

/** The entitlement list pre-program centers were provisioned with. */
export const PRE_PROGRAM_MODULES: string[] = [
  'scolaire',
  'studentTimeSheets',
  'finance',
  'etude',
  'coursParticuliers',
  'revision',
  'formations',
  'events'
];

/** Legacy passthrough: unknown type, empty entitlement list, admin role. */
export const LEGACY_CONFIG: ProgramConfig = {
  type: undefined,
  enabledModules: [],
  role: 'admin'
};

/** Resolve a composed configuration, defaulting every omitted dimension to legacy. */
export function makeConfig(overrides: Partial<ProgramConfig> = {}): ProgramConfig {
  return {
    ...LEGACY_CONFIG,
    ...overrides,
    enabledModules: overrides.enabledModules ?? LEGACY_CONFIG.enabledModules
  };
}

/**
 * The exact `CenterTenant` shape the app shell consumes (and `verifyPassword`
 * resolves at login). `type`/`enabledModules` come from the composed config;
 * other tenant fields default to a live, active center.
 */
export function makeCenter(config: Partial<ProgramConfig> = {}): CenterTenant {
  const resolved = makeConfig(config);
  return {
    id: 'c_program',
    name: 'Program Center',
    plan: 'growth',
    status: 'active',
    enabledModules: [...resolved.enabledModules],
    centerType: resolved.type,
    createdAt: 0
  };
}

/** The exact `UserAccount` shape the session carries (role = restriction layer). */
export function makeUser(
  role: UserAccount['role'] = LEGACY_CONFIG.role,
  overrides: Partial<UserAccount> = {}
): UserAccount {
  return {
    email: 'admin@program.tn',
    name: 'Program Admin',
    role,
    description: '',
    ...overrides
  };
}

/** Convenience pair for the composed login harness: `{ center, user }`. */
export function makeProgram(config: Partial<ProgramConfig> = {}): {
  center: CenterTenant;
  user: UserAccount;
  config: ProgramConfig;
} {
  const resolved = makeConfig(config);
  return { center: makeCenter(resolved), user: makeUser(resolved.role), config: resolved };
}

// ── Matrix rows (data-model C1–C5) ─────────────────────────────────────────

/** C1: crèche + Étude without Staff + both new modules, admin. */
export const CRECHE_COMPOSED_CONFIG: Partial<ProgramConfig> = {
  type: 'creche',
  enabledModules: [...PRE_PROGRAM_MODULES, 'activites', 'competences'],
  role: 'admin'
};

/** C2: unknown type + legacy empty module list, admin. */
export const LEGACY_PASSTHROUGH_CONFIG: Partial<ProgramConfig> = {
  type: undefined,
  enabledModules: [],
  role: 'admin'
};

/** C3: formation + pre-program entitlement list, admin. */
export const FORMATION_CONFIG: Partial<ProgramConfig> = {
  type: 'formation',
  enabledModules: [...PRE_PROGRAM_MODULES],
  role: 'admin'
};

/** C4: garderie + pre-program entitlement list, admin. */
export const GARDERIE_CONFIG: Partial<ProgramConfig> = {
  type: 'garderie',
  enabledModules: [...PRE_PROGRAM_MODULES],
  role: 'admin'
};

/** C5: crèche (type layer) + étude-only (subscription layer) + restricted_admin (role layer). */
export const C5_RESTRICTED_CONFIG: Partial<ProgramConfig> = {
  type: 'creche',
  enabledModules: ['etude', 'activites'],
  role: 'restricted_admin'
};
