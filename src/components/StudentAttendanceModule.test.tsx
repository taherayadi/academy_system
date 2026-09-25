import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import StudentAttendanceModule from './StudentAttendanceModule';
import { Student, StudentAttendanceRecord } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: (_t, prop) => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const student = (id: string, grade?: string): Student =>
  ({ id, firstName: 'Enfant', lastName: id, ...(grade ? { grade } : {}) } as Student);

const students: Student[] = [
  student('st1', 'PS'),
  student('st2', 'GS'),
  student('st3')
];

const attendance: StudentAttendanceRecord[] = [];

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('StudentAttendanceModule — grade filter by center type (revision C, remark 1)', () => {
  it('hides the « كل المستويات » grade filter for a crèche center', () => {
    render(
      <StudentAttendanceModule
        students={students}
        attendance={attendance}
        onUpdateAttendance={vi.fn()}
        centerType="creche"
      />
    );
    expect(screen.queryByText('كل المستويات')).toBeNull();
    // The rest of the register stays fully usable.
    expect(screen.getByPlaceholderText('ابحث عن تلميذ...')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'حاضر' }).length).toBe(3);
    expect(screen.getAllByRole('button', { name: 'غائب' }).length).toBe(3);
  });

  it('hides the filter for a jardin center too', () => {
    render(
      <StudentAttendanceModule
        students={students}
        attendance={attendance}
        onUpdateAttendance={vi.fn()}
        centerType="jardin"
      />
    );
    expect(screen.queryByText('كل المستويات')).toBeNull();
  });

  it('renders the unfiltered student list when the filter is absent', () => {
    render(
      <StudentAttendanceModule
        students={students}
        attendance={attendance}
        onUpdateAttendance={vi.fn()}
        centerType="creche"
      />
    );
    for (const s of students) {
      expect(screen.getByText(`${s.firstName} ${s.lastName}`)).toBeTruthy();
    }
  });

  it('keeps the filter for a formation center and filters by grade (US2 regression)', () => {
    render(
      <StudentAttendanceModule
        students={students}
        attendance={attendance}
        onUpdateAttendance={vi.fn()}
        centerType="formation"
      />
    );
    const select = screen.getByText('كل المستويات').closest('select') as unknown as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'PS' } });
    expect(screen.getByText('Enfant st1')).toBeTruthy();
    expect(screen.queryByText('Enfant st2')).toBeNull();
    expect(screen.queryByText('Enfant st3')).toBeNull();
  });

  it('keeps the filter for unknown/undefined types (legacy passthrough)', () => {
    render(
      <StudentAttendanceModule
        students={students}
        attendance={attendance}
        onUpdateAttendance={vi.fn()}
      />
    );
    expect(screen.getByText('كل المستويات')).toBeTruthy();
  });

  it('saves pointage normally for a crèche center with the filter hidden', () => {
    const onUpdateAttendance = vi.fn();
    render(
      <StudentAttendanceModule
        students={students}
        attendance={attendance}
        onUpdateAttendance={onUpdateAttendance}
        centerType="creche"
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'غائب' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /حفظ pointage اليوم/ }));
    expect(onUpdateAttendance).toHaveBeenCalledTimes(1);
    const rows = onUpdateAttendance.mock.calls[0][0] as StudentAttendanceRecord[];
    expect(rows.length).toBe(3);
    expect(rows.find(r => r.studentId === 'st1')?.status).toBe('absent');
  });
});
