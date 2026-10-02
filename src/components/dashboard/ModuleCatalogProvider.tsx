/**
 * ModuleCatalogProvider — feeds the DB-driven module + center-type catalog
 * (GET /api/modules) into the client store and re-renders its consumers.
 *
 * One fetch per mount of the platform dashboard; every UI surface (module
 * pickers, eligibility locks, center-type selects, labels) derives from the
 * DB payload via the pure helpers in dashboard/constants.ts. While the
 * request is in flight the helpers serve the bootstrap catalog, and `ready`
 * stays false so callers can gate rendering — never a stale hardcoded list.
 */
import { useEffect, useState, ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { fetchModuleCatalogApi, ModuleCatalogPayload, UnauthorizedError } from '../../api';
import { setModuleCatalog, subscribeModuleCatalog, getModuleCatalog } from '../../utils/moduleCatalogStore';

export interface ModuleCatalogState extends ModuleCatalogPayload {
  /** True once the DB catalog has landed this session. */
  ready: boolean;
  /** Re-fetch the catalog after a catalog-mutating operation (rare). */
  reload: () => void;
}

export function ModuleCatalogProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    fetchModuleCatalogApi()
      .then(data => {
        if (cancelled) return;
        setModuleCatalog(data);
        setReady(true);
      })
      .catch((err: unknown) => {
        // Session expiry is handled globally (App.tsx catches UnauthorizedError
        // higher up); a catalog failure only leaves the bootstrap data served.
        if (!(err instanceof UnauthorizedError) && !cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, [tick]);

  // The store notifies on every setModuleCatalog — components re-render here.
  useSyncExternalStore(subscribeModuleCatalog, getModuleCatalog);

  const payload = getModuleCatalog();
  const value: ModuleCatalogState = {
    modules: payload.modules,
    centerTypes: payload.centerTypes,
    ready,
    reload: () => setTick(t => t + 1),
  };
  return (
    <ModuleCatalogContext.Provider value={value}>
      {children}
    </ModuleCatalogContext.Provider>
  );
}

import { createContext, useContext } from 'react';

const ModuleCatalogContext = createContext<ModuleCatalogState | null>(null);

/** Direct access to the raw catalog payload (most components use the pure
 *  helpers from dashboard/constants.ts instead). Throws outside the provider. */
export function useModuleCatalog(): ModuleCatalogState {
  const ctx = useContext(ModuleCatalogContext);
  if (!ctx) throw new Error('useModuleCatalog must be used inside <ModuleCatalogProvider>');
  return ctx;
}
