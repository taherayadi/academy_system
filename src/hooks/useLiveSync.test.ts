import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLiveSync, subscriptionSnapshot, LIVE_SYNC_INTERVAL_MS } from './useLiveSync';
import type { CenterTenant } from '../types';

const center = (over: Record<string, unknown> = {}): CenterTenant => ({
  id: 'c1',
  name: 'Centre Alpha',
  plan: 'starter',
  enabledModules: ['scolaire', 'finance', 'studentTimeSheets'],
  status: 'active',
  trialEndsAt: null,
  subscriptionEndsAt: 9999999999999,
  billingCycle: 'monthly',
  monthlyPrice: 90,
  createdAt: 0,
  ...over,
} as CenterTenant);

describe('subscriptionSnapshot', () => {
  it('is stable for identical centers and null-safe', () => {
    expect(subscriptionSnapshot(center())).toBe(subscriptionSnapshot(center()));
    expect(subscriptionSnapshot(null)).toBe('none');
    expect(subscriptionSnapshot(undefined)).toBe('none');
  });

  it('detects every field the platform may change on accept', () => {
    const base = subscriptionSnapshot(center());
    expect(subscriptionSnapshot(center({ plan: 'growth' }))).not.toBe(base);
    expect(subscriptionSnapshot(center({ status: 'expired' }))).not.toBe(base);
    expect(subscriptionSnapshot(center({ billingCycle: 'annual' }))).not.toBe(base);
    expect(subscriptionSnapshot(center({ monthlyPrice: 165 }))).not.toBe(base);
    expect(subscriptionSnapshot(center({ subscriptionEndsAt: 1111111111111 }))).not.toBe(base);
    expect(subscriptionSnapshot(center({ trialEndsAt: 1111111111111 }))).not.toBe(base);
    expect(
      subscriptionSnapshot(center({ enabledModules: ['scolaire', 'finance', 'studentTimeSheets', 'etude'] }))
    ).not.toBe(base);
  });

  it('ignores module order and cosmetic fields', () => {
    const base = subscriptionSnapshot(center());
    expect(
      subscriptionSnapshot(center({ enabledModules: ['finance', 'studentTimeSheets', 'scolaire'] }))
    ).toBe(base);
    expect(subscriptionSnapshot(center({ name: 'Renamed', logoUrl: 'https://x/y.png' }))).toBe(base);
  });
});

describe('useLiveSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ticks only on the interval — focus / visible / online never fetch', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useLiveSync(true, handler, 10000));

    expect(handler).not.toHaveBeenCalled(); // no fetch on mount
    await vi.advanceTimersByTimeAsync(10000);
    expect(handler).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20000);
    expect(handler).toHaveBeenCalledTimes(3);

    // Regaining focus, coming back online or becoming visible again must NOT
    // trigger a fetch — refresh is a page open or a user action only.
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10000);
    expect(handler).toHaveBeenCalledTimes(4); // cadence resumed, no catch-up
  });

  it('pauses while the tab is hidden and resumes without an immediate fetch', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useLiveSync(true, handler, 5000));

    await vi.advanceTimersByTimeAsync(5000);
    expect(handler).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(handler).toHaveBeenCalledTimes(1); // fully paused while hidden

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(1); // resume: no immediate fetch
    await vi.advanceTimersByTimeAsync(5000);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('stays silent while disabled and skips ticks when the tab is hidden', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(({ on }: { on: boolean }) => useLiveSync(on, handler, 5000), {
      initialProps: { on: false },
    });

    await vi.advanceTimersByTimeAsync(30000);
    expect(handler).not.toHaveBeenCalled();

    rerender({ on: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(handler).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    await vi.advanceTimersByTimeAsync(15000);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    unmount();
  });

  it('switches cadence when the interval changes', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ ms }: { ms: number }) => useLiveSync(true, handler, ms), {
      initialProps: { ms: 10000 },
    });
    await vi.advanceTimersByTimeAsync(10000);
    expect(handler).toHaveBeenCalledTimes(1);

    rerender({ ms: 2000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(handler).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(handler).toHaveBeenCalledTimes(4);
  });

  it('uses the default 30 s interval', () => {
    expect(LIVE_SYNC_INTERVAL_MS).toBe(30000);
  });
});
