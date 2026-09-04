import { describe, it, expect } from 'vitest';
import { PaymentRecord, Student, generateReceiptNumber } from './types';

describe('Payments & Discount Business Logic', () => {
  const baseStudent = {
    id: 'st_test_1',
    firstName: 'Ahmed',
    lastName: 'Ben Ali',
    birthDate: '2010-05-15',
    birthPlace: 'Sfax',
    grade: 'Collège 8ème',
    academicYear: '2026/2027',
    parentalSituation: 'mariés',
    allergies: 'Aucune',
    enrolledServices: { suivi: true, etude: false, library: false, meals: false },
    suiviFees: { annualRegistrationFee: 150, monthlyFee: 250 },
    payments: []
  } as unknown as Student;

  describe('Discount Rules (discount strictly less than totalRequired)', () => {
    it('allows valid discount strictly less than required fee', () => {
      const requiredFee = 250;
      const discount = 50;

      const isValid = discount >= 0 && discount < requiredFee;
      const effectiveRequired = Math.max(0, requiredFee - discount);

      expect(isValid).toBe(true);
      expect(effectiveRequired).toBe(200);
    });

    it('rejects discount that is equal to total required fee', () => {
      const requiredFee = 250;
      const discount = 250;

      const isValid = discount >= 0 && discount < requiredFee;
      expect(isValid).toBe(false);
    });

    it('rejects discount that exceeds total required fee', () => {
      const requiredFee = 250;
      const discount = 300;

      const isValid = discount >= 0 && discount < requiredFee;
      expect(isValid).toBe(false);
    });

    it('rejects negative discount amounts', () => {
      const requiredFee = 250;
      const discount = -20;

      const isValid = discount >= 0 && discount < requiredFee;
      expect(isValid).toBe(false);
    });
  });

  describe('Payment Calculations & Status Workflow', () => {
    it('calculates full payment with remaining balance equal to 0', () => {
      const fullFee = 250;
      const discount = 30;
      const effectiveRequired = fullFee - discount;
      const paid = 220;

      const remaining = Math.max(0, effectiveRequired - paid);
      const isFull = paid >= effectiveRequired;

      const payment: PaymentRecord = {
        id: 'pay_1',
        date: '2026-09-05',
        amountPaid: paid,
        totalRequired: effectiveRequired,
        remainingBalance: remaining,
        service: 'Suivi',
        month: 'Septembre (2026/2027)',
        paymentType: isFull ? 'full' : 'advance',
        method: 'Espèces',
        receiptNumber: 'REC-001',
        discount: discount > 0 ? discount : undefined
      };

      expect(payment.remainingBalance).toBe(0);
      expect(payment.paymentType).toBe('full');
      expect(payment.discount).toBe(30);
    });

    it('calculates partial/advance payment with positive remaining balance', () => {
      const fullFee = 250;
      const discount = 0;
      const effectiveRequired = fullFee - discount;
      const advancePaid = 100;

      const remaining = Math.max(0, effectiveRequired - advancePaid);
      const paymentType = advancePaid >= effectiveRequired ? 'full' : 'advance';

      const payment: PaymentRecord = {
        id: 'pay_advance_1',
        date: '2026-09-05',
        amountPaid: advancePaid,
        totalRequired: effectiveRequired,
        remainingBalance: remaining,
        service: 'Suivi',
        month: 'Septembre (2026/2027)',
        paymentType,
        method: 'Espèces',
        receiptNumber: 'REC-002'
      };

      expect(payment.remainingBalance).toBe(150);
      expect(payment.paymentType).toBe('advance');
    });

    it('completes remaining balance with a balance payment record', () => {
      const priorAdvance = 100;
      const effectiveRequired = 250;
      const balancePaid = 150;

      const totalPaid = priorAdvance + balancePaid;
      const remaining = Math.max(0, effectiveRequired - totalPaid);

      const balancePayment: PaymentRecord = {
        id: 'pay_balance_1',
        date: '2026-09-20',
        amountPaid: balancePaid,
        totalRequired: effectiveRequired,
        remainingBalance: remaining,
        service: 'Suivi',
        month: 'Septembre (2026/2027)',
        paymentType: totalPaid >= effectiveRequired ? 'balance' : 'advance',
        method: 'Espèces',
        receiptNumber: 'REC-003'
      };

      expect(balancePayment.remainingBalance).toBe(0);
      expect(balancePayment.paymentType).toBe('balance');
    });

    it('processes refund payments correctly with negative amount and refundOf reference', () => {
      const originalPayment: PaymentRecord = {
        id: 'pay_orig_1',
        date: '2026-10-01',
        amountPaid: 250,
        totalRequired: 250,
        remainingBalance: 0,
        service: 'Suivi',
        month: 'Octobre (2026/2027)',
        paymentType: 'full',
        method: 'Espèces',
        receiptNumber: 'REC-101'
      };

      const refundRecord: PaymentRecord = {
        id: 'pay_ref_1',
        date: '2026-10-05',
        amountPaid: -250,
        totalRequired: 250,
        remainingBalance: 250,
        service: 'Suivi',
        month: 'Octobre (2026/2027)',
        paymentType: 'full',
        method: 'Espèces',
        receiptNumber: 'REC-REF-001',
        refund: true,
        refundOf: originalPayment.id,
        notes: 'استرجاع خلاص شهر أكتوبر'
      };

      expect(refundRecord.refund).toBe(true);
      expect(refundRecord.amountPaid).toBe(-250);
      expect(refundRecord.refundOf).toBe('pay_orig_1');
    });

    it('tracks cheque payment details and cashed state', () => {
      const chequePayment: PaymentRecord = {
        id: 'pay_chk_1',
        date: '2026-09-01',
        amountPaid: 250,
        totalRequired: 250,
        remainingBalance: 0,
        service: 'Suivi',
        month: 'Septembre (2026/2027)',
        paymentType: 'full',
        method: 'Chèque',
        chequeNumber: 'CHQ-987654',
        chequeDate: '2026-09-15',
        chequePaid: false,
        receiptNumber: 'REC-004'
      };

      expect(chequePayment.method).toBe('Chèque');
      expect(chequePayment.chequeNumber).toBe('CHQ-987654');
      expect(chequePayment.chequePaid).toBe(false);

      const cashed = { ...chequePayment, chequePaid: true };
      expect(cashed.chequePaid).toBe(true);
    });
  });

  describe('Receipt Number Generation', () => {
    it('generates sequential receipt numbers based on existing student records', () => {
      const st1: Student = {
        ...baseStudent,
        payments: [
          {
            id: 'p1', date: '2026-09-01', amountPaid: 150, totalRequired: 150, remainingBalance: 0,
            service: 'Inscription Suivi', month: 'Annuel', paymentType: 'full', method: 'Espèces', receiptNumber: 'REC-001'
          }
        ]
      };

      const nextRec = generateReceiptNumber([st1], 'REC-');
      expect(nextRec).toBe('REC-002');
    });
  });
});
