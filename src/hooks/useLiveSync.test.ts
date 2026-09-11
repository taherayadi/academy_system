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

  it('ticks on the interval and on focus / visible / online', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useLiveSync(true, handler, 10000));

    expect(handler).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10000);
    expect(handler).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20000);
    expect(handler).toHaveBeenCalledTimes(3);

    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(4);

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(5);

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(6);
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

  it('uses the default 30 s interval', () => {
    expect(LIVE_SYNC_INTERVAL_MS).toBe(30000);
  });
});
