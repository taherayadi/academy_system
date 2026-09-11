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
      { ...ad(['https://cdn/sky.jpg']), positions: ['skyscraper_160x600'] },
      { ...ad(['https://cdn/mix.jpg']), positions: ['leaderboard_728x90', 'skyscraper_160x600'] },
    ]);
    const { container } = render(<AdvertisementCarousel location="landing_page" />);
    await waitFor(() => expect(api.fetchActiveAdvertisementsApi).toHaveBeenCalled());
    expect(container.querySelector('img')).toBeNull(); // positionnées → créneaux dédiés
  });

  it('format slots pick their own ads and render exact IAB dimensions', async () => {
    const ads = [
      { ...ad(['https://cdn/lb.jpg']), positions: ['leaderboard_728x90', 'skyscraper_160x600'] },
      { ...ad(['https://cdn/sq.jpg']), positions: ['medium_rectangle_300x250'] },
    ];
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue(ads);

    const { container } = render(<AdvertisementCarousel location="landing_page" format="leaderboard_728x90" />);
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy());
    const lbRoot = container.querySelector('div') as HTMLElement;
    expect(lbRoot.className).toContain('max-w-[728px]'); // largeur leaderboard
    expect(lbRoot.className).toContain('hidden');        // invisible sur mobile
    expect(Array.from(container.querySelectorAll('div')).some(d => d.className.includes('aspect-[728/90]'))).toBe(true);

    const rect = render(<AdvertisementCarousel location="center_admin" centerId="c1" format="medium_rectangle_300x250" />);
    await waitFor(() => expect(rect.container.querySelector('img')).toBeTruthy());
    const rectRoot = rect.container.querySelector('div') as HTMLElement;
    expect(rectRoot.className).toContain('w-[300px]');
    expect(Array.from(rect.container.querySelectorAll('div')).some(d => d.className.includes('aspect-[300/250]'))).toBe(true);
  });

  it('fetches with the requested location + center scope', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<AdvertisementCarousel location="center_admin" centerId="c9" />);
    await waitFor(() => expect(api.fetchActiveAdvertisementsApi).toHaveBeenCalledWith('center_admin', 'c9'));
    expect(screen.queryByAltText('Promo rentrée')).toBeNull();
  });
});
