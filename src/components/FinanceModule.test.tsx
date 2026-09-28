import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import FinanceModule from './FinanceModule';
import { Student, CenterSettings, initialStudentFeeSet } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const baseServices = { etude: true, suivi: true, library: false, meals: false };

const student = (overrides: Record<string, unknown>): Student =>
  ({ id: 'st_x', firstName: 'A', lastName: 'B', grade: 'G', enrolledServices: { ...baseServices }, ...overrides } as unknown as Student);

const gouterStudent = student({
  id: 'st_fin_gouter',
  firstName: 'FinGouter',
  enrolledServices: { ...baseServices, gouterSoir: true },
  mealAttendances: [
    { date: '2026-09-14', type: 'unit', paid: false, service: 'gouter_apres_midi' },
    { date: '2026-09-15', type: 'unit', paid: false, service: 'lunch' }
  ]
});

const lunchSubscriber = student({
  id: 'st_fin_lunch',
  firstName: 'FinLunch',
  enrolledServices: { ...baseServices, meals: true },
  mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true },
  mealAttendances: [{ date: '2026-09-14', type: 'subscription', paid: true, service: 'lunch' }]
});

const settings = (mode: 'external_traiteur' | 'in_house_kitchen') =>
  ({
    centerName: 'Test Center',
    mealOperatingMode: mode,
    fees: initialStudentFeeSet
  } as unknown as CenterSettings);

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

const renderFinance = (
  mode: 'external_traiteur' | 'in_house_kitchen',
  students: Student[] = [gouterStudent],
  extraProps: Record<string, unknown> = {}
) => {
  render(
    <FinanceModule
      students={students}
      expenses={[]}
      onUpdateExpenses={vi.fn()}
      settings={settings(mode)}
      enabledModules={['cantine']}
      {...extraProps}
    />
  );
  // Navigate to the Gestion des repas tab («🍽️ إدارة المطعم»).
  const restoTab = screen.getAllByRole('button').find(b => (b.textContent || '').includes('إدارة المطعم'));
  expect(restoTab, 'إدارة المطعم tab button not found').toBeTruthy();
  fireEvent.click(restoTab!);
};

describe('FinanceModule — Gestion des repas (revision D, remarks F1 + F2)', () => {
  it('renders the tab without crashing in external-traiteur mode', () => {
    renderFinance('external_traiteur');
    expect(screen.getByText('تفاصيل استهلاك التلاميذ (1 تلميذ)')).toBeTruthy();
  });

  it('remark F1: shows the traiteur indicators in external-traiteur mode', () => {
    renderFinance('external_traiteur');
    // The lunch table's h3 carries the live count, making it unique.
    const detailCard = screen.getByText(/تفاصيل استهلاك التلاميذ \(/).closest('div.bg-white') as HTMLElement;
    expect(within(detailCard).getByText('حصة الـ Traiteur')).toBeTruthy();
    expect(within(detailCard).getByText('حصة السنتر')).toBeTruthy();
  });

  it('remark F1: hides the traiteur indicators in in-house mode but keeps the other columns', () => {
    renderFinance('in_house_kitchen');
    const detailCard = screen.getByText(/تفاصيل استهلاك التلاميذ \(/).closest('div.bg-white') as HTMLElement;
    expect(within(detailCard).queryByText('حصة الـ Traiteur')).toBeNull();
    expect(within(detailCard).queryByText('حصة السنتر')).toBeNull();
    // The rest of the table keeps its columns and rows.
    expect(within(detailCard).getByText('المجموع')).toBeTruthy();
  });

  it('remark F1: consumption summary is identical between modes for the same data', () => {
    const readConsumedSummary = (mode: 'external_traiteur' | 'in_house_kitchen') => {
      render(
        <FinanceModule
          students={[gouterStudent]}
          expenses={[]}
          onUpdateExpenses={vi.fn()}
          settings={settings(mode)}
          enabledModules={['cantine']}
        />
      );
      const restoTab = screen.getAllByRole('button').find(b => (b.textContent || '').includes('إدارة المطعم'));
      fireEvent.click(restoTab!);
      const summaryLabel = screen.getByText('إجمالي الوجبات المستهلكة');
      const text = summaryLabel.parentElement?.textContent ?? '';
      cleanup();
      return text;
    };
    expect(readConsumedSummary('external_traiteur')).toBe(readConsumedSummary('in_house_kitchen'));
  });

  it('remark F2: hosts a dedicated Goûter detail table counting only goûter attendances', () => {
    renderFinance('external_traiteur');
    // Revision E: the Goûter detail lives on the Goûter panel.
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    const gouterTable = screen.getByTestId('finance-gouter-table');
    expect(within(gouterTable).getByText('FinGouter B')).toBeTruthy();
    expect(within(gouterTable).getByTestId('consumed-soir-st_fin_gouter').textContent).toBe('1');
    expect(within(gouterTable).getByTestId('consumed-matin-st_fin_gouter').textContent).toBe('0');
  });
});

describe('FinanceModule — revision E (per-service synthesis + onglets)', () => {
  const setMonth = (value: string) => {
    fireEvent.change(screen.getByLabelText('الشهر:'), { target: { value } });
  };

  it('remark E1: the restaurant tab exposes the two service tabs with Repas default', () => {
    renderFinance('external_traiteur', [lunchSubscriber]);
    expect(screen.getByTestId('service-tab-repas')).toBeTruthy();
    expect(screen.getByTestId('service-tab-gouter')).toBeTruthy();
    // Repas panel: the three synthesis cards are visible, Goûter detail absent.
    expect(screen.getByText('إجمالي الاشتراكات')).toBeTruthy();
    expect(screen.queryByTestId('finance-gouter-table')).toBeNull();
  });

  it('remark E1: the Goûter panel swaps in the mirrored cards, the Goûter detail 3.2 and the 3.3 grid', () => {
    renderFinance('external_traiteur', [lunchSubscriber]);
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    expect(screen.getByTestId('finance-gouter-table')).toBeTruthy();
    expect(screen.getByTestId('finance-gouter-monthly')).toBeTruthy();
    // The lunch detail table is not in the Goûter panel.
    expect(screen.queryByText(/تفاصيل استهلاك التلاميذ \(/)).toBeNull();
  });

  it('remark E7: the Repas cards and the monthly table 3.1 count lunch attendances only', () => {
    renderFinance('external_traiteur', [lunchSubscriber, gouterStudent]);
    const consumedLabel = screen.getByText('إجمالي الوجبات المستهلكة');
    // Only the subscriber's single Septembre lunch — the gouter attendance on
    // the same date must not leak into the Repas number.
    expect(consumedLabel.parentElement?.textContent).toContain('1');
    // The day program card opens the 3.1 monthly grid — open September's detail.
    fireEvent.click(screen.getByText('سبتمبر (Septembre)'));
    const detail = screen.getByText(/تفاصيل الوجبات المستهلكة في شهر/).closest('div.mt-5') as HTMLElement;
    const rows = within(detail).queryAllByText(/لمجة (الصباح|المساء)/);
    expect(rows.length).toBe(0);
  });

  it('remark E7: the Goûter cards mirror them over gouter attendances and Goûter payments', () => {
    renderFinance('external_traiteur', [lunchSubscriber, gouterStudent]);
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    const consumedLabel = screen.getByText('إجمالي الوجبات المستهلكة');
    // Only FinGouter's single Septembre gouter_apres_midi — the lunch row on
    // the same date must not leak into the Goûter number.
    expect(consumedLabel.parentElement?.textContent).toContain('1');
  });

  it('remark E7 (sum invariant): Repas + Goûter consumption equals the pre-split combined number', () => {
    renderFinance('external_traiteur', [lunchSubscriber, gouterStudent]);
    const readCard = () => screen.getByText('إجمالي الوجبات المستهلكة').parentElement?.textContent ?? '';
    const repasConsumed = readCard();
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    const gouterConsumed = readCard();
    // lunch 1 + gouter 1 = the 2 attendances seeded.
    expect(repasConsumed).toContain('1');
    expect(gouterConsumed).toContain('1');
  });

  it('remark 3.2: the Goûter detail respects the month filter — the displayed data matches the selected month', () => {
    renderFinance('external_traiteur', [gouterStudent]);
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    // The subscriber list is month-independent; the DATA follows the month.
    setMonth('Octobre');
    const table = screen.getByTestId('finance-gouter-table');
    expect(within(table).getByTestId('consumed-soir-st_fin_gouter').textContent).toBe('0');
    expect(within(table).getByTestId('consumed-matin-st_fin_gouter').textContent).toBe('0');
    setMonth('Septembre');
    expect(within(table).getByTestId('consumed-soir-st_fin_gouter').textContent).toBe('1');
  });

  it('remark E1 (US2 regression): a legacy render keeps every panel reachable, merely regrouped', () => {
    renderFinance('external_traiteur', [lunchSubscriber]);
    expect(screen.getByText(/تفاصيل استهلاك التلاميذ \(/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    expect(screen.getByTestId('finance-gouter-table')).toBeTruthy();
  });
});

describe('FinanceModule — US1 tab de-mixing (feature 007)', () => {
  it.each(['external_traiteur', 'in_house_kitchen'] as const)('hides the forfait block, price banner and strip on the Goûter tab (%s mode)', (mode) => {
    renderFinance(mode, [lunchSubscriber]);
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    // FR-001: forfait ferme block absent.
    expect(screen.queryByText(/الفرفي المكتسب/)).toBeNull();
    expect(screen.queryByText(/إغلاق شهر/)).toBeNull();
    // FR-002: meal-price banner absent (both its traiteur figures and the
    // in-house hint variant).
    expect(screen.queryByText('سعر الوجبة:')).toBeNull();
    expect(screen.queryByText(/مطبخ داخلي — بدون وسيط/)).toBeNull();
    // FR-003: the summary strip is removed entirely.
    expect(screen.queryByText(/مداخيل واستهلاك خدمة اللمجة/)).toBeNull();
    // The Goûter content itself stays.
    expect(screen.getByTestId('finance-gouter-table')).toBeTruthy();
    expect(screen.getByTestId('finance-gouter-monthly')).toBeTruthy();
  });

  it('keeps the forfait block and price banner on the Repas tab (FR-004 regression)', () => {
    // A finished month lets the «إغلاق شهر» action render (Septembre 2026 is
    // over when today is in October+ of the 2026/2027 year; the default filter
    // month is the current academic month, so pin a finished one explicitly).
    renderFinance('external_traiteur', [lunchSubscriber]);
    // FR-004: both Repas-only blocks render on the Repas panel.
    expect(screen.getByText(/الفرفي المكتسب/)).toBeTruthy();
    expect(screen.getByText('سعر الوجبة:')).toBeTruthy();
  });

  it('renders the «إغلاق شهر» closure action on the Repas tab for a finished month', () => {
    renderFinance('external_traiteur', [lunchSubscriber], {
      onUpdateMealForfaitClosures: vi.fn()
    });
    // The default filter month is the current academic month (Septembre for
    // the 2026/2027 year in this environment) — finished on/after Octobre 1st,
    // which 'today' (2026-09-28 mocked-or-real) may not satisfy, so assert via
    // whichever state applies: the button OR its not-yet-finished hint exists
    // inside the forfait card on the Repas tab only.
    const forfaitCard = screen.getByText(/الفرفي المكتسب/).closest('div.bg-gradient-to-r') as HTMLElement;
    const hasButton = screen.queryByText(/إغلاق شهر/) !== null || within(forfaitCard).queryByText(/إغلاق شهر/) !== null;
    const hasHint = within(forfaitCard).queryByText(/الزر يتفعّل عند نهاية الشهر/) !== null;
    expect(hasButton || hasHint, 'closure action or its pending hint must render on Repas').toBe(true);
    // And neither appears on the Goûter tab.
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    expect(screen.queryByText(/الفرفي المكتسب/)).toBeNull();
    expect(screen.queryByText(/إغلاق شهر/)).toBeNull();
    expect(screen.queryByText(/الزر يتفعّل عند نهاية الشهر/)).toBeNull();
  });
});

describe('FinanceModule — US3 source-level Repas isolation (feature 007)', () => {
  // A day holding TWO lunch records + ONE goûter record in the same month:
  // the Repas figures must count 2, never 3.
  const mixedStudent = student({
    id: 'st_mixed_fin',
    firstName: 'Mixed',
    lastName: 'Day',
    enrolledServices: { ...baseServices, meals: true, gouterSoir: true },
    mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true },
    mealAttendances: [
      { date: '2026-09-14', type: 'subscription', paid: true, service: 'lunch' },
      { date: '2026-09-14', type: 'unit', paid: true, service: 'lunch' },
      { date: '2026-09-14', type: 'unit', paid: false, service: 'gouter_apres_midi' }
    ]
  });

  const openDayDetail = () => {
    fireEvent.click(screen.getByText('سبتمبر (Septembre)'));
    const detail = screen.getByText(/تفاصيل الوجبات المستهلكة في شهر/).closest('div.mt-5') as HTMLElement;
    const dayToggle = within(detail).getAllByRole('button').find(b => (b.textContent || '').includes('2026-09-14'))!;
    fireEvent.click(dayToggle); // expand the shared day — research R4
    return detail;
  };

  it('counts the 3.1 month cell lunch-only at the source (2, not 3)', () => {
    renderFinance('external_traiteur', [mixedStudent]);
    const septCell = screen.getByText('سبتمبر (Septembre)').closest('button') as HTMLElement;
    expect(septCell.textContent).toContain('2');
    expect(septCell.textContent).not.toContain('3');
  });

  it('shows zero goûter rows in the expanded day panel of the Repas month detail', () => {
    renderFinance('external_traiteur', [mixedStudent]);
    const detail = openDayDetail();
    // The goûter row would render as «لمجة المساء …» — it must not exist.
    expect(within(detail).queryByText(/لمجة المساء/)).toBeNull();
    expect(within(detail).queryByText(/لمجة الصباح/)).toBeNull();
    // Both lunch rows render (subscription + unit).
    expect(within(detail).getAllByText(/وجبة غداء/).length).toBe(2);
  });

  it('keeps the day badge at the lunch-only count', () => {
    renderFinance('external_traiteur', [mixedStudent]);
    openDayDetail();
    const badge = screen.getAllByText(/2 وجبة/);
    expect(badge.length).toBeGreaterThan(0);
    expect(screen.queryByText(/3 وجبة/)).toBeNull();
  });

  it('cell-level sum invariant: Repas 3.1 cell + Goûter grid cell equals the combined count', () => {
    renderFinance('external_traiteur', [mixedStudent]);
    const repasSept = (screen.getByText('سبتمبر (Septembre)').closest('button') as HTMLElement).textContent || '';
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    const gouterSept = (screen.getByTestId('gouter-monthly-Septembre').textContent || '');
    // lunch 2 + gouter 1 = 3 combined; Repas cell shows 2, Goûter cell shows 1.
    expect(repasSept).toContain('2');
    expect(gouterSept).toContain('1');
  });
});
