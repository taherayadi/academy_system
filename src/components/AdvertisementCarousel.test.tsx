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
    expect(screen.getByAltText('Promo rentrée').getAttribute('src')).toBe('https://cdn/2.jpg');
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

  it('fetches with the requested location + center scope', async () => {
    (api.fetchActiveAdvertisementsApi as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<AdvertisementCarousel location="center_admin" centerId="c9" />);
    await waitFor(() => expect(api.fetchActiveAdvertisementsApi).toHaveBeenCalledWith('center_admin', 'c9'));
    expect(screen.queryByAltText('Promo rentrée')).toBeNull();
  });
});
