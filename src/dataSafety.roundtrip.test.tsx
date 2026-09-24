/**
 * Feature 006 — US4: data-safety round-trips (matrix C6–C9).
 *
 * Guarantees under test: gating never destroys data (reveal is verbatim),
 * entitlements/modules are reversible mid-session, and the skills write path
 * stays cascade-precise under a stale second writer.
 */
import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react';
import App from './App';
import { writeSkills } from '../functions/api/_lib';
import type { CenterTenant, UserAccount } from './types';
import { CRECHE_COMPOSED_CONFIG, makeCenter, makeProgram } from './testing/programConfig';

const h = vi.hoisted(() => ({
  liveSyncHandlers: [] as Array<() => Promise<void>>,
  centers: [] as unknown[],
  db: {} as Record<string, unknown>
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchDatabase: vi.fn(() => Promise.resolve(h.db)),
    fetchStudentAttendanceApi: vi.fn().mockResolvedValue([]),
    fetchMealForfaitClosures: vi.fn().mockResolvedValue([]),
    fetchCentersApi: vi.fn(() => Promise.resolve(h.centers)),
    fetchRenewalRequestsApi: vi.fn().mockResolvedValue({ requests: [], history: [] }),
    fetchActiveAdvertisementsApi: vi.fn().mockResolvedValue([]),
    saveDatabase: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock('./hooks/useLiveSync', () => ({
  useLiveSync: (_enabled: boolean, cb: () => Promise<void>) => {
    h.liveSyncHandlers.push(cb);
  },
  subscriptionSnapshot: (c: unknown) => JSON.stringify(c),
  LIVE_SYNC_INTERVAL_MS: 60000,
  LIVE_SYNC_FAST_INTERVAL_MS: 5000
}));
vi.mock('./hooks/usePubNubSync', () => ({ usePubNubSync: () => 'inactive' }));

vi.mock('./auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth')>();
  return { ...actual, verifyPassword: vi.fn() };
});

beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } root = null; rootMargin = ''; thresholds: number[] = []; }
  (globalThis as any).IntersectionObserver = IO;
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!(globalThis as any).matchMedia) {
    (globalThis as any).matchMedia = () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  }
  if (!(window as any).scrollTo) (window as any).scrollTo = vi.fn();
  if (!(Element.prototype as any).scrollTo) (Element.prototype as any).scrollTo = vi.fn();
});

const DASHBOARD_GREETING = /مرحباً بك في لوحة قيادة/;
const STORED_GRADE = 'Grande Section';
const LOCKED_MESSAGE = /ميزة مقفلة/;
const POINTAGE_TAB_LABEL = 'نظام الحضور والغياب اليومي';

function roundTripDb() {
  return {
    settings: { centerName: 'Program Center' },
    students: [{
      id: 'stu_1',
      firstName: 'Amine',
      lastName: 'Ben',
      grade: STORED_GRADE, // stored before the module was restricted
      birthDate: '2021-04-01',
      enrolledServices: { suivi: true },
      payments: [{ id: 'pay_1', service: 'Suivi', month: 'Septembre 2026', amount: 250, discount: 0, date: '2026-09-05' }]
    }],
    staff: [{
      id: 'stf_1',
      firstName: 'Mohamed',
      lastName: 'Ali',
      role: 'enseignant',
      contractStartDate: '2026-09-01',
      baseSalary: 1200,
      // payroll history that a locked lite center must not lose
      advances: [{ id: 'adv_1', amount: 200, date: '2026-09-10' }],
      payments: [{ id: 'sp_1', amount: 1000, date: '2026-09-30' }],
      payslips: [{ id: 'ps_1', month: 'Septembre', year: 2026, netSalary: 1000 }],
      schedule: []
    }],
    slots: [], courses: [], sessions: [], mealPlans: [], expenses: [], timesheets: [],
    externalStudents: [], revisionSeances: [], studentTimeSheets: [],
    formations: [], events: [],
    activities: [{ id: 'act_1', title: 'Motricité du matin', category: 'motricite', weekday: 0, timeStart: '09:00', timeEnd: '09:30' }],
    skills: [{ id: 'skl_1', domain: 'langage', label: 'Vocabulaire' }],
    skillEvaluations: [{ id: 'evl_1', studentId: 'stu_1', skillId: 'skl_1', level: 'acquis', evaluatedByName: 'Mme Salma', evaluatedAt: '2026-09-10' }]
  };
}

async function loginAs(center: CenterTenant, user: UserAccount) {
  const { verifyPassword } = await import('./auth');
  vi.mocked(verifyPassword).mockResolvedValue({ user, center });

  render(<App />);
  fireEvent.click(screen.getAllByRole('button', { name: /connexion/i })[0]);
  await screen.findByText('كلمة السر');
  fireEvent.change(screen.getByPlaceholderText('example@gmail.com'), { target: { value: user.email } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret' } });
  fireEvent.submit(document.querySelector('form')!);
  await screen.findByText('لوحة القيادة');
  await waitFor(() => expect(document.body.textContent || '').toMatch(DASHBOARD_GREETING), { timeout: 5000 });
}

async function clickTab(label: string | RegExp, marker: string | RegExp) {
  fireEvent.click(screen.getAllByRole('button', { name: label })[0]);
  await waitFor(() => {
    const text = document.body.textContent || '';
    const rendered = typeof marker === 'string' ? text.includes(marker) : marker.test(text);
    expect(rendered, `module ${String(label)} did not render (marker ${String(marker)})`).toBe(true);
  }, { timeout: 5000 });
}

async function pushCenterUpdate(center: CenterTenant) {
  h.centers = [center];
  const handler = h.liveSyncHandlers[h.liveSyncHandlers.length - 1];
  expect(handler, 'live-sync handler must be registered').toBeTruthy();
  await act(async () => { await handler(); });
}

const bodyText = () => document.body.textContent || '';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.liveSyncHandlers.length = 0;
  h.centers = [];
  h.db = roundTripDb();
  cleanup();
});

describe('C6 — a type flip restores stored grades verbatim', { timeout: 30000 }, () => {
  it('hides the stored grade for a crèche, reveals it for a formation center, and keeps it intact', async () => {
    const { center, user } = makeProgram(CRECHE_COMPOSED_CONFIG);
    await loginAs(center, user);
    // the registration card renders the grade badge only for school types
    await clickTab('تسجيل التلاميذ', 'تسجيل تلميذ جديد');
    expect(bodyText()).toContain('Amine Ben');
    // hidden for the crèche — the stored value is not rendered anywhere
    expect(bodyText()).not.toContain(STORED_GRADE);

    // flip to a school-bearing type mid-session
    await pushCenterUpdate({ ...center, centerType: 'formation' });
    await waitFor(() => expect(bodyText()).toContain(STORED_GRADE), { timeout: 5000 });

    // flip back: hidden again
    await pushCenterUpdate({ ...center, centerType: 'creche' });
    await waitFor(() => expect(bodyText()).not.toContain(STORED_GRADE), { timeout: 5000 });

    // flip forward again: the value is byte-identical, never destroyed
    await pushCenterUpdate({ ...center, centerType: 'formation' });
    await waitFor(() => expect(bodyText()).toContain(STORED_GRADE), { timeout: 5000 });
    expect(bodyText()).toContain(STORED_GRADE);
  });

  it('hides the registration school fields for a crèche and restores them for a formation center', async () => {
    const { center, user } = makeProgram(CRECHE_COMPOSED_CONFIG);
    await loginAs(center, user);
    await clickTab('تسجيل التلاميذ', 'تسجيل تلميذ جديد');
    fireEvent.click(screen.getByRole('button', { name: /تسجيل تلميذ جديد/ }));
    await waitFor(() => expect(document.querySelector('.fixed.inset-0')).toBeTruthy(), { timeout: 5000 });
    let dialog = document.querySelector('.fixed.inset-0') as HTMLElement;
    expect(within(dialog).queryByText(/المستوى الدراسي/)).toBeNull();

    await pushCenterUpdate({ ...center, centerType: 'formation' });
    await waitFor(() => {
      dialog = document.querySelector('.fixed.inset-0') as HTMLElement;
      expect(within(dialog).getAllByText(/المستوى الدراسي/).length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });
});

describe('C7 — an entitlement upgrade reveals locked payroll records unchanged', { timeout: 30000 }, () => {
  it('lite locks flip to the full staff module with the roster and payroll history intact', async () => {
    const { center, user } = makeProgram({ type: 'formation', enabledModules: ['scolaire', 'etude'] });
    await loginAs(center, user);
    await clickTab('إدارة الموظفين', 'فريق العمل والملفات');
    // locked: no pointage sub-tab, payroll surfaces replaced by lock cards
    expect(screen.queryByText(POINTAGE_TAB_LABEL)).toBeNull();
    expect(screen.getAllByText(LOCKED_MESSAGE).length).toBeGreaterThanOrEqual(4);

    // the center buys the staff module mid-session
    await pushCenterUpdate({ ...center, enabledModules: ['scolaire', 'etude', 'staff'] });
    await waitFor(() => expect(screen.queryByText(LOCKED_MESSAGE)).toBeNull(), { timeout: 5000 });
    expect(screen.getByText(POINTAGE_TAB_LABEL)).toBeTruthy();
    // the roster record survived the locked period untouched
    expect(bodyText()).toContain('Mohamed Ali');
  });
});

describe('C8 — disabling and re-enabling a module never loses its data', { timeout: 30000 }, () => {
  const composed: Partial<typeof CRECHE_COMPOSED_CONFIG> = { type: 'formation', enabledModules: [...(CRECHE_COMPOSED_CONFIG.enabledModules as string[])] };

  it('the activities module leaves the nav when disabled and returns with its data', async () => {
    const { center, user } = makeProgram(composed);
    await loginAs(center, user);
    await clickTab('الأنشطة والبرنامج', 'Motricité du matin');

    await pushCenterUpdate({ ...center, enabledModules: (center.enabledModules as string[]).filter(k => k !== 'activites') });
    // nav trace gone, and the stale deep link fell back to the dashboard
    await waitFor(() => expect(screen.queryByText('الأنشطة والبرنامج')).toBeNull(), { timeout: 5000 });
    await waitFor(() => expect(bodyText()).toMatch(DASHBOARD_GREETING), { timeout: 5000 });

    await pushCenterUpdate({ ...center, enabledModules: [...(CRECHE_COMPOSED_CONFIG.enabledModules as string[])] });
    await clickTab('الأنشطة والبرنامج', 'Motricité du matin');
    expect(screen.getByText('Motricité du matin')).toBeTruthy();
  });

  it('the competences module leaves the nav when disabled and returns with catalog + evaluations', async () => {
    const { center, user } = makeProgram(composed);
    await loginAs(center, user);
    await clickTab('المهارات والكفاءات', 'الكتالوج');
    expect(screen.getByText('Vocabulaire')).toBeTruthy();

    await pushCenterUpdate({ ...center, enabledModules: (center.enabledModules as string[]).filter(k => k !== 'competences') });
    await waitFor(() => expect(screen.queryByText('المهارات والكفاءات')).toBeNull(), { timeout: 5000 });

    await pushCenterUpdate({ ...center, enabledModules: [...(CRECHE_COMPOSED_CONFIG.enabledModules as string[])] });
    await clickTab('المهارات والكفاءات', 'الكتالوج');
    // catalog intact; the stored evaluation is still there for the child
    expect(screen.getByText('Vocabulaire')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'التقييم' })[0]);
    fireEvent.change(screen.getByLabelText('الطفل'), { target: { value: 'stu_1' } });
    const levelSelect = await screen.findByLabelText('المستوى Vocabulaire') as unknown as HTMLSelectElement;
    expect(levelSelect.value).toBe('acquis');
  });
});

// ── C9: the skills write path under a stale second writer ────────────────────

const CENTER = 'c1';

let sqlite: DatabaseSync;
let db: any;

function storedDoc() {
  return {
    skills: sqlite.prepare('SELECT id FROM skills WHERE center_id = ? ORDER BY id').all(CENTER).map((r: any) => r.id),
    evaluations: sqlite.prepare('SELECT id, skill_id FROM skill_evaluations WHERE center_id = ? ORDER BY id').all(CENTER)
  };
}

const skill = (id: string) => ({ id, domain: 'langage', label: `Compétence ${id}` });
const evaluation = (id: string, skillId: string, level = 'acquis') => ({
  id, studentId: 'stu_1', skillId, level, evaluatedByName: 'Mme Salma', evaluatedAt: '2026-09-20'
});

describe('C9 — cascade precision under a stale second writer', () => {
  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`
      CREATE TABLE skills (
        id TEXT PRIMARY KEY, center_id TEXT NOT NULL, domain TEXT NOT NULL,
        label TEXT NOT NULL, age_from INTEGER, age_to INTEGER, created_at TEXT
      );
      CREATE TABLE skill_evaluations (
        id TEXT PRIMARY KEY, center_id TEXT NOT NULL, student_id TEXT NOT NULL,
        skill_id TEXT NOT NULL, level TEXT NOT NULL,
        evaluated_by_staff_id TEXT, evaluated_by_name TEXT, evaluated_at TEXT NOT NULL
      );
      CREATE TABLE students (id TEXT PRIMARY KEY, center_id TEXT);
      INSERT INTO students VALUES ('stu_1', '${CENTER}');
    `);
    db = {
      prepare(sql: string) {
        let args: any[] = [];
        const stmt = {
          bind(...values: any[]) { args = values; return stmt; },
          async first() { return sqlite.prepare(sql).get(...args) ?? null; },
          async all() { return { results: sqlite.prepare(sql).all(...args) }; },
          async run() { return sqlite.prepare(sql).run(...args); }
        };
        return stmt;
      },
      async batch(stmts: any[]) {
        for (const s of stmts) await s.run();
      }
    };
  });

  afterEach(() => sqlite.close());

  it('the latest write wins as a whole document, with cascade applied inside it', async () => {
    // Session A removes skill S and its evaluation.
    await writeSkills(db, { catalog: [skill('skl_keep')], evaluations: [evaluation('evl_keep', 'skl_keep')] }, CENTER);
    expect(storedDoc()).toEqual({ skills: ['skl_keep'], evaluations: [{ id: 'evl_keep', skill_id: 'skl_keep' }] });

    // Session B is stale: it still holds S and an evaluation on it.
    await writeSkills(db, {
      catalog: [skill('skl_keep'), skill('skl_stale')],
      evaluations: [evaluation('evl_keep', 'skl_keep'), evaluation('evl_stale', 'skl_stale')]
    }, CENTER);

    // B wins as a whole: both skills and both evaluations are stored.
    expect(storedDoc()).toEqual({
      skills: ['skl_keep', 'skl_stale'],
      evaluations: [
        { id: 'evl_keep', skill_id: 'skl_keep' },
        { id: 'evl_stale', skill_id: 'skl_stale' }
      ]
    });
  });

  it('drops exactly the evaluations whose skill left the same write, and no orphans survive', async () => {
    await writeSkills(db, {
      catalog: [skill('skl_keep'), skill('skl_gone')],
      evaluations: [evaluation('evl_keep', 'skl_keep'), evaluation('evl_gone', 'skl_gone')]
    }, CENTER);

    // The next write removes skl_gone but its (stale) evaluation is still sent.
    await writeSkills(db, {
      catalog: [skill('skl_keep')],
      evaluations: [evaluation('evl_keep', 'skl_keep'), evaluation('evl_gone', 'skl_gone')]
    }, CENTER);

    const doc = storedDoc();
    expect(doc.skills).toEqual(['skl_keep']);
    // unrelated evaluation persists, the orphaned one is gone
    expect(doc.evaluations).toEqual([{ id: 'evl_keep', skill_id: 'skl_keep' }]);
    // no stored evaluation references a skill that is not stored (no orphans)
    for (const e of doc.evaluations) {
      expect(doc.skills).toContain(e.skill_id);
    }
  });

  it('keeps the last evaluation per (student, skill) pair within one write', async () => {
    await writeSkills(db, {
      catalog: [skill('skl_1')],
      evaluations: [
        evaluation('evl_old', 'skl_1', 'emergent'),
        evaluation('evl_new', 'skl_1', 'acquis')
      ]
    }, CENTER);

    const doc = storedDoc();
    expect(doc.evaluations.length).toBe(1);
    expect(doc.evaluations[0].id).toBe('evl_new');
  });

  it('keeps concurrent center data isolated while the cascade runs', async () => {
    sqlite.exec(`INSERT INTO students VALUES ('stu_b', 'c2')`);
    await writeSkills(db, { catalog: [skill('skl_b')], evaluations: [evaluation('evl_b', 'skl_b')] }, 'c2');
    await writeSkills(db, { catalog: [skill('skl_keep')], evaluations: [evaluation('evl_keep', 'skl_keep')] }, CENTER);

    expect(storedDoc()).toEqual({ skills: ['skl_keep'], evaluations: [{ id: 'evl_keep', skill_id: 'skl_keep' }] });
    const other = sqlite.prepare('SELECT id FROM skills WHERE center_id = ?').all('c2');
    expect(other.map((r: any) => r.id)).toEqual(['skl_b']);
  });
});

describe('programConfig factory remains the matrix source for this suite', () => {
  it('the composed crèche row is the one these round-trips flip between', () => {
    const center = makeCenter(CRECHE_COMPOSED_CONFIG);
    expect(center.centerType).toBe('creche');
    expect(center.enabledModules).toContain('activites');
    expect(center.enabledModules).toContain('competences');
  });
});
