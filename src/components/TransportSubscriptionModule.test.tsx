import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TransportSubscriptionModule from './TransportSubscriptionModule';
import { CenterSettings, Student } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: (_t, prop) => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'st_1',
    firstName: 'Ahmed',
    lastName: 'Ben Ali',
    birthDate: '2015-05-10',
    birthPlace: 'Sfax',
    grade: 'Collège 7ème Année',
    academicYear: '2026/2027',
    mother: { name: 'M', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '', email: '' },
    father: { name: 'F', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '20123456', email: '' },
    parentalSituation: 'mariés',
    siblings: [],
    authorizedPersons: [],
    allergies: '',
    academicHistory: {
      nMinus1: { school: '', grade: '' },
      nMinus2: { school: '', grade: '' },
      nMinus3: { school: '', grade: '' },
    },
    registration: { date: '2026-09-01', location: 'Sfax', signedElectronically: false },
    enrolledServices: { suivi: true, etude: false, library: false, meals: false, transport: true },
    suiviFees: { annualRegistrationFee: 150, monthlyFee: 250 },
    etudeFees: { annualRegistrationFee: 0, monthlyFee: 0 },
    libraryFees: { annualRegistrationFee: 0, monthlyFee: 0 },
    transportFees: { monthlyFee: 45 },
    mealSubscription: { mode: 'subscription', monthlyPrice: 0, unitPrice: 0, prepaidMeals: 0, consumedMealsCount: 0, active: false },
    payments: [],
    ...overrides,
  };
}

function makeSettings(): CenterSettings {
  return {
    centerName: 'Centre Test',
    phoneNumber: '',
    locationCity: '',
    currency: 'TND',
    servicePrices: { '2026/2027': { 'transport:month': 45 } },
  };
}

describe('TransportSubscriptionModule', () => {
  beforeEach(() => localStorage.clear());

  it('affiche uniquement les élèves inscrits au transport avec le tarif des paramètres', () => {
    const enrolled = makeStudent();
    const notEnrolled = makeStudent({
      id: 'st_2',
      firstName: 'Sami',
      lastName: 'Trabelsi',
      enrolledServices: { suivi: true, etude: false, library: false, meals: false, transport: false },
    });
    render(
      <TransportSubscriptionModule
        students={[enrolled, notEnrolled]}
        settings={makeSettings()}
        onUpdateStudent={vi.fn()}
        onRecordPayment={vi.fn()}
      />
    );

    expect(screen.getByTestId('transport-student-st_1')).toBeTruthy();
    expect(screen.queryByTestId('transport-student-st_2')).toBeNull();
    expect(screen.getByText('45 د.ت')).toBeTruthy();
  });

  it('enregistre une mensualité Transport via le callback de paiement dédié', () => {
    const onRecordPayment = vi.fn();
    render(
      <TransportSubscriptionModule
        students={[makeStudent()]}
        settings={makeSettings()}
        onUpdateStudent={vi.fn()}
        onRecordPayment={onRecordPayment}
      />
    );

    fireEvent.click(screen.getByTestId('transport-month-st_1-Octobre'));
    fireEvent.click(screen.getByTestId('transport-pay-submit'));

    expect(onRecordPayment).toHaveBeenCalledTimes(1);
    const [studentId, payment] = onRecordPayment.mock.calls[0];
    expect(studentId).toBe('st_1');
    expect(payment).toMatchObject({
      service: 'Transport',
      month: 'Octobre (2026/2027)',
      amountPaid: 45,
      totalRequired: 45,
      paymentType: 'full',
    });
  });

  it('inscrit un élève au transport avec le tarif mensuel configuré', () => {
    const onUpdateStudent = vi.fn();
    const enrolled = makeStudent();
    const notEnrolled = makeStudent({
      id: 'st_2',
      firstName: 'Sami',
      lastName: 'Trabelsi',
      enrolledServices: { suivi: true, etude: false, library: false, meals: false, transport: false },
    });
    render(
      <TransportSubscriptionModule
        students={[enrolled, notEnrolled]}
        settings={makeSettings()}
        onUpdateStudent={onUpdateStudent}
        onRecordPayment={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('transport-enroll-open'));
    fireEvent.click(screen.getByTestId('transport-enroll-st_2'));

    expect(onUpdateStudent).toHaveBeenCalledTimes(1);
    expect(onUpdateStudent.mock.calls[0][0]).toMatchObject({
      id: 'st_2',
      enrolledServices: { transport: true, suivi: true },
      transportFees: { monthlyFee: 45 },
      suiviFees: { annualRegistrationFee: 150, monthlyFee: 250 },
    });
  });

  it('désinscrit un élève sans toucher aux autres services', () => {
    const onUpdateStudent = vi.fn();
    render(
      <TransportSubscriptionModule
        students={[makeStudent()]}
        settings={makeSettings()}
        onUpdateStudent={onUpdateStudent}
        onRecordPayment={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('transport-unenroll-st_1'));
    fireEvent.click(screen.getByTestId('transport-unenroll-confirm'));

    expect(onUpdateStudent).toHaveBeenCalledTimes(1);
    expect(onUpdateStudent.mock.calls[0][0]).toMatchObject({
      id: 'st_1',
      enrolledServices: { transport: false, suivi: true },
    });
  });
});
