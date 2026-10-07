/**
 * Catalogue EXÉCUTION — la base est la SEULE source de vérité.
 *
 * Tout est chargé depuis GET /api/catalog (tables `modules`,
 * `center_types`, `center_type_modules`) via fetchCatalogApi. Aucun repli
 * statique, aucune liste de clés codée en dur : avant la réponse API le
 * snapshot est vide (les surfaces affichent leurs coquilles, puis se
 * remplissent), après la réponse il reflète exactement la base.
 *
 * expose :
 *   • getCatalogSnapshot / getCatalogVersion / setCatalogSnapshot
 *   • moduleKeys() — clés actives de la table `modules`
 *   • moduleCatalogEmpty() — vrai tant que l'API n'a pas répondu
 *   • useCatalog() — hook React (déclenche le chargement + re-rend)
 *   • isModuleKey / normalizeModuleKeys — helpers tolérants aux clés inconnues
 */
import { useEffect, useState } from 'react';
import { fetchCatalogApi } from '../api';

export interface CatalogModule {
  key: string;
  label: string;
  labelAr: string;
  isBasic: boolean;
  isUnbilled: boolean;
  isHidden: boolean;
  icon: string;
  description: string;
  features: string[];
}

export interface CatalogCenterType {
  key: string;
  label: string;
  labelAr: string;
  hint: string;
  hintAr: string;
}

export interface CatalogSnapshot {
  modules: readonly CatalogModule[];
  centerTypes: readonly CatalogCenterType[];
  centerTypeModuleKeys: readonly { centerType: string; moduleKey: string }[];
}

const EMPTY: CatalogSnapshot = { modules: [], centerTypes: [], centerTypeModuleKeys: [] };

/** Avant la réponse API : vide. La base (via /api/catalog) le remplit. */
let snapshot: CatalogSnapshot = EMPTY;

/** Incrémenté à chaque setCatalogSnapshot réussi — les abonnés se re-rendent. */
let version = 0;
const listeners = new Set<() => void>();

let inFlight: Promise<void> | null = null;

const str = (v: unknown): string => String(v ?? '');
const bool = (v: unknown): boolean => v === 1 || v === true;

function parseFeatures(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(str(raw) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Remplace le snapshot par les données API (normalisées, key: string — un
 * module ajouté en base après le build doit s'afficher). Un payload dégénéré
 * (catalogue vide — réponse tronquée, API cassée) est IGNORÉ : le snapshot
 * précédent (éventuellement vide) est conservé.
 */
export function setCatalogSnapshot(payload: {
  modules?: any[];
  centerTypes?: any[];
  centerTypeModules?: any[];
}): boolean {
  const modules = (payload.modules || []).map((m): CatalogModule => ({
    key: str(m.key),
    label: str(m.label),
    labelAr: str(m.labelAr),
    isBasic: bool(m.isBasic),
    isUnbilled: bool(m.isUnbilled),
    isHidden: bool(m.isHidden),
    icon: str(m.icon),
    description: str(m.description),
    features: Array.isArray(m.features) ? m.features.map(String) : parseFeatures(m.features),
  })).filter(m => m.key);
  if (modules.length === 0) return false;

  snapshot = {
    modules,
    centerTypes: (payload.centerTypes || []).map((t): CatalogCenterType => ({
      key: str(t.key),
      label: str(t.label),
      labelAr: str(t.labelAr),
      hint: str(t.hint),
      hintAr: str(t.hintAr),
    })).filter(t => t.key),
    centerTypeModuleKeys: (payload.centerTypeModules || [])
      .map(p => ({ centerType: str(p.centerType), moduleKey: str(p.moduleKey) }))
      .filter(p => p.centerType && p.moduleKey),
  };
  version += 1;
  for (const notify of listeners) notify();
  return true;
}

/** Snapshot courant — vide jusqu'à la première réponse /api/catalog. */
export function getCatalogSnapshot(): CatalogSnapshot {
  return snapshot;
}

/** Version du snapshot — incrémentée à chaque remplacement réussi. */
export function getCatalogVersion(): number {
  return version;
}

/** Vrai tant que l'API n'a pas livré le catalogue (premier rendu). */
export function moduleCatalogEmpty(): boolean {
  return snapshot.modules.length === 0;
}

/** Clés actives de la table `modules` (ordre de la table, y compris isHidden). */
export function moduleKeys(): string[] {
  return snapshot.modules.map(m => m.key);
}

/** Garde-fou runtime : la clé existe-t-elle dans le catalogue chargé ? */
export function isModuleKey(value: string): boolean {
  return snapshot.modules.some(m => m.key === value);
}

/** Normalise n'importe quelle liste de clés (DB/API) en string[] dédupliquée. */
export function normalizeModuleKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const key = String(v).trim();
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Charge le catalogue depuis /api/catalog une seule fois par page (dedup des
 * appels concurrents). N'échoue JAMAIS : en cas d'erreur réseau le snapshot
 * reste vide et le prochain montage retentera.
 */
export async function ensureCatalogLoaded(): Promise<void> {
  if (snapshot !== EMPTY) return;
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const payload = await fetchCatalogApi();
        setCatalogSnapshot(payload);
      } catch {
        // Snapshot vide conservé ; retry au prochain montage.
      } finally {
        inFlight = null;
      }
    })();
  }
  await inFlight;
}

/** Test-only : vide le snapshot, la version et les abonnés. */
export function __resetCatalogForTests(): void {
  snapshot = EMPTY;
  version = 0;
  listeners.clear();
  inFlight = null;
}

/** Test-only : recharge le snapshot avec un payload donné (déjà normalisé ou brut). */
export function __seedCatalogForTests(payload: Parameters<typeof setCatalogSnapshot>[0]): boolean {
  __resetCatalogForTests();
  return setCatalogSnapshot(payload);
}

/**
 * Hook React : s'abonne aux remplacements du snapshot ET déclenche le
 * chargement API au montage. Premier rendu vide (base pas encore lue),
 * puis re-rendu avec les données live — zéro donnée codée en dur.
 */
export function useCatalog(): number {
  const [v, setV] = useState(version);
  useEffect(() => {
    const notify = () => setV(getCatalogVersion());
    listeners.add(notify);
    void ensureCatalogLoaded();
    return () => { listeners.delete(notify); };
  }, []);
  return v;
}
