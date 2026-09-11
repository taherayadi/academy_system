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
    setState('connecting');
    const handle = subscribeRealtime(
      () => {
        void handlerRef.current();
      },
      setState,
      sessionKey
    );
    return handle.unsubscribe;
  }, [enabled, sessionKey]);

  return state;
}
