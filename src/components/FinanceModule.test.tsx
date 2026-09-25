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

const renderFinance = (mode: 'external_traiteur' | 'in_house_kitchen') => {
  render(
    <FinanceModule
      students={[gouterStudent]}
      expenses={[]}
      onUpdateExpenses={vi.fn()}
      settings={settings(mode)}
      enabledModules={['cantine']}
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
    const gouterTable = screen.getByTestId('finance-gouter-table');
    expect(within(gouterTable).getByText('FinGouter B')).toBeTruthy();
    expect(within(gouterTable).getByTestId('consumed-soir-st_fin_gouter').textContent).toBe('1');
    expect(within(gouterTable).getByTestId('consumed-matin-st_fin_gouter').textContent).toBe('0');
  });
});
