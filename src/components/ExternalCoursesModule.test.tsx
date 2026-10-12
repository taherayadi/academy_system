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
    expect(screen.getByText('خلاص التأمين المدرسي 🛡️')).toBeTruthy();
  });

  it('paying marks the register + course roster assurance as paid with the course amount', async () => {
    const { onUpdateExternalStudents, onUpdateCourses } = renderModule();
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'تأمين ✗' }));

    fireEvent.click(screen.getByRole('button', { name: 'خلاص' }));

    expect(onUpdateExternalStudents).toHaveBeenCalledTimes(1);
    const updatedRegister = onUpdateExternalStudents.mock.calls[0][0] as ExternalStudentRegister[];
    expect(updatedRegister[0]).toMatchObject({ id: REG_ID, assurancePaid: true, assuranceAmount: 50 });

    expect(onUpdateCourses).toHaveBeenCalledTimes(1);
    const updatedCourses = onUpdateCourses.mock.calls[0][0] as ExternalCourse[];
    expect(updatedCourses[0].enrolledStudents[0]).toMatchObject({
      studentId: REG_ID, assurancePaid: true, assuranceAmount: 50
    });
    expect(updatedCourses[0].enrolledStudents[0].assuranceDate).toBeTruthy();
  });
});
