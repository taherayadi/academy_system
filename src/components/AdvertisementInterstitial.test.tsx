import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as api from '../api';

vi.mock('../api', () => ({
  fetchActiveAdvertisementsApi: vi.fn(),
}));

import AdvertisementInterstitial from './AdvertisementInterstitial';

const INTERSTITIAL = 'interstitial';
const RECTANGLE = 'rectangle';

const ad = (id: string, title: string, positions: string[], linkUrl = '') => ({
  id, title, imageUrls: [`https://cdn/${id}.jpg`], linkUrl, priority: 10, positions,
});

describe('AdvertisementInterstitial — responsive full-screen overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { sessionStorage.clear(); } catch { /* noop */ }
  });

  it('opens the interstitial ad only, as a modal dialog', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      ad('i1', 'Offre spéciale', [INTERSTITIAL]),
      ad('r1', 'Rectangle only', [RECTANGLE]),
    ]);
    render(<AdvertisementInterstitial location="landing_page" delayMs={0} />);

    await waitFor(() => expect(screen.getByAltText('Offre spéciale')).toBeTruthy());
    // Une pub sans la position interstitiel n'a rien à faire ici.
    expect(screen.queryByAltText('Rectangle only')).toBeNull();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Publicité : Offre spéciale');
    expect(screen.getByText('Publicité')).toBeTruthy();
  });

  it('close button dismisses the ad and stores it for the session', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      ad('i1', 'Offre spéciale', [INTERSTITIAL]),
    ]);
    render(<AdvertisementInterstitial location="landing_page" delayMs={0} />);
    await waitFor(() => expect(screen.getByAltText('Offre spéciale')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('Fermer la publicité'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByAltText('Offre spéciale')).toBeNull();
    expect(sessionStorage.getItem('ad_interstitial_dismissed:i1')).toBe('1');
    expect(sessionStorage.getItem('ad_interstitial_seen:landing_page:all')).toBe('1');
  });

  it('Escape closes the overlay and restores page scrolling', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      ad('i2', 'Campagne', [INTERSTITIAL]),
    ]);
    render(<AdvertisementInterstitial location="center_admin" centerId="c9" delayMs={0} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(sessionStorage.getItem('ad_interstitial_seen:center_admin:c9')).toBe('1');
  });

  it('never reopens once an interstitial was shown in the session', async () => {
    try {
      sessionStorage.setItem('ad_interstitial_seen:landing_page:all', '1');
    } catch { /* noop */ }
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      ad('i1', 'Offre spéciale', [INTERSTITIAL]),
    ]);

    render(<AdvertisementInterstitial location="landing_page" delayMs={0} />);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.fetchActiveAdvertisementsApi).not.toHaveBeenCalled();
  });

  it('renders nothing when no ad carries the interstitial position', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      ad('r1', 'Rectangle only', [RECTANGLE]),
    ]);
    render(<AdvertisementInterstitial location="center_admin" centerId="c9" delayMs={0} />);

    await waitFor(() => expect(api.fetchActiveAdvertisementsApi).toHaveBeenCalledWith('center_admin', 'c9'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exposes the destination link when the ad carries one', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      ad('i3', 'Portes ouvertes', [INTERSTITIAL], 'https://example.test/po'),
    ]);
    render(<AdvertisementInterstitial location="landing_page" delayMs={0} />);

    await waitFor(() => expect(screen.getByAltText('Portes ouvertes')).toBeTruthy());
    const link = screen.getByRole('link', { name: 'En savoir plus' }) as HTMLAnchorElement;
    expect(link.href).toBe('https://example.test/po');
    expect(link.rel).toContain('noopener');
  });
});
