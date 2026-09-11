/**
 * PubNub realtime client (browser side).
 *
 * One shared PubNub instance per tab serves every consumer (App, RenewalModule,
 * PlatformAdminDashboard). Messages are **"refetch" signals only**: consumers
 * re-run their existing fetch/snapshot/toast handlers and NEVER trust the
 * pushed payload.
 *
 * Lifecycle:
 *   1. `GET /api/pubnub-grant` returns a short-TTL PAM token scoped to the
 *      session (center → `center.{ownId}`, platform admin → `platform`).
 *   2. The client subscribes to the granted channels with that token.
 *   3. The token is refreshed halfway through its TTL for long-lived tabs.
 *   4. Any failure — client keys absent (not baked at build time), grant
 *      unavailable, access denied, network loss — flips the shared state to
 *      `fallback` so consumers resume their `useLiveSync` polling. Without
 *      keys the module stays completely silent (no fetch, no console errors).
 */
import PubNub from 'pubnub';
import { getSessionToken } from '../api';

/** Default TTL (seconds) used when the grant response omits one. */
const DEFAULT_GRANT_TTL_SECONDS = 600;
/** Delay before retrying a failed token refresh (ms). */
const RETRY_GRANT_MS = 30_000;

export type RealtimeState = 'idle' | 'connecting' | 'active' | 'fallback';

/**
 * Client keys are baked into the bundle at build time (Cloudflare Pages →
 * Settings → Environment variables, read via import.meta.env only). Read
 * lazily so tests can stub the env.
 */
export function pubnubSubscribeKey(): string {
  const value = import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY;
  return typeof value === 'string' ? value.trim() : '';
}

interface GrantResponse {
  enabled?: boolean;
  token?: string;
  uuid?: string;
  channels?: string[];
  ttl?: number;
}

/** Fetches the session-scoped grant; null on any failure (never throws). */
async function fetchRealtimeGrant(): Promise<GrantResponse | null> {
  const headers: Record<string, string> = {};
  const token = getSessionToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch('/api/pubnub-grant', { headers, credentials: 'include' });
  if (!res.ok) return null; // 401/403/5xx → polling fallback, silently
  return (await res.json().catch(() => null)) as GrantResponse | null;
}

interface RealtimeStatusEvent {
  category?: string;
  error?: string | boolean;
}

interface SharedListener {
  status(event: RealtimeStatusEvent): void;
  message(event: { channel?: string }): void;
}

/** Categories that mean the connection is unusable → resume polling. */
const FALLBACK_CATEGORIES = new Set([
  'PNNetworkIssuesCategory',
  'PNTimeoutCategory',
  'PNAccessDeniedCategory',
  'PNBadRequestCategory',
  'PNValidationErrorCategory',
  'PNMalformedResponseCategory',
  'PNServerErrorCategory',
  'PNUnknownCategory',
  'PNNetworkDownCategory',
  'PNConnectionErrorCategory',
  'PNDisconnectedUnexpectedlyCategory',
]);

function isErrorStatus(event: RealtimeStatusEvent): boolean {
  if (event?.error === true || typeof event?.error === 'string') return true;
  return FALLBACK_CATEGORIES.has(String(event?.category || ''));
}

interface Listener {
  onMessage: () => void;
  onState: (state: RealtimeState) => void;
}

// ── Shared singleton state ───────────────────────────────────────────────────
const listeners = new Set<Listener>();
let client: PubNub | null = null;
let state: RealtimeState = 'idle';
let started = false;
let activeSessionKey: string | undefined;
/** Bumped on every teardown/restart so in-flight grants can be discarded. */
let generation = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function setState(next: RealtimeState): void {
  if (state === next) return;
  state = next;
  for (const listener of [...listeners]) {
    try {
      listener.onState(next);
    } catch {
      /* a consumer's state setter must never break the others */
    }
  }
}

function notifyMessage(): void {
  for (const listener of [...listeners]) {
    try {
      listener.onMessage();
    } catch (err) {
      console.warn('[realtime] refetch handler failed.', err);
    }
  }
}

const sharedListener: SharedListener = {
  status(event) {
    const category = String(event?.category || '');
    if (category === 'PNConnectedCategory' || category === 'PNReconnectedCategory') {
      setState('active');
      return;
    }
    // Missed messages after a catch-up → force one refetch right now.
    if (category === 'PNRequestMessageCountExceededCategory') {
      notifyMessage();
      return;
    }
    if (
      category === 'PNAcknowledgmentCategory' ||
      category === 'PNNetworkUpCategory' ||
      category === 'PNSubscriptionChangedCategory' ||
      category === 'PNDisconnectedCategory'
    ) {
      return;
    }
    if (isErrorStatus(event)) setState('fallback');
  },
  message() {
    // Payload deliberately ignored — it is a refetch signal, never data.
    notifyMessage();
  },
};

function disconnectClient(): void {
  if (!client) return;
  try {
    client.removeAllListeners();
  } catch {
    /* ignore */
  }
  try {
    client.disconnect();
  } catch {
    /* ignore */
  }
  client = null;
}

function clearRefreshTimer(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleTokenRefresh(gen: number, ttlSeconds: number): void {
  clearRefreshTimer();
  const delayMs = Math.max(30, Math.floor(ttlSeconds / 2)) * 1000;
  refreshTimer = setTimeout(() => {
    void refreshToken(gen);
  }, delayMs);
}

async function refreshToken(gen: number): Promise<void> {
  if (gen !== generation || !client) return;
  try {
    const grant = await fetchRealtimeGrant();
    if (gen !== generation || !client) return;
    if (grant?.enabled && grant.token && grant.uuid) {
      client.setAuthKey(grant.token);
      client.reconnect(); // next subscribe loop carries the fresh token
      scheduleTokenRefresh(gen, grant.ttl ?? DEFAULT_GRANT_TTL_SECONDS);
      return;
    }
    // Server key set disappeared → degrade to polling, retry the grant later.
    setState('fallback');
  } catch {
    if (gen !== generation) return;
    // Transient failure — polling takes over until a grant succeeds again.
    setState('fallback');
  }
  if (gen === generation) {
    refreshTimer = setTimeout(() => {
      void refreshToken(gen);
    }, RETRY_GRANT_MS);
  }
}

async function startClient(): Promise<void> {
  const gen = ++generation;
  clearRefreshTimer();
  disconnectClient();
  setState('connecting');

  // Keys not baked at build time → behave exactly as before (polling), silently.
  const subscribeKey = pubnubSubscribeKey();
  if (!subscribeKey) {
    setState('fallback');
    return;
  }

  let grant: GrantResponse | null;
  try {
    grant = await fetchRealtimeGrant();
  } catch {
    if (gen === generation) setState('fallback');
    return;
  }
  if (gen !== generation) return; // superseded by a teardown / session change

  if (!grant?.enabled || !grant.token || !grant.uuid || !Array.isArray(grant.channels) || grant.channels.length === 0) {
    setState('fallback'); // server has no keys, or the grant was refused
    return;
  }

  try {
    client = new PubNub({
      subscribeKey,
      authKey: grant.token,
      userId: grant.uuid,
    });
    client.addListener(sharedListener as never);
    client.subscribe({ channels: grant.channels });
    scheduleTokenRefresh(gen, grant.ttl ?? DEFAULT_GRANT_TTL_SECONDS);
    // State stays `connecting` (polling still on) until PNConnectedCategory.
  } catch (err) {
    console.warn('[realtime] PubNub init failed — falling back to polling.', err);
    disconnectClient();
    if (gen === generation) setState('fallback');
  }
}

export interface RealtimeHandle {
  unsubscribe(): void;
}

/**
 * Registers a "refetch" consumer on the shared client. All consumers share one
 * connection; the first one starts it, the last one tears it down.
 *
 * `sessionKey` (e.g. the user email) restarts the client when the account
 * changes. Pass `undefined` to simply attach to the current session.
 */
export function subscribeRealtime(
  onMessage: () => void,
  onState: (state: RealtimeState) => void,
  sessionKey?: string
): RealtimeHandle {
  const listener: Listener = { onMessage, onState };
  listeners.add(listener);

  const sessionChanged = sessionKey !== undefined && activeSessionKey !== sessionKey;
  if (!started || sessionChanged) {
    // New session (login/logout/account switch): restart with a fresh grant.
    activeSessionKey = sessionKey ?? activeSessionKey;
    started = true;
    void startClient();
  } else {
    onState(state); // sync the newcomer with the current shared state
  }

  return {
    unsubscribe() {
      listeners.delete(listener);
      if (listeners.size === 0) {
        started = false;
        activeSessionKey = undefined;
        generation++;
        clearRefreshTimer();
        disconnectClient();
        setState('idle');
      }
    },
  };
}
