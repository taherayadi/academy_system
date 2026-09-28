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

describe('Meal logic (revision E — onglets Repas/Goûter)', () => {
  const baseServices = { etude: true, suivi: true, library: false, meals: false };
  const makeStudent = (overrides: Record<string, unknown>) =>
    ({ id: 'st_x', firstName: 'A', lastName: 'B', grade: 'G', enrolledServices: { ...baseServices }, ...overrides }) as unknown as Student;

  describe('academicMonthPrefix — single month→prefix map (remark 3.2)', () => {
    it('maps each academic month to its calendar YYYY-MM prefix within the school year', async () => {
      const logic = await import('./utils/mealLogic');
      expect(logic.academicMonthPrefix('Septembre', '2025/2026')).toBe('2025-09');
      expect(logic.academicMonthPrefix('Octobre', '2025/2026')).toBe('2025-10');
      expect(logic.academicMonthPrefix('Décembre', '2025/2026')).toBe('2025-12');
      expect(logic.academicMonthPrefix('Janvier', '2025/2026')).toBe('2026-01');
      expect(logic.academicMonthPrefix('Mai', '2025/2026')).toBe('2026-05');
    });
  });

  describe('computeGouterRows month scoping — remark 3.2 (point de vigilance)', () => {
    it('a Septembre attendance does not count in an Octobre query', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({
        enrolledServices: { ...baseServices, gouterMatin: true },
        mealAttendances: [
          { date: '2025-09-14', type: 'unit', paid: false, service: 'gouter_matin' },
          { date: '2025-09-20', type: 'subscription', paid: true, service: 'gouter_matin' }
        ]
      });
      const sept = logic.computeGouterRows([st], 'Septembre', '2025/2026', null);
      expect(sept[0].consumedMatin).toBe(2);
      expect(sept[0].unpaidUnitMatin).toHaveLength(1);
      const oct = logic.computeGouterRows([st], 'Octobre', '2025/2026', null);
      expect(oct[0].consumedMatin).toBe(0);
      expect(oct[0].unpaidUnitMatin).toHaveLength(0);
    });
  });

  describe('ensureGouterAttendanceForDate — remark E5 service-scoped upsert', () => {
    it('creates gouter-only rows for a student absent from the pointage (no lunch row)', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({
        enrolledServices: { ...baseServices, gouterMatin: true, gouterSoir: true, gouterBoth: true }
      });
      const updated = logic.ensureGouterAttendanceForDate(st, '2025-10-06', ['gouter_matin', 'gouter_apres_midi']);
      const thatDay = (updated.mealAttendances || []).filter(a => a.date === '2025-10-06');
      expect(thatDay).toHaveLength(2);
      expect(thatDay.map(a => a.service).sort()).toEqual(['gouter_apres_midi', 'gouter_matin']);
    });

    it('appends the goûter services to an existing lunch-only line without duplicates', async () => {
      const logic = await import('./utils/mealLogic');
      const lunchRow = { date: '2025-10-06', type: 'subscription', paid: true, service: 'lunch' };
      const st = makeStudent({
        enrolledServices: { ...baseServices, meals: true, gouterMatin: true },
        mealSubscription: { mode: 'subscription', monthlyPrice: 150, unitPrice: 8, prepaidMeals: 0, consumedMealsCount: 0, active: true },
        mealAttendances: [lunchRow]
      });
      const updated = logic.ensureGouterAttendanceForDate(st, '2025-10-06', ['gouter_matin']);
      const thatDay = (updated.mealAttendances || []).filter(a => a.date === '2025-10-06');
      expect(thatDay).toHaveLength(2);
      expect(thatDay.filter(a => a.service === 'lunch')).toHaveLength(1);
      expect(thatDay.filter(a => a.service === 'gouter_matin')).toHaveLength(1);
      // the pre-existing lunch row is returned verbatim — never modified
      expect((updated.mealAttendances || []).find(a => a.date === '2025-10-06' && a.service === 'lunch')).toEqual(lunchRow);
    });

    it('is a no-op (same reference) when every requested service already exists for the date', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({
        enrolledServices: { ...baseServices, gouterMatin: true },
        mealAttendances: [{ date: '2025-10-06', type: 'unit', paid: false, service: 'gouter_matin' }]
      });
      expect(logic.ensureGouterAttendanceForDate(st, '2025-10-06', ['gouter_matin'])).toBe(st);
    });

    it('types created rows from the month payment status and snapshots the traiteur price', async () => {
      const logic = await import('./utils/mealLogic');
      const gouterFees = { fraisGouterMatinMensuel: 15 } as unknown as import('./types').CenterFeeSet;
      const paidSt = makeStudent({
        enrolledServices: { ...baseServices, gouterMatin: true },
        payments: [{ id: 'p1', service: 'Goûter', month: 'Octobre (2025/2026)', amountPaid: 15 }]
      });
      const updated = logic.ensureGouterAttendanceForDate(paidSt, '2025-10-06', ['gouter_matin'], {
        month: 'Octobre', schoolYear: '2025/2026', fees: gouterFees, traiteurPrice: 4.5
      });
      const subRow = (updated.mealAttendances || []).find(a => a.date === '2025-10-06' && a.service === 'gouter_matin')!;
      expect(subRow.type).toBe('subscription');

      const unpaidUpdated = logic.ensureGouterAttendanceForDate(paidSt, '2025-10-07', ['gouter_matin'], {
        month: 'Novembre', schoolYear: '2025/2026', fees: null, traiteurPrice: 4.5
      });
      const unitRow = (unpaidUpdated.mealAttendances || []).find(a => a.date === '2025-10-07' && a.service === 'gouter_matin')!;
      expect(unitRow.type).toBe('unit');
      expect(unitRow.paid).toBe(false);
      expect(unitRow.traiteurPrice).toBe(4.5);
    });
  });

  describe('computeGouterMonthly — remark 3.3 (Goûter-only monthly grid)', () => {
    it('returns one cell per academic month with matin/soir/total counts over gouter attendances only', async () => {
      const logic = await import('./utils/mealLogic');
      const both = makeStudent({
        id: 'st_both',
        enrolledServices: { ...baseServices, gouterMatin: true, gouterSoir: true, gouterBoth: true },
        mealAttendances: [
          { date: '2025-09-01', type: 'subscription', paid: true, service: 'gouter_matin' },
          { date: '2025-09-02', type: 'unit', paid: false, service: 'gouter_matin' },
          { date: '2025-10-03', type: 'subscription', paid: true, service: 'gouter_apres_midi' },
          { date: '2025-10-04', type: 'unit', paid: false, service: 'lunch' }
        ]
      });
      const soir = makeStudent({
        id: 'st_soir',
        enrolledServices: { ...baseServices, gouterSoir: true },
        mealAttendances: [{ date: '2025-10-08', type: 'unit', paid: false, service: 'gouter_apres_midi' }]
      });
      const grid = logic.computeGouterMonthly([both, soir], '2025/2026');
      expect(grid).toHaveLength(9);
      const sept = grid.find(g => g.month === 'Septembre')!;
      const oct = grid.find(g => g.month === 'Octobre')!;
      expect(sept.matin).toBe(2);
      expect(sept.soir).toBe(0);
      expect(sept.total).toBe(2);
      expect(oct.matin).toBe(0);
      expect(oct.soir).toBe(2);
      expect(oct.total).toBe(2);
    });
  });

  describe('gouterServicesForStudent — services behind the mark-today button', () => {
    it('derives the subscribed goûter services from the enrolled flags', async () => {
      const logic = await import('./utils/mealLogic');
      expect(logic.gouterServicesForStudent(makeStudent({ enrolledServices: { ...baseServices, gouterMatin: true } }))).toEqual(['gouter_matin']);
      expect(logic.gouterServicesForStudent(makeStudent({ enrolledServices: { ...baseServices, gouterSoir: true } }))).toEqual(['gouter_apres_midi']);
      expect(logic.gouterServicesForStudent(makeStudent({ enrolledServices: { ...baseServices, gouterBoth: true } }))).toEqual(['gouter_matin', 'gouter_apres_midi']);
      expect(logic.gouterServicesForStudent(makeStudent({}))).toEqual([]);
    });
  });

  describe('isLunchAttendance — the shared lunch predicate (feature 007)', () => {
    it('classifies lunch rows (with or without an explicit service) as lunch', async () => {
      const logic = await import('./utils/mealLogic');
      expect(logic.isLunchAttendance({ date: '2026-09-01', type: 'subscription', paid: true, service: 'lunch' } as never)).toBe(true);
      expect(logic.isLunchAttendance({ date: '2026-09-01', type: 'unit', paid: false } as never)).toBe(true);
    });

    it('classifies goûter rows as non-lunch', async () => {
      const logic = await import('./utils/mealLogic');
      expect(logic.isLunchAttendance({ date: '2026-09-01', type: 'subscription', paid: true, service: 'gouter_matin' } as never)).toBe(false);
      expect(logic.isLunchAttendance({ date: '2026-09-01', type: 'unit', paid: false, service: 'gouter_apres_midi' } as never)).toBe(false);
    });
  });

  describe('computeGouterMonthDetail — the Goûter day drilldown (feature 007)', () => {
    it('groups the month\'s gouter attendances by date ascending with full row context', async () => {
      const logic = await import('./utils/mealLogic');
      const both = makeStudent({
        firstName: 'Sami',
        lastName: 'BenAli',
        grade: 'GS2',
        enrolledServices: { ...baseServices, gouterMatin: true, gouterSoir: true, gouterBoth: true },
        mealAttendances: [
          { date: '2026-10-06', type: 'subscription', paid: true, service: 'gouter_apres_midi' },
          { date: '2026-10-02', type: 'unit', paid: false, service: 'gouter_matin' },
          { date: '2026-10-06', type: 'unit', paid: false, service: 'gouter_matin' }
        ]
      });
      const detail = logic.computeGouterMonthDetail([both], 'Octobre', '2026/2027');
      expect(detail.map(d => d.date)).toEqual(['2026-10-02', '2026-10-06']);
      expect(detail[1].rows).toHaveLength(2);
      const matinRow = detail[1].rows.find(r => r.service === 'gouter_matin')!;
      expect(matinRow.studentName).toBe('Sami BenAli');
      expect(matinRow.grade).toBe('GS2');
      expect(matinRow.type).toBe('unit');
      expect(matinRow.paid).toBe(false);
      const soirRow = detail[1].rows.find(r => r.service === 'gouter_apres_midi')!;
      expect(soirRow.type).toBe('subscription');
      expect(soirRow.paid).toBe(true);
    });

    it('never includes lunch rows — filtering happens at the source', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({
        enrolledServices: { ...baseServices, meals: true, gouterSoir: true },
        mealAttendances: [
          { date: '2026-10-06', type: 'subscription', paid: true, service: 'lunch' },
          { date: '2026-10-06', type: 'unit', paid: false, service: 'gouter_apres_midi' }
        ]
      });
      const detail = logic.computeGouterMonthDetail([st], 'Octobre', '2026/2027');
      expect(detail).toHaveLength(1);
      expect(detail[0].rows).toHaveLength(1);
      expect(detail[0].rows[0].service).toBe('gouter_apres_midi');
    });

    it('returns an empty array for a consumption-free month', async () => {
      const logic = await import('./utils/mealLogic');
      const st = makeStudent({
        enrolledServices: { ...baseServices, gouterSoir: true },
        mealAttendances: [{ date: '2026-09-14', type: 'unit', paid: false, service: 'gouter_apres_midi' }]
      });
      expect(logic.computeGouterMonthDetail([st], 'Février', '2026/2027')).toEqual([]);
    });
  });
});

describe('getGouterStatusFor — settled months, refunds and over-match (feature 008)', () => {
  const baseServices = { etude: true, suivi: true, library: false, meals: false };
  const makeStudent = (overrides: Record<string, unknown>) =>
    ({ id: 'st_x', firstName: 'A', lastName: 'B', grade: 'G', enrolledServices: { ...baseServices }, ...overrides }) as unknown as Student;
  const fees = { fraisGouterMatinMensuel: 15 } as unknown as import('./types').CenterFeeSet;

  it('reads a settled Goûter month (non-refund payments covering the effective total) as paid', async () => {
    const logic = await import('./utils/mealLogic');
    const st = makeStudent({
      enrolledServices: { ...baseServices, gouterMatin: true },
      payments: [{ id: 'p1', service: 'Goûter', month: 'Octobre (2025/2026)', amountPaid: 15 }]
    });
    expect(logic.getGouterStatusFor(st, 'Octobre', '2025/2026', fees).status).toBe('paid');
  });

  it('keeps a settled month paid when a refund-shaped record nets out (the anomaly repro)', async () => {
    const logic = await import('./utils/mealLogic');
    const st = makeStudent({
      enrolledServices: { ...baseServices, gouterMatin: true },
      payments: [
        { id: 'p1', service: 'Goûter', month: 'Octobre (2025/2026)', amountPaid: 15 },
        { id: 'r1', service: 'Goûter', month: 'Octobre (2025/2026)', amountPaid: -5, refund: true }
      ]
    });
    expect(logic.getGouterStatusFor(st, 'Octobre', '2025/2026', fees).status).toBe('paid');
  });

  it('never over-matches: a Repas payment in the same month leaves the Goûter month unpaid', async () => {
    const logic = await import('./utils/mealLogic');
    const st = makeStudent({
      enrolledServices: { ...baseServices, gouterMatin: true },
      payments: [{ id: 'p1', service: 'Repas', month: 'Octobre (2025/2026)', amountPaid: 15 }]
    });
    expect(logic.getGouterStatusFor(st, 'Octobre', '2025/2026', fees).status).toBe('unpaid');
  });

  it('never over-matches: a Goûter payment for another month leaves this month unpaid', async () => {
    const logic = await import('./utils/mealLogic');
    const st = makeStudent({
      enrolledServices: { ...baseServices, gouterMatin: true },
      payments: [{ id: 'p1', service: 'Goûter', month: 'Novembre (2025/2026)', amountPaid: 15 }]
    });
    expect(logic.getGouterStatusFor(st, 'Octobre', '2025/2026', fees).status).toBe('unpaid');
  });

  it('keeps the advance semantics for a partially covered month', async () => {
    const logic = await import('./utils/mealLogic');
    const st = makeStudent({
      enrolledServices: { ...baseServices, gouterMatin: true },
      payments: [{ id: 'p1', service: 'Goûter', month: 'Octobre (2025/2026)', amountPaid: 8 }]
    });
    const status = logic.getGouterStatusFor(st, 'Octobre', '2025/2026', fees);
    expect(status.status).toBe('advance');
    expect(status.remaining).toBe(7);
  });

  it('keeps discount handling unchanged: a discounted settled month reads paid', async () => {
    const logic = await import('./utils/mealLogic');
    const st = makeStudent({
      enrolledServices: { ...baseServices, gouterMatin: true },
      payments: [{ id: 'p1', service: 'Goûter', month: 'Octobre (2025/2026)', amountPaid: 12, discount: 3 }]
    });
    const status = logic.getGouterStatusFor(st, 'Octobre', '2025/2026', fees);
    expect(status.effectiveRequired).toBe(12);
    expect(status.status).toBe('paid');
  });
});
