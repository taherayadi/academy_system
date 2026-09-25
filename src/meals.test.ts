import { describe, it, expect } from 'vitest';
import { MealSubscription, MealAttendance, Student } from './types';

describe('Meals Module Business Logic', () => {
  describe('Subscription vs Unit Mode', () => {
    it('manages active monthly subscription plan', () => {
      const sub: MealSubscription = {
        mode: 'subscription',
        monthlyPrice: 150,
        unitPrice: 8,
        prepaidMeals: 0,
        consumedMealsCount: 14,
        active: true
      };

      expect(sub.mode).toBe('subscription');
      expect(sub.active).toBe(true);
      expect(sub.monthlyPrice).toBe(150);
    });

    it('calculates remaining prepaid meals in unit-based plan', () => {
      const unitPlan: MealSubscription = {
        mode: 'unit',
        monthlyPrice: 0,
        unitPrice: 8,
        prepaidMeals: 20,
        consumedMealsCount: 7,
        active: true
      };

      const remainingMeals = Math.max(0, unitPlan.prepaidMeals - unitPlan.consumedMealsCount);

      expect(remainingMeals).toBe(13);
      expect(unitPlan.unitPrice).toBe(8);
    });

    it('prevents negative remaining meals balance', () => {
      const unitPlan: MealSubscription = {
        mode: 'unit',
        monthlyPrice: 0,
        unitPrice: 8,
        prepaidMeals: 5,
        consumedMealsCount: 8,
        active: true
      };

      const remainingMeals = Math.max(0, unitPlan.prepaidMeals - unitPlan.consumedMealsCount);
      expect(remainingMeals).toBe(0);
    });
  });

  describe('Daily Meal Pointage & Attendance', () => {
    it('tracks paid and unpaid unit meal attendances', () => {
      const attendances: MealAttendance[] = [
        { date: '2026-09-01', type: 'unit', paid: true, paidAt: '2026-09-01T12:30:00Z' },
        { date: '2026-09-02', type: 'unit', paid: false },
        { date: '2026-09-03', type: 'subscription', paid: true }
      ];

      const unpaidUnitMeals = attendances.filter(a => a.type === 'unit' && !a.paid);
      const totalPaidMeals = attendances.filter(a => a.paid).length;

      expect(unpaidUnitMeals.length).toBe(1);
      expect(unpaidUnitMeals[0].date).toBe('2026-09-02');
      expect(totalPaidMeals).toBe(2);
    });

    it('updates consumed count when pointage is recorded', () => {
      const student = {
        id: 'st_meal_1',
        firstName: 'Youssef',
        lastName: 'Trabelsi',
        birthDate: '2012-03-20',
        birthPlace: 'Sfax',
        grade: 'Collège 7ème',
        parentalSituation: 'mariés',
        allergies: 'Aucune',
        mealSubscription: {
          mode: 'unit',
          monthlyPrice: 0,
          unitPrice: 8,
          prepaidMeals: 10,
          consumedMealsCount: 3,
          active: true
        },
        mealAttendances: []
      } as unknown as Student;

      // Add a new consumed meal
      const newAttendance: MealAttendance = {
        date: '2026-09-15',
        type: 'unit',
        paid: true,
        paidAt: '2026-09-15T12:15:00Z'
      };

      const updatedStudent: Student = {
        ...student,
        mealSubscription: {
          ...student.mealSubscription!,
          consumedMealsCount: (student.mealSubscription?.consumedMealsCount || 0) + 1
        },
        mealAttendances: [...(student.mealAttendances || []), newAttendance]
      };

      expect(updatedStudent.mealSubscription?.consumedMealsCount).toBe(4);
      expect(updatedStudent.mealAttendances?.length).toBe(1);
      expect(updatedStudent.mealSubscription!.prepaidMeals - updatedStudent.mealSubscription!.consumedMealsCount).toBe(6);
    });
  });
});

describe('Meal logic (revision D)', () => {
  describe('Weekly day constants — remark M1 (Samedi)', () => {
    it('offers Samedi as the sixth selectable day with its Arabic label', async () => {
      const logic = await import('./utils/mealLogic');
      expect(logic.WEEKDAYS).toEqual(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']);
      expect(logic.ARABIC_WEEKDAYS['Samedi']).toBe('السبت');
    });

    it('resolves Saturday from the calendar index and keeps the Sunday fallback', async () => {
      const logic = await import('./utils/mealLogic');
      expect(logic.DAY_BY_INDEX[6]).toBe('Samedi');
      expect(logic.DAY_BY_INDEX[1]).toBe('Lundi');
      expect(logic.DAY_BY_INDEX[0]).toBeUndefined();
    });
  });

  describe('Service eligibility for the unit-meal modal — remark M3', () => {
    const baseServices = { etude: true, suivi: true, library: false, meals: false };
    const makeStudent = (overrides: Record<string, unknown>) =>
      ({ id: 'st_x', firstName: 'A', lastName: 'B', grade: 'G', enrolledServices: { ...baseServices }, ...overrides }) as unknown as Student;

    it('enables only the services the subscription covers for a goûter-subscribed student', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({ enrolledServices: { ...baseServices, gouterMatin: true } });
      expect(logic.eligibleServicesForStudent(st)).toEqual({
        lunch: false, gouterMatin: true, gouterSoir: false, allAtUnitPrice: false
      });
    });

    it('enables both goûter services for a gouterBoth student', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({ enrolledServices: { ...baseServices, gouterSoir: true, gouterBoth: true } });
      const e = logic.eligibleServicesForStudent(st);
      expect(e.gouterMatin).toBe(true);
      expect(e.gouterSoir).toBe(true);
      expect(e.lunch).toBe(false);
    });

    it('enables Déjeuner for a lunch-subscribed student and the goûters per flags', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({ mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true } });
      const e = logic.eligibleServicesForStudent(st);
      expect(e.lunch).toBe(true);
      expect(e.gouterMatin).toBe(false);
      expect(e.allAtUnitPrice).toBe(false);
    });

    it('enables all three services at unit price for a non-subscribed student', async () => {
      const logic = await import('./utils/mealLogic');
      const e = logic.eligibleServicesForStudent(makeStudent({}));
      expect(e).toEqual({ lunch: true, gouterMatin: true, gouterSoir: true, allAtUnitPrice: true });
    });

    it('enables all three services at unit price for a refunded-month student', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({ mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true } });
      const e = logic.eligibleServicesForStudent(st, { refundedMonth: true });
      expect(e).toEqual({ lunch: true, gouterMatin: true, gouterSoir: true, allAtUnitPrice: true });
    });
  });

  describe('Goûter consumption rows — remarks M2 + F2', () => {
    const baseServices = { etude: true, suivi: true, library: false, meals: false };
    const makeStudent = (overrides: Record<string, unknown>) =>
      ({ id: 'st_x', firstName: 'A', lastName: 'B', grade: 'G', enrolledServices: { ...baseServices }, ...overrides }) as unknown as Student;

    it('builds rows for goûter subscribers only, with type and per-service consumption', async () => {
      const logic = await import('./utils/mealLogic');
      const both = makeStudent({
        firstName: 'Both',
        enrolledServices: { ...baseServices, gouterMatin: true, gouterSoir: true, gouterBoth: true },
        mealAttendances: [
          { date: '2026-09-07', type: 'subscription', paid: true, service: 'gouter_matin' },
          { date: '2026-09-08', type: 'unit', paid: false, service: 'gouter_apres_midi' },
          { date: '2026-09-09', type: 'unit', paid: false, service: 'lunch' }
        ]
      });
      const lunchOnly = makeStudent({ firstName: 'LunchOnly', enrolledServices: { ...baseServices, meals: true } });
      const rows = logic.computeGouterRows([both, lunchOnly], 'Septembre', '2026/2027', null);
      expect(rows).toHaveLength(1);
      expect(rows[0].isBoth).toBe(true);
      expect(rows[0].typeLabel).toBe('اللمجتان معاً');
      expect(rows[0].consumedMatin).toBe(1);
      expect(rows[0].consumedSoir).toBe(1);
      expect(rows[0].unpaidUnitSoir).toHaveLength(1);
      expect(rows[0].unpaidUnitMatin).toHaveLength(0);
    });

    it('computes the month payment status from Goûter payments with discount handling', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({
        enrolledServices: { ...baseServices, gouterMatin: true },
        payments: [{ id: 'p1', service: 'Goûter', month: 'Septembre (2026/2027)', amountPaid: 12, discount: 3 }]
      });
      const fees = { fraisGouterMatinMensuel: 15, fraisGouterSoirMensuel: 10, fraisDeuxGoutersMensuel: 0 } as unknown as import('./types').CenterFeeSet;
      const rows = logic.computeGouterRows([st], 'Septembre', '2026/2027', fees);
      expect(rows[0].status).toBe('paid');
      expect(rows[0].remaining).toBe(0);
      expect(rows[0].total).toBe(15);
    });

    it('marks an unpaid month and keeps an unpaid unit goûter out of the subscription count', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({
        enrolledServices: { ...baseServices, gouterSoir: true },
        payments: [],
        mealAttendances: [{ date: '2026-09-14', type: 'unit', paid: false, service: 'gouter_apres_midi' }]
      });
      const rows = logic.computeGouterRows([st], 'Septembre', '2026/2027', null);
      expect(rows[0].status).toBe('unpaid');
      expect(rows[0].remaining).toBeGreaterThan(0);
      expect(rows[0].unpaidUnitSoir).toHaveLength(1);
    });
  });

  it('delegates goûter status to the shared pure implementation (getGouterStatus parity)', async () => {
    const logic = await import('./utils/mealLogic');
    const st = {
      id: 'st_parity', firstName: 'P', lastName: 'Q', grade: 'G',
      enrolledServices: { etude: true, suivi: true, library: false, meals: false, gouterMatin: true }
    } as unknown as Student;
    const local = logic.getGouterStatusFor(st, 'Septembre', '2026/2027', null);
    expect(local.status).toBe('unpaid');
    expect(local.typeLabel).toBe('لمجة الصباح');
  });
});
