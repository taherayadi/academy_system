import { useEffect, useRef, useState } from 'react';
import { subscribeRealtime } from '../realtime/pubnubClient';
import type { RealtimeState } from '../realtime/pubnubClient';

export type { RealtimeState };

/**
 * Live-sync via PubNub pub/sub (replaces polling while connected).
 *
 * Subscribes to the channels granted to the current session by
 * `GET /api/pubnub-grant` and invokes `onMessage` for every incoming
 * "refetch" signal. `onMessage` MUST be the same handler the polling fallback
 * uses — the pushed payload is never trusted.
 *
 * Returned state:
 *   • `active`    — PubNub is live; consumers pause their polling.
 *   • `connecting`/`fallback`/`idle` — keep polling with `useLiveSync`.
 *
 * While the tab is hidden the subscription is torn down entirely (state
 * `idle`): pushed signals never trigger background refreshes.
 *
 * `sessionKey` (typically the user email) forces a fresh grant + subscription
 * when the authenticated account changes.
 */
export function usePubNubSync(
  enabled: boolean,
  onMessage: () => Promise<void> | void,
  sessionKey?: string
): RealtimeState {
  const [state, setState] = useState<RealtimeState>(enabled ? 'connecting' : 'idle');

  // Keep the latest handler without re-subscribing on every render (same
  // pattern as useLiveSync's handlerRef).
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!enabled) {
      setState('idle');
      return;
    }
    let cleanup: { unsubscribe: () => void } | null = null;
    let paused = false;
    const start = () => {
      setState('connecting');
      cleanup = subscribeRealtime(
        () => {
          if (document.hidden) return; // never auto-refresh in the background
          void handlerRef.current();
        },
        setState,
        sessionKey
      );
    };
    start();
    // No live traffic while the tab is hidden: the subscription is torn down
    // and re-established (fresh grant) when the page becomes visible again.
    const onVisible = () => {
      if (document.hidden) {
        paused = true;
        cleanup?.unsubscribe();
        cleanup = null;
        setState('idle'); // consumers keep polling; polling is paused too
      } else if (paused) {
        paused = false;
        start();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      cleanup?.unsubscribe();
    };
  }, [enabled, sessionKey]);

  return state;
}
