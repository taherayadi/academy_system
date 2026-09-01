import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UnauthorizedError,
  saveStudents,
  saveStaff,
  saveSlots,
  saveCourses,
  saveSessions,
  saveMealPlans,
  saveExpenses,
  saveTimesheets,
  saveExternalStudents,
  saveRevisionSeances,
  saveStudentTimeSheets,
  saveFormations,
  saveSettings,
  saveDatabase,
  fetchDatabase,
  loginRequest,
  getSessionToken,
  setSessionToken,
} from './api';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// UnauthorizedError
// ---------------------------------------------------------------------------
describe('UnauthorizedError', () => {
  it('has correct name and message', () => {
    const err = new UnauthorizedError();
    expect(err.name).toBe('UnauthorizedError');
    expect(err.message).toContain('صلاحية الجلسة');
  });

  it('is an instance of Error', () => {
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// saveStudents (representative of all saveX functions)
// ---------------------------------------------------------------------------
describe('saveStudents', () => {
  it('sends PUT with students body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    const students = [{ id: 's1', firstName: 'Test' }];
    await saveStudents(students as any);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/students');
    expect(opts.method).toBe('PUT');
    expect(opts.body).toBe(JSON.stringify(students));
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'DB error' }, 500));
    await expect(saveStudents([])).rejects.toThrow('DB error');
  });

  it('throws UnauthorizedError on 401', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    await expect(saveStudents([])).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('uses Arabic error message when server returns no error field', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(saveStudents([])).rejects.toThrow('تعذر حفظ بيانات التلاميذ');
  });
});

// ---------------------------------------------------------------------------
// All save domain functions use the same pattern, verify each route
// ---------------------------------------------------------------------------
describe('save domain functions route paths', () => {
  const cases: [string, (data: any) => Promise<void>][] = [
    ['/api/students', saveStudents],
    ['/api/staff', saveStaff],
    ['/api/slots', saveSlots],
    ['/api/courses', saveCourses],
    ['/api/sessions', saveSessions],
    ['/api/meals', saveMealPlans],
    ['/api/expenses', saveExpenses],
    ['/api/timesheets', saveTimesheets],
    ['/api/external-students', saveExternalStudents],
    ['/api/revision-seances', saveRevisionSeances],
    ['/api/student-timesheets', saveStudentTimeSheets],
    ['/api/formations', saveFormations],
    ['/api/settings', saveSettings],
  ];

  it.each(cases)('saveX sends to %s', async (path, fn) => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    await fn([] as any);
    expect(mockFetch.mock.calls[0][0]).toBe(path);
  });
});

// ---------------------------------------------------------------------------
// saveDatabase (full state PUT)
// ---------------------------------------------------------------------------
describe('saveDatabase', () => {
  it('sends PUT to /api/state', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    const state = { students: [], staff: [] } as any;
    await saveDatabase(state);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/state');
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
  });
});

// ---------------------------------------------------------------------------
// fetchDatabase (concurrent domain load)
// ---------------------------------------------------------------------------
describe('fetchDatabase', () => {
  it('calls all 13 domain endpoints concurrently', async () => {
    const responses = Array.from({ length: 13 }, () => jsonResponse([]));
    mockFetch.mockImplementation(() => Promise.resolve(responses.shift()));

    const db = await fetchDatabase();
    expect(mockFetch).toHaveBeenCalledTimes(13);
    expect(db.students).toEqual([]);
    expect(db.staff).toEqual([]);
    expect(db.settings).toEqual([]);
    expect(db.slots).toEqual([]);
    expect(db.courses).toEqual([]);
    expect(db.sessions).toEqual([]);
    expect(db.mealPlans).toEqual([]);
    expect(db.expenses).toEqual([]);
    expect(db.timesheets).toEqual([]);
    expect(db.externalStudents).toEqual([]);
    expect(db.revisionSeances).toEqual([]);
    expect(db.studentTimeSheets).toEqual([]);
    expect(db.formations).toEqual([]);
  });

  it('throws UnauthorizedError if any endpoint returns 401', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    await expect(fetchDatabase()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

// ---------------------------------------------------------------------------
// Session token persistence (Bearer header for app-restart auto-login)
// ---------------------------------------------------------------------------
describe('session token', () => {
  beforeEach(() => {
    localStorage.removeItem('tc_token');
  });

  it('stores login token and returns user', async () => {
    const user = { email: 'a@b.com', name: 'A', role: 'super_admin', description: '' };
    mockFetch.mockResolvedValue(jsonResponse({ user, token: 'tok123' }));
    const result = await loginRequest('a@b.com', 'pass');
    expect(result).toEqual(user);
    expect(getSessionToken()).toBe('tok123');
  });

  it('does not crash when login returns no token', async () => {
    const user = { email: 'a@b.com', name: 'A', role: 'super_admin', description: '' };
    mockFetch.mockResolvedValue(jsonResponse({ user }));
    const result = await loginRequest('a@b.com', 'pass');
    expect(result).toEqual(user);
    expect(getSessionToken()).toBeNull();
  });

  it('clears token via setSessionToken(null)', () => {
    localStorage.setItem('tc_token', 'abc');
    setSessionToken(null);
    expect(getSessionToken()).toBeNull();
  });

  it('sends Authorization Bearer header on authed requests', async () => {
    localStorage.setItem('tc_token', 'secret-token');
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    await saveStudents([]);
    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe('Bearer secret-token');
  });
});

// ---------------------------------------------------------------------------
// loginRequest
// ---------------------------------------------------------------------------
describe('loginRequest', () => {
  it('sends POST to /api/auth/login', async () => {
    const user = { email: 'a@b.com', name: 'A', role: 'super_admin', description: '' };
    mockFetch.mockResolvedValue(jsonResponse({ user }));
    const result = await loginRequest('a@b.com', 'pass');
    expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/login');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    expect(result).toEqual(user);
  });

  it('throws on server error', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Bad credentials' }, 401));
    await expect(loginRequest('x', 'y')).rejects.toThrow('Bad credentials');
  });

  it('throws generic error when server returns no error message', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(loginRequest('x', 'y')).rejects.toThrow('خطأ في تسجيل الدخول');
  });
});
