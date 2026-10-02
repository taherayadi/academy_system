import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import PricingSection from './PricingSection';
import type { DashboardApi } from './usePlatformDashboard';
import type { ModuleCatalogEntry, ModuleCatalogPayload } from '../../api';
import { setModuleCatalog, resetModuleCatalogStore } from '../../utils/moduleCatalogStore';

const MODULES: ModuleCatalogEntry[] = [
  { key: 'scolaire', label: 'Scolaire', labelAr: 'مدرسي', isBasic: true, isUnbilled: false, isHidden: false, allowedCenterTypes: [] },
  { key: 'cantine', label: 'Cantine', labelAr: 'المطعم', isBasic: false, isUnbilled: false, isHidden: false, allowedCenterTypes: [] },
  { key: 'bibliotheque', label: 'Bibliothèque', labelAr: 'المكتبة', isBasic: false, isUnbilled: true, isHidden: true, allowedCenterTypes: [] },
];

/** Fresh payload copy — mimics a GET /api/modules answer. */
const payload = (modules: ModuleCatalogEntry[] = MODULES): ModuleCatalogPayload => ({
  modules: modules.map(m => ({ ...m })),
  centerTypes: [],
});

const feed = (modules: ModuleCatalogEntry[] = MODULES) => setModuleCatalog(payload(modules));

/** Row of a module (data-module) and one of its chips, re-queried on every
 *  call so a re-render never hands back a detached node. */
const rowOf = (key: string) => within(document.querySelector(`[data-module="${key}"]`) as HTMLElement);
const chip = (row: ReturnType<typeof within>, name: string) =>
  row.getByRole('button', { name }) as HTMLButtonElement;

function makeD(overrides: Record<string, unknown> = {}): DashboardApi {
  return {
    priceYear: '2026/2027',
    setPriceYear: vi.fn(),
    priceYears: ['2026/2027'],
    addSchoolYear: vi.fn(),
    addingYear: false,
    nextSchoolYear: '2027/2028',
    pricesLoading: false,
    priceList: { scolaire: 45, cantine: 12, bibliotheque: 0 },
    setPriceList: vi.fn(),
    savePrices: vi.fn(),
    savingPrices: false,
    updateModuleFlag: vi.fn(async () => {}),
    ...overrides,
  } as unknown as DashboardApi;
}

beforeEach(() => feed());
afterEach(() => resetModuleCatalogStore());

describe('PricingSection — module flag chips', () => {
  it('reads the pressed state of every chip from the catalog flags', () => {
    render(<PricingSection d={makeD()} />);
    // Base module: basic ON, paid OFF, hiding refused (disabled).
    expect(chip(rowOf('scolaire'), 'أساسي').getAttribute('aria-pressed')).toBe('true');
    expect(chip(rowOf('scolaire'), 'مجاني').getAttribute('aria-pressed')).toBe('false');
    expect(chip(rowOf('scolaire'), 'إخفاء').disabled).toBe(true);
    // Optional module: every toggle OFF until it is pressed.
    expect(chip(rowOf('cantine'), 'أساسي').getAttribute('aria-pressed')).toBe('false');
    expect(chip(rowOf('cantine'), 'مجاني').getAttribute('aria-pressed')).toBe('false');
    expect(chip(rowOf('cantine'), 'إخفاء').getAttribute('aria-pressed')).toBe('false');
    expect(chip(rowOf('cantine'), 'إخفاء').disabled).toBe(false);
    // Retired module: hidden ON once « عرض المحذوفة » reveals the row.
    fireEvent.click(screen.getByRole('button', { name: 'عرض المحذوفة' }));
    expect(chip(rowOf('bibliotheque'), 'مخفي').getAttribute('aria-pressed')).toBe('true');
    expect(chip(rowOf('bibliotheque'), 'مجاني').getAttribute('aria-pressed')).toBe('true');
  });

  it('flips the chip — and the base-plan card — as soon as the catalog store lands', async () => {
    // Mirrors usePlatformDashboard.updateModuleFlag: API, then catalog reload.
    const updateModuleFlag = vi.fn(async (key: string, flags: Record<string, boolean>) => {
      feed(MODULES.map(m => (m.key === key ? { ...m, ...flags } : m)));
    });
    render(<PricingSection d={makeD({ updateModuleFlag })} />);

    fireEvent.click(chip(rowOf('cantine'), 'أساسي'));
    await waitFor(() => expect(updateModuleFlag).toHaveBeenCalledWith('cantine', { isBasic: true }));
    // The store notification alone repaints the section — no other state moved.
    await waitFor(() => expect(chip(rowOf('cantine'), 'أساسي').getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('heading', { level: 3, name: 'مدرسي + المطعم' })).toBeTruthy();
    expect(screen.getByText('57')).toBeTruthy(); // 45 (scolaire) + 12 (cantine)
  });

  it('toggles « مجاني » on and hides the price input for an unbilled module', async () => {
    const updateModuleFlag = vi.fn(async (key: string, flags: Record<string, boolean>) => {
      feed(MODULES.map(m => (m.key === key ? { ...m, ...flags } : m)));
    });
    render(<PricingSection d={makeD({ updateModuleFlag })} />);

    expect(rowOf('cantine').queryAllByText('مشمول')).toHaveLength(0);
    fireEvent.click(chip(rowOf('cantine'), 'مجاني'));
    await waitFor(() => expect(updateModuleFlag).toHaveBeenCalledWith('cantine', { isUnbilled: true }));
    await waitFor(() => expect(chip(rowOf('cantine'), 'مجاني').getAttribute('aria-pressed')).toBe('true'));
    // badge + price cell both announce that the module is now bundled
    expect(rowOf('cantine').getAllByText('مشمول').length).toBeGreaterThan(0);
    expect(rowOf('cantine').queryByRole('spinbutton')).toBeNull();
  });
});
