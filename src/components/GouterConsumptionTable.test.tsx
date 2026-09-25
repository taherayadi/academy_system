import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import GouterConsumptionTable from './GouterConsumptionTable';
import { Student, CenterFeeSet } from '../types';

const baseServices = { etude: true, suivi: true, library: false, meals: false };

const student = (overrides: Record<string, unknown>): Student =>
  ({ id: 'st_x', firstName: 'A', lastName: 'B', grade: 'G', enrolledServices: { ...baseServices }, ...overrides } as unknown as Student);

const fees = {
  fraisGouterMatinMensuel: 15,
  fraisGouterSoirMensuel: 10,
  fraisDeuxGoutersMensuel: 22,
  fraisGouterMatinUnitaire: 1,
  fraisGouterSoirUnitaire: 1.5
} as unknown as CenterFeeSet;

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('GouterConsumptionTable — the dedicated Goûter table (revision D, remarks M2 + F2)', () => {
  it('shows a gouterBoth student with «اللمجتان معاً» and both per-service counts', () => {
    const both = student({
      firstName: 'Both',
      enrolledServices: { ...baseServices, gouterMatin: true, gouterSoir: true, gouterBoth: true },
      mealAttendances: [
        { date: '2026-09-07', type: 'subscription', paid: true, service: 'gouter_matin' },
        { date: '2026-09-08', type: 'unit', paid: false, service: 'gouter_apres_midi' }
      ]
    });
    render(<GouterConsumptionTable students={[both]} month="Septembre" schoolYear="2026/2027" fees={fees} />);
    expect(screen.getByText('اللمجتان معاً')).toBeTruthy();
    expect(screen.getByText('Both B')).toBeTruthy();
    expect(screen.getByTestId('consumed-matin-st_x').textContent).toBe('1');
    expect(screen.getByTestId('consumed-soir-st_x').textContent).toBe('1');
  });

  it('shows a matin-only student with a single service type', () => {
    const matin = student({
      firstName: 'Matin',
      enrolledServices: { ...baseServices, gouterMatin: true }
    });
    render(<GouterConsumptionTable students={[matin]} month="Septembre" schoolYear="2026/2027" fees={fees} />);
    expect(screen.getByText('لمجة الصباح')).toBeTruthy();
    expect(screen.queryByText('اللمجتان معاً')).toBeNull();
  });

  it('reflects the month payment status from Goûter payments', () => {
    const paid = student({
      firstName: 'Paid',
      enrolledServices: { ...baseServices, gouterMatin: true },
      payments: [{ id: 'p1', service: 'Goûter', month: 'Septembre (2026/2027)', amountPaid: 15 }]
    });
    const unpaid = student({
      id: 'st_unpaid',
      firstName: 'Unpaid',
      enrolledServices: { ...baseServices, gouterMatin: true }
    });
    render(<GouterConsumptionTable students={[paid, unpaid]} month="Septembre" schoolYear="2026/2027" fees={fees} />);
    expect(screen.getByText('مسدد')).toBeTruthy();
    expect(screen.getByText('غير مسدد')).toBeTruthy();
  });

  it('offers a pay-unit action for unpaid unit goûters and calls back per service', () => {
    const st = student({
      firstName: 'Unit',
      enrolledServices: { ...baseServices, gouterSoir: true },
      mealAttendances: [{ date: '2026-09-14', type: 'unit', paid: false, service: 'gouter_apres_midi' }]
    });
    const onPayUnit = vi.fn();
    render(
      <GouterConsumptionTable
        students={[st]}
        month="Septembre"
        schoolYear="2026/2027"
        fees={fees}
        onPayUnit={onPayUnit}
      />
    );
    const btn = screen.getByTitle('خلاص لمجة المساء');
    fireEvent.click(btn);
    expect(onPayUnit).toHaveBeenCalledWith(st, 'gouter_apres_midi');
  });

  it('never lists a lunch-only student', () => {
    const lunchOnly = student({ id: 'st_lunch', firstName: 'LunchOnly', enrolledServices: { ...baseServices, meals: true } });
    render(<GouterConsumptionTable students={[lunchOnly]} month="Septembre" schoolYear="2026/2027" fees={fees} />);
    expect(screen.queryByText('LunchOnly')).toBeNull();
    expect(screen.getByText('لا يوجد مشتركون في خدمة اللمجة.')).toBeTruthy();
  });

  it('keeps legacy goûter-only students (stale meals:true) in the Goûter table', () => {
    const legacy = student({
      firstName: 'Legacy',
      enrolledServices: { ...baseServices, meals: true, gouterMatin: true },
      mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true }
    });
    render(<GouterConsumptionTable students={[legacy]} month="Septembre" schoolYear="2026/2027" fees={fees} />);
    expect(screen.getByText('Legacy B')).toBeTruthy();
  });
});
