/**
 * Feature 006 — US1/US2: composed pass over the most restrictive and the most
 * legacy configurations, in ONE render each.
 *
 * The point of this suite is cross-feature interference: every surface assert
 * happens while every other feature is active. Assertions are deliberately
 * *presence/absence of surface affordances* (labels, action titles, locked
 * cards) rather than deep form interaction — the per-feature suites own the
 * data-shape and save-path guarantees, and the gates run them unmodified.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CenterTenant, UserAccount } from './types';
import {
  CRECHE_COMPOSED_CONFIG,
  C5_RESTRICTED_CONFIG,
  FORMATION_CONFIG,
  GARDERIE_CONFIG,
  LEGACY_PASSTHROUGH_CONFIG,
  makeProgram
} from './testing/programConfig';

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
    createRenewalRequestApi: vi.fn().mockResolvedValue({ success: true, id: 'req_1' }),
    fetchActiveAdvertisementsApi: vi.fn().mockResolvedValue([]),
    saveDatabase: vi.fn().mockResolvedValue(undefined)
  };
});

// The composed pass drives the mid-session subscription/type sync by hand: the
// live-sync transport is captured rather than polled.
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
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as any).IntersectionObserver = IO;
  (globalThis as any).ResizeObserver = RO;
  if (!(globalThis as any).matchMedia) {
    (globalThis as any).matchMedia = () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  }
  if (!(window as any).scrollTo) (window as any).scrollTo = vi.fn();
  // jsdom has no Element.scrollTo; the app resets the module scroll on every tab switch.
  if (!(Element.prototype as any).scrollTo) (Element.prototype as any).scrollTo = vi.fn();
});

const STUDY_TAB_LABELS = ['الدروس الخصوصية', 'تأطير Étude', 'حصة مراجعة', 'التكوينات والدورات'];
const LOCKED_MESSAGE = /ميزة مقفلة/;
const POINTAGE_TAB_LABEL = 'نظام الحضور والغياب اليومي';
const DASHBOARD_GREETING = /مرحباً بك في لوحة قيادة/;
const NOTES_ACTION = 'إدخال نقاط الفروض (Notes Devoirs)';
const TIMESHEET_ACTION = 'عرض الجدول الزمني';
const PAYMENT_ACTION = 'استرجاع أشهر مستقبلية';

/** A composed dataset: one child (stored grade, suivi enrolment), one staff
 *  member, one activity, one skill + evaluation. */
function composedDb() {
  return {
    settings: { centerName: 'Program Center' },
    students: [{
      id: 'stu_1',
      firstName: 'Amine',
      lastName: 'Ben',
      grade: 'Grande Section',
      birthDate: '2021-04-01',
      enrolledServices: { suivi: true },
      timeSheetId: 'ts_1',
      payments: [{ id: 'pay_1', service: 'Suivi', month: 'Septembre 2026', amount: 250, discount: 0, date: '2026-09-05' }],
      suiviNotes: [{ schoolYear: '2026-2027', subjects: {} }]
    }],
    staff: [{
      id: 'stf_1',
      firstName: 'Mohamed',
      lastName: 'Ali',
      role: 'enseignant',
      contractStartDate: '2026-09-01',
      baseSalary: 1200,
      advances: [{ id: 'adv_1', amount: 200, date: '2026-09-10' }],
      payments: [{ id: 'sp_1', amount: 1000, date: '2026-09-30' }],
      payslips: [{ id: 'ps_1', month: 'Septembre', year: 2026, netSalary: 1000 }],
      schedule: []
    }],
    slots: [], courses: [], sessions: [], mealPlans: [], expenses: [], timesheets: [],
    externalStudents: [], revisionSeances: [],
    studentTimeSheets: [{ id: 'ts_1', studentId: 'stu_1', entries: [] }],
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
  // The sidebar renders first; wait until the authenticated shell has finished
  // booting (module content only mounts once fetchDatabase resolves).
  await screen.findByText('لوحة القيادة');
  await waitFor(() => expect(document.body.textContent || '').toMatch(DASHBOARD_GREETING), { timeout: 5000 });
}

/** Switch module by sidebar label and wait for that module's marker content. */
async function clickTab(label: string | RegExp, marker: string | RegExp) {
  fireEvent.click(screen.getAllByRole('button', { name: label })[0]);
  await waitFor(() => {
    const text = document.body.textContent || '';
    const rendered = typeof marker === 'string' ? text.includes(marker) : marker.test(text);
    expect(rendered, `module ${String(label)} did not render (marker ${String(marker)})`).toBe(true);
  }, { timeout: 5000 });
}

/** Open the registration create/edit form and return its dialog element. */
async function openRegistrationForm() {
  fireEvent.click(screen.getByRole('button', { name: /تسجيل تلميذ جديد/ }));
  await waitFor(() => expect(document.querySelector('.fixed.inset-0')).toBeTruthy(), { timeout: 5000 });
  return document.querySelector('.fixed.inset-0') as HTMLElement;
}

/** Push a mid-session subscription/type change through the captured live sync. */
async function pushCenterUpdate(center: CenterTenant) {
  h.centers = [center];
  const handler = h.liveSyncHandlers[h.liveSyncHandlers.length - 1];
  expect(handler, 'live-sync handler must be registered').toBeTruthy();
  await act(async () => { await handler(); });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.liveSyncHandlers.length = 0;
  h.centers = [];
  h.db = composedDb();
  cleanup();
});

// Composed passes drive several awaited module switches per test; the default
// 5 s test budget is not enough for the whole pass.
describe('US1 — the crèche composed pass (C1)', { timeout: 30000 }, () => {
  it('composes type hiding, subscription lite locks and the new modules in one pass', async () => {
    const { center, user } = makeProgram(CRECHE_COMPOSED_CONFIG);
    await loginAs(center, user);

    // Type layer — no study surface anywhere, even though every study module is entitled.
    for (const label of STUDY_TAB_LABELS) {
      expect(screen.queryByText(label), `crèche must not expose ${label}`).toBeNull();
    }
    // Subscription layer — the two new modules are entitled and navigable.
    expect(screen.getAllByText('الأنشطة والبرنامج').length).toBeGreaterThan(0);
    expect(screen.getAllByText('المهارات والكفاءات').length).toBeGreaterThan(0);
    // Étude entitlement without the Staff module keeps the staff tab (lite).
    expect(screen.getAllByText('إدارة الموظفين').length).toBeGreaterThan(0);

    // Registration — school-level fields are gone for a crèche.
    await clickTab('تسجيل التلاميذ', 'تسجيل تلميذ جديد');
    const regDialog = await openRegistrationForm();
    expect(within(regDialog).queryByText(/المستوى الدراسي/)).toBeNull();
    expect(within(regDialog).queryByText(/المؤسسة التعليمية/)).toBeNull();

    // Suivi — notes/timesheet actions hidden, payment actions intact.
    await clickTab('المتابعة الدراسية', 'رسوم التسجيل السنوي');
    expect(screen.queryByTitle(NOTES_ACTION)).toBeNull();
    expect(screen.queryByTitle(TIMESHEET_ACTION)).toBeNull();
    expect(screen.queryByTitle('لم يُسنَد جدول توقيت بعد')).toBeNull();
    expect(screen.getAllByTitle(PAYMENT_ACTION).length).toBeGreaterThan(0);

    // Staff — lite: roster CRUD present, pointage tab locked (visible but
    // disabled, remark 3), payroll locked with upgrade path.
    await clickTab('إدارة الموظفين', 'فريق العمل والملفات');
    const pointageTab = screen.getByText(POINTAGE_TAB_LABEL).closest('button') as HTMLButtonElement;
    expect(pointageTab.disabled).toBe(true);
    expect(screen.getAllByText(LOCKED_MESSAGE).length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText('الذهاب إلى التجديد').length).toBeGreaterThan(0);

    // Attendance register (remark 1, revision C): the crèche/jardin surface
    // shows no grade filter — search and status buttons stay.
    await clickTab('تسجيل حضور التلاميذ', 'حفظ pointage اليوم');
    expect(screen.queryByText('كل المستويات')).toBeNull();
    expect(screen.getByPlaceholderText('ابحث عن تلميذ...')).toBeTruthy();

    // Both new modules are functional with real data in the same session.
    await clickTab('الأنشطة والبرنامج', 'Motricité du matin');
    await clickTab('المهارات والكفاءات', 'الكتالوج');
    expect(screen.getByText('Vocabulaire')).toBeTruthy();
  });

  it('C1 — the crèche renewal simulator never offers study modules (composed)', async () => {
    const { center, user } = makeProgram(CRECHE_COMPOSED_CONFIG);
    await loginAs(center, user);
    await clickTab('التجديد', 'Simulateur de plan');

    // Remark 4: incompatible study addons are never offered as checkboxes…
    for (const label of ['Étude Surveillée', 'Cours Particuliers', 'Révision Examens', 'Formations']) {
      expect(screen.queryByRole('checkbox', { name: new RegExp(label) }), label).toBeNull();
    }
    // …while compatible addons and the base remain offered.
    expect(screen.getByRole('checkbox', { name: /Cantine & Repas/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Activités & Planning/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Compétences & Skills/ })).toBeTruthy();

    // The étude this center is already entitled to (pre-program list) stays
    // displayed as active — never re-offered, never hidden (research R9).
    expect(screen.getByText(/Étude Surveillée — reste actif/)).toBeTruthy();
  });

  it('C1 — the crèche renewal derives Pro from the type-applicable selection (composed, remark 7)', async () => {
    const { center, user } = makeProgram(CRECHE_COMPOSED_CONFIG);
    await loginAs(center, user);
    await clickTab('التجديد', 'Simulateur de plan');

    // Tick every compatible addon the simulator offers (cantine, transport,
    // events, staff, activites, competences — étude is entitled but never
    // re-offered, and the base is always included).
    for (const label of ['Cantine & Repas', 'Transport Scolaire', 'Événements & Sorties', 'Personnel & Salaires', 'Activités & Planning', 'Compétences & Skills']) {
      const box = screen.getByRole('checkbox', { name: new RegExp(label) });
      if (!(box as HTMLInputElement).checked) fireEvent.click(box);
    }

    // Selecting the type-applicable set derives Pro (remark 7) — the submit
    // button offers the plan change, and the request carries requestedPlan pro.
    await waitFor(() => expect(screen.getByText(/Demander le changement d/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Demander le changement d/));
    await waitFor(() => expect(api.createRenewalRequestApi).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'upgrade',
      requestedPlan: 'pro',
    })));
  });

  it('falls back to the dashboard when the center type flips under a study tab (stale deep link)', async () => {
    // Login as a study-bearing center, open the étude tab, then flip the type
    // mid-session: the guard must land on the dashboard, never keep module3 open.
    const { center, user } = makeProgram({
      type: 'formation',
      enabledModules: [...(CRECHE_COMPOSED_CONFIG.enabledModules as string[])]
    });
    await loginAs(center, user);
    fireEvent.click(screen.getAllByRole('button', { name: 'تأطير Étude' })[0]);
    // the dashboard module must have unmounted → the étude tab is really open
    await waitFor(() => expect(document.body.textContent || '').not.toMatch(DASHBOARD_GREETING), { timeout: 5000 });

    await pushCenterUpdate({ ...center, centerType: 'creche' });

    // study surfaces gone and the active tab fell back to the dashboard
    for (const label of STUDY_TAB_LABELS) {
      expect(screen.queryByText(label)).toBeNull();
    }
    await waitFor(() => expect(document.body.textContent || '').toMatch(DASHBOARD_GREETING), { timeout: 5000 });
  });
});

describe('US1 edge — C5 composes all three restriction layers', { timeout: 30000 }, () => {
  it('role limits ∩ subscription ∩ type hiding compose with no error state', async () => {
    const { center, user } = makeProgram(C5_RESTRICTED_CONFIG);
    await loginAs(center, user);

    // role layer: restricted_admin never reaches the staff module, even with étude entitled
    expect(screen.queryByText('إدارة الموظفين')).toBeNull();
    // role layer: the restricted payroll/meal tabs are gone too
    expect(screen.queryByText('إدارة الوجبات')).toBeNull();
    // type layer: no study surface for the crèche
    for (const label of STUDY_TAB_LABELS) {
      expect(screen.queryByText(label)).toBeNull();
    }
    // subscription layer: only the entitled new module is navigable
    expect(screen.getAllByText('الأنشطة والبرنامج').length).toBeGreaterThan(0);
    expect(screen.queryByText('المهارات والكفاءات')).toBeNull();
    // the shell is healthy: dashboard renders and the entitled module works
    expect(document.body.textContent || '').toMatch(DASHBOARD_GREETING);
    await clickTab('الأنشطة والبرنامج', 'Motricité du matin');
  });
});

describe('US2 — legacy regression safety (C2/C3/C4)', { timeout: 30000 }, () => {
  const rows: Array<[string, typeof LEGACY_PASSTHROUGH_CONFIG]> = [
    ['unknown type + legacy empty module list', LEGACY_PASSTHROUGH_CONFIG],
    ['formation + pre-program list', FORMATION_CONFIG],
    ['garderie + pre-program list', GARDERIE_CONFIG]
  ];

  it.each(rows)('%s keeps full pre-program visibility', async (_name, config) => {
    const { center, user } = makeProgram(config);
    await loginAs(center, user);

    // every study surface is back
    for (const label of STUDY_TAB_LABELS) {
      expect(screen.getAllByText(label).length, `${label} must stay visible`).toBeGreaterThan(0);
    }

    // registration keeps the school-level fields
    await clickTab('تسجيل التلاميذ', 'تسجيل تلميذ جديد');
    const regDialog = await openRegistrationForm();
    expect(within(regDialog).getAllByText(/المستوى الدراسي/).length).toBeGreaterThan(0);
    expect(within(regDialog).getAllByText(/المؤسسة التعليمية/).length).toBeGreaterThan(0);

    // Suivi keeps notes + timesheet actions next to the payment actions
    await clickTab('المتابعة الدراسية', 'رسوم التسجيل السنوي');
    expect(screen.getAllByTitle(NOTES_ACTION).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(TIMESHEET_ACTION).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(PAYMENT_ACTION).length).toBeGreaterThan(0);
  });

  it('C1 — meals & goûter remarks compose through the App shell (revision D)', async () => {
    // C1 is entitled to cantine by revision D's composed extension: the meals
    // module must compose its remark surfaces with every other feature active.
    const { center, user } = makeProgram({ ...CRECHE_COMPOSED_CONFIG, enabledModules: [...CRECHE_COMPOSED_CONFIG.enabledModules!, 'cantine'] });
    // Seed a lunch subscriber and both goûter-only shapes (fresh + legacy stale
    // meals:true) so the disjoint-table assertions have data to bite on.
    const base = composedDb();
    h.db = {
      ...base,
      students: [
        ...base.students,
        {
          id: 'stu_gouter_fresh', firstName: 'Gouter', lastName: 'Fresh', grade: 'PS',
          enrolledServices: { suivi: true, gouterMatin: true }
        },
        {
          id: 'stu_gouter_legacy', firstName: 'Gouter', lastName: 'Legacy', grade: 'GS',
          enrolledServices: { suivi: true, meals: true, gouterSoir: true }
        }
      ]
    };
    await loginAs(center, user);
    await clickTab('إدارة الوجبات', 'برنامج وجبة اليوم');

    // Remark M1: the six day tabs including «السبت».
    for (const label of ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']) {
      const tabs = screen.getAllByRole('button', { name: label });
      expect(tabs.length, `day tab ${label}`).toBeGreaterThan(0);
    }

    // Remark M2: the dedicated Goûter consumption table renders beside the lunch table.
    expect(screen.getByText('متابعة استهلاك مشتركي اللمجة شهرياً')).toBeTruthy();
    expect(screen.getByText('متابعة استهلاك المشتركين شهرياً')).toBeTruthy();

    // Remark M3: the unit-meal modal gates its three toggles by subscription —
    // all three start disabled before any candidate is selected.
    fireEvent.click(screen.getAllByRole('button', { name: /إضافة تلميذ بالوحدة/ })[0]);
    expect(document.querySelector('[data-testid="unit-service-toggle-lunch"]')).toHaveProperty('disabled', true);
    expect(document.querySelector('[data-testid="unit-service-toggle-gouter_matin"]')).toHaveProperty('disabled', true);
    expect(document.querySelector('[data-testid="unit-service-toggle-gouter_apres_midi"]')).toHaveProperty('disabled', true);

    // Remark M4: the Goûter subscribers table keeps its edit-type action and no unenroll button.
    expect(screen.queryByTitle('إلغاء الاشتراك في اللمجة')).toBeNull();
    expect(screen.getAllByTitle('تعديل نوع الاشتراك').length).toBe(2);
  });

  it('C2 — the legacy empty module list keeps the FULL staff module (no locks)', async () => {
    const { center, user } = makeProgram(LEGACY_PASSTHROUGH_CONFIG);
    await loginAs(center, user);
    await clickTab('إدارة الموظفين', 'فريق العمل والملفات');
    // legacy passthrough is not "lite": the pointage sub-tab and the payroll
    // surfaces are all available
    expect(screen.getByText(POINTAGE_TAB_LABEL)).toBeTruthy();
    expect(screen.queryByText(LOCKED_MESSAGE)).toBeNull();
  });

  it('C3/C4 — an explicit pre-program list without the staff key renders lite (subscription is authoritative)', async () => {
    const { center, user } = makeProgram(FORMATION_CONFIG);
    await loginAs(center, user);
    await clickTab('إدارة الموظفين', 'فريق العمل والملفات');
    // entitled to Étude but not to Staff → roster only, pointage tab locked,
    // payroll surfaces locked
    const pointageTab = screen.getByText(POINTAGE_TAB_LABEL).closest('button') as HTMLButtonElement;
    expect(pointageTab.disabled).toBe(true);
    expect(screen.getAllByText(LOCKED_MESSAGE).length).toBeGreaterThanOrEqual(4);
  });
});
