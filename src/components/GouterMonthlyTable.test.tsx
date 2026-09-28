import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

  it('renders the explicit empty state when no goûter attendance exists', () => {
    render(<GouterMonthlyTable students={[student({ id: 'st_empty' })]} schoolYear="2026/2027" />);
    expect(screen.getByText('لا يوجد استهلاك مسجل لخدمة اللمجة.')).toBeTruthy();
  });
});
