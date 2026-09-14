import { useEffect, useRef } from 'react';

/**
 * Polling cadence used by the platform dashboard while no realtime PubNub
 * signal is active (30 s). On the SaaS console this refreshes platform
 * aggregates (centers, invoices, requests) — there are no center sessions.
 */
export const LIVE_SYNC_INTERVAL_MS = 30000;

/**
 * Runs `handler` every `intervalMs` while the page is open and visible.
 * There is NO fetch on focus regain, visibility regain or reconnect — data
 * loads when the page opens and refreshes only when the caller invokes the
 * handler itself (e.g. a refresh button). The cadence is paused while the
 * tab is hidden and resumes afterwards without an immediate fetch.
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
    let id = window.setInterval(() => { void tick(); }, intervalMs);
    // While hidden: no ticking at all. On return: resume the cadence WITHOUT
    // an immediate fetch — a refresh is a page open or a user action, never
    // a background event.
    const onVisible = () => {
      window.clearInterval(id);
      id = window.setInterval(() => { void tick(); }, intervalMs);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs]);
}
