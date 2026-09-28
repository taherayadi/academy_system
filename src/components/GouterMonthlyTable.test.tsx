import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import GouterMonthlyTable from './GouterMonthlyTable';
import { Student } from '../types';

const baseServices = { etude: true, suivi: true, library: false, meals: false };

const student = (overrides: Record<string, unknown>): Student =>
  ({ id: 'st_x', firstName: 'A', lastName: 'B', grade: 'G', enrolledServices: { ...baseServices }, ...overrides } as unknown as Student);

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('GouterMonthlyTable — the Goûter-only monthly grid (revision E, remark 3.3)', () => {
  it('renders one cell per academic month with matin/soir/total counts from computeGouterMonthly', () => {
    const both = student({
      id: 'st_both',
      firstName: 'Both',
      enrolledServices: { ...baseServices, gouterMatin: true, gouterSoir: true, gouterBoth: true },
      mealAttendances: [
        { date: '2026-09-01', type: 'subscription', paid: true, service: 'gouter_matin' },
        { date: '2026-09-02', type: 'unit', paid: false, service: 'gouter_matin' },
        { date: '2026-10-03', type: 'subscription', paid: true, service: 'gouter_apres_midi' }
      ]
    });
    render(<GouterMonthlyTable students={[both]} schoolYear="2026/2027" />);
    // Septembre cell: 2 matin, 0 soir, 2 total.
    const sept = screen.getByTestId('gouter-monthly-Septembre');
    expect(sept.textContent).toContain('2');
    // Octobre cell: 1 soir.
    const oct = screen.getByTestId('gouter-monthly-Octobre');
    expect(oct.textContent).toContain('1');
    // All nine academic months render.
    ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai'].forEach(m => {
      expect(screen.getByTestId(`gouter-monthly-${m}`)).toBeTruthy();
    });
  });

  it('never shows lunch data — «sans aucune donnée du Repas»', () => {
    const mixed = student({
      id: 'st_mixed',
      firstName: 'Mixed',
      enrolledServices: { ...baseServices, meals: true, gouterSoir: true },
      mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true },
      mealAttendances: [
        { date: '2026-09-05', type: 'subscription', paid: true, service: 'lunch' },
        { date: '2026-09-06', type: 'subscription', paid: true, service: 'lunch' },
        { date: '2026-09-06', type: 'subscription', paid: true, service: 'gouter_apres_midi' }
      ]
    });
    render(<GouterMonthlyTable students={[mixed]} schoolYear="2026/2027" />);
    const sept = screen.getByTestId('gouter-monthly-Septembre');
    // 1 goûter, and the two lunch rows appear nowhere in the cell.
    expect(sept.textContent).toContain('1');
    expect(sept.textContent).not.toContain('3');
  });

  it('renders the explicit empty state when no goûter attendance exists (feature 007: zero grand total, empty month detail)', () => {
    render(<GouterMonthlyTable students={[student({ id: 'st_empty' })]} schoolYear="2026/2027" />);
    // The grid still renders (clickable cells) with a zero grand total; the
    // empty state moved to the month detail per FR-010.
    expect(screen.getByText('الإجمالي الكلي')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gouter-monthly-Septembre'));
    expect(screen.getByText('لا يوجد استهلاك في هذا الشهر.')).toBeTruthy();
  });
});

describe('GouterMonthlyTable — day drilldown (feature 007, US2)', () => {
  const active = student({
    id: 'st_drill',
    firstName: 'Sami',
    lastName: 'BenAli',
    grade: 'GS2',
    enrolledServices: { ...baseServices, gouterMatin: true, gouterSoir: true, gouterBoth: true },
    mealAttendances: [
      { date: '2026-10-02', type: 'unit', paid: false, service: 'gouter_matin' },
      { date: '2026-10-06', type: 'subscription', paid: true, service: 'gouter_apres_midi' },
      { date: '2026-10-06', type: 'subscription', paid: true, service: 'lunch' }
    ]
  });

  it('renders the Repas-style card container with the grand-total badge', () => {
    render(<GouterMonthlyTable students={[active]} schoolYear="2026/2027" />);
    expect(screen.getByText('إجمالي استهلاك اللمجة في كل شهر')).toBeTruthy();
    expect(screen.getByText('الإجمالي الكلي')).toBeTruthy();
  });

  it('opens a day-grouped detail when a month cell is clicked, listing goûter rows only', () => {
    render(<GouterMonthlyTable students={[active]} schoolYear="2026/2027" />);
    fireEvent.click(screen.getByTestId('gouter-monthly-Octobre'));
    // Day panels exist (one per day with consumption), rows carry the student.
    expect(screen.getAllByText(/2026-10-\d\d/).length).toBeGreaterThan(0);
    // The lunch row on the same day appears nowhere (source-level exclusion).
    expect(screen.queryByText('وجبة غداء')).toBeNull();
  });

  it('toggles a day panel open and closed independently', () => {
    render(<GouterMonthlyTable students={[active]} schoolYear="2026/2027" />);
    fireEvent.click(screen.getByTestId('gouter-monthly-Octobre'));
    const dayToggle = screen.getAllByRole('button').find(b => (b.textContent || '').includes('2026-10-06'))!;
    // Rows hidden before expanding, visible after.
    expect(screen.queryByText('Sami BenAli')).toBeNull();
    fireEvent.click(dayToggle);
    expect(screen.getAllByText('Sami BenAli').length).toBe(1);
    fireEvent.click(dayToggle);
    expect(screen.queryByText('Sami BenAli')).toBeNull();
  });

  it('closes the detail on re-click of the active month and via the close action', () => {
    render(<GouterMonthlyTable students={[active]} schoolYear="2026/2027" />);
    const cell = screen.getByTestId('gouter-monthly-Octobre');
    fireEvent.click(cell);
    expect(screen.getAllByText(/2026-10-\d\d/).length).toBeGreaterThan(0);
    // Close action.
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(screen.queryByText(/2026-10-\d\d/)).toBeNull();
    // Re-click the active month closes it too.
    fireEvent.click(cell);
    expect(screen.getAllByText(/2026-10-\d\d/).length).toBeGreaterThan(0);
    fireEvent.click(cell);
    expect(screen.queryByText(/2026-10-\d\d/)).toBeNull();
  });

  it('shows the explicit empty message for a consumption-free month', () => {
    render(<GouterMonthlyTable students={[active]} schoolYear="2026/2027" />);
    fireEvent.click(screen.getByTestId('gouter-monthly-Février'));
    expect(screen.getByText('لا يوجد استهلاك في هذا الشهر.')).toBeTruthy();
  });
});
