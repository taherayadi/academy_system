import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import App from './App';
import { CenterTenant, UserAccount } from './types';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchDatabase: vi.fn().mockResolvedValue({
      settings: {}, students: [], staff: [], slots: [], courses: [], sessions: [],
      mealPlans: [], expenses: [], timesheets: [], externalStudents: [],
      revisionSeances: [], studentTimeSheets: [], formations: [], events: []
    }),
    fetchStudentAttendanceApi: vi.fn().mockResolvedValue([]),
    fetchMealForfaitClosures: vi.fn().mockResolvedValue([]),
    fetchCentersApi: vi.fn().mockResolvedValue([]),
    fetchRenewalRequestsApi: vi.fn().mockResolvedValue({ requests: [], history: [] }),
    fetchActiveAdvertisementsApi: vi.fn().mockResolvedValue([]),
    saveDatabase: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('./hooks/usePubNubSync', () => ({ usePubNubSync: () => 'inactive' }));
vi.mock('./hooks/useLiveSync', () => ({
  useLiveSync: vi.fn(),
  subscriptionSnapshot: (c: unknown) => JSON.stringify(c),
  LIVE_SYNC_INTERVAL_MS: 60000,
  LIVE_SYNC_FAST_INTERVAL_MS: 5000,
}));

vi.mock('./auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth')>();
  return { ...actual, verifyPassword: vi.fn() };
});

beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } root = null; rootMargin = ''; thresholds = []; }
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as any).IntersectionObserver = IO;
  (globalThis as any).ResizeObserver = RO;
  if (!(globalThis as any).matchMedia) {
    (globalThis as any).matchMedia = () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  }
  if (!(window as any).scrollTo) (window as any).scrollTo = vi.fn();
});

const STUDY_TAB_LABELS = ['الدروس الخصوصية', 'تأطير Étude', 'حصة مراجعة', 'التكوينات والدورات'];

function makeCenter(centerType: string | undefined, enabledModules: string[]): CenterTenant {
  return {
    id: 'c1',
    name: 'Test Center',
    plan: 'growth',
    status: 'active',
    enabledModules,
    centerType,
    createdAt: 0
  };
}

async function loginAs(center: CenterTenant) {
  const { verifyPassword } = await import('./auth');
  const user: UserAccount = { email: 'admin@test.tn', name: 'Admin', role: 'admin', description: '' };
  vi.mocked(verifyPassword).mockResolvedValue({ user, center });

  render(<App />);
  // Landing → login screen (the login view's back button also matches /connexion/)
  fireEvent.click(screen.getAllByRole('button', { name: /connexion/i })[0]);
  await screen.findByText('كلمة السر');

  fireEvent.change(screen.getByPlaceholderText('example@gmail.com'), { target: { value: 'admin@test.tn' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret' } });
  fireEvent.submit(document.querySelector('form')!);

  await screen.findByText('لوحة القيادة');
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  cleanup();
});

describe('App type gating (study modules)', () => {
  it('hides the four study tabs for a crèche center even when their modules are enabled', async () => {
    // The study modules are part of the subscription — type gating must still
    // remove the tabs for a crèche (intersection of both gates).
    await loginAs(makeCenter('creche', ['scolaire', 'studentTimeSheets', 'finance', 'etude', 'coursParticuliers', 'revision', 'formations', 'events']));
    for (const label of STUDY_TAB_LABELS) {
      expect(screen.queryByText(label), `creche must not show ${label}`).toBeNull();
    }
    // non-study tabs remain
    expect(screen.getAllByText('الفعاليات والخرجات').length).toBeGreaterThan(0);
  });

  it('shows all four study tabs for a formation center', async () => {
    await loginAs(makeCenter('formation', ['scolaire', 'studentTimeSheets', 'finance', 'etude', 'coursParticuliers', 'revision', 'formations', 'events']));
    for (const label of STUDY_TAB_LABELS) {
      expect(screen.getAllByText(label).length, `formation must show ${label}`).toBeGreaterThan(0);
    }
  });

  it('keeps every tab for a legacy center with no type', async () => {
    await loginAs(makeCenter(undefined, ['scolaire', 'studentTimeSheets', 'finance', 'etude', 'coursParticuliers', 'revision', 'formations', 'events']));
    for (const label of STUDY_TAB_LABELS) {
      expect(screen.getAllByText(label).length, `legacy must show ${label}`).toBeGreaterThan(0);
    }
  });
});
