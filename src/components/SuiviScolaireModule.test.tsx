import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SuiviScolaireModule from './SuiviScolaireModule';
import { Student, StudentTimeSheet } from '../types';

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
      nMinus3: { school: '', grade: '' }
    },
    registration: { date: '2026-09-01', location: 'Sfax', signedElectronically: false },
    enrolledServices: { suivi: true, etude: false, library: false, meals: false },
    suiviFees: { annualRegistrationFee: 0, monthlyFee: 0 },
    etudeFees: { annualRegistrationFee: 0, monthlyFee: 0 },
    libraryFees: { annualRegistrationFee: 0, monthlyFee: 0 },
    mealSubscription: { mode: 'subscription', monthlyPrice: 0, unitPrice: 0, prepaidMeals: 0, consumedMealsCount: 0, active: false },
    payments: [],
    ...overrides
  };
}

describe('SuiviScolaireModule type-aware quick actions', () => {
  beforeEach(() => localStorage.clear());

  it('hides row quick-action icons and grade filter for a crèche', () => {
    render(
      <SuiviScolaireModule
        students={[makeStudent()]}
        onUpdateStudent={vi.fn()}
        onUpdateStudents={vi.fn()}
        studentTimeSheets={[]}
        centerType="creche"
      />
    );
    expect(screen.queryByTitle('إدخال نقاط الفروض (Notes Devoirs)')).toBeNull();
    expect(screen.queryByTitle('عرض الجدول الزمني')).toBeNull();
    expect(screen.queryByTitle('لم يُسنَد جدول توقيت بعد')).toBeNull();
    expect(screen.queryByText('كل المستويات')).toBeNull();
    // payments stay untouched
    expect(screen.getByText(/شبكة المتابعة والمدفوعات/)).toBeTruthy();
  });

  it('shows both quick-action icons and the grade filter for a formation center', () => {
    const sheet: StudentTimeSheet = {
      id: 'ts_1',
      schoolYear: '2026/2027',
      establishmentName: 'Institut',
      gradeLevel: 'Collège 7ème Année',
      weeklySchedule: [],
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01'
    };
    render(
      <SuiviScolaireModule
        students={[makeStudent({ timeSheetId: 'ts_1' })]}
        onUpdateStudent={vi.fn()}
        onUpdateStudents={vi.fn()}
        studentTimeSheets={[sheet]}
        centerType="formation"
      />
    );
    expect(screen.getAllByTitle('إدخال نقاط الفروض (Notes Devoirs)').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('عرض الجدول الزمني').length).toBeGreaterThan(0);
    expect(screen.getByText('كل المستويات')).toBeTruthy();
  });

  it('keeps icons for legacy/undefined center type', () => {
    render(
      <SuiviScolaireModule
        students={[makeStudent()]}
        onUpdateStudent={vi.fn()}
        onUpdateStudents={vi.fn()}
        studentTimeSheets={[]}
      />
    );
    expect(screen.getAllByTitle('إدخال نقاط الفروض (Notes Devoirs)').length).toBeGreaterThan(0);
  });
});
