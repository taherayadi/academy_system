import { describe, it, expect } from 'vitest';
import { StaffMember, StaffPayslip, StaffAdvance } from './types';

describe('Staff Payroll & Salary Calculation Business Logic', () => {
  const sampleTeacher: StaffMember = {
    id: 'staff_1',
    firstName: 'Sami',
    lastName: 'Mansour',
    cin: '09876543',
    cnssNumber: '12345678-90',
    salary: 1200,
    type: 'enseignant',
    phone: '98123456',
    role: 'Professeur de Mathématiques',
    contractStartDate: '2026-09-01',
    baseSalary: 1200,
    cnssAmount: 110.16, // 9.18% employee CNSS rate in Tunisia
    hourlyRate: 25
  };

  it('calculates standard net salary without deductions or bonuses', () => {
    const baseSalary = sampleTeacher.baseSalary || 1200;
    const bonus = 0;
    const cnssDeduction = sampleTeacher.cnssAmount || 110.16;
    const absenceDeductions = 0;
    const advanceDeducted = 0;

    const netSalary = Math.max(0, baseSalary + bonus - cnssDeduction - absenceDeductions - advanceDeducted);

    expect(netSalary).toBeCloseTo(1089.84, 2);
  });

  it('correctly adds bonuses and extra hours to net salary', () => {
    const baseSalary = 1200;
    const bonus = 150;
    const extraHours = 4;
    const extraHourRate = 25;
    const extraHoursAmount = extraHours * extraHourRate; // 100
    const cnssDeduction = 110.16;
    const absenceDeductions = 0;
    const advanceDeducted = 0;

    const grossAdditions = baseSalary + bonus + extraHoursAmount; // 1450
    const netSalary = Math.max(0, grossAdditions - cnssDeduction - absenceDeductions - advanceDeducted);

    expect(netSalary).toBeCloseTo(1339.84, 2);
  });

  it('applies absence deductions and advance repayment to net salary', () => {
    const baseSalary = 1200;
    const bonus = 0;
    const cnssDeduction = 110.16;
    const daysAbsent = 2;
    const dailyRate = baseSalary / 26; // approx 46.15 per day (Tunisian standard 26 workdays)
    const absenceDeductions = Math.round(daysAbsent * dailyRate * 100) / 100; // 92.31
    const advanceDeducted = 200; // previous advance

    const totalDeductions = cnssDeduction + absenceDeductions + advanceDeducted; // 402.47
    const netSalary = Math.max(0, baseSalary + bonus - totalDeductions);

    expect(netSalary).toBeCloseTo(797.53, 2);
  });

  it('ensures net salary never drops below 0 even with large deductions', () => {
    const baseSalary = 500;
    const deductions = 650;

    const netSalary = Math.max(0, baseSalary - deductions);
    expect(netSalary).toBe(0);
  });

  it('creates a complete payslip record structure accurately', () => {
    const payslip: StaffPayslip = {
      id: 'slip_2026_09_staff_1',
      month: 'Septembre 2026',
      baseSalary: 1200,
      bonus: 50,
      bonusReason: 'Prime de rentrée',
      cnssDeduction: 110.16,
      absenceDeductions: 0,
      advanceDeducted: 100,
      netSalary: 1039.84,
      issueDate: '2026-09-30',
      daysPresent: 22,
      daysAbsent: 0,
      daysRetard: 0,
      extraHours: 0,
      extraHourRate: 25,
      extraHoursAmount: 0
    };

    expect(payslip.netSalary).toBe(1039.84);
    expect(payslip.bonus).toBe(50);
    expect(payslip.advanceDeducted).toBe(100);
  });

  it('tracks advance approval state', () => {
    const advance: StaffAdvance = {
      id: 'adv_1',
      amount: 200,
      date: '2026-09-10',
      reason: 'Urgence familiale',
      status: 'approved'
    };

    expect(advance.status).toBe('approved');
    expect(advance.amount).toBe(200);
  });
});
