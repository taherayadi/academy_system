// Minimal public API surface for the landing page.
// Only the three landing-only endpoints: public pricing, active ads and
// demo/trial request submission. Nothing authenticated exists here — the
// center workspace is served by the other application.

const API_BASE = '/api';

// ========================================================================
// Public landing — demo request submission
// ========================================================================

/** Submit a trial / demo / info request from the landing page (public). */
export async function submitDemoRequestApi(data: {
  requestType: 'trial' | 'demo' | 'info';
  fullName: string;
  academyName: string;
  email: string;
  phone: string;
  estimatedSize?: string;
  message?: string;
  requestedModules?: string[];
  centerType?: string; // 'jardin' | 'creche' | 'garderie' | 'formation'
}): Promise<void> {
  const res = await fetch(`${API_BASE}/demo-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Erreur lors de l\'envoi de la demande.');
}


/** Fetch public module prices for the landing page without a session. */
export async function fetchPublicModulePricesApi(year?: string): Promise<Record<string, number>> {
  const params = new URLSearchParams();
  if (year) params.set('year', year);
  const query = params.toString();
  const res = await fetch(`${API_BASE}/public-pricing${query ? `?${query}` : ''}`, {
    credentials: 'same-origin'
  });
  const data: { prices?: Array<{ module_key?: string; price?: number }>; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur chargement des tarifs publics.');
  return (data.prices || []).reduce<Record<string, number>>((prices, row) => {
    if (row.module_key) prices[row.module_key] = Number(row.price) || 0;
    return prices;
  }, {});
}


// ─── Annonces actives : déduplication + cache TTL court ────────────────────
// Trois surfaces (2 carrousels + interstitiel) demandent la même liste pour un
// même couple (location, centerId), et le StrictMode de React double chaque
// effet en dev. Un cache module réduit tout ça à UNE requête réseau par
// fenêtre. Les annonces sont rédigées dans la console plateforme et changent
// rarement : un TTL court est sûr. Les échecs ne sont jamais mis en cache —
// le montage suivant retente.
const ADS_CACHE_TTL_MS = 60_000;
let adsCache: { key: string; data: any[]; expiresAt: number } | null = null;
const adsInFlight = new Map<string, Promise<any[]>>();

/** Test-only : vide le cache/dedup des annonces entre les tests. */
export function __resetActiveAdsCacheForTests(): void {
  adsCache = null;
  adsInFlight.clear();
}

/** Fetch active advertisements by location and optional centerId (public endpoint). */
export async function fetchActiveAdvertisementsApi(location: string, centerId?: string): Promise<any[]> {
  const key = `${location}|${centerId || ''}`;
  if (adsCache && adsCache.key === key && Date.now() < adsCache.expiresAt) {
    return adsCache.data;
  }
  const pending = adsInFlight.get(key);
  if (pending) return pending;

  const params = new URLSearchParams({ location });
  if (centerId) params.set('centerId', centerId);

  const request = (async () => {
    const res = await fetch(`${API_BASE}/advertisements/active?${params.toString()}`, {
      credentials: 'same-origin'
    });
    const data: { advertisements?: any[]; error?: string } = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'خطأ في جلب الإعلانات.');
    const ads = data.advertisements || [];
    adsCache = { key, data: ads, expiresAt: Date.now() + ADS_CACHE_TTL_MS };
    return ads;
  })().finally(() => {
    adsInFlight.delete(key);
  });

  adsInFlight.set(key, request);
  return request;
}
