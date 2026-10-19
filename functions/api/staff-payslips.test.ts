import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './staff-payslips';
import { onRequest, ROUTES } from './_middleware';
import { readStaff } from './_lib';

vi.mock('./_lib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib')>();
  return { ...actual, validateSession: vi.fn(async () => null) };
});

const CENTER_A = 'c1';
const CENTER_B = 'c2';

let sqlite: DatabaseSync;
let db: any;

function applySession(context: any, centerId: string) {
  context.data = { session: { email: 'x@example.invalid', token: 't', centerId, role: 'admin' } };
}

function postRequest(body: unknown) {
  return new Request('https://app.example/api/staff-payslips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  // Fixture alignée sur la migration admin (STRICT) : staff_payslips.month est
  // GLOB 'YYYY-MM' (le client envoie un libellé arabe), UNIQUE (staff_id, month).
  sqlite.exec(`
    CREATE TABLE staff (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, first_name TEXT NOT NULL,
      last_name TEXT NOT NULL, cin TEXT NOT NULL, cnss_number TEXT,
      phone TEXT NOT NULL, email TEXT, address TEXT, role TEXT NOT NULL,
      contract_type TEXT, contract_start_date TEXT NOT NULL,
      base_salary REAL NOT NULL CHECK (base_salary >= 0),
      cnss_amount REAL, hourly_rate REAL,
      status TEXT NOT NULL DEFAULT 'active',
      UNIQUE (center_id, cin)
    ) STRICT;
    CREATE TABLE staff_payslips (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
      base_salary REAL NOT NULL CHECK (base_salary >= 0),
      bonus REAL NOT NULL DEFAULT 0, bonus_reason TEXT,
      cnss_deduction REAL NOT NULL DEFAULT 0, absence_deductions REAL NOT NULL DEFAULT 0,
      advance_deducted REAL NOT NULL DEFAULT 0,
      extra_hours REAL, extra_hour_rate REAL, extra_hours_amount REAL,
      days_present INTEGER, days_absent INTEGER, days_retard INTEGER,
      net_salary REAL NOT NULL, issue_date TEXT NOT NULL,
      UNIQUE (staff_id, month)
    ) STRICT;
    CREATE TABLE subjects (id TEXT PRIMARY KEY, center_id TEXT, name TEXT);
    CREATE TABLE staff_subjects (staff_id TEXT, subject_id TEXT);
    CREATE TABLE staff_schedule (staff_id TEXT, day TEXT, slots TEXT);
    CREATE TABLE staff_payments (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, staff_id TEXT NOT NULL,
      month TEXT NOT NULL, amount_paid REAL NOT NULL, bonus REAL, deduction REAL,
      net_salary REAL NOT NULL, date TEXT NOT NULL, receipt_number TEXT, notes TEXT
    ) STRICT;
    CREATE TABLE staff_leave_requests (id TEXT PRIMARY KEY, staff_id TEXT, start_date TEXT, end_date TEXT, reason TEXT, type TEXT, status TEXT);
    CREATE TABLE staff_advances (id TEXT PRIMARY KEY, center_id TEXT, staff_id TEXT, amount REAL, date TEXT, reason TEXT, status TEXT);
    INSERT INTO staff VALUES ('stf_A', 'c1', 'Abir', 'Test', '55', '', '42', '', '', 'enseignant', NULL, '2026-10-16', 1000, 0, NULL, 'active');
    INSERT INTO staff VALUES ('stf_B', 'c2', 'Bob', 'Test', '56', '', '43', '', '', 'enseignant', NULL, '2026-10-16', 1000, 0, NULL, 'active');
  `);
  db = {
    prepare(sql: string) {
      let args: any[] = [];
      const stmt = {
        bind(...values: any[]) { args = values; return stmt; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { return sqlite.prepare(sql).run(...args); },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      for (const s of stmts) await s.run();
    },
  };
});

afterEach(() => sqlite.close());

const validPayslip = {
  id: 'pay_1',
  staffId: 'stf_A',
  month: 'سبتمبر 2026',
  baseSalary: 1000,
  bonus: 0,
  bonusReason: 'منحة',
  cnssDeduction: 0,
  absenceDeductions: 0,
  advanceDeducted: 0,
  netSalary: 1000,
  issueDate: '2026-10-16',
  daysPresent: 0,
  daysAbsent: 0,
  daysRetard: 0,
  extraHours: 0,
  extraHourRate: 8,
  extraHoursAmount: 0
};

describe('POST /api/staff-payslips', () => {
  it('creates ONE payslip, normalizing the Arabic month label to YYYY-MM', async () => {
    const ctx: any = { env: { DB: db }, request: postRequest({ staffId: 'stf_A', payslip: validPayslip }), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestPost(ctx)).status).toBe(200);
    const rows = sqlite.prepare('SELECT id, center_id, staff_id, month, net_salary FROM staff_payslips').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'pay_1', center_id: CENTER_A, staff_id: 'stf_A', month: '2026-09', net_salary: 1000 });
  });

  it('is idempotent on re-post (UPDATE, no duplicate row)', async () => {
    for (const net of [1000, 1100]) {
      const ctx: any = { env: { DB: db }, request: postRequest({ staffId: 'stf_A', payslip: { ...validPayslip, netSalary: net } }), data: {} };
      applySession(ctx, CENTER_A);
      await onRequestPost(ctx);
    }
    const rows = sqlite.prepare('SELECT COUNT(*) AS n, MAX(net_salary) AS net FROM staff_payslips').get() as any;
    expect(rows.n).toBe(1);
    expect(rows.net).toBe(1100);
  });

  it('reads the payslip back with the Arabic month label the UI uses', async () => {
    const ctx: any = { env: { DB: db }, request: postRequest({ staffId: 'stf_A', payslip: validPayslip }), data: {} };
    applySession(ctx, CENTER_A);
    await onRequestPost(ctx);
    const [staff] = await readStaff(db, CENTER_A);
    expect(staff.payslips).toHaveLength(1);
    expect(staff.payslips[0].month).toBe('سبتمبر 2026');
  });

  it('rejects a foreign-center staff with 400', async () => {
    const ctx: any = { env: { DB: db }, request: postRequest({ staffId: 'stf_B', payslip: validPayslip }), data: {} };
    applySession(ctx, CENTER_A);
    expect((await onRequestPost(ctx)).status).toBe(400);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM staff_payslips').get() as any).n).toBe(0);
  });

  it('rejects an invalid body (array / missing fields) with 400', async () => {
    const bads = [
      [],
      { staffId: 'stf_A', payslip: { id: 'x' } },
      { staffId: 'stf_A', payslip: { ...validPayslip, issueDate: '' } }
    ];
    for (const bad of bads) {
      const ctx: any = { env: { DB: db }, request: postRequest(bad), data: {} };
      applySession(ctx, CENTER_A);
      expect((await onRequestPost(ctx)).status).toBe(400);
    }
  });
});

describe('middleware boundary', () => {
  it('registers /api/staff-payslips with POST', () => {
    expect(ROUTES['/api/staff-payslips']).toEqual(['POST']);
  });

  it('returns 401 for unauthenticated access and 405 for wrong method', async () => {
    expect((await onRequest({ request: postRequest({}), env: { DB: db }, data: {}, next: vi.fn() } as any)).status).toBe(401);
    const patch = await onRequest({ request: new Request('https://app.example/api/staff-payslips', { method: 'PATCH' }), env: { DB: db }, data: {}, next: vi.fn() } as any);
    expect(patch.status).toBe(405);
  });
});
