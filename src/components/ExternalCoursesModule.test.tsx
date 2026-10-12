import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import ExternalCoursesModule from './ExternalCoursesModule';
import { ExternalCourse, ExternalStudentRegister } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('../api', () => ({
  fetchSubjectsApi: vi.fn().mockResolvedValue([]),
  createSubjectApi: vi.fn().mockResolvedValue({ id: 'sub_x', name: 'X' }),
}));

const REG_ID = 'reg_1';

const course: ExternalCourse = {
  id: 'c1',
  schoolYear: '2026/2027',
  trimester: 'Trimestre 1',
  gradeLevel: 'Collège 7ème Année',
  subject: 'Mathématiques',
  teacherName: 'Ali',
  teacherPhone: '25141141',
  monthlyFee: 80,
  teacherShare: 70,
  centerShare: 10,
  assuranceAmount: 50,
  enrolledStudents: [
    {
      studentId: REG_ID, studentName: 'Ali Ayadi', parentPhone: '25141141',
      isExternal: true, assurancePaid: false, assuranceAmount: 0, enrolledAt: '2026-10-09'
    }
  ]
};

const register: ExternalStudentRegister = {
  id: REG_ID, name: 'Ali Ayadi', parentPhone: '25141141', grade: 'Collège 7ème Année',
  schoolYear: '2026/2027', assurancePaid: false, assuranceAmount: 0,
  payments: [], attendance: [], createdAt: '2026-10-09'
};

beforeEach(() => cleanup());

function renderModule(overrides: Record<string, unknown> = {}) {
  const onUpdateExternalStudents = vi.fn();
  const onUpdateCourses = vi.fn();
  render(
    <ExternalCoursesModule
      students={[]}
      courses={[course]}
      sessions={[]}
      settings={{ centerName: 'Test Center' } as any}
      externalStudents={[register]}
      onUpdateExternalStudents={onUpdateExternalStudents}
      onUpdateCourses={onUpdateCourses}
      onUpdateSessions={vi.fn()}
      {...overrides}
    />
  );
  // Enrolled list is collapsed by default — expand it to reveal the badges.
  fireEvent.click(screen.getByRole('button', { name: /التلاميذ المسجلون/ }));
  return { onUpdateExternalStudents, onUpdateCourses };
}

describe('ExternalCoursesModule — assurance payment from the « تأمين ✗ » badge', () => {
  it('opens the payment modal when clicking the unpaid assurance badge', async () => {
    renderModule();
    await act(async () => { await Promise.resolve(); });
    const badge = screen.getByRole('button', { name: 'تأمين ✗' });
    fireEvent.click(badge);
    expect(screen.getByText(/تنزيل خلاص التأمين المدرسي/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تأكيد الدفع وطباعة الوصل' })).toBeTruthy();
  });

  it('paying marks the register + course roster assurance as paid with the course amount', async () => {
    const { onUpdateExternalStudents, onUpdateCourses } = renderModule();
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'تأمين ✗' }));

    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الدفع وطباعة الوصل' }));

    expect(onUpdateExternalStudents).toHaveBeenCalledTimes(1);
    const updatedRegister = onUpdateExternalStudents.mock.calls[0][0] as ExternalStudentRegister[];
    expect(updatedRegister[0]).toMatchObject({ id: REG_ID, assurancePaid: true, assuranceAmount: 50 });
    expect(updatedRegister[0].assurancePayments).toHaveLength(1);

    expect(onUpdateCourses).toHaveBeenCalledTimes(1);
    const updatedCourses = onUpdateCourses.mock.calls[0][0] as ExternalCourse[];
    expect(updatedCourses[0].enrolledStudents[0]).toMatchObject({
      studentId: REG_ID, assurancePaid: true, assuranceAmount: 50
    });
    expect(updatedCourses[0].enrolledStudents[0].assuranceDate).toBeTruthy();
  });

  it('tops up the remaining balance when the assurance was partially paid', async () => {
    const partialCourse: ExternalCourse = {
      ...course,
      enrolledStudents: [{ ...course.enrolledStudents[0], assuranceAmount: 30, assuranceRequired: 50 }]
    };
    const partialRegister: ExternalStudentRegister = {
      ...register,
      assuranceAmount: 30,
      assuranceRequired: 50,
      assurancePayments: [{ id: 'asr_a', date: '2026-10-09', amount: 30, method: 'Espèces' }]
    };
    const { onUpdateExternalStudents } = renderModule({ courses: [partialCourse], externalStudents: [partialRegister] });
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole('button', { name: /تأمين 30\/50/ }));
    // Remaining balance (50 - 30) is pre-filled.
    expect((screen.getByDisplayValue('20') as HTMLInputElement).value).toBe('20');
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الدفع وطباعة الوصل' }));

    const updated = onUpdateExternalStudents.mock.calls[0][0] as ExternalStudentRegister[];
    expect(updated[0]).toMatchObject({ assurancePaid: true, assuranceAmount: 50, assuranceRequired: 50 });
    expect(updated[0].assurancePayments).toHaveLength(2);
  });

  it('keeps the discounted amount due (not the full course fee) when topping up', async () => {
    // Assurance 50, تخفيض 10 → dû 40 ; 20 déjà versés → reste 20 (et non 30).
    const discountedCourse: ExternalCourse = {
      ...course,
      enrolledStudents: [{ ...course.enrolledStudents[0], assuranceAmount: 20, assuranceRequired: 40 }]
    };
    const discountedRegister: ExternalStudentRegister = {
      ...register,
      assuranceAmount: 20,
      assuranceRequired: 40,
      assurancePayments: [{ id: 'asr_a', date: '2026-10-09', amount: 20, method: 'Espèces' }]
    };
    const { onUpdateExternalStudents } = renderModule({ courses: [discountedCourse], externalStudents: [discountedRegister] });
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole('button', { name: /تأمين 20\/40/ }));
    expect((screen.getByDisplayValue('20') as HTMLInputElement).value).toBe('20');
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الدفع وطباعة الوصل' }));

    const updated = onUpdateExternalStudents.mock.calls[0][0] as ExternalStudentRegister[];
    expect(updated[0]).toMatchObject({ assurancePaid: true, assuranceAmount: 40, assuranceRequired: 40 });
    expect(updated[0].assurancePayments).toHaveLength(2);
  });
});
