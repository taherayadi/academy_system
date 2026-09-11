import { useEffect, useRef } from 'react';
import type { CenterTenant } from '../types';

/** How often a center session re-checks its subscription state (30 s). */
export const LIVE_SYNC_INTERVAL_MS = 30000;

/**
 * Runs `handler` every `intervalMs`, plus whenever the tab regains focus,
 * becomes visible again or comes back online. Ticks are skipped while the
 * tab is hidden and overlapping runs are guarded — silent by design, the
 * handler decides what (if anything) deserves a toast.
 */
export function useLiveSync(
  enabled: boolean,
  handler: () => Promise<void> | void,
  intervalMs = LIVE_SYNC_INTERVAL_MS
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    const tick = async () => {
      if (stopped || running || document.hidden) return;
      running = true;
      try {
        await handlerRef.current();
      } finally {
        running = false;
      }
    };
    const id = window.setInterval(() => { void tick(); }, intervalMs);
    const onFocus = () => { void tick(); };
    const onVisible = () => { if (!document.hidden) void tick(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onFocus);
    return () => {
      stopped = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onFocus);
    };
  }, [enabled, intervalMs]);
}

/**
 * Comparable snapshot of everything the platform may change on a center
 * when it accepts a renewal / plan-change request. Compared as a string:
 * any difference means the UI state is stale and must be replaced.
 */
export function subscriptionSnapshot(center: CenterTenant | null | undefined): string {
  if (!center) return 'none';
  return JSON.stringify({
    status: center.status ?? null,
    plan: center.plan ?? null,
    billingCycle: center.billingCycle ?? null,
    monthlyPrice: Number(center.monthlyPrice) || 0,
    modules: [...((center.enabledModules as string[] | undefined) || [])].sort(),
    subscriptionEndsAt: center.subscriptionEndsAt ?? null,
    trialEndsAt: center.trialEndsAt ?? null,
  });
}
