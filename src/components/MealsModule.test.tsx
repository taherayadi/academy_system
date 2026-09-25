import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import MealsModule from './MealsModule';
import { Student, CenterSettings } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: (_t, prop) => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('./ConfirmDialog', () => ({
  default: (props: any) => (
    <div data-testid="confirm-dialog">
      <button onClick={props.onConfirm}>confirm</button>
      <button onClick={props.onCancel}>cancel</button>
    </div>
  ),
}));

const baseServices = { etude: true, suivi: true, library: false, meals: false };

const student = (overrides: Record<string, unknown>): Student =>
  ({ id: 'st_x', firstName: 'A', lastName: 'B', grade: 'G', enrolledServices: { ...baseServices }, ...overrides } as unknown as Student);

const settings = { centerName: 'Test Center' } as unknown as CenterSettings;

const lunchSubscribed = student({
  id: 'st_lunch',
  firstName: 'Lunch',
  enrolledServices: { ...baseServices, meals: true },
  mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true }
});

const gouterOnlyFresh = student({
  id: 'st_gouter',
  firstName: 'Gouter',
  enrolledServices: { ...baseServices, gouterMatin: true }
});

const gouterOnlyLegacy = student({
  id: 'st_legacy',
  firstName: 'Legacy',
  enrolledServices: { ...baseServices, meals: true, gouterMatin: true }
});

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('MealsModule — revision D remarks', () => {
  it('remark M1: renders the six day tabs including «السبت» (Samedi) and selects it', () => {
    render(<MealsModule students={[lunchSubscribed]} mealPlans={[]} onUpdateStudents={vi.fn()} onUpdateMealPlans={vi.fn()} settings={settings} />);
    const saturdayTab = screen.getByRole('button', { name: 'السبت' });
    expect(saturdayTab).toBeTruthy();
    ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].forEach(label => {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    });
    fireEvent.click(saturdayTab);
    expect(saturdayTab.className).toContain('bg-brand-600');
  });

  it('remark M1: resolves Samedi from the shared DAY_BY_INDEX', async () => {
    const logic = await import('../utils/mealLogic');
    expect(logic.DAY_BY_INDEX[6]).toBe('Samedi');
  });

  it('remark M2: the lunch consumption table lists lunch subscribers only; fresh and legacy goûter-only shapes are excluded', () => {
    render(
      <MealsModule
        students={[lunchSubscribed, gouterOnlyFresh, gouterOnlyLegacy]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    const lunchCard = screen.getByText('متابعة استهلاك المشتركين شهرياً').closest('div.bg-white') as HTMLElement;
    expect(within(lunchCard).getByText('Lunch B')).toBeTruthy();
    expect(within(lunchCard).queryByText('Gouter B')).toBeNull();
    expect(within(lunchCard).queryByText('Legacy B')).toBeNull();
  });

  it('remark M2: the dedicated Goûter table lists goûter subscribers with type and counts', () => {
    render(
      <MealsModule
        students={[lunchSubscribed, gouterOnlyFresh]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    const gouterCard = screen.getByText('متابعة استهلاك مشتركي اللمجة شهرياً').closest('div.bg-white') as HTMLElement;
    expect(within(gouterCard).getByText('Gouter B')).toBeTruthy();
    expect(within(gouterCard).getByText('لمجة الصباح')).toBeTruthy();
    expect(within(gouterCard).queryByText('Lunch B')).toBeNull();
  });

  it('remark M2: a dual-service student (active lunch + goûter) appears in both tables', () => {
    const dual = student({
      id: 'st_dual',
      firstName: 'Dual',
      enrolledServices: { ...baseServices, meals: true, gouterMatin: true },
      mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true }
    });
    render(
      <MealsModule
        students={[dual]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    const lunchCard = screen.getByText('متابعة استهلاك المشتركين شهرياً').closest('div.bg-white') as HTMLElement;
    const gouterCard = screen.getByText('متابعة استهلاك مشتركي اللمجة شهرياً').closest('div.bg-white') as HTMLElement;
    expect(within(lunchCard).getByText('Dual B')).toBeTruthy();
    expect(within(gouterCard).getByText('Dual B')).toBeTruthy();
  });

  it('remark M4: the Goûter subscribers table shows the edit-type action but no unenroll button', () => {
    render(
      <MealsModule
        students={[gouterOnlyFresh]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    expect(screen.queryByTitle('إلغاء الاشتراك في اللمجة')).toBeNull();
    expect(screen.getByTitle('تعديل نوع الاشتراك')).toBeTruthy();
  });

  it('remark M3: the unit-meal modal starts with all three service toggles disabled before selection', () => {
    render(
      <MealsModule
        students={[lunchSubscribed, gouterOnlyFresh]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /إضافة تلميذ بالوحدة/ }));
    expect(screen.getByTestId('unit-service-toggle-lunch')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('unit-service-toggle-gouter_matin')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('unit-service-toggle-gouter_apres_midi')).toHaveProperty('disabled', true);
  });

  it('remark M3: selecting a candidate enables exactly the services his subscription covers', () => {
    render(
      <MealsModule
        students={[gouterOnlyFresh, lunchSubscribed]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /إضافة تلميذ بالوحدة/ }));
    fireEvent.click(screen.getByTestId('unit-candidate-st_gouter'));
    expect(screen.getByTestId('unit-service-toggle-lunch')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('unit-service-toggle-gouter_matin')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('unit-service-toggle-gouter_apres_midi')).toHaveProperty('disabled', true);
  });

  it('remark M3: a non-subscribed student gets all three toggles at unit price', () => {
    const unitStudent = student({ id: 'st_unit', firstName: 'Unit', lastName: 'Student' });
    render(
      <MealsModule
        students={[unitStudent]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /إضافة تلميذ بالوحدة/ }));
    fireEvent.click(screen.getByText('Unit Student'));
    ['lunch', 'gouter_matin', 'gouter_apres_midi'].forEach(s => {
      expect(screen.getByTestId(`unit-service-toggle-${s}`)).toHaveProperty('disabled', false);
    });
  });

  it('remark M3: confirming with two services writes two unit attendances (lunch + goûter matin)', async () => {
    const unitStudent = student({ id: 'st_unit2', firstName: 'Unit', lastName: 'Two' });
    const onUpdate = vi.fn();
    render(
      <MealsModule
        students={[unitStudent]}
        mealPlans={[]}
        onUpdateStudents={onUpdate}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /إضافة تلميذ بالوحدة/ }));
    fireEvent.click(screen.getByText('Unit Two'));
    fireEvent.click(screen.getByTestId('unit-service-toggle-lunch'));
    fireEvent.click(screen.getByTestId('unit-service-toggle-gouter_matin'));
    fireEvent.click(screen.getByRole('button', { name: 'إضافة الخدمات المحددة' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const updated = onUpdate.mock.calls[0][0].find((s: Student) => s.id === 'st_unit2') as Student;
    const services = (updated.mealAttendances || []).map(a => a.service);
    expect(services).toContain('lunch');
    expect(services).toContain('gouter_matin');
    expect(updated.mealAttendances!.filter(a => a.date === (updated.mealAttendances![0].date)).length).toBe(2);
  });

  it('remark M3: the confirm button stays disabled until at least one service is ticked', () => {
    const unitStudent = student({ id: 'st_unit3', firstName: 'Unit', lastName: 'Three' });
    render(
      <MealsModule
        students={[unitStudent]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /إضافة تلميذ بالوحدة/ }));
    fireEvent.click(screen.getByText('Unit Three'));
    expect(screen.getByRole('button', { name: 'إضافة الخدمات المحددة' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByTestId('unit-service-toggle-lunch'));
    expect(screen.getByRole('button', { name: 'إضافة الخدمات المحددة' })).toHaveProperty('disabled', false);
  });
});
