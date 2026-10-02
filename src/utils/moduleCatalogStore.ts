/**
 * Client-side mirror of the DB module catalog (GET /api/modules).
 *
 * The `modules` and `center_types` tables are the runtime source of truth.
 * This store holds the last loaded catalog so the pure helpers exported from
 * dashboard/constants.ts (usable outside React — plan-change utils, tests,
 * module-scope code) read DB data without a React context. React components
 * go through ModuleCatalogProvider, which calls setModuleCatalog() and
 * triggers re-renders.
 *
 * The fallback catalog below is the BOOTSTRAP ONLY (store never fed, offline
 * fetch): exactly the previous hardcoded constants. Once /api/modules has
 * answered once, everything derives from the DB.
 */
import type { ModuleCatalogEntry, CenterTypeEntry } from '../api';

export interface ClientModuleEntry {
  key: string;
  label: string;
  labelAr: string;
  isBasic: boolean;
  isUnbilled: boolean;
  isHidden: boolean;
  /** Empty ⇒ universal (allowed with every center type). */
  allowedCenterTypes: string[];
}

export interface ClientCenterTypeEntry {
  key: string;
  label: string;
  labelAr: string;
  hint: string;
}

// Bootstrap uses isUnbilled flag — no hardcoded key sentinel needed.
const BOOTSTRAP_BASE_KEYS = ['scolaire', 'finance', 'studentTimeSheets'];
const BOOTSTRAP_UNBILLED_KEYS = new Set(['studentTimeSheets', 'bibliotheque']);
const BOOTSTRAP_HIDDEN_KEYS = new Set(['bibliotheque']);
const BOOTSTRAP_ALL_KEYS = [
  'scolaire', 'finance', 'etude', 'coursParticuliers', 'revision',
  'formations', 'cantine', 'transport', 'events',
  'studentTimeSheets', 'staff', 'activites', 'competences', 'bibliotheque',
];
// étude/cours/révision/formations are school-support modules: not offered to
// crèches nor jardins. Everything else is universal. Mirrors the server
// bootstrap fallback in functions/api/_modules.ts.
const BOOTSTRAP_SCHOOL_SUPPORT = ['etude', 'coursParticuliers', 'revision', 'formations'];

const bootstrapModules: ClientModuleEntry[] = BOOTSTRAP_ALL_KEYS.map(key => ({
  key,
  label: key,
  labelAr: key,
  isBasic: BOOTSTRAP_BASE_KEYS.includes(key),
  isUnbilled: BOOTSTRAP_UNBILLED_KEYS.has(key),
  isHidden: BOOTSTRAP_HIDDEN_KEYS.has(key),
  allowedCenterTypes: BOOTSTRAP_SCHOOL_SUPPORT.includes(key)
    ? ['garderie', 'formation']
    : ['creche', 'jardin', 'garderie', 'formation'],
}));

const bootstrapCenterTypes: ClientCenterTypeEntry[] = [
  { key: 'creche', label: 'creche', labelAr: 'creche', hint: '' },
  { key: 'jardin', label: 'jardin', labelAr: 'jardin', hint: '' },
  { key: 'garderie', label: 'garderie', labelAr: 'garderie', hint: '' },
  { key: 'formation', label: 'formation', labelAr: 'formation', hint: '' },
];

let state: { modules: ClientModuleEntry[]; centerTypes: ClientCenterTypeEntry[]; fromDb: boolean } = {
  modules: bootstrapModules,
  centerTypes: bootstrapCenterTypes,
  fromDb: false,
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Feed the store from GET /api/modules (called by ModuleCatalogProvider). */
export function setModuleCatalog(payload: { modules: ModuleCatalogEntry[]; centerTypes: CenterTypeEntry[] } | null): void {
  if (!payload) return;
  const modules = (payload.modules || []).map(m => ({
    key: String(m.key),
    label: String(m.label || m.key),
    labelAr: String(m.labelAr || m.label || m.key),
    isBasic: !!m.isBasic,
    isUnbilled: !!m.isUnbilled,
    isHidden: !!m.isHidden,
    allowedCenterTypes: (m.allowedCenterTypes || []).map(String),
  }));
  const centerTypes = (payload.centerTypes || []).map(ct => ({
    key: String(ct.key),
    label: String(ct.label || ct.key),
    labelAr: String(ct.labelAr || ct.label || ct.key),
    hint: String(ct.hint || ''),
  }));
  if (modules.length === 0) return; // never let a broken payload empty the UI
  state = { modules, centerTypes, fromDb: true };
  notify();
}

/** Flags the server has CONFIRMED for one module (POST /api/platform-billing
 *  update-module-flags). Applying them straight away makes a toggle visible
 *  even when the follow-up catalog fetch fails — the console must never show
 *  a state the backend has already rejected or accepted differently.
 *  Undefined flags are left untouched. */
export function patchModuleFlags(key: string, flags: { isBasic?: boolean; isUnbilled?: boolean; isHidden?: boolean }): void {
  const next = state.modules.map(m => {
    if (m.key !== key) return m;
    const patched = { ...m };
    if (flags.isBasic !== undefined) patched.isBasic = flags.isBasic;
    if (flags.isUnbilled !== undefined) patched.isUnbilled = flags.isUnbilled;
    if (flags.isHidden !== undefined) patched.isHidden = flags.isHidden;
    return patched;
  });
  if (next.every((m, i) => m === state.modules[i])) return; // nothing to patch
  state = { ...state, modules: next };
  notify();
}

/** Subscribe to catalog changes (React provider; returns an unsubscribe fn). */
export function subscribeModuleCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Latest catalog snapshot with `fromDb` — true once the DB payload landed. */
export function getModuleCatalog(): { modules: ClientModuleEntry[]; centerTypes: ClientCenterTypeEntry[]; fromDb: boolean } {
  return state;
}

/** True when the catalog has never been fed from the DB this session. */
export function isModuleCatalogFromDb(): boolean {
  return state.fromDb;
}

/** Force back to the bootstrap catalog (tests). */
export function resetModuleCatalogStore(): void {
  state = { modules: bootstrapModules, centerTypes: bootstrapCenterTypes, fromDb: false };
  notify();
}
