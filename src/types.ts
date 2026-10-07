export type SubscriptionPlan = 'trial' | 'starter' | 'growth' | 'pro' | 'custom';

export type CenterStatus = 'trial' | 'active' | 'suspended' | 'expired';

// ---------------------------------------------------------------------------
// Modules — la table `modules` est la SEULE source de vérité. Le catalogue
// (clés, libellés, drapeaux isBasic/isUnbilled/isHidden, compatibilité par
// type) est chargé à l'EXÉCUTION depuis GET /api/catalog via
// src/utils/catalogStore.ts : aucune liste de clés codée en dur. Les clés de
// module sont des strings libres — le runtime ne connaît que la base. Les
// prix vivent dans `module_prices` (chargés via /api/public-pricing).
// ---------------------------------------------------------------------------

/**
 * Clé de module — string libre miroir de `modules.key`. Aucune union fermée :
 * un module ajouté en base existe côté code sans toucher aux sources.
 */
export type ModuleKey = string;

/** Ligne de la table `modules`, telle que livrée par GET /api/catalog. */
export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  labelAr: string;
  isBasic: boolean;
  isUnbilled: boolean;
  isHidden: boolean;
  icon: string;
  description: string;
  features: string[];
}

// ─── Helpers clés de module (implémentation : catalogStore, lu sur la base) ───
export { isModuleKey, normalizeModuleKeys } from './utils/catalogStore';

export interface CenterTenant {
  id: string;
  name: string;
  slug?: string;
  phoneNumber?: string;
  locationCity?: string;  plan: SubscriptionPlan;
  // ⚠️ Nouveau schéma : les modules actifs vivent dans la table
  // center_modules (center_id, module_key) — livrés par l'API
  // (login / me / centers → champ `modules`). undefined/[] = legacy full-visibility.
  modules?: ModuleKey[];
  // Le mode cantine (external_traiteur / in_house_kitchen) vit dans
  // center_meal_mode_history et arrive via CenterSettings.mealOperatingMode.
  status: CenterStatus;
  trialEndsAt?: number | null;
  subscriptionEndsAt?: number | null;
  billingCycle?: 'monthly' | 'annual';
  monthlyPrice?: number;
  // 'jardin' | 'creche' | 'garderie' | 'formation' — unknown/empty keeps legacy full-visibility
  centerType?: string;
  logoUrl?: string; // ImageKit CDN URL — empty = default brand logo
  createdAt: number;
}


export type AdvertisementLocation =
  | 'landing_page'
  | 'center_admin'
  | 'both' // visible on the landing page AND in the selected centers' dashboards
  | string;
 // Allow custom locations

/**
 * Positions d'affichage — une annonce peut en cumuler plusieurs.
 *
 * Depuis la migration 0032, les formats IAB figés (728×90, 300×250, 320×50,
 * 160×600) sont remplacés par deux formats responsives :
 *   • rectangle    — bloc fluide, nettement plus grand que l'ancien 300×250
 *   • interstitial — overlay plein écran (mobile compris), fermable
 */
export type AdPositionId =
  | 'rectangle'
  | 'interstitial';


// L'interstitiel se rend en overlay plein écran (vitrine + tableaux de bord)
// au lieu du carrousel standard.
export const INTERSTITIAL_POSITION_ID = 'interstitial';


export function hasInterstitialPosition(positions?: string[]): boolean {
  return (positions || []).includes(INTERSTITIAL_POSITION_ID);
}


export interface UserAccount {
  email: string;
  name: string;
  role: 'admin' | 'super_admin';
  description: string;
  centerId?: string;
}


export type MealOperatingMode = 'external_traiteur' | 'in_house_kitchen';

// ---------------------------------------------------------------------------
// Nouveau schéma tarifaire — la table `services` définit le catalogue,
// `center_service_prices` porte le prix par centre / année / période.
// ---------------------------------------------------------------------------

/** Ligne de la table `services`. */
export interface ServiceDefinition {
  key: string;
  category: 'scolaire' | 'meal' | 'course' | 'other';
  labelFr: string;
  labelAr: string;
  moduleKey?: string;
}

/**
 * Périodes de facturation possibles — VOCABULAIRE DE LA BASE
 * (CHECK billing_period IN ('month','unit','year') sur center_service_prices
 * et payments). Ne pas « franciser » : la DB est la source de vérité.
 */
export type ServiceBillingPeriod = 'month' | 'year' | 'unit';

/**
 * Tarifs d'un centre pour une année scolaire :
 * servicePrices[year][`${serviceKey}:${period}`] = price.
 * La clé réservée « DEFAULT » porte les tarifs sans année (fallback).
 */
export type ServicePricesByYear = Record<string, Record<string, number>>;

/** Historique du mode cantine — table center_meal_mode_history. */
export interface CenterMealModeEntry {
  id: number;
  centerId: string;
  mode: MealOperatingMode;
  effectiveFrom: string; // YYYY-MM-DD
  createdBy?: string;
  createdAt: number;
}

export interface CenterSettings {
  centerName: string;
  phoneNumber: string;
  locationCity: string;
  currency: string; // center_settings.currency, ex: 'TND'
  // ⚠️ Nouveau schéma : plus de bloc CenterFeeSet — chaque service a son
  // prix par année dans center_service_prices. Voir servicePriceForYear().
  servicePrices: ServicePricesByYear;
  // Mode cantine courant — dérivé de la dernière ligne de
  // center_meal_mode_history (lisible par le centre, écrit par la plateforme).
  mealOperatingMode?: MealOperatingMode;
  // Matières partagées (table subjects) et établissements (table etablissements)
  subjects?: string[];
  etablissements?: string[];
}

// ---------------------------------------------------------------------------
// LEGACY SHIM — l'ancienne nomenclature CenterFeeSet reste disponible comme
// VUE sur servicePrices (mapping champ → service_key + billing_period).
// À supprimer quand tous les écrans parlent « service » nativement.
// ---------------------------------------------------------------------------

export interface CenterFeeSet {
  fraisAnnuelSuivi: number;
  fraisMensuelSuivi: number;
  fraisAnnuelBibliotheque: number;
  fraisMensuelBibliotheque: number;
  fraisAbonnementRepas: number;
  fraisParRepas: number;
  prixPlatTraiteur: number;
  fraisAnnuelEtude: number;
  fraisMensuelEtude: number;
  fraisAssuranceCoursExternes: number;
  fraisGouterMatinMensuel: number;
  fraisGouterMatinUnitaire: number;
  fraisGouterSoirMensuel: number;
  fraisGouterSoirUnitaire: number;
  fraisDeuxGoutersMensuel: number;
}

/**
 * Mapping champ legacy → (service_key, billing_period) dans center_service_prices.
 * Vocabulaire DB ('month' | 'year' | 'unit'). prixPlatTraiteur (assiette
 * traiteur externe) et fraisParRepas pointent tous deux sur lunch:unit —
 * la DB ne porte qu'UN prix unitaire repas ; la part traiteur vit dans
 * center_service_prices.traiteur_share.
 */
export const LEGACY_FEE_SERVICE_MAP: Record<keyof CenterFeeSet, { serviceKey: string; period: ServiceBillingPeriod }> = {
  fraisAnnuelSuivi: { serviceKey: 'suivi', period: 'year' },
  fraisMensuelSuivi: { serviceKey: 'suivi', period: 'month' },
  fraisAnnuelBibliotheque: { serviceKey: 'bibliotheque', period: 'year' },
  fraisMensuelBibliotheque: { serviceKey: 'bibliotheque', period: 'month' },
  fraisAbonnementRepas: { serviceKey: 'lunch', period: 'month' },
  fraisParRepas: { serviceKey: 'lunch', period: 'unit' },
  prixPlatTraiteur: { serviceKey: 'lunch', period: 'unit' },
  fraisAnnuelEtude: { serviceKey: 'etude', period: 'year' },
  fraisMensuelEtude: { serviceKey: 'etude', period: 'month' },
  fraisAssuranceCoursExternes: { serviceKey: 'assurance_externe', period: 'year' },
  fraisGouterMatinMensuel: { serviceKey: 'gouter_matin', period: 'month' },
  fraisGouterMatinUnitaire: { serviceKey: 'gouter_matin', period: 'unit' },
  fraisGouterSoirMensuel: { serviceKey: 'gouter_apres_midi', period: 'month' },
  fraisGouterSoirUnitaire: { serviceKey: 'gouter_apres_midi', period: 'unit' },
  fraisDeuxGoutersMensuel: { serviceKey: 'gouter_both', period: 'month' }
};

/** Prix d'un service pour une année (clé composite « service:period »). */
export function servicePriceForYear(
  servicePrices: ServicePricesByYear | null | undefined,
  serviceKey: string,
  period: string,
  year: string,
  fallback = 0
): number {
  if (!servicePrices) return fallback;
  const row = servicePrices[year] || servicePrices['DEFAULT'] || {};
  const v = row[`${serviceKey}:${period}`] ?? row[serviceKey];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Écrit/met à jour le prix d'un service pour une année (immutable). */
export function withServicePrice(
  servicePrices: ServicePricesByYear,
  year: string,
  serviceKey: string,
  period: string,
  value: number
): ServicePricesByYear {
  const forYear = { ...(servicePrices[year] || {}) };
  forYear[`${serviceKey}:${period}`] = value;
  return { ...servicePrices, [year]: forYear };
}

/** Convertit un ancien CenterFeeSet en servicePrices (clé 'DEFAULT'). */
export function feeSetToServicePrices(fees: Partial<CenterFeeSet> | null | undefined, year = 'DEFAULT'): ServicePricesByYear {
  const out: ServicePricesByYear = {};
  if (!fees || typeof fees !== 'object') return out;
  for (const [field, map] of Object.entries(LEGACY_FEE_SERVICE_MAP)) {
    const v = (fees as any)[field];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[year] = { ...(out[year] || {}), [`${map.serviceKey}:${map.period}`]: v };
    }
  }
  return out;
}


// Shared default list of matières used across the whole app (Suivi notes devoirs, staff enseignant, cours)
/**
 * Liste de secours des matières — la source de vérité est la TABLE `subjects`.
 * L'API livre `settings.subjects` depuis la table ; cette constante n'est plus
 * le catalogue officiel, seulement le repli quand la table est vide.
 */
export const APP_SUBJECTS = [
  'الرياضيات (Mathématiques)',
  'الفيزياء والكيمياء (Physique-Chimie)',
  'علوم الحياة والأرض (SVT)',
  'اللغة العربية (Arabe)',
  'اللغة الفرنسية (Français)',
  'اللغة الإنجليزية (Anglais)',
  'الإعلامية (Informatique)',
  'الفلسفة (Philosophie)',
  'التاريخ والجغرافيا (Histoire-Géo)',
  'الإقتصاد والتصرف (Économie-Gestion)'
];


// Tarifs par défaut appliqués à la création d'un élève quand le service
// n'a pas encore de prix dans center_service_prices (0 = non configuré).
export const initialCenterSettings: CenterSettings = {
  centerName: 'EduSphère',
  phoneNumber: '',
  locationCity: '',
  currency: 'TND',
  servicePrices: {}
};


// Fixed academic year list shown in every year combobox (3 years before and after the current one)
export const DEFAULT_ACADEMIC_YEARS = [
  '2022/2023', '2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'
];


/**
 * Revision D (remark S1): decimal-tolerant money parsing for fee inputs.
 * Accepts comma or dot decimals («2,5» → 2.5), keeps the historical
 * leading-zero cleanup («02,5» → 2.5), and never rounds. Non-numeric → 0.
 */
export function parseDecimalFee(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const cleaned = (raw ?? '')
    .toString()
    .trim()
    .replace(',', '.')
    .replace(/^0+(\d)/, '$1');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}


export function normalizeFeeSet(raw: any, fallback?: Partial<CenterFeeSet> | null): CenterFeeSet {
  const fb = fallback || {};
  if (!raw || typeof raw !== 'object') {
    return {
      fraisAnnuelSuivi: Number(fb.fraisAnnuelSuivi) || 0,
      fraisMensuelSuivi: Number(fb.fraisMensuelSuivi) || 0,
      fraisAnnuelBibliotheque: Number(fb.fraisAnnuelBibliotheque) || 0,
      fraisMensuelBibliotheque: Number(fb.fraisMensuelBibliotheque) || 0,
      fraisAbonnementRepas: Number(fb.fraisAbonnementRepas) || 0,
      fraisParRepas: Number(fb.fraisParRepas) || 0,
      prixPlatTraiteur: fb.prixPlatTraiteur != null ? Number(fb.prixPlatTraiteur) : 6,
      fraisAnnuelEtude: Number(fb.fraisAnnuelEtude) || 0,
      fraisMensuelEtude: Number(fb.fraisMensuelEtude) || 0,
      fraisAssuranceCoursExternes: Number(fb.fraisAssuranceCoursExternes) || 0,
      fraisGouterMatinMensuel: Number(fb.fraisGouterMatinMensuel) || 0,
      fraisGouterMatinUnitaire: Number(fb.fraisGouterMatinUnitaire) || 0,
      fraisGouterSoirMensuel: Number(fb.fraisGouterSoirMensuel) || 0,
      fraisGouterSoirUnitaire: Number(fb.fraisGouterSoirUnitaire) || 0,
      fraisDeuxGoutersMensuel: Number(fb.fraisDeuxGoutersMensuel) || 0
    };
  }

  const getNum = (camelKey: string, snakeKey: string, altKey?: string, defaultVal = 0): number => {
    if (raw[camelKey] != null && raw[camelKey] !== '') return Number(raw[camelKey]) || 0;
    if (raw[snakeKey] != null && raw[snakeKey] !== '') return Number(raw[snakeKey]) || 0;
    if (altKey && raw[altKey] != null && raw[altKey] !== '') return Number(raw[altKey]) || 0;
    return defaultVal;
  };

  return {
    fraisAnnuelSuivi: getNum('fraisAnnuelSuivi', 'frais_annuel_suivi', 'suiviAnnualFee', Number(fb.fraisAnnuelSuivi) || 0),
    fraisMensuelSuivi: getNum('fraisMensuelSuivi', 'frais_mensuel_suivi', 'suiviMonthlyFee', Number(fb.fraisMensuelSuivi) || 0),
    fraisAnnuelBibliotheque: getNum('fraisAnnuelBibliotheque', 'frais_annuel_bibliotheque', 'libraryAnnualFee', Number(fb.fraisAnnuelBibliotheque) || 0),
    fraisMensuelBibliotheque: getNum('fraisMensuelBibliotheque', 'frais_mensuel_bibliotheque', 'libraryMonthlyFee', Number(fb.fraisMensuelBibliotheque) || 0),
    fraisAbonnementRepas: getNum('fraisAbonnementRepas', 'frais_abonnement_repas', 'mealMonthlyPrice', Number(fb.fraisAbonnementRepas) || 0),
    fraisParRepas: getNum('fraisParRepas', 'frais_par_repas', 'mealUnitPrice', Number(fb.fraisParRepas) || 0),
    prixPlatTraiteur: raw.prixPlatTraiteur != null ? Number(raw.prixPlatTraiteur) : (raw.prix_plat_traiteur != null ? Number(raw.prix_plat_traiteur) : (fb.prixPlatTraiteur != null ? Number(fb.prixPlatTraiteur) : 6)),
    fraisAnnuelEtude: getNum('fraisAnnuelEtude', 'frais_annuel_etude', undefined, Number(fb.fraisAnnuelEtude) || 0),
    fraisMensuelEtude: getNum('fraisMensuelEtude', 'frais_mensuel_etude', undefined, Number(fb.fraisMensuelEtude) || 0),
    fraisAssuranceCoursExternes: getNum('fraisAssuranceCoursExternes', 'frais_assurance_cours_externes', 'assuranceFee', Number(fb.fraisAssuranceCoursExternes) || 0),
    fraisGouterMatinMensuel: getNum('fraisGouterMatinMensuel', 'frais_gouter_matin_mensuel', undefined, Number(fb.fraisGouterMatinMensuel) || 0),
    fraisGouterMatinUnitaire: getNum('fraisGouterMatinUnitaire', 'frais_gouter_matin_unitaire', undefined, Number(fb.fraisGouterMatinUnitaire) || 0),
    fraisGouterSoirMensuel: getNum('fraisGouterSoirMensuel', 'frais_gouter_soir_mensuel', undefined, Number(fb.fraisGouterSoirMensuel) || 0),
    fraisGouterSoirUnitaire: getNum('fraisGouterSoirUnitaire', 'frais_gouter_soir_unitaire', undefined, Number(fb.fraisGouterSoirUnitaire) || 0),
    fraisDeuxGoutersMensuel: getNum('fraisDeuxGoutersMensuel', 'frais_deux_gouters_mensuel', undefined, Number(fb.fraisDeuxGoutersMensuel) || 0)
  };
}


export function normalizeSettings(raw: any, topLevelFees?: any, topLevelFeesByYear?: any): CenterSettings {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  // Nouveau schéma : servicePrices[year]["service:period"] — tolère aussi la
  // structure plate { "service:period": n } sans année.
  const servicePrices: ServicePricesByYear = {};
  const rawSp = (src.servicePrices && typeof src.servicePrices === 'object' && !Array.isArray(src.servicePrices))
    ? src.servicePrices
    : {};
  for (const [year, prices] of Object.entries(rawSp)) {
    if (year && prices && typeof prices === 'object' && !Array.isArray(prices)) {
      const row: Record<string, number> = {};
      for (const [k, v] of Object.entries(prices as Record<string, unknown>)) {
        const n = Number(v);
        if (k && Number.isFinite(n)) row[k] = n;
      }
      servicePrices[year] = row;
    }
  }
  if (Object.keys(servicePrices).length === 0 && Object.keys(src).length > 0) {
    // Payload plat (import legacy) : "suivi:monthly" sans conteneur d'année.
    const flat: Record<string, number> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k.includes(':')) { const n = Number(v); if (Number.isFinite(n)) flat[k] = n; }
    }
    if (Object.keys(flat).length > 0) servicePrices['DEFAULT'] = flat;
  }

  // Ancien bloc fees/feesByYear embarqué → converti en servicePrices
  // (chemin legacy : anciens snapshots, anciens payloads API).
  const mergeLegacyInto = (rawFees: any, year: string) => {
    if (!rawFees || typeof rawFees !== 'object') return;
    const feeSet = normalizeFeeSet(rawFees, null);
    for (const [field, map] of Object.entries(LEGACY_FEE_SERVICE_MAP) as [keyof CenterFeeSet, { serviceKey: string; period: string }][]) {
      const v = (feeSet as any)[field];
      if (typeof v !== 'number') continue;
      const key = `${map.serviceKey}:${map.period}`;
      // prixPlatTraiteur (valeur d'affichage par défaut, souvent 6) ne doit
      // JAMAIS écraser un vrai prix unitaire repas : la DB ne porte qu'UN
      // prix lunch:unit (fraisParRepas) — la part traiteur vit dans traiteur_share.
      if (field === 'prixPlatTraiteur' && servicePrices[year]?.[key] != null) continue;
      if (v !== 0 || field === 'prixPlatTraiteur') {
        servicePrices[year] = { ...(servicePrices[year] || {}), [key]: v };
      }
    }
  };
  if (Object.keys(servicePrices).length === 0) {
    if (src.fees && typeof src.fees === 'object') mergeLegacyInto(src.fees, 'DEFAULT');
    if (src.feesByYear && typeof src.feesByYear === 'object' && !Array.isArray(src.feesByYear)) {
      for (const [year, yFees] of Object.entries(src.feesByYear)) {
        if (year && yFees && typeof yFees === 'object') mergeLegacyInto(yFees, year);
      }
    }
  }

  const subjects: string[] = Array.isArray(src.subjects) && src.subjects.length > 0
    ? (Array.from(new Set(src.subjects.map((s: any) => String(s).trim()).filter(Boolean))) as string[])
    : [];

  const mode = src.mealOperatingMode || src.meal_operating_mode;

  return {
    centerName: src.centerName || src.center_name || 'EduSphère',
    phoneNumber: src.phoneNumber || src.phone_number || '',
    locationCity: src.locationCity || src.location_city || '',
    currency: src.currency || 'TND',
    servicePrices,
    ...(mode ? { mealOperatingMode: mode === 'in_house_kitchen' ? 'in_house_kitchen' : 'external_traiteur' } : {}),
    ...(Array.isArray(src.etablissements) ? { etablissements: src.etablissements.map((e: any) => String(e)).filter(Boolean) } : {}),
    ...(topLevelFees || topLevelFeesByYear ? normalizeLegacyFeePayload(topLevelFees, topLevelFeesByYear, servicePrices) : {})
  };
}

/** Fusionne un ancien payload fees/feesByYear dans servicePrices (chemin d'import legacy). */
function normalizeLegacyFeePayload(topLevelFees: any, topLevelFeesByYear: any, servicePrices: ServicePricesByYear): Partial<CenterSettings> {
  const mergeLegacy = (rawFees: any, year: string) => {
    const feeSet = normalizeFeeSet(rawFees, null);
    for (const [field, map] of Object.entries(LEGACY_FEE_SERVICE_MAP) as [keyof CenterFeeSet, { serviceKey: string; period: string }][]) {
      const v = (feeSet as any)[field];
      if (typeof v !== 'number') continue;
      const key = `${map.serviceKey}:${map.period}`;
      // prixPlatTraiteur (valeur d'affichage par défaut, souvent 6) ne doit
      // JAMAIS écraser un vrai prix unitaire repas : la DB ne porte qu'UN
      // prix lunch:unit (fraisParRepas) — la part traiteur vit dans traiteur_share.
      if (field === 'prixPlatTraiteur' && servicePrices[year]?.[key] != null) continue;
      if (v !== 0 || field === 'prixPlatTraiteur') {
        servicePrices[year] = { ...(servicePrices[year] || {}), [key]: v };
      }
    }
  };
  if (topLevelFeesByYear && typeof topLevelFeesByYear === 'object' && !Array.isArray(topLevelFeesByYear)) {
    for (const [year, yFees] of Object.entries(topLevelFeesByYear)) {
      if (year && yFees && typeof yFees === 'object') mergeLegacy(yFees, year);
    }
  }
  if (topLevelFees && typeof topLevelFees === 'object') mergeLegacy(topLevelFees, 'DEFAULT');
  return {};
}


// Returns the fees to apply for a given academic year (VUE legacy sur servicePrices)
export function getFeesForYear(settings: CenterSettings | null | undefined, year: string): CenterFeeSet {
  const empty: CenterFeeSet = {
    fraisAnnuelSuivi: 0, fraisMensuelSuivi: 0,
    fraisAnnuelBibliotheque: 0, fraisMensuelBibliotheque: 0,
    fraisAbonnementRepas: 0, fraisParRepas: 0,
    prixPlatTraiteur: 6,
    fraisAnnuelEtude: 0, fraisMensuelEtude: 0,
    fraisAssuranceCoursExternes: 0,
    fraisGouterMatinMensuel: 0, fraisGouterMatinUnitaire: 0,
    fraisGouterSoirMensuel: 0, fraisGouterSoirUnitaire: 0,
    fraisDeuxGoutersMensuel: 0
  };
  const sp = settings?.servicePrices;
  if (!sp) return empty;
  const out = { ...empty };
  for (const [field, map] of Object.entries(LEGACY_FEE_SERVICE_MAP) as [keyof CenterFeeSet, { serviceKey: string; period: string }][]) {
    (out as any)[field] = servicePriceForYear(sp, map.serviceKey, map.period, year, field === 'prixPlatTraiteur' ? 6 : 0);
  }
  return out;
}


export const ACADEMIC_MONTHS = [
  'Septembre', 'Octobre', 'Novembre', 'Décembre', 
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai'
] as const;


export type AcademicMonth = typeof ACADEMIC_MONTHS[number];


export const ARABIC_MONTHS: Record<string, string> = {
  'Septembre': 'سبتمبر',
  'Octobre': 'أكتوبر',
  'Novembre': 'نوفمبر',
  'Décembre': 'ديسمبر',
  'Janvier': 'جانفي',
  'Février': 'فيفري',
  'Mars': 'مارس',
  'Avril': 'أفريل',
  'Mai': 'ماي',
  'Juin': 'جوان',
  'Juillet': 'جويلية',
  'Août': 'أوت'
};


export const ARABIC_ACADEMIC_MONTHS: Record<AcademicMonth, string> = {
  'Septembre': 'سبتمبر',
  'Octobre': 'أكتوبر',
  'Novembre': 'نوفمبر',
  'Décembre': 'ديسمبر',
  'Janvier': 'جانفي',
  'Février': 'فيفري',
  'Mars': 'مارس',
  'Avril': 'أفريل',
  'Mai': 'ماي'
};


// Arabic month names indexed by JS Date month number (0 = January ... 11 = December)
export const MONTH_BY_CALENDAR_INDEX: string[] = [
  'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
  'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];


export function monthToArabic(monthStr: string): string {
  const match = Object.keys(ARABIC_MONTHS).find(key => monthStr.includes(key));
  if (!match) return monthStr;
  return monthStr.replace(match, ARABIC_MONTHS[match]);
}


// Map a real JS month index (0=January) to an academic index (0=Septembre ... 8=Mai).
// Returns -1 when the real month is outside the academic calendar (Juin/Juillet/Août).
export function getCurrentAcademicIndex(): number {
  const real = new Date().getMonth();
  const map: Record<number, number> = {
    8: 0, 9: 1, 10: 2, 11: 3, 0: 4, 1: 5, 2: 6, 3: 7, 4: 8
  };
  return map[real] ?? -1;
}


// Current academic year label (e.g. '2026/2027') based on today's date.
// A new academic year starts in July, so August 2026 -> '2026/2027'.
export function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}


export interface ParentInfo {
  name: string;
  birthDate: string;
  profession: string;
  address: string;
  phoneFixed: string;
  phoneMobile: string;
  email: string;
  extraPhones?: string[];
}


export interface Sibling {
  id: string;
  name: string;
  age: number;
  grade: string;
}


export interface AuthorizedPerson {
  id: string;
  name: string;
  phone: string;
  relation: string;
}


export interface AcademicHistoryEntry {
  school: string;
  grade: string;
}


export interface PaymentRecord {
  id: string;
  date: string;
  amountPaid: number;      // payments.amount
  totalRequired: number;   // payments.total_required
  // Dérivé côté client (total_required - amount_paid) — plus de colonne.
  remainingBalance: number;
  // Libellé du service (affichage). Le schéma nouveau stocke service_key ;
  // le mapping clé → libellé vient de la table `services`.
  service: 'Suivi' | 'Inscription Suivi' | 'Étude' | 'Inscription Étude' | 'Cours Particuliers' | 'Revision' | 'Formation' | 'Bibliothèque' | 'Inscription Bibliothèque' | 'Repas' | 'Goûter' | 'Assurance' | 'Événements' | 'Autres' | string;
  // ⚠️ Nouveau schéma : service_key (ex: 'suivi', 'lunch', 'assurance_externe')
  serviceKey?: string;
  // ⚠️ Nouveau schéma : billing_period ('monthly' | 'annual' | 'unit')
  billingPeriod?: ServiceBillingPeriod | string;
  // ⚠️ Nouveau schéma : period_month (ex: 'Octobre' ou '2026-10')
  month: string;
  // ⚠️ Nouveau schéma : school_year (ex: '2026/2027')
  schoolYear?: string;
  paymentType: 'full' | 'advance' | 'balance'; // Payé / Avance (acompte) / Solde
  method: 'Espèces' | 'Chèque' | 'Virement' | string;
  chequeNumber?: string;
  chequeDate?: string;
  chequePaid?: boolean; // payments.cheque_paid — chèque encaissé
  receiptNumber: string; // payments.receipt_number
  notes?: string;
  discount?: number;      // payments.discount (حسم / تخفيض)
  refund?: boolean;       // payments.is_refund — remboursement
  refundOf?: string;      // payments.refund_of — id du paiement remboursé
  // ⚠️ Nouveau schéma : ref_type/ref_id — rattachement optionnel à une entité
  // (inscription, événement, cours…)
  refType?: string;
  refId?: string;
}

/**
 * Libellé d'affichage « طريقة الخلاص » : clé brute (nouveau schéma DB :
 * cash/cheque/transfer/card) → libellé FR lisible côté centre.
 * « Espèces » est la valeur par défaut partout dans l'UI.
 */
export function paymentMethodLabel(method: unknown): string {
  const m = typeof method === 'string' ? method.trim().toLowerCase() : '';
  if (m === 'cheque') return 'Chèque';
  if (m === 'transfer') return 'Virement';
  if (m === 'card') return 'Carte';
  return 'Espèces'; // 'cash', 'espèces', valeur absente/inconnue
}


export interface MealSubscription {
  mode: 'subscription' | 'unit';
  monthlyPrice: number; // ex: 150 DT
  unitPrice: number;    // ex: 8 DT
  prepaidMeals: number; // ex: 18 repas
  consumedMealsCount: number; // ex: 5 repas
  active: boolean;
}


export type MealServiceType = 'lunch' | 'gouter_matin' | 'gouter_apres_midi';


/** One meal or snack served to a student on a specific date. */
export interface MealAttendance {
  date: string;
  service?: MealServiceType;
  /** A monthly subscriber or a student paying for a single dish. */
  type: 'subscription' | 'unit';
  paid: boolean;
  paidAt?: string;
  traiteurPrice?: number;
}


export interface StudentRegistration {
  date: string;
  location: string;
  signedElectronically: boolean;
  signatureName?: string;
}


/**
 * Ligne 1:1 de la TABLE `students` (nouveau schéma normalisé). L'interface
 * `Student` ci-dessous reste la VUE AGGREGÉE de l'application : le serveur
 * l'assemble depuis students + student_parents + student_years +
 * student_service_enrollments + payments + meal_attendances.
 */
export interface StudentDbRow {
  id: string;
  centerId: string;
  studentType: string; // 'regular' | …
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  birthPlace?: string | null;
  contactPhone?: string | null;
  allergies: string;
  parentalSituation?: string | null;
  parentalComments?: string | null;
  registrationDate?: string | null;
  registrationLocation?: string | null;
  registrationSignedElectronically: boolean;
  registrationSignatureName?: string | null;
  status: string; // 'active' | …
  createdAt: number;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  grade: string; // Level e.g. "Collège 8ème", "Lycée 2ème Science", etc.
  
  // Academic Year
  academicYear?: string; // e.g. "2025/2026"
  etablissement?: string; // School / establishment name
  
  // MODULE 1 Legal Guardians
  mother: ParentInfo;
  father: ParentInfo;
  parentalSituation: 'mariés' | 'séparés_garde_mere' | 'séparés_garde_pere' | 'séparés_garde_alternee';
  parentalComments?: string;
  
  // Family & Authorizations
  siblings: Sibling[];
  authorizedPersons: AuthorizedPerson[];
  allergies: string;
  
  // 3 Last Academic Years
  academicHistory: {
    nMinus1: AcademicHistoryEntry;
    nMinus2: AcademicHistoryEntry;
    nMinus3: AcademicHistoryEntry;
  };
  
  registration: StudentRegistration;
  
  // Service Enrolments
  enrolledServices: {
    suivi: boolean;
    etude: boolean;
    library: boolean;
    meals: boolean;
    gouterMatin?: boolean;
    gouterSoir?: boolean;
    gouterBoth?: boolean;
  };
  
  // MODULE 2: Suivi Fees
  suiviFees: {
    annualRegistrationFee: number; // ex: 150 DT
    monthlyFee: number;            // ex: 250 DT
  };
  
  // MODULE 3: Étude / tutoring fees
  etudeFees: {
    annualRegistrationFee: number; // ex: 50 DT
    monthlyFee: number;            // ex: 80 DT
  };

  // MODULE 5: Library Fees
  libraryFees: {
    annualRegistrationFee: number; // ex: 20 DT
    monthlyFee: number;            // ex: 30 DT
  };

  // MODULE 6: Meals Config
  mealSubscription: MealSubscription;
  mealAttendances?: MealAttendance[];
  
  // Ledger Payments
  payments: PaymentRecord[];
  
  // MODULE 7: Suivi Scolaire - notes per trimester per subject
  suiviNotes?: SuiviNotes[];

  // TimeSheet reference
  timeSheetId?: string;
}


export interface SuiviSubjectGrade {
  devoir1?: number;  // devoir de contrôle n°1
  devoir2?: number;  // devoir de contrôle n°2 (Mathématiques uniquement)
  synthese?: number; // devoir de synthèse
}


export interface SuiviTrimester {
  trimester: 1 | 2 | 3;
  subjects: Record<string, SuiviSubjectGrade>; // subject name (e.g. "Mathématiques") -> grades
}


export interface SuiviNotes {
  schoolYear: string;
  trimesters: SuiviTrimester[];
}


// Returns the shared subject list used everywhere (from settings or default)
export function getAppSubjects(settings?: CenterSettings): string[] {
  return settings?.subjects?.length ? settings.subjects : APP_SUBJECTS;
}


// Helper to detect the Mathématiques subject no matter its label format
export function isMathSubject(subject: string): boolean {
  const s = subject.toLowerCase();
  return s === 'mathématiques' || s.includes('رياضيات') || s.includes('mathématiques');
}


export type StaffRole = 'enseignant' | 'encadrant' | 'administration' | 'agent_entretien' | 'cuisinier' | 'chauffeur_bus' | 'autre';


export type StaffRequestStatus = 'en_attente' | 'approuve' | 'refuse';


export interface LeaveRequest {
  id: string;
  staffId: string;
  startDate: string;
  endDate: string;
  reason: string;
  type: 'Maladie' | 'Annuel' | 'Exceptionnel';
  status: StaffRequestStatus;
}


export interface StaffAdvance {
  id: string;
  staffId: string;
  amount: number;
  date: string;        // تاريخ الطلب
  reason: string;
  status: StaffRequestStatus;
}


export interface PaySlip {
  id: string;
  staffId: string;
  month: string;
  baseSalary: number;
  bonus: number;
  bonusReason: string;
  cnssDeduction: number;
  absenceDeductions: number;
  /** Total of approved advances deducted from this month's salary */
  advanceDeducted: number;
  netSalary: number;
  issueDate: string;
  // Attendance & hours summary for the month
  daysPresent?: number;
  daysAbsent?: number;
  daysRetard?: number;
  extraHours?: number;
  // Extra hours pay (automatic: extraHours * rate)
  extraHourRate?: number;
  extraHoursAmount?: number;
}


export interface StaffPayment {
  id: string;
  month: string;
  amountPaid: number;
  bonus?: number;
  deduction?: number;
  netSalary: number;
  date: string;
  receiptNumber: string;
  notes?: string;
}


export interface StaffScheduleSlot {
  day: string;      // 'Lundi' | 'Mardi' | ... | 'Samedi'
  slots: string[];  // e.g. ['08:00 - 12:00', '14:00 - 18:00']
}


export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  cin: string;
  cnssNumber: string; // Numéro CNSS
  subjects: string[]; // Matières enseignées
  salary: number;     // Salaire fixe ou tarif
  phone: string;
  role: StaffRole;
  contractStartDate: string;
  contractType?: 'CDI' | 'CDD' | 'Vacation';
  email?: string;
  address?: string;
  baseSalary?: number;
  cnssAmount?: number;
  hourlyRate?: number;
  hireDate?: string;
  leaveRequests?: LeaveRequest[];
  advances?: StaffAdvance[];       // طلبات السلف (Demande avance)
  payments?: StaffPayment[];
  payslips?: PaySlip[];
  schedule?: StaffScheduleSlot[]; // Emploi du temps hebdomadaire
}


export interface TimesheetEntry {
  id: string;
  staffId: string;
  date: string;
  slotTime?: string; // ex: "08:00 - 10:00"
  status: 'present' | 'absent' | 'retard' | 'conge';
  leaveReason?: string;
  leaveStatus?: 'en_attente' | 'approuvé' | 'refusé';
  notes?: string;
  hoursWorked?: number; // normal work hours for the day
  extraHours?: number;  // supplementary hours (heures supplémentaires)
}


export const ETUDE_DAYS = [
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
] as const;


export type EtudeDay = typeof ETUDE_DAYS[number];


export interface EtudeSlot {
  id: string;
  day: EtudeDay;
  startTime: string; // e.g. "08:30"
  endTime: string;   // e.g. "10:30"
  gradeLevel: string; // Level target
  teacherId: string;  // Staff ID
  enrolledStudentIds: string[];
  isExtra?: boolean; // Seance outside the teacher's weekly schedule → counted as additional hours
}


// Tunisian school levels (Primaire 1ère → 6ème, Collège 7ème → 9ème, Lycée 1ère → Bac)
export const EXTERNAL_GRADE_LEVELS: { level: string; branches: string[] }[] = [
  { level: 'Primaire 1ère Année', branches: [] },
  { level: 'Primaire 2ème Année', branches: [] },
  { level: 'Primaire 3ème Année', branches: [] },
  { level: 'Primaire 4ème Année', branches: [] },
  { level: 'Primaire 5ème Année', branches: [] },
  { level: 'Primaire 6ème Année', branches: [] },
  { level: 'Collège 7ème Année', branches: [] },
  { level: 'Collège 8ème Année', branches: [] },
  { level: 'Collège 9ème Année', branches: [] },
  { level: 'Lycée 1ère Année', branches: [] },
  { level: 'Lycée 2ème Année', branches: [] },
  { level: 'Lycée 3ème Année', branches: [] },
  { level: 'Baccalauréat', branches: [] }
];


// Build a grade list ("Primaire 1ère", ..., "Baccalauréat") for dropdowns — same labels as student fiche
export function buildExternalGradeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  EXTERNAL_GRADE_LEVELS.forEach(({ level }) => {
    options.push({ value: level, label: level.replace(' Année', '') });
  });
  return options;
}


export const EXTERNAL_GRADE_OPTIONS = buildExternalGradeOptions();


// ─── Student TimeSheet ────────────────────────────────────────────────

export const TIMESHEET_DAYS = ['الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

export type TimesheetDay = typeof TIMESHEET_DAYS[number];


export interface TimeSheetSlot {
  id?: string;
  day: TimesheetDay;
  startTime: string; // "08:00"
  endTime: string;   // "12:00"
}


export interface StudentTimeSheet {
  id: string;
  schoolYear: string;
  establishmentName: string;
  gradeLevel: string;
  branch?: string;
  className?: string;
  weeklySchedule: TimeSheetSlot[];
  createdAt: string;
  updatedAt: string;
}


export type StudentAttendanceStatus = 'present' | 'absent';


/** Daily check-in record used by jardin centers (Pointage Élèves). */
export interface StudentAttendanceRecord {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  status: StudentAttendanceStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}


export const TIMESHEET_GRADES_NO_BRANCH = [
  'Primaire 1ère', 'Primaire 2ème', 'Primaire 3ème', 'Primaire 4ème', 'Primaire 5ème', 'Primaire 6ème',
  'Collège 7ème', 'Collège 8ème', 'Collège 9ème', 'Lycée 1ère'
];


export const TIMESHEET_GRADES_2EME_BRANCHES = [
  'Lettres (آداب)',
  'Sciences (علوم)',
  'Économie et Services (إقتصاد وخدمات)',
  'Technologies de l\'Informatique (تكنولوجيا المعلومات)',
];


export const TIMESHEET_GRADES_3EME_BAC_BRANCHES = [
  'Lettres (آداب)',
  'Mathématiques (رياضيات)',
  'Sciences Expérimentales (علوم تجريبية)',
  'Sciences Techniques (علوم تقنية)',
  'Sciences de l\'Informatique (علوم الحاسوب)',
  'Économie et Gestion (إقتصاد وتصرف)',
  'Sport (رياضة)',
];


export function getTimesheetBranches(grade: string): string[] {
  if (TIMESHEET_GRADES_NO_BRANCH.some(g => grade.includes(g))) return [];
  if (grade.includes('Primaire') || grade.includes('Collège')) return [];
  if (grade.includes('2ème') || grade.includes('2eme')) return TIMESHEET_GRADES_2EME_BRANCHES;
  if (grade.includes('3ème') || grade.includes('3eme') || grade.includes('Bac')) return TIMESHEET_GRADES_3EME_BAC_BRANCHES;
  return [];
}


export function getTimeSlotsForDay(schedule: TimeSheetSlot[], day: TimesheetDay): TimeSheetSlot[] {
  return schedule.filter(s => s.day === day);
}


export interface ExternalCourseStudent {
  studentId: string;
  studentName: string;
  parentPhone: string;
  isExternal?: boolean;        // true when not a registered center student
  assurancePaid?: boolean;     // assurance scolaire paid for the year
  assuranceAmount?: number;    // ex: 50 DT
  assuranceDate?: string;
  enrolledAt?: string;         // date of enrollment in course
}


// Global register of external (hors-liste) students shared across all courses
export interface ExternalRegistrationRecord {
  id: string;
  studentId: string;
  courseId: string;
  courseName: string;   // subject + grade for display
  schoolYear: string;
  amountPaid: number;
  date: string;
  method: 'Espèces' | 'Chèque' | 'Virement';
  notes?: string;
}


export interface ExternalAttendanceRecord {
  id: string;
  studentId: string;
  courseId: string;
  courseName: string;   // subject (grade) for display
  date: string;
  status: 'present' | 'absent';
}


export interface ExternalStudentRegister {
  id: string;
  name: string;
  parentPhone: string;
  grade: string;
  schoolYear?: string; // ex: "2026/2027" — registration year
  assurancePaid: boolean;
  assuranceAmount: number;
  assuranceDate?: string;
  payments: ExternalRegistrationRecord[];
  attendance: ExternalAttendanceRecord[];
  createdAt: string;
}


export interface ExternalCourse {
  id: string;
  schoolYear: string;  // ex: "2026/2027"
  trimester: string; // ex: "Trimestre 1"
  gradeLevel: string; // ex: "Lycée 3ème Math"
  subject: string;    // ex: "Mathématiques"
  teacherName: string;
  teacherPhone: string;
  monthlyFee: number;  // ex: 80 DT
  teacherShare: number; // ex: 70 DT
  centerShare: number;  // ex: 10 DT
  // Montant de l'assurance scolaire propre à CE cours (table external_courses.assurance_amount)
  assuranceAmount: number;
  enrolledStudents: ExternalCourseStudent[];
}


// Per-seance status for an enrolled student in a given session
export type SeanceStudentStatus = 'present' | 'absent' | 'paie_mois' | 'paie_seance';


export interface ExternalCourseSession {
  id: string;
  courseId: string;
  date: string;
  presentStudentIds: string[];
  oneTimeStudents: { id: string; name: string; parentPhone: string; paidUnit: boolean }[];
  monthPaidMap: Record<string, boolean>; // studentId -> isCurrentMonthPaid
  // Optional per-seance status per student (advanced pointage). Falls back to presentStudentIds + monthPaidMap when empty.
  seanceStatusMap?: Record<string, SeanceStudentStatus>;
  // Per-student amount actually collected (paie_mois), keyed by studentId
  seanceAmountMap?: Record<string, number>;
  periodName?: string; // e.g. "الثلاثي الأول" or month label for the session
}


export interface MealPlanDay {
  id: string;
  day: 'Lundi' | 'Mardi' | 'Mercredi' | 'Jeudi' | 'Vendredi' | 'Samedi'; // Revision D (remark M1): السبت added
  date: string;
  dishName: string;
  description: string;
  attendees: {
    studentId: string;
    isOneTime: boolean;
    paidUnit: boolean;
  }[];
}


// "Forfait ferme" (Case C): when the admin closes a month (end of month), the paid
// subscription balance not consumed by the student becomes center profit. The amounts
// are snapshotted at closure time so they stay frozen even if payments change later.
export interface MealForfaitClosureItem {
  studentId: string;
  studentName: string;
  netPaid: number;
  consumedSubscriptionMeals: number;
  fraisParRepas: number;
  amount: number;
}


export interface MealForfaitClosure {
  id: string;
  month: string;          // ex: 'Septembre'
  schoolYear: string;     // ex: '2026/2027'
  createdAt: string;      // ISO timestamp
  items: (MealForfaitClosureItem | null)[];
}


// A single "seance de revision" (one-time revision session with an external teacher).
// Unlike a course, it has no monthly fee / cycles / assurance — just 1 session.
export interface RevisionSeanceStudent {
  studentId: string;
  studentName: string;
  parentPhone: string;
  paidSeance: boolean;  // did this student pay for the revision seance
  present: boolean;     // attendance status
}


export interface RevisionSeance {
  id: string;
  schoolYear: string;   // ex: "2026/2027"
  trimester: string;    // ex: "Trimestre 1"
  gradeLevel: string;   // ex: "Baccalauréat"
  subject: string;      // ex: "Mathématiques"
  teacherName: string;
  teacherPhone: string;
  date: string;         // seance date
  teacherShare: number;
  centerShare: number;
  students: RevisionSeanceStudent[];
}


export interface FormationMatiere {
  id: string;
  subject: string;
}


export interface FormationStudent {
  id: string;
  studentName: string;
  parentPhone: string;
  isPack: boolean;
  enrolledMatiereIds: string[];
  amountPaid: number;
  totalRequired: number;
  remainingBalance: number;
  paymentMethod: 'espece' | 'cheque';
  chequeNumber?: string;
  chequeDate?: string;
  chequePaid?: boolean;
  discount: number;
  isAdvance: boolean;
  paidAt?: string;
  notes?: string;
  enrolledAt: string;
  // Refund (student quit the formation after paying)
  refundAmount?: number;
  refundedAt?: string;
  refundReason?: string;
}


export interface Formation {
  id: string;
  name: string;
  schoolYear: string;
  startDate: string;
  endDate: string;
  packPrice: number;
  matieres: FormationMatiere[];
  students: FormationStudent[];
  createdAt: string;
  // Target grade (المستوى الدراسي) and branch (الشعبة, only for grades > 2ème)
  grade?: string;
  branch?: string;
  // Weekly schedule of training sessions (seances), edited manually
  schedule?: FormationSeance[];
}


export interface FormationSeance {
  id: string;
  day: string;          // e.g. الأثنين
  startTime: string;    // e.g. 09:00
  endTime: string;      // e.g. 11:00
  matiere: string;      // subject name
  description?: string;
  // IDs of the students attending this seance. A student cannot attend two
  // overlapping seances on the same day.
  students?: string[];
}


export type StaffPayslip = PaySlip;


export type ExpenseCategory = 
  | 'Télécom' 
  | 'Eau (SONEDE)' 
  | 'Électricité (STEG)' 
  | 'CNSS' 
  | 'Produits d\'hygiène' 
  | 'Fournitures d\'entretien' 
  | 'Frais d\'examen' 
  | 'Assurance' 
  | 'Salaires (Personnel)' 
  | 'الكراء' 
  | 'المحاسبات' 
  | 'Autres';


export interface CenterExpense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  receiptRef: string;
}


/**
 * Generate the next sequential receipt number for a given prefix.
 * Scans all student payments across all students to find the highest
 * existing number for `prefix` and returns `prefix` + (max + 1), zero-padded to 3 digits.
 *
 * Example: generateReceiptNumber(students, 'REC-') → 'REC-001' (first ever)
 *          generateReceiptNumber(students, 'REM-') → 'REM-003'
 */
export function generateReceiptNumber(students: Student[], prefix: string): string {
  let max = 0;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}(\\d+)$`);
  for (const s of students) {
    for (const p of s.payments || []) {
      const match = p.receiptNumber.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}


// ─── Activités & Planning (module « activites ») ─────────────────────────

export type ActivityCategory = 'motricite' | 'art' | 'musique' | 'jeu';

/** Planned activity in a center's weekly calendar (module Activités & Planning). */
export interface Activity {
  id: string;
  /** Stampé côté serveur depuis la session — jamais pris du payload. */
  centerId?: string;
  title: string;
  category: ActivityCategory;
  /** 0–6 (Lun–Dim), requis quand `date` est absent ; ignoré si `date` présent. */
  weekday?: number;
  /** Date ISO unique (YYYY-MM-DD) — remplace `weekday` quand présent. */
  date?: string;
  timeStart: string; // HH:MM
  timeEnd: string;   // HH:MM (> timeStart)
  location?: string;
  /** Classe/niveau — clé de groupement optionnelle. */
  levelClass?: string;
  /** Référence optionnelle au staff encadrant ; référence pendante tolérée. */
  staffId?: string;
  createdAt?: string;
}

// ─── Compétences & Skills (module « competences ») ────────────────────────

export type SkillDomain = 'langage' | 'motricite' | 'social' | 'autonomie';

export type SkillLevel = 'non_evalue' | 'emergent' | 'en_cours' | 'acquis';

/** Catalog entry of observable skills, grouped by domain. */
export interface Skill {
  id: string;
  centerId?: string;
  domain: SkillDomain;
  label: string;
  /** Âge en mois, optionnel ; ageTo >= ageFrom quand les deux sont présents. */
  ageFrom?: number;
  ageTo?: number;
  createdAt?: string;
}

/** A child's assessed level on one skill (latest save wins per pair). */
export interface SkillEvaluation {
  id: string;
  centerId?: string;
  studentId: string;
  skillId: string;
  level: SkillLevel;
  /** Discriminateur : evaluatedByStaffId XOR evaluatedByName (jamais les deux). */
  evaluatedByStaffId?: string;
  evaluatedByName?: string;
  evaluatedAt: string; // ISO date
}


// ─── Demandes de renouvellement (migration 0033) ──────────────────────────
// Un centre demande soit le renouvellement de son offre actuelle (appliqué à
// la fin de la période en cours), soit un passage à une offre supérieure
// (Basic → Growth → Pro), appliqué dès l'acceptation par la plateforme.

export type RenewalRequestKind = 'renewal' | 'upgrade';

export type RenewalRequestStatus = 'pending' | 'approved' | 'rejected';


export interface RenewalRequest {
  id: string;
  centerId: string;
  centerName?: string;
  kind: RenewalRequestKind;
  currentPlan: string;
  /** Statut du centre au moment de la demande ('trial' | 'active' | …). */
  currentStatus: string;
  currentModules: string[];
  requestedPlan: string;
  requestedModules: string[];
  billingCycle: 'monthly' | 'annual';
  amount: number | null;
  status: RenewalRequestStatus;
  /** Date à laquelle la demande devrait prendre effet. */
  effectiveAt: number | null;
  note: string;
  decisionNote: string;
  decidedBy: string;
  decidedAt: number | null;
  createdAt: number;
  updatedAt: number;
}


/** Ligne de l'historique des plans d'un centre (table center_plan_history). */
export interface PlanHistoryEntry {
  id: string;
  action: string;
  details: string;
  amount: number | null;
  invoiceNumber: string | null;
  createdAt: number;
}


// ─── Événements & Sorties (الفعاليات والخرجات) ──────────────────────────────

export type EventCategory = 'trip' | 'party' | 'workshop' | 'other';

export type EventStatus = 'planned' | 'confirmed' | 'completed' | 'cancelled';

/** Qui participe à l'événement et à quel tarif. */
export type EventParticipantType = 'student' | 'parent' | 'sibling' | 'external';

export interface EventParticipant {
  id: string;                        // 'prt_' + crypto.randomUUID()
  participantName: string;
  participantType: EventParticipantType;
  /** Élève du centre auquel ce participant est rattaché (parent / fratrie). */
  linkedStudentId?: string;
  contactPhone: string;
  amountPaid: number;
  totalRequired: number;
  remainingBalance: number;
  /** Les événements n'acceptent que l'espèce et le chèque (pas de virement). */
  paymentMethod?: 'Espèces' | 'Chèque';
  chequeNumber?: string;
  chequeDate?: string;               // YYYY-MM-DD
  /** Réduction accordée sur le tarif du type de participant (dérive totalRequired). */
  discount?: number;
  /**
   * Chèque encaissé par le module Finance. Un participant payé par chèque
   * reste `paid: false` jusqu'à la validation du chèque côté Finance.
   */
  chequePaid?: boolean;
  paid: boolean;
  paidAt?: string;                   // ISO timestamp
  attended: boolean;
  notes?: string;
  receiptNumber?: string;            // 'REC-EVT-001'
}

/** Nommé SchoolEvent (et non Event) : `Event` est déjà pris par le DOM. */
export interface SchoolEvent {
  id: string;                        // 'evt_' + crypto.randomUUID()
  name: string;
  description?: string;
  category: EventCategory;
  date: string;                      // YYYY-MM-DD
  time?: string;                     // HH:MM
  location: string;
  priceStudent: number;
  priceParent: number;
  priceSibling: number;
  priceExternal: number;
  maxCapacity?: number;
  busIncluded: boolean;
  status: EventStatus;
  schoolYear: string;
  participants: EventParticipant[];
  createdAt: string;                 // ISO timestamp
}

/** Tarif applicable à un type de participant. */
export function eventPriceFor(evt: SchoolEvent, type: EventParticipantType): number {
  switch (type) {
    case 'student': return evt.priceStudent || 0;
    case 'parent': return evt.priceParent || 0;
    case 'sibling': return evt.priceSibling || 0;
    default: return evt.priceExternal || 0;
  }
}

/**
 * Prochain numéro de reçu d'événement, en scannant tous les participants de
 * tous les événements pour trouver le plus grand numéro `REC-EVT-` existant.
 * Les reçus d'événements ne vivent pas dans student.payments, donc
 * generateReceiptNumber() ne peut pas les voir.
 */
export function generateEventReceiptNumber(events: SchoolEvent[], prefix = 'REC-EVT-'): string {
  let max = 0;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}(\\d+)$`);
  for (const evt of events) {
    for (const p of evt.participants || []) {
      const match = (p.receiptNumber || '').match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
