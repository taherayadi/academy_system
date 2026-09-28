import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import MealsModule from './MealsModule';
import { Student, CenterSettings, initialStudentFeeSet } from '../types';

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
    fireEvent.click(screen.getByTestId('service-tab-repas'));
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
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
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
    fireEvent.click(screen.getByTestId('service-tab-repas'));
    const lunchCard = screen.getByText('متابعة استهلاك المشتركين شهرياً').closest('div.bg-white') as HTMLElement;
    expect(within(lunchCard).getByText('Dual B')).toBeTruthy();
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    const gouterCard = screen.getByText('متابعة استهلاك مشتركي اللمجة شهرياً').closest('div.bg-white') as HTMLElement;
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
    // The Goûter subscribers grid lives on the Goûter panel (revision E).
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
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

describe('MealsModule — revision E (onglets Repas/Goûter)', () => {
  it('remark E1: renders the two service tabs under the filters, Repas active by default', () => {
    render(<MealsModule students={[lunchSubscribed]} mealPlans={[]} onUpdateStudents={vi.fn()} onUpdateMealPlans={vi.fn()} settings={settings} />);
    expect(screen.getByTestId('service-tab-repas')).toBeTruthy();
    expect(screen.getByTestId('service-tab-gouter')).toBeTruthy();
    // Default view is Repas: lunch consumption visible, Goûter grid absent.
    expect(screen.getByText('متابعة استهلاك المشتركين شهرياً')).toBeTruthy();
    expect(screen.queryByText(/جدول المشتركين في خدمة اللمجة - Goûter/)).toBeNull();
  });

  it('remark E1: the Repas tab shows exactly the payment grid, day program and lunch consumption', () => {
    render(<MealsModule students={[lunchSubscribed]} mealPlans={[]} onUpdateStudents={vi.fn()} onUpdateMealPlans={vi.fn()} settings={settings} />);
    expect(screen.getByText(/شبكة مدفوعات المطعم/)).toBeTruthy();
    expect(screen.getByText('برنامج وجبة اليوم:')).toBeTruthy();
    expect(screen.getByText('متابعة استهلاك المشتركين شهرياً')).toBeTruthy();
    // The Goûter sections are not in the Repas panel.
    expect(screen.queryByText('متابعة استهلاك مشتركي اللمجة شهرياً')).toBeNull();
  });

  it('remark E1: the Goûter tab shows exactly the subscribers grid and the Goûter consumption table', () => {
    render(
      <MealsModule
        students={[lunchSubscribed, gouterOnlyFresh]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    expect(screen.getByText(/جدول المشتركين في خدمة اللمجة - Goûter/)).toBeTruthy();
    expect(screen.getByText('متابعة استهلاك مشتركي اللمجة شهرياً')).toBeTruthy();
    // The Repas sections are not in the Goûter panel.
    expect(screen.queryByText(/شبكة مدفوعات المطعم/)).toBeNull();
    expect(screen.queryByText('برنامج وجبة اليوم:')).toBeNull();
    expect(screen.queryByText('متابعة استهلاك المشتركين شهرياً')).toBeNull();
  });

  it('remark E1: the daily pointage stays shared below the tab panels on both tabs', () => {
    render(<MealsModule students={[lunchSubscribed]} mealPlans={[]} onUpdateStudents={vi.fn()} onUpdateMealPlans={vi.fn()} settings={settings} />);
    expect(screen.getByText(/Pointage اليوم/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    expect(screen.getByText(/Pointage اليوم/)).toBeTruthy();
  });

  it('remark E4: «تسجيل الوجبة» on a lunch subscriber writes exactly one lunch attendance and no gouter attendance', async () => {
    const onUpdate = vi.fn();
    render(
      <MealsModule
        students={[lunchSubscribed]}
        mealPlans={[]}
        onUpdateStudents={onUpdate}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    const lunchCard = screen.getByText('متابعة استهلاك المشتركين شهرياً').closest('div.bg-white') as HTMLElement;
    fireEvent.click(within(lunchCard).getByRole('button', { name: 'تسجيل الوجبة' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const updated = onUpdate.mock.calls[0][0].find((s: Student) => s.id === 'st_lunch') as Student;
    const thatDay = (updated.mealAttendances || []).filter(a => a.date === updated.mealAttendances![0].date);
    expect(thatDay.map(a => a.service || 'lunch')).toEqual(['lunch']);
  });

  it('remark E5: the Goûter mark-today button creates a gouter-only line for an absent student', async () => {
    const onUpdate = vi.fn();
    render(
      <MealsModule
        students={[gouterOnlyFresh]}
        mealPlans={[]}
        onUpdateStudents={onUpdate}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    fireEvent.click(screen.getByTestId(`mark-today-${gouterOnlyFresh.id}`));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const updated = onUpdate.mock.calls[0][0].find((s: Student) => s.id === gouterOnlyFresh.id) as Student;
    const thatDay = (updated.mealAttendances || []).filter(a => a.date === updated.mealAttendances![0].date);
    expect(thatDay.map(a => a.service || 'lunch')).toEqual(['gouter_matin']);
  });

  it('remark E5: the Goûter mark-today button appends goûter to an existing lunch-only line without duplicating it', async () => {
    const dualLunch = student({
      id: 'st_dual_e5',
      firstName: 'DualE5',
      enrolledServices: { ...baseServices, meals: true, gouterMatin: true },
      mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true },
      mealAttendances: [{ date: new Date().toISOString().split('T')[0], type: 'subscription', paid: true, service: 'lunch' }]
    });
    const onUpdate = vi.fn();
    render(
      <MealsModule
        students={[dualLunch]}
        mealPlans={[]}
        onUpdateStudents={onUpdate}
        onUpdateMealPlans={vi.fn()}
        settings={settings}
      />
    );
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    fireEvent.click(screen.getByTestId(`mark-today-${dualLunch.id}`));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const updated = onUpdate.mock.calls[0][0].find((s: Student) => s.id === 'st_dual_e5') as Student;
    const thatDay = (updated.mealAttendances || []).filter(a => a.date === new Date().toISOString().split('T')[0]);
    expect(thatDay).toHaveLength(2);
    expect(thatDay.filter(a => (a.service || 'lunch') === 'lunch')).toHaveLength(1);
    expect(thatDay.filter(a => a.service === 'gouter_matin')).toHaveLength(1);
  });

  it('remark E1 (US2 regression): an unknown-type legacy render keeps every section present, merely regrouped', () => {
    render(<MealsModule students={[lunchSubscribed, gouterOnlyFresh]} mealPlans={[]} onUpdateStudents={vi.fn()} onUpdateMealPlans={vi.fn()} settings={settings} />);
    // Both panels reachable: the tabs only regroup — nothing disappears.
    fireEvent.click(screen.getByTestId('service-tab-repas'));
    expect(screen.getByText(/شبكة مدفوعات المطعم/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    expect(screen.getByText(/جدول المشتركين في خدمة اللمجة - Goûter/)).toBeTruthy();
  });
});

describe('MealsModule — Goûter paid-status cross-surface agreement (feature 008)', () => {
  const feesSettings = {
    centerName: 'Test Center',
    fees: { ...initialStudentFeeSet, fraisGouterMatinMensuel: 15 }
  } as unknown as CenterSettings;

  // One shared paid-month fixture: a settled Goûter month (frais 15 = paid 15)
  // plus a refund-shaped record (the anomaly's repro) and day goûter
  // attendances — both surfaces must agree through the shared computation.
  const paidGouterStudent = student({
    id: 'st_gouter_paid008',
    firstName: 'PaidGouter',
    enrolledServices: { ...baseServices, gouterMatin: true },
    payments: [
      { id: 'p_paid008', service: 'Goûter', month: 'Septembre (2026/2027)', amountPaid: 15 },
      { id: 'r_paid008', service: 'Goûter', month: 'Septembre (2026/2027)', amountPaid: -5, refund: true }
    ],
    mealAttendances: [
      { date: '2026-09-14', type: 'subscription', paid: true, service: 'gouter_matin' },
      { date: '2026-09-15', type: 'unit', paid: false, service: 'gouter_matin' }
    ]
  });

  it('FR-009: a settled Goûter month with a refund record shows the paid mark on the monthly grid', () => {
    render(
      <MealsModule
        students={[paidGouterStudent]}
        mealPlans={[]}
        onUpdateStudents={vi.fn()}
        onUpdateMealPlans={vi.fn()}
        settings={feesSettings}
      />
    );
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    expect(screen.getByText(/جدول المشتركين في خدمة اللمجة - Goûter/)).toBeTruthy();
    expect(screen.getByText(/Payé \(15 د.ت\)/)).toBeTruthy();
  });

  it('FR-009: mark-today writes a paid subscription row when the month is settled', async () => {
    const onUpdate = vi.fn();
    render(
      <MealsModule
        students={[paidGouterStudent]}
        mealPlans={[]}
        onUpdateStudents={onUpdate}
        onUpdateMealPlans={vi.fn()}
        settings={feesSettings}
      />
    );
    fireEvent.click(screen.getByTestId('service-tab-gouter'));
    fireEvent.click(screen.getByTestId(`mark-today-${paidGouterStudent.id}`));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const today = new Date().toISOString().split('T')[0];
    const updated = onUpdate.mock.calls[0][0].find((s: Student) => s.id === paidGouterStudent.id) as Student;
    const row = (updated.mealAttendances || []).find(a => a.date === today && a.service === 'gouter_matin');
    expect(row).toBeTruthy();
    expect(row!.type).toBe('subscription');
    // The reported anomaly: subscription rows written with paid=false render
    // as unpaid meals everywhere — paid must follow the settled month.
    expect(row!.paid).toBe(true);
  });

  it('FR-009: the daily-grid mark path treats the paid month as subscription (hasPaid true)', async () => {
    const logic = await import('../utils/mealLogic');
    // Sanity pin on the shared computation the day grid consumes.
    expect(logic.getGouterStatusFor(paidGouterStudent, 'Septembre', '2026/2027', feesSettings.fees).status).toBe('paid');
    // The student must hold an attendance dated today to appear in the day grid.
    const today = new Date().toISOString().split('T')[0];
    const gridStudent = { ...paidGouterStudent, mealAttendances: [...(paidGouterStudent.mealAttendances || []), { date: today, type: 'unit' as const, paid: false, service: 'lunch' as const }] };
    const onUpdate = vi.fn();
    render(
      <MealsModule
        students={[gridStudent]}
        mealPlans={[]}
        onUpdateStudents={onUpdate}
        onUpdateMealPlans={vi.fn()}
        settings={feesSettings}
      />
    );
    // Day grid: mark the goûter for today — the paid month must write a
    // subscription-type, paid=true attendance (hasPaidGouter true).
    fireEvent.click(screen.getByRole('button', { name: '+ لمجة صباح' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const updated = onUpdate.mock.calls[0][0].find((s: Student) => s.id === paidGouterStudent.id) as Student;
    const row = (updated.mealAttendances || []).find(a => a.date === today && a.service === 'gouter_matin');
    expect(row).toBeTruthy();
    expect(row!.type).toBe('subscription');
    expect(row!.paid).toBe(true);
  });
});
