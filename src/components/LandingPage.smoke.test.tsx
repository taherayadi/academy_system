import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LandingPage from './LandingPage';
import { submitDemoRequestApi } from '../api';

vi.mock('../api', () => ({ submitDemoRequestApi: vi.fn().mockResolvedValue(undefined) }));

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

describe('LandingPage (base = Scolaire + Jd. Horaires + Finance, add-ons only)', () => {
  it('renders the hero and emphasises the base plan', () => {
    render(<LandingPage onOpenLogin={() => {}} centerName="Test Academy" />);

    expect(screen.getAllByText(/sous contrôle total/i).length).toBeGreaterThan(0);
    // Base modules are highlighted in several sections
    expect(screen.getAllByText('Scolaire & Notes').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Finance & Paiements').length).toBeGreaterThan(1);
    // Base price mentioned
    expect(screen.getAllByText(/40 TND/).length).toBeGreaterThan(0);
    // Nav + login
    expect(screen.getAllByText('Connexion').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Jd. Horaires as bundled (no tarif) and hides Bibliothèque', () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    // Jd. Horaires is on the landing as part of the base, marked as offered/included
    expect(screen.getAllByText(/Jd\. Horaires/i).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/Offert avec la base|offert/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Inclus/i).length).toBeGreaterThan(0);

    // Bibliothèque stays hidden
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

    // Base is flagged as non-removable
    expect(screen.getAllByText(/Non retirable/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Toujours incluse/i).length).toBeGreaterThan(0);

    // Default selection: 3 modules (scolaire + studentTimeSheets + finance)
    expect(screen.getAllByText(/3 modules au total/i).length).toBeGreaterThan(0);

    // Adding an add-on module increases the count
    clickModuleToggle('Étude Surveillée');
    expect(screen.getAllByText(/4 modules au total/i).length).toBeGreaterThan(0);
  });

  it('sends the selected modules (base incl. Jd. Horaires) with the demo request', async () => {
    render(<LandingPage onOpenLogin={() => {}} />);

    // Add two add-on modules
    clickModuleToggle('Cantine & Repas');
    clickModuleToggle('Transport Scolaire');

    fireEvent.change(screen.getByPlaceholderText('Ahmed Ben Ali'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByPlaceholderText('Excellence Academy'), { target: { value: 'Test Academy' } });
    fireEvent.change(screen.getByPlaceholderText('contact@academy.tn'), { target: { value: 'test@test.tn' } });
    fireEvent.change(screen.getByPlaceholderText('+216 XX XXX XXX'), { target: { value: '+216 20 000 000' } });

    fireEvent.click(screen.getByRole('button', { name: /Démarrer mon essai gratuit/i }));

    await waitFor(() => {
      expect(submitDemoRequestApi).toHaveBeenCalledWith(expect.objectContaining({
        requestedModules: ['scolaire', 'studentTimeSheets', 'finance', 'cantine', 'transport']
      }));
    });
  });
});
