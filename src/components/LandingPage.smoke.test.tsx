import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LandingPage from './LandingPage';
import { submitDemoRequestApi } from '../api';

vi.mock('../api', () => ({
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
});
