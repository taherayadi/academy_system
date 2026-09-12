import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePubNubSync } from './usePubNubSync';

/**
 * Faux SDK pubnub — capture les instances pour piloter les événements
 * (status / message) depuis les tests. Le vrai SDK n'est jamais importé.
 * Tout est défini dans la factory (hoistée) ; l'état est exposé via
 * `vi.hoisted` pour rester accessible avant l'initialisation du module.
 */
const pubnubMock = vi.hoisted(() => {
  const instances: any[] = [];
  class FakePubNub {
    config: Record<string, unknown>;
    listener: {
      status?: (event: { category?: string; error?: string | boolean }) => void;
      message?: (event: { channel?: string }) => void;
    } | null = null;
    subscribedChannels: string[][] = [];
    setAuthKeys: string[] = [];
    reconnected = 0;
    disconnected = 0;
    removedAllListeners = 0;

    constructor(config: Record<string, unknown>) {
      this.config = config;
      instances.push(this);
    }
    addListener(listener: NonNullable<FakePubNub['listener']>) {
      this.listener = listener;
    }
    removeAllListeners() {
      this.removedAllListeners++;
      this.listener = null;
    }
    subscribe(params: { channels: string[] }) {
      this.subscribedChannels.push(params.channels);
    }
    unsubscribe() {}
    setAuthKey(token: string) {
      this.setAuthKeys.push(token);
    }
    reconnect() {
      this.reconnected++;
    }
    disconnect() {
      this.disconnected++;
    }
  }
  return { instances, FakePubNub };
});

vi.mock('pubnub', () => ({ default: pubnubMock.FakePubNub }));

const instances = pubnubMock.instances;

const GRANT = { enabled: true, token: 'tok-123', uuid: 'uuid-abc', channels: ['platform'], ttl: 600 };
const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
  new Response(JSON.stringify(GRANT), { status: 200, headers: { 'content-type': 'application/json' } })
);

/**
 * Flushe les microtasks/promesses du manager dans le scope `act` jusqu'à ce
 * que `condition` soit vraie (les mises à jour React restent ainsi wrappées).
 */
async function flushUntil(condition: () => boolean, tries = 60): Promise<void> {
  await act(async () => {
    for (let i = 0; i < tries && !condition(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });
}

beforeEach(() => {
  instances.length = 0;
  fetchMock.mockClear();
  // Implémentation par défaut : grant accordé.
  fetchMock.mockImplementation(async () =>
    new Response(JSON.stringify(GRANT), { status: 200, headers: { 'content-type': 'application/json' } })
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_PUBNUB_SUBSCRIBE_KEY', 'sub-demo-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('usePubNubSync', () => {
  it('souscrit avec le token accordé et transmet les signaux au handler', async () => {
    const handler = vi.fn(async () => {});
    const { result } = renderHook(() => usePubNubSync(true, handler, 'user@x'));
    expect(result.current).toBe('connecting');

    // Le grant est récupéré avec les identifiants de session.
    await flushUntil(() => instances.length === 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/pubnub-grant');

    // Le client est construit avec la subscribe key Vite + token PAM + uuid lié.
    const instance = instances[0];
    expect(instance.config).toEqual({ subscribeKey: 'sub-demo-key', authKey: 'tok-123', userId: 'uuid-abc' });
    expect(instance.subscribedChannels).toEqual([['platform']]);

    // Un message = un signal refetch (le payload n'est pas lu).
    await act(async () => {
      instance.listener?.message?.({ channel: 'platform' });
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // Connexion établie → `active` (le consommateur arrête son polling).
    await act(async () => {
      instance.listener?.status?.({ category: 'PNConnectedCategory' });
    });
    expect(result.current).toBe('active');
  });

  it('passe en fallback quand le grant échoue — le polling reprend, sans erreur', async () => {
    fetchMock.mockImplementation(async () => new Response('{"error":"x"}', { status: 500 }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = vi.fn();
    const { result } = renderHook(() => usePubNubSync(true, handler, 'user@x'));

    await flushUntil(() => result.current === 'fallback');
    expect(instances.length).toBe(0); // jamais de client sans token
    expect(handler).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('clés Vite absentes → fallback immédiat, aucune requête, aucune erreur', async () => {
    vi.stubEnv('VITE_PUBNUB_SUBSCRIBE_KEY', '');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = vi.fn();
    const { result } = renderHook(() => usePubNubSync(true, handler));

    await flushUntil(() => result.current === 'fallback');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(instances.length).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('redevient fallback sur erreur PubNub (déconnexion / accès refusé)', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() => usePubNubSync(true, handler, 'user@x'));
    await flushUntil(() => instances.length === 1);
    const instance = instances[0];
    await act(async () => {
      instance.listener?.status?.({ category: 'PNConnectedCategory' });
    });
    expect(result.current).toBe('active');

    await act(async () => {
      instance.listener?.status?.({ category: 'PNNetworkIssuesCategory', error: true });
    });
    expect(result.current).toBe('fallback');
  });

  it('désactivé (logout) → idle, aucun client, désouscription propre', async () => {
    const handler = vi.fn();
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => usePubNubSync(on, handler, 'user@x'),
      { initialProps: { on: true } }
    );
    await flushUntil(() => instances.length === 1);
    const instance = instances[0];

    rerender({ on: false });
    expect(result.current).toBe('idle');
    expect(instance.disconnected).toBe(1);
    expect(instance.removedAllListeners).toBe(1);

    // Remontée → nouveau client (nouveau grant).
    rerender({ on: true });
    await flushUntil(() => instances.length === 2);
    expect(instances[1].disconnected).toBe(0);
  });

  it('changement de session → nouveau grant et nouvelle connexion', async () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ session }: { session?: string }) => usePubNubSync(true, handler, session),
      { initialProps: { session: 'a@x' } }
    );
    await flushUntil(() => instances.length === 1);

    rerender({ session: 'b@x' });
    await flushUntil(() => instances.length === 2);
    expect(instances[0].disconnected).toBe(1);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
