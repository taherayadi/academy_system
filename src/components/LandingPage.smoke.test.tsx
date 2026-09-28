import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LandingPage from './LandingPage';
import { submitDemoRequestApi } from '../api';

vi.mock('../api', () => ({
  fetchActiveAdvertisementsApi: vi.fn().mockResolvedValue([]),
  fetchPublicModulePricesApi: vi.fn().mockResolvedValue({
    scolaire: 20,
    finance: 20,
    studentTimeSheets: 0,
    etude: 15,
    coursParticuliers: 15,
    revision: 15,
    formations: 15,
    cantine: 18,
    transport: 15,
    events: 15,
    staff: 12
  }),
  submitDemoRequestApi: vi.fn().mockResolvedValue(undefined)
}));

beforeAll(() => {
  // jsdom lacks the observers used by motion's whileInView / useInView
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
  }
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).IntersectionObserver = IO;
  (globalThis as any).ResizeObserver = RO;
});

/** Click the first *button* containing the given text (module toggle cards/rows). */
function clickModuleToggle(label: string) {
  const btn = screen.getAllByText(label)
    .map(el => el.closest('button'))
    .filter((b): b is HTMLButtonElement => !!b)[0];
  expect(btn, `no toggle button found for ${label}`).toBeTruthy();
  fireEvent.click(btn);
}

function fillForm(phone: string) {
  fireEvent.change(screen.getByPlaceholderText('Ahmed Ben Ali'), { target: { value: 'Test User' } });
  fireEvent.change(screen.getByPlaceholderText('Excellence Academy'), { target: { value: 'Test Academy' } });
  fireEvent.change(screen.getByPlaceholderText('contact@academy.tn'), { target: { value: 'test@test.tn' } });
  fireEvent.change(screen.getByPlaceholderText('20 123 456'), { target: { value: phone } });
}

describe('LandingPage (base = Scolaire + Jd. Horaires + Finance, add-ons only)', () => {
  it('renders the hero and emphasises the base plan', async () => {
    render(<LandingPage onOpenLogin={() => {}} centerName="Test Academy" />);

    expect(screen.getAllByText(/sous contrôle total/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Scolaire & Notes').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Finance & Paiements').length).toBeGreaterThan(1);
    await waitFor(() => expect(screen.getAllByText(/40 TND/).length).toBeGreaterThan(0));
    expect(screen.getAllByText('Connexion').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Jd. Horaires as bundled (no tarif) and hides Bibliothèque', () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    expect(screen.getAllByText(/Jd\. Horaires/i).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/Offert avec la base|offert/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Inclus/i).length).toBeGreaterThan(0);

    expect(screen.queryByText('Bibliothèque')).toBeNull();
    expect(screen.queryByText('Prêts livres, inventaire')).toBeNull();

    // Jd. Horaires must NOT appear as a paid add-on toggle button
    const jdToggle = screen.getAllByText(/Jd\. Horaires/i)
      .map(el => el.closest('button'))
      .filter(Boolean);
    expect(jdToggle.length).toBe(0);
  });

  it('locks the base modules and only allows adding', () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    expect(screen.getAllByText(/Non retirable/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Toujours incluse/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3 modules au total/i).length).toBeGreaterThan(0);

    clickModuleToggle('Étude Surveillée');
    expect(screen.getAllByText(/4 modules au total/i).length).toBeGreaterThan(0);
  });

  it('has no "Démo guidée" tab and offers the two request types', () => {
    render(<LandingPage onOpenLogin={() => {}} />);
    expect(screen.queryByText('Démo guidée')).toBeNull();
    expect(screen.getAllByText('Essai gratuit').length).toBeGreaterThan(0);
    expect(screen.getByText('Plus d’infos')).toBeTruthy();
  });

  it('requires the establishment type (jardin / formation)', () => {
    render(<LandingPage onOpenLogin={() => {}} />);
    fillForm('20123456');
    fireEvent.click(screen.getByRole('button', { name: /Démarrer mon essai gratuit/i }));
    expect(screen.getByText(/Sélectionnez le type de votre établissement/i)).toBeTruthy();
    expect(submitDemoRequestApi).not.toHaveBeenCalled();
  });

  it('rejects phone numbers that are not exactly 8 digits', () => {
    render(<LandingPage onOpenLogin={() => {}} />);
    fireEvent.click(screen.getByText('Jardin d’enfant'));
    fillForm('20123'); // too short
    fireEvent.click(screen.getByRole('button', { name: /Démarrer mon essai gratuit/i }));
    expect(screen.getByText(/exactement 8 chiffres/i)).toBeTruthy();
    expect(submitDemoRequestApi).not.toHaveBeenCalled();
  });

  it('sends centerType, cleaned phone and modules with the demo request', async () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    clickModuleToggle('Cantine & Repas');
    fireEvent.click(screen.getByText('Centre de formation'));
    fillForm('20 123 456'); // with spaces — must be cleaned to 8 digits

    fireEvent.click(screen.getByRole('button', { name: /Démarrer mon essai gratuit/i }));

    await waitFor(() => {
      expect(submitDemoRequestApi).toHaveBeenCalledWith(expect.objectContaining({
        phone: '20123456',
        centerType: 'formation',
        requestedModules: ['scolaire', 'studentTimeSheets', 'finance', 'cantine']
      }));
    });
  });

  it('shows an error with retry instead of fake success when the API fails', async () => {
    const apiMock = vi.mocked(submitDemoRequestApi);
    apiMock.mockClear();
    apiMock.mockRejectedValueOnce(new Error('network down'));
    render(<LandingPage onOpenLogin={() => {}} />);

    fireEvent.click(screen.getByText('Jardin d’enfant'));
    fillForm('20 123 456');
    fireEvent.click(screen.getByRole('button', { name: /Démarrer mon essai gratuit/i }));

    // The failure must be announced — never a success screen.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/envoi a échoué/i);
    expect(screen.queryByText(/Demande envoyée avec succès/i)).toBeNull();

    // Retry succeeds → success screen, API called twice.
    apiMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/i }));
    await screen.findByText(/Demande envoyée avec succès/i);
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it('offers Crèche and Garderie as establishment types and submits creche', async () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    expect(screen.getByText('Crèche')).toBeTruthy();
    expect(screen.getByText('Garderie')).toBeTruthy();

    fillForm('20 123 456');
    fireEvent.click(screen.getByText('Crèche'));
    fireEvent.click(screen.getByRole('button', { name: /Démarrer mon essai gratuit/i }));

    await waitFor(() => {
      expect(submitDemoRequestApi).toHaveBeenCalledWith(expect.objectContaining({
        centerType: 'creche'
      }));
    });
  });

  it('submits garderie as the selected center type', async () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    fillForm('20 123 456');
    fireEvent.click(screen.getByText('Garderie'));
    fireEvent.click(screen.getByRole('button', { name: /Démarrer mon essai gratuit/i }));

    await waitFor(() => {
      expect(submitDemoRequestApi).toHaveBeenCalledWith(expect.objectContaining({
        centerType: 'garderie'
      }));
    });
  });

  it('resurfaces a previously saved offline lead and resends it (prefix)', async () => {
    // Une visite précédente a échoué : une copie dort dans localStorage.
    localStorage.setItem('academy_demo_requests', JSON.stringify([
      { id: 'REQ-1', requestType: 'trial', fullName: 'Old Lead', academyName: 'Old Academy', email: 'old@test.tn', phone: '20123456', estimatedSize: '3 modules', requestedModules: ['scolaire', 'studentTimeSheets', 'finance'], message: '', submittedAt: new Date().toISOString() }
    ]));
    const apiMock = vi.mocked(submitDemoRequestApi);
    apiMock.mockClear();
    apiMock.mockResolvedValue(undefined);

    render(<LandingPage onOpenLogin={() => {}} />);

    // The banner appears (status role) and offers the resend.
    const status = await screen.findByRole('status');
    expect(status.textContent).toMatch(/n'a pas pu partir/i);
    fireEvent.click(screen.getByRole('button', { name: /Renvoyer maintenant/i }));

    await waitFor(() => {
      expect(submitDemoRequestApi).toHaveBeenCalledWith(expect.objectContaining({
        fullName: 'Old Lead',
        phone: '20123456'
      }));
    });
    // The saved copy is consumed after a successful resend.
    await waitFor(() => {
      expect(localStorage.getItem('academy_demo_requests')).toBeNull();
    });
    // Banner gone.
    expect(screen.queryByText(/n'a pas pu partir/i)).toBeNull();
  });
});

describe('LandingPage — module×type compatibility (T025, remarks 5+6)', () => {
  /** The pricing addon row for a module label — the LAST aria-pressed toggle
   *  (the hero features strip also carries the labels, but has no badge). */
  function addonRow(label: string): HTMLElement {
    const candidates = screen.getAllByText(label).map(el => el.closest('button'))
      .filter((b): b is HTMLButtonElement => !!b && b.getAttribute('aria-pressed') !== null);
    const btn = candidates[candidates.length - 1];
    expect(btn, `no addon row for ${label}`).toBeTruthy();
    return btn!;
  }

  it('shows a «Disponible : …» badge line on every addon row (remark 5)', () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    // étude → Garderie, Formation only.
    const etude = addonRow('Étude Surveillée');
    expect(within(etude).getByText(/Disponible\s*:\s*Garderie · Formation/)).toBeTruthy();

    // events → all four types (order-agnostic: the badge is one text run).
    const events = addonRow('Événements & Sorties');
    const eventsText = within(events).getByText(/Disponible\s*:/).textContent || '';
    for (const label of ["Jardin d'enfants", 'Crèche', 'Garderie', 'Formation']) {
      expect(eventsText).toContain(label);
    }

    // Base rows stay badge-free: exactly the 10 addon rows carry a badge.
    expect(screen.getAllByText(/Disponible\s*:/).length).toBe(10);
  });

  it('live-warns about incompatible selections without blocking submission (remark 6)', async () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    // No type selected yet → no banner even with an incompatible module.
    clickModuleToggle('Étude Surveillée');
    expect(screen.queryByText(/n'est pas disponible pour les centres/)).toBeNull();

    // Selecting crèche lights the banner up, live.
    fireEvent.click(screen.getByText('Crèche'));
    const banner = await screen.findByText(/n'est pas disponible pour les centres/);
    expect(banner.textContent).toContain('Étude Surveillée');

    // Informative, not blocking: submit stays enabled and the payload is unmodified.
    fillForm('20 123 456');
    const submit = screen.getByRole('button', { name: /Démarrer mon essai gratuit/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(submitDemoRequestApi).toHaveBeenCalledWith(expect.objectContaining({
        centerType: 'creche',
        requestedModules: expect.arrayContaining(['etude'])
      }));
    });
  });

  it('clears the banner when the module is removed or the type flips', async () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    clickModuleToggle('Étude Surveillée');
    fireEvent.click(screen.getByText('Crèche'));
    await screen.findByText(/n'est pas disponible pour les centres/);

    // Remove the module → banner clears.
    clickModuleToggle('Étude Surveillée');
    expect(screen.queryByText(/n'est pas disponible pour les centres/)).toBeNull();

    // Re-add and flip the type to Garderie → banner clears too.
    clickModuleToggle('Étude Surveillée');
    fireEvent.click(screen.getByText('Garderie'));
    expect(screen.queryByText(/n'est pas disponible pour les centres/)).toBeNull();
  });
});
