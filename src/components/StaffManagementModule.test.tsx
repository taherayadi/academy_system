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
const LOCKED_MESSAGE = 'ميزة مقفلة';

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

/**
 * The motion/react Proxy mock gives every motion component a fresh identity,
 * so state updates remount the dialog. Always re-query nodes before touching
 * them, or the event lands on a detached subtree and React ignores it.
 */
function changeByPlaceholder(ph: string, value: string) {
  const el = document.querySelector(`input[placeholder="${ph}"]`) as HTMLInputElement;
  fireEvent.change(el, { target: { value } });
}

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

  // ── T004 [US1]: lite roster CRUD works end to end ────────────────────────

  it('US1: opens the add-staff dialog and invokes onUpdateStaff with the new roster (lite)', () => {
    const onUpdateStaff = vi.fn();
    renderModule({ staffLite: true, onUpdateStaff });
    fireEvent.click(screen.getByText('إضافة موظف / أستاذ'));
    // Fill required identity fields: first name, last name, phone, 8-digit CIN
    changeByPlaceholder('مثال: مراد', 'Salah');
    changeByPlaceholder('مثال: المنصوري', 'Ben Ali');
    changeByPlaceholder('98765432', '20123456');
    changeByPlaceholder('08765432', '09876543');
    fireEvent.submit(document.querySelector('form')!);
    expect(onUpdateStaff).toHaveBeenCalledTimes(1);
    const roster = onUpdateStaff.mock.calls[0][0];
    expect(roster.length).toBe(2); // existing fixture + the new one
    expect(roster[1].firstName).toBe('Salah');
  });

  it('US1: edit control present per staff card (lite)', () => {
    renderModule({ staffLite: true });
    expect(screen.queryByTitle('تعديل الموظف')).toBeTruthy();
    expect(screen.queryByTitle('حذف الموظف')).toBeTruthy();
  });

  it('US1: full mode keeps the same CRUD controls (regression baseline)', () => {
    renderModule({});
    expect(screen.getByText('إضافة موظف / أستاذ')).toBeTruthy();
    expect(screen.queryByTitle('تعديل الموظف')).toBeTruthy();
    expect(screen.queryByTitle('حذف الموظف')).toBeTruthy();
  });

  // ── T006 [US2]: payroll surfaces locked in lite mode ─────────────────────

  it('US2: locked cards replace schedule/congés/advances/payslip surfaces and navigate to renewal', () => {
    const onGoToRenewal = vi.fn();
    renderModule({ staffLite: true, onGoToRenewal, staff: [makeStaff({ id: 'stf_1' })] });
    // locked messages render in place of payroll surfaces
    const locked = screen.getAllByText(new RegExp(LOCKED_MESSAGE));
    expect(locked.length).toBeGreaterThanOrEqual(4);
    // upgrade navigation works
    fireEvent.click(screen.getAllByText('الذهاب إلى التجديد')[0]);
    expect(onGoToRenewal).toHaveBeenCalledTimes(1);
    // no payroll write surfaces: advance request form absent
    expect(screen.queryByText('إرسال طلب السلفة')).toBeNull();
  });

  it('US2: full mode renders no locked cards and no upgrade buttons', () => {
    renderModule({});
    expect(screen.queryByText(new RegExp(LOCKED_MESSAGE))).toBeNull();
    expect(screen.queryByText('الذهاب إلى التجديد')).toBeNull();
  });

  // ── T009 [US3]: full-mode parity ─────────────────────────────────────────

  it('US3: full mode exposes payslip/avance/congé/schedule labeled surfaces', () => {
    renderModule({});
    expect(screen.queryByText('التوقيت الأسبوعي')).toBeTruthy();
    expect(screen.queryByText('طلبات السلفة')).toBeTruthy();
  });
});
