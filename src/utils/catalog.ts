/**
 * Catalogue runtime — the single source of truth is the D1 database
 * (`modules`, `center_types`, `center_type_modules`, `module_prices`), served
 * by GET /api/public-pricing. The arrays in `pricing.ts` and `centerType.ts`
 * were the *compiled* source of truth before this revision; they remain here
 * only as the FALLBACK catalog used while the network request is in flight or
 * when it fails, so the landing page degrades to the same data as before
 * instead of rendering an empty simulator.
 *
 * Nothing in this file hardcodes module/center-type data: every selector reads
 * from the Catalog instance set by `setCatalog` / held by the fallback.
 */

import {
  GraduationCap, DollarSign, Clock, BookOpen, Users, Award, Sparkles,
  Utensils, Bus, Calendar, ShieldCheck, Shapes, Brain,
} from 'lucide-react';
import type { CenterType } from './centerType';

/** Icon names stored in `modules.icon` map to lucide components here. */
export const MODULE_ICONS: Record<string, any> = {
  GraduationCap, DollarSign, Clock, BookOpen, Users, Award, Sparkles,
  Utensils, Bus, Calendar, ShieldCheck, Shapes, Brain,
};

export interface CatalogModule {
  key: string;
  label: string;
  labelAr: string;
  icon: string;               // lucide component name, see MODULE_ICONS
  description: string;
  features: string[];         // bullets shown on the base-plan cards
  mock: string;               // mini-mock variant name ('bulletin' | 'revenue' | …)
  isBasic: boolean;           // part of the locked base (always included)
  isUnbilled: boolean;        // bundled — never charged separately
  isHidden: boolean;          // exists in DB but not offered on the landing
}

export interface CatalogCenterType {
  key: CenterType | string;
  label: string;
  labelAr: string;
  hint: string;
  hintAr: string;
}

export interface Catalog {
  modules: readonly CatalogModule[];
  centerTypes: readonly CatalogCenterType[];
  /** module_key → center_type keys that may select it (from center_type_modules). */
  moduleCenterTypes: Readonly<Record<string, readonly string[]>>;
  /** module_key → monthly price for the current school year (from module_prices). */
  prices: Readonly<Record<string, number>>;
  schoolYear: string;
}

export const EMPTY_CATALOG: Catalog = {
  modules: [],
  centerTypes: [],
  moduleCenterTypes: {},
  prices: {},
  schoolYear: '',
};

// ─── Global catalog holder ─────────────────────────────────────────────────
// The landing loads the catalog once at mount; helpers in pricing.ts /
// centerType.ts read through these accessors so their function signatures
// (used by the center application's RenewalModule too) stay unchanged.

let activeCatalog: Catalog = EMPTY_CATALOG;

/** Install a fetched catalog (LandingPage does this once, on mount). */
export function setCatalog(catalog: Catalog): void {
  activeCatalog = catalog;
}

/** Reset to empty — test helper only. */
export function __resetCatalogForTests(): void {
  activeCatalog = EMPTY_CATALOG;
}

export function getCatalog(): Catalog {
  return activeCatalog;
}

// ─── Shared selectors (all derive from the active catalog) ─────────────────

export function isBundledKey(key: string): boolean {
  const mod = activeCatalog.modules.find(m => m.key === key);
  return !!mod && mod.isUnbilled;
}

export function isBaseKey(key: string): boolean {
  const mod = activeCatalog.modules.find(m => m.key === key);
  return !!mod && mod.isBasic;
}

/** Base keys in catalog order. */
export function baseKeys(): string[] {
  return activeCatalog.modules.filter(m => m.isBasic).map(m => m.key);
}

/** Offered (non-hidden) modules in catalog order. */
export function offeredModules(): readonly CatalogModule[] {
  return activeCatalog.modules.filter(m => !m.isHidden);
}

/** Price of a module (0 when absent from the current price list). */
export function modulePrice(key: string): number {
  return activeCatalog.prices[key] || 0;
}

/**
 * Center types a module may be selected for. A module with no matrix row is
 * servable by no known type; an unknown/empty type keeps legacy passthrough
 * (handled by isModuleCompatible in centerType.ts).
 */
export function servedTypes(moduleKey: string): readonly string[] {
  return activeCatalog.moduleCenterTypes[moduleKey] || [];
}
