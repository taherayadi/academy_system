import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StudentTimeSheetModule from './StudentTimeSheetModule';
import { Student, StudentAttendanceRecord, StudentTimeSheet } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: (_t, prop) => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const students: Student[] = [
  { id: 'st1', firstName: 'Enfant', lastName: 'Uno', grade: 'PS' } as Student,
  { id: 'st2', firstName: 'Enfant', lastName: 'Dos', grade: 'GS' } as Student
];

const sheets: StudentTimeSheet[] = [];
const attendance: StudentAttendanceRecord[] = [];

const baseProps = {
  students,
  studentTimeSheets: sheets,
  onUpdateStudentTimeSheets: vi.fn(),
  onUpdateStudent: vi.fn(),
  onUpdateStudents: vi.fn(),
  studentAttendance: attendance,
  onUpdateStudentAttendance: vi.fn()
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('StudentTimeSheetModule — register branch forwards centerType (revision C, remark 1)', () => {
  it('renders the attendance register without the grade filter for a crèche center', () => {
    render(<StudentTimeSheetModule {...baseProps} centerType="creche" />);
    // The register branch is the crèche/jardin surface.
    expect(screen.getByText('نظام تسجيل حضور التلاميذ')).toBeTruthy();
    expect(screen.queryByText('كل المستويات')).toBeNull();
  });

  it('renders the register without the grade filter for a jardin center', () => {
    render(<StudentTimeSheetModule {...baseProps} centerType="jardin" />);
    expect(screen.getByText('نظام تسجيل حضور التلاميذ')).toBeTruthy();
    expect(screen.queryByText('كل المستويات')).toBeNull();
  });

  it('keeps the time-sheets view (and its filters) for a formation center (US2 regression)', () => {
    render(<StudentTimeSheetModule {...baseProps} centerType="formation" />);
    expect(screen.queryByText('نظام تسجيل حضور التلاميذ')).toBeNull();
    expect(screen.getByText('إدارة جداول التوقيت الأسبوعية للتلاميذ (0)')).toBeTruthy();
  });

  it('keeps the legacy time-sheets view for an unknown/undefined type (passthrough)', () => {
    render(<StudentTimeSheetModule {...baseProps} />);
    expect(screen.queryByText('نظام تسجيل حضور التلاميذ')).toBeNull();
    expect(screen.getByText('إدارة جداول التوقيت الأسبوعية للتلاميذ (0)')).toBeTruthy();
  });
});
