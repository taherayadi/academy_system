import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as api from '../api';

vi.mock('../api', () => ({
  fetchActiveAdvertisementsApi: vi.fn(),
}));

import AdvertisementCarousel from './AdvertisementCarousel';

const ad = (imageUrls: string[]) => ({
  id: 'a1', title: 'Promo rentrée', imageUrls, linkUrl: '', priority: 10,
});

describe('AdvertisementCarousel — multi-image indicators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an animated counter and one dot per image; clicking a dot switches', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>)
      .mockResolvedValue([ad(['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg'])]);
    render(<AdvertisementCarousel location="landing_page" />);

    await waitFor(() => expect(screen.getByText('1 / 3')).toBeTruthy());
    const dots = screen.getAllByLabelText(/Go to image/);
    expect(dots).toHaveLength(3);

    fireEvent.click(dots[1]);
    await waitFor(() => expect(screen.getByText('2 / 3')).toBeTruthy());
    // L'ancienne image reste montée le temps de sa sortie (AnimatePresence)
    await waitFor(() => expect(screen.getByAltText('Promo rentrée').getAttribute('src')).toBe('https://cdn/2.jpg'));
  });

  it('single-image ads carry no indicators (and no arrows)', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>)
      .mockResolvedValue([ad(['https://cdn/only.jpg'])]);
    render(<AdvertisementCarousel location="landing_page" />);

    await waitFor(() => expect(screen.getByAltText('Promo rentrée')).toBeTruthy());
    expect(screen.queryByText(/\/ 1/)).toBeNull();
    expect(screen.queryAllByLabelText(/Go to image/)).toHaveLength(0);
    expect(screen.queryByLabelText('Next image')).toBeNull();
  });

  it('the standard carousel only serves ads WITHOUT positions', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { ...ad(['https://cdn/sky.jpg']), positions: ['interstitial'] },
      { ...ad(['https://cdn/mix.jpg']), positions: ['rectangle', 'interstitial'] },
    ]);
    const { container } = render(<AdvertisementCarousel location="landing_page" />);
    await waitFor(() => expect(api.fetchActiveAdvertisementsApi).toHaveBeenCalled());
    expect(container.querySelector('img')).toBeNull(); // positionnées → créneaux dédiés
  });

  it('the rectangle slot picks its own ads and renders a fluid, larger frame', async () => {
    const ads = [
      { ...ad(['https://cdn/lb.jpg']), positions: ['interstitial'] },
      { ...ad(['https://cdn/sq.jpg']), positions: ['rectangle'] },
    ];
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue(ads);

    const rect = render(<AdvertisementCarousel location="center_admin" centerId="c1" format="rectangle" />);
    await waitFor(() => expect(rect.container.querySelector('img')).toBeTruthy());
    const rectRoot = rect.container.querySelector('div') as HTMLElement;
    // Fluide : toute la largeur disponible, plafonnée à 480 px (bien plus
    // large que l'ancien 300×250) — jamais de dimension figée.
    expect(rectRoot.className).toContain('w-full');
    expect(rectRoot.className).toContain('max-w-[480px]');
    expect(Array.from(rect.container.querySelectorAll('div')).some(d => d.className.includes('aspect-[6/5]'))).toBe(true);

    // L'emplacement ne sert QUE les pubs portant la position « rectangle ».
    const interstitial = render(<AdvertisementCarousel location="landing_page" format="rectangle" />);
    await waitFor(() => expect(interstitial.container.querySelector('img')).toBeTruthy());
    expect((interstitial.container.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('https://cdn/sq.jpg');
  });

  it('fetches with the requested location + center scope', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<AdvertisementCarousel location="center_admin" centerId="c9" />);
    await waitFor(() => expect(api.fetchActiveAdvertisementsApi).toHaveBeenCalledWith('center_admin', 'c9'));
    expect(screen.queryByAltText('Promo rentrée')).toBeNull();
  });
});
