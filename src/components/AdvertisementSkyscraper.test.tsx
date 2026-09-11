import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as api from '../api';

vi.mock('../api', () => ({
  fetchActiveAdvertisementsApi: vi.fn(),
}));

import AdvertisementSkyscraper from './AdvertisementSkyscraper';

const SKY = 'skyscraper_160x600';
const LB = 'leaderboard_728x90';

const ad = (id: string, title: string, positions: string[]) => ({
  id, title, imageUrls: [`https://cdn/${id}.jpg`], linkUrl: '', priority: 10, positions,
});

describe('AdvertisementSkyscraper — fixed side banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { sessionStorage.clear(); } catch { /* noop */ }
  });

  it('shows only skyscraper-carrying ads, stacked with dots', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      ad('s1', 'Sky one', [SKY]),
      ad('c1', 'Carousel only', [LB]),
      ad('b1', 'Mixed ad', [LB, SKY]),
    ]);
    render(<AdvertisementSkyscraper location="landing_page" />);

    await waitFor(() => expect(screen.getByAltText('Sky one')).toBeTruthy());
    // Le carousel-only ad n'a rien à faire ici.
    expect(screen.queryByAltText('Carousel only')).toBeNull();
    // Deux bandeaux → navigation par points, la 2e pub est atteignable.
    fireEvent.click(screen.getByLabelText('Publicité 2'));
    await waitFor(() => expect(screen.getByAltText('Mixed ad')).toBeTruthy());
    expect(screen.getByText('Publicité')).toBeTruthy(); // étiquette IAB
  });

  it('close button dismisses the current banner for the whole session', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      ad('s1', 'Sky one', [SKY]),
      ad('s2', 'Sky two', [SKY]),
    ]);
    const { container } = render(<AdvertisementSkyscraper location="landing_page" />);
    await waitFor(() => expect(screen.getByAltText('Sky one')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('Fermer la publicité'));
    await waitFor(() => expect(screen.getByAltText('Sky two')).toBeTruthy());
    expect(sessionStorage.getItem('ad_skyscraper_dismissed:s1')).toBe('1');

    fireEvent.click(screen.getByLabelText('Fermer la publicité'));
    await waitFor(() => expect(container.querySelector('aside')).toBeNull());
  });

  it('renders nothing when no skyscraper exists (center scope included)', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([
      ad('c1', 'Carousel only', [LB]),
    ]);
    const { container } = render(<AdvertisementSkyscraper location="center_admin" centerId="c9" />);
    await waitFor(() => expect(api.fetchActiveAdvertisementsApi).toHaveBeenCalledWith('center_admin', 'c9'));
    expect(container.querySelector('aside')).toBeNull();
  });
});
