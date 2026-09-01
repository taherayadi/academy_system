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
      const student: Student = {
        id: 'st_meal_1',
        firstName: 'Youssef',
        lastName: 'Trabelsi',
        birthDate: '2012-03-20',
        birthPlace: 'Sfax',
        grade: 'Collège 7ème',
        parentalSituation: 'Ensemble',
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
      };

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
