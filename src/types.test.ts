import { describe, it, expect } from 'vitest';
import {
  AD_POSITION_SPECS,
  AD_POSITION_IDS,
  adPositionLabel,
  hasInterstitialPosition,
  INTERSTITIAL_POSITION_ID,
} from './types';

/**
 * The platform's type module kept only the shared SaaS domain (center tenants,
 * subscriptions, advertisement positions, requests). Center-operational type
 * helpers (fees per school year, subjects, receipts…) were removed together
 * with the center application — these tests cover what remains.
 */
describe('ad position catalog (platform-owned, rendered by the center app)', () => {
  it('exposes the responsive rectangle + interstitial formats only', () => {
    expect(AD_POSITION_IDS).toEqual(['rectangle', 'interstitial']);
    expect(AD_POSITION_SPECS.map(s => s.id)).toEqual(AD_POSITION_IDS);
    for (const spec of AD_POSITION_SPECS) {
      expect(spec.label).toBeTruthy();
      expect(spec.size).toBeTruthy();
      expect(spec.hint).toBeTruthy();
    }
  });

  it('adPositionLabel decorates known ids and echoes unknown ones', () => {
    expect(adPositionLabel('rectangle')).toMatch(/^Rectangle \(/);
    expect(adPositionLabel(INTERSTITIAL_POSITION_ID)).toMatch(/^Interstitiel \(/);
    expect(adPositionLabel('legacy_728')).toBe('legacy_728');
  });

  it('hasInterstitialPosition detects the overlay placement', () => {
    expect(hasInterstitialPosition(['rectangle', 'interstitial'])).toBe(true);
    expect(hasInterstitialPosition(['rectangle'])).toBe(false);
    expect(hasInterstitialPosition(undefined)).toBe(false);
  });
});
