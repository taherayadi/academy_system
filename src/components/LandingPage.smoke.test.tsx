import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingPage from './LandingPage';

// jsdom lacks the observers that motion's whileInView relies on
beforeAll(() => {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
  }
  // @ts-expect-error partial stub
  global.IntersectionObserver = IO;
  // @ts-expect-error partial stub
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

vi.mock('./api', () => ({ submitDemoRequestApi: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../api', () => ({ submitDemoRequestApi: vi.fn().mockResolvedValue(undefined) }));

describe('LandingPage (modern redesign)', () => {
  it('renders the hero and highlights the basic plan (Scolaire + Finance)', () => {
    render(<LandingPage onOpenLogin={() => {}} centerName="Test Academy" />);

    // Hero headline
    expect(screen.getAllByText(/enfin simple et moderne/i).length).toBeGreaterThan(0);

    // Basic plan card
    expect(screen.getAllByText('Essentiel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Plan de base').length).toBeGreaterThan(0);

    // Base plan modules are featured in the bento grid
    expect(screen.getAllByText('Scolaire & Notes').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Finance & Paiements').length).toBeGreaterThan(1);

    // Nav + login button (nav + footer)
    expect(screen.getAllByText('Connexion').length).toBeGreaterThanOrEqual(2);

    // FAQ section present
    expect(screen.getByText(/Tout ce que vous devez savoir/i)).toBeTruthy();

    // Contact form fields
    expect(screen.getByPlaceholderText('Ahmed Ben Ali')).toBeTruthy();
    expect(screen.getByPlaceholderText('Excellence Academy')).toBeTruthy();
    expect(screen.getByPlaceholderText('contact@academy.tn')).toBeTruthy();
  });

  it('shows the base plan price of 40 TND (20 + 20)', () => {
    render(<LandingPage onOpenLogin={() => {}} />);
    // Calculator summary defaults to scolaire + finance = 40 TND
    expect(screen.getAllByText('40').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 modules sélectionnés/i).length).toBeGreaterThan(0);
  });
});
