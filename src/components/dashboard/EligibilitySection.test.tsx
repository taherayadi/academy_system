import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import EligibilitySection from './EligibilitySection';
import type { DashboardApi } from './usePlatformDashboard';
import type { ModuleCatalogEntry, ModuleCatalogPayload, CenterTypeEntry } from '../../api';
import { setModuleCatalog, resetModuleCatalogStore } from '../../utils/moduleCatalogStore';
import { updateModuleEligibilityApi } from '../../api';

vi.mock('../../api', () => ({ updateModuleEligibilityApi: vi.fn() }));

const CENTER_TYPES: CenterTypeEntry[] = [
  { key: 'creche', label: 'Crèche', labelAr: 'حضانة', hint: '' },
  { key: 'jardin', label: 'Jardin', labelAr: 'روضة', hint: '' },
  { key: 'garderie', label: 'Garderie', labelAr: 'دار الرعاية', hint: '' },
  { key: 'formation', label: 'Formation', labelAr: 'تكوين', hint: '' },
];

const MODULES: ModuleCatalogEntry[] = [
  // basic ⇒ always allowed, locked
  { key: 'scolaire', label: 'Scolaire', labelAr: 'مدرسي', isBasic: true, isUnbilled: false, isHidden: false, allowedCenterTypes: [] },
  // no rows ⇒ universal (allowed for every type)
  { key: 'cantine', label: 'Cantine', labelAr: 'المطعم', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: [] },
  // restricted to the two school-support types
  { key: 'etude', label: 'Étude', labelAr: 'الدراسة', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: ['garderie', 'formation'] },
  // hidden ⇒ not listed at all
  { key: 'bibliotheque', label: 'Bibliothèque', labelAr: 'المكتبة', isBasic: false, isUnbilled: true, isHidden: true, allowedCenterTypes: [] },
];

const payload = (): ModuleCatalogPayload => ({
  modules: MODULES.map(m => ({ ...m })),
  centerTypes: CENTER_TYPES,
});

const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
const d = { toast } as unknown as DashboardApi;

/** Row of a module + its switch, re-queried so a re-render never returns a stale node. */
const rowOf = (key: string) => within(document.querySelector(`[data-module="${key}"]`) as HTMLElement);
const sw = (key: string) => rowOf(key).getByRole('switch') as HTMLButtonElement;
const pill = (name: RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

const mockApi = updateModuleEligibilityApi as ReturnType<typeof vi.fn>;
/** The endpoint answers with the catalog it just wrote (mirrors the server). */
const answerWith = (key: string, allowed: string[]): ModuleCatalogPayload => ({
  modules: MODULES.map(m => (m.key === key ? { ...m, allowedCenterTypes: allowed } : { ...m })),
  centerTypes: CENTER_TYPES,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the endpoint answers with the catalog it just wrote (server parity).
  mockApi.mockReset();
  mockApi.mockImplementation(async (key: string, allowed: string[]) => answerWith(key, allowed));
  setModuleCatalog(payload());
});
afterEach(() => resetModuleCatalogStore());

describe('EligibilitySection — center_type_modules editor', () => {
  it('reads each switch from the rows of the selected center type', () => {
    render(<EligibilitySection d={d} />);
    // Default type = first DB type (creche).
    expect(sw('cantine').getAttribute('aria-checked')).toBe('true');  // universal
    expect(sw('etude').getAttribute('aria-checked')).toBe('false');   // school-support only
    expect(sw('scolaire').getAttribute('aria-checked')).toBe('true'); // basic
    expect(sw('scolaire').disabled).toBe(true);                      // …and locked
    expect(document.querySelector('[data-module="bibliotheque"]')).toBeNull(); // hidden

    // Switching the type flips the restricted module only.
    fireEvent.click(pill(/دار الرعاية/));
    expect(sw('etude').getAttribute('aria-checked')).toBe('true');
    expect(sw('cantine').getAttribute('aria-checked')).toBe('true');
  });

  it('unchecking a universal module writes the OTHER types (never [])', async () => {
    render(<EligibilitySection d={d} />);

    fireEvent.click(sw('cantine')); // allowed for all ⇒ turn off for creche
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('cantine', ['jardin', 'garderie', 'formation']));
    await waitFor(() => expect(sw('cantine').getAttribute('aria-checked')).toBe('false'));
    // …and it stays allowed for the other types.
    fireEvent.click(pill(/روضة/));
    expect(sw('cantine').getAttribute('aria-checked')).toBe('true');
  });

  it('checking a restricted module adds the selected type to its set', async () => {
    render(<EligibilitySection d={d} />);

    fireEvent.click(sw('etude')); // not allowed for creche → allow it
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('etude', ['creche', 'garderie', 'formation']));
    await waitFor(() => expect(sw('etude').getAttribute('aria-checked')).toBe('true'));
  });

  it('refuses to strip the last allowed type (it would mean universal again)', async () => {
    render(<EligibilitySection d={d} />);
    fireEvent.click(pill(/دار الرعاية/)); // etude: allowed for garderie + formation
    expect(sw('etude').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(sw('etude')); // revoke garderie → formation remains
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('etude', ['formation']));
    // The switch reports THIS type, so it now reads off — exactly what was asked.
    await waitFor(() => expect(sw('etude').getAttribute('aria-checked')).toBe('false'));

    fireEvent.click(pill(/تكوين/));
    expect(sw('etude').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw('etude')); // formation is the last one → blocked
    expect(mockApi).toHaveBeenCalledTimes(1); // only the previous, allowed call
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    expect(sw('etude').getAttribute('aria-checked')).toBe('true'); // unchanged
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports a failed save and leaves the switch where it was', async () => {
    mockApi.mockRejectedValue(new Error('network down')); // overrides the default
    render(<EligibilitySection d={d} />);

    fireEvent.click(sw('cantine'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('network down'));
    expect(sw('cantine').getAttribute('aria-checked')).toBe('true');
  });
});
