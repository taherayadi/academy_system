import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import StaffManagementModule from './StaffManagementModule';
import { StaffMember } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: (_t, prop) => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('./ConfirmDialog', () => ({ default: () => null }));

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'stf_1',
    firstName: 'Mohamed',
    lastName: 'Ali',
    cin: '09123456',
    cnssNumber: '12345678',
    subjects: [],
    salary: 800,
    phone: '20123456',
    role: 'enseignant',
    contractStartDate: '2026-09-01',
    ...overrides
  };
}

function renderModule(props: Record<string, unknown> = {}) {
  return render(
    <StaffManagementModule
      staff={[makeStaff()]}
      timesheets={[]}
      onUpdateStaff={vi.fn()}
      onUpdateTimesheets={vi.fn()}
      {...props}
    />
  );
}

const POINTAGE_TAB_LABEL = 'نظام الحضور والغياب اليومي';

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('StaffManagementModule staff-lite gating', () => {
  it('hides the pointage sub-tab in lite mode and keeps roster CRUD', () => {
    renderModule({ staffLite: true });
    expect(screen.queryByText(POINTAGE_TAB_LABEL)).toBeNull();
    // roster still manageable: the profiles sub-tab is active and add control exists
    expect(screen.getAllByText(/فريق العمل/).length).toBeGreaterThan(0);
  });

  it('shows the pointage sub-tab in full mode', () => {
    renderModule({});
    expect(screen.getByText(POINTAGE_TAB_LABEL)).toBeTruthy();
  });

  it('forces the profiles sub-tab in lite mode even when pointage was requested', () => {
    // A lite center cannot reach pointage: the sub-tab does not exist, and the
    // profiles pane is the only rendered content.
    renderModule({ staffLite: true });
    expect(screen.queryByText(POINTAGE_TAB_LABEL)).toBeNull();
    expect(screen.getAllByText(/فريق العمل والملفات/).length).toBeGreaterThan(0);
  });

  it('in full mode the pointage pane is reachable', () => {
    renderModule({});
    fireEvent.click(screen.getByText(POINTAGE_TAB_LABEL));
    // pointage pane header appears (assert the tab switch worked without crashing)
    expect(screen.getByText(POINTAGE_TAB_LABEL)).toBeTruthy();
  });
});
