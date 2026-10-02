import type { ModuleKey, CenterTenant, PlatformAdvertisement } from '../../types';
import type { StatusTone } from '../ui/StatusBadge';
import { getModuleCatalog, type ClientModuleEntry, type ClientCenterTypeEntry } from '../../utils/moduleCatalogStore';

const RENEWAL_STATUS_LABEL: Record<string, string> = {
  trial: 'تجربة', active: 'نشط', suspended: 'موقوف', expired: 'منتهٍ',
};

// ─── Constants ─────────────────────────────────────────────────────────────
// Base plan: Scolaire + Finance (priced) + Jd. Horaires (bundled, no tarif)

// The bundled (isUnbilled) module is identified via the DB flag, not a hardcoded key.

// ─── DB-driven catalog accessors ───────────────────────────────────────────
// The `modules` and `center_types` tables are the single source of truth.
// These helpers read the latest catalog snapshot fed by ModuleCatalogProvider
// (see src/utils/moduleCatalogStore.ts). Nothing here hardcodes a module key,
// a label or an eligibility list.

/** Every module in the DB catalog, hidden ones included. */
function catalogModules(): ClientModuleEntry[] {
  return getModuleCatalog().modules;
}

/** Center types from the DB ('other' sentinel already excluded server-side). */
function catalogCenterTypes(): ClientCenterTypeEntry[] {
  return getModuleCatalog().centerTypes;
}

/** Non-hidden modules — the selectable catalog. */
function selectableModules(): ClientModuleEntry[] {
  return catalogModules().filter(m => !m.isHidden);
}

/** Modules flagged isBasic (always attached to every centre). The platform
 *  admin edits this list from the Tarifs page (« أساسي » toggle). */
function basicModules(): ClientModuleEntry[] {
  return catalogModules().filter(m => m.isBasic);
}

/** Modules flagged isUnbilled (never priced) — exported for price sheets. */
export function unbilledModuleKeys(): Set<string> {
  return new Set(catalogModules().filter(m => m.isUnbilled).map(m => m.key));
}

function unbilledKeys(): Set<string> {
  return unbilledModuleKeys();
}

/** SELECTABLE_MODULE_KEYS — DB order, hidden modules excluded. */
export function SELECTABLE_MODULE_KEYS(): string[] {
  return selectableModules().map(m => m.key);
}

/** BASIC_MODULE_KEYS — the isBasic rows of the DB (base + bundled). */
export function BASIC_MODULE_KEYS(): string[] {
  return basicModules().map(m => m.key);
}

/** BASE_MODULE_KEYS — basic modules that are priced (isUnbilled=false). */
export function BASE_MODULE_KEYS(): string[] {
  return basicModules().filter(m => !m.isUnbilled).map(m => m.key);
}

/** ALL_MODULES — {key, labelAr, flags} triples of the whole DB catalog. */
export function ALL_MODULES(): Array<{ key: ModuleKey; label: string; isBasic: boolean; isUnbilled: boolean; isHidden: boolean }> {
  return catalogModules().map(m => ({ key: m.key as ModuleKey, label: m.labelAr, isBasic: m.isBasic, isUnbilled: m.isUnbilled, isHidden: m.isHidden }));
}

/** « Bibliothèque » et les modules retirés du catalogue : isModuleHidden les
 *  masque des sélections et de la page Tarifs — flag isHidden = 1 en DB. */
export function isModuleHidden(key: string): boolean {
  return !!catalogModules().find(m => m.key === key)?.isHidden;
}

const MODULE_LABEL = (key: string) => {
  const entry = catalogModules().find(m => m.key === key);
  return entry?.labelAr || key;
};

/** True when the key is flagged isBasic in the DB. */
export function isBaseModule(key: string): boolean {
  return basicModules().some(m => m.key === key);
}

/** A module may only be attached to a center whose type is marked eligible
 *  (center_type_modules). Empty allowedCenterTypes ⇒ universal. */
function isModuleAllowedForCenterType(key: string, centerType: CenterType | ''): boolean {
  if (isBaseModule(key)) return true;
  if (isModuleHidden(key)) return false; // removed from catalog
  if (!centerType) return true; // legacy/untyped centers stay permissive
  const entry = catalogModules().find(m => m.key === key);
  if (!entry) return false; // unknown module → never offer it
  return entry.allowedCenterTypes.length === 0 || entry.allowedCenterTypes.includes(centerType);
}

/** Base toujours incluse + modules du centre, dédupliqués (DB order). */
function normalizeCenterModules(modules?: string[] | null): string[] {
  return Array.from(new Set([
    ...BASIC_MODULE_KEYS(),
    ...(modules || []),
  ]));
}

export type PlatformAdminPage = 'overview' | 'centers' | 'requests' | 'finance' | 'pricing' | 'advertisements' | 'renewals';

interface PlatformAdminDashboardProps {
  /** Page courante — pilotée par le menu de l'application (App.tsx) */
  page?: PlatformAdminPage;
  /** Navigation interne (vers une autre page du menu) */
  onNavigate?: (page: PlatformAdminPage) => void;
}

/** requestedModules may arrive as a JSON string, comma list, or array */
function parseModules(rm?: string[] | string): string[] {
  if (!rm) return [];
  if (Array.isArray(rm)) return rm.filter(Boolean);
  try {
    const parsed = JSON.parse(rm);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch { /* not JSON */ }
  return String(rm).split(',').map(s => s.trim()).filter(Boolean);
}

/** School year like 2026/2027 (September based) */
function currentSchoolYear(): string {
  const d = new Date();
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${y + 1}`;
}

// ─── Labels & badges ───────────────────────────────────────────────────────
// Basic is stored as 'starter'; the database also accepts Growth, Pro, and Custom.
const PLAN_LABEL: Record<string, string> = {
  starter: 'الأساسية',
  basic: 'الأساسية',
  growth: 'النمو',
  pro: 'الاحترافية',
  custom: 'مخصصة'
};

const PLAN_BADGE: Record<string, StatusTone> = {
  starter: 'neutral', basic: 'neutral', growth: 'neutral', pro: 'brand', custom: 'brand'
};

// ─── Center types (DB-driven via /api/modules → center_types table) ────────
export type CenterType = 'creche' | 'jardin' | 'garderie' | 'formation';
export type CenterTypeFilter = 'all' | CenterType;

/** CENTER_TYPES — {key, labelAr, hint} from the DB, in DB order. */
function CENTER_TYPES(): Array<{ key: CenterType; label: string; hint: string }> {
  return catalogCenterTypes()
    .filter(ct => ct.key !== 'other')
    .map(ct => ({ key: ct.key as CenterType, label: ct.labelAr, hint: ct.hint }));
}

/** CENTER_TYPE_LABEL — key → Arabic label from the DB. */
function CENTER_TYPE_LABEL(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const ct of catalogCenterTypes()) map[ct.key] = ct.labelAr;
  return map;
}

/** Badge tone per center type — replaces per-screen color ternaries.
 *  Presentation only; keys come from the DB, tones are theme constants. */
const CENTER_TYPE_BADGE: Record<string, StatusTone> = {
  creche: 'warning',
  jardin: 'brand',
  garderie: 'info',
  formation: 'neutral',
};

/** Normalise le type d’établissement: strips diacritics, lowercases, trims.
 *  Known legacy fuzzy variants are mapped to their canonical key; other
 *  non-empty values pass through so new DB types work without a code change. */
function normalizeCenterType(raw?: string): CenterType | '' {
  const v = String(raw || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!v || v === 'other') return '';
  if (v.includes('creche')) return 'creche';
  if (v.includes('garderie')) return 'garderie';
  if (v.includes('jardin')) return 'jardin';
  if (v.includes('formation') || v.includes('centre de formation')) return 'formation';
  return v as CenterType;
}

/** Capitalise la première lettre de chaque mot : "ahmed ben-ali" → "Ahmed Ben-Ali" */
function titleCaseName(value?: string): string {
  return (value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(/([\s-])/)
    .map(p => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join('');
}

// Recherche insensible à la casse et aux accents (« école » trouve « École »).
function normalizeText(value?: string): string {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const STATUS_BADGE: Record<string, StatusTone> = {
  trial: 'brand', active: 'brand', suspended: 'neutral', expired: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  trial: 'تجربة', active: 'نشط', suspended: 'موقوف', expired: 'منتهٍ'
};

const REQ_STATUS_BADGE: Record<string, StatusTone> = {
  new: 'brand', contacted: 'brand', converted: 'brand', archived: 'neutral',
};

const REQ_STATUS_LABEL: Record<string, string> = {
  new: 'جديد', contacted: 'تم الاتصال', converted: 'محوَّل', archived: 'مؤرشف'
};

const REQ_TYPE_LABEL: Record<string, string> = {
  trial: 'تجربة مجانية', demo: 'عرض توضيحي', info: 'Infos'
};

function daysLeft(ts?: number | null): number | null {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / 86400000);
}

function normalizePhoneInput(value?: string): string {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 8);
}

function isValidCenterPhone(value: string): boolean {
  return /^[0-9]{8}$/.test(value);
}

const AUTOMATIC_PLAN_KEYS = ['basic', 'growth', 'pro'];

const ANNUAL_DISCOUNT = 0.2;

/** Sum of the enabled modules' prices. Unbilled modules (isUnbilled = 1 in
 *  the DB — the bundled time sheets, the retired Library) never count. */
function calculateModuleTotal(enabledModules: string[], modulePrices: Record<string, number>): number {
  const unbilled = unbilledKeys();
  return enabledModules.reduce((total, key) => (
    total + (unbilled.has(key) ? 0 : (Number(modulePrices[key]) || 0))
  ), 0);
}

function calculatePlanTariff(plan: string, billingCycle: 'monthly' | 'annual', enabledModules: string[], modulePrices: Record<string, number>, manualTariff = 0): number {
  if (plan === 'custom') return Math.max(0, Number(manualTariff) || 0);
  if (!AUTOMATIC_PLAN_KEYS.includes(plan)) return 0;
  const monthlyTotal = calculateModuleTotal(enabledModules, modulePrices);
  return billingCycle === 'annual' ? monthlyTotal * 12 * (1 - ANNUAL_DISCOUNT) : monthlyTotal;
}

function addSubscriptionPeriod(timestamp: number, billingCycle: 'monthly' | 'annual'): number {
  return timestamp + (billingCycle === 'annual' ? 365 : 30) * 86400000;
}

function formatTnd(value: number): string {
  return `${value.toLocaleString('ar-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;
}

/** Badge + label of an invoice status (a pending cheque gets its own badge). */
function invoiceStatusMeta(inv: { status: string; paymentMethod?: string | null }): { label: string; tone: StatusTone } {
  if (inv.status === 'pending' && inv.paymentMethod === 'cheque') {
    return { label: 'شيك قيد الانتظار', tone: 'brand' };
  }
  switch (inv.status) {
    case 'pending': return { label: 'قيد الانتظار', tone: 'warning' };
    case 'paid': return { label: 'مدفوعة', tone: 'brand' };
    case 'overdue': return { label: 'متأخرة', tone: 'error' };
    case 'cancelled': return { label: 'ملغاة', tone: 'neutral' };
    default: return { label: inv.status, tone: 'neutral' };
  }
}

function paymentMethodLabel(method?: string | null): string {
  if (method === 'cash') return 'نقدًا';
  if (method === 'cheque') return 'شيك';
  return method || '—';
}

function inferredSubscriptionStart(center: CenterTenant): number | null {
  if (center.status === 'trial') return null;
  if (center.trialEndsAt) return center.trialEndsAt;
  if (!center.subscriptionEndsAt) return null;
  const durationDays = center.billingCycle === 'annual' ? 365 : 30;
  return center.subscriptionEndsAt - durationDays * 86400000;
}

// ─── Segmented filter control (landing style) ──────────────────────────────
// ── Pagination (thème plateforme) ──────────────────────────────────────────
function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current - 1, current, current + 1].filter(p => p >= 1 && p <= total));
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of [...set].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

// ─── Edit Center Modal ──────────────────────────────────────────────────────
function centerDateInputValue(timestamp?: number | null): string {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '';
}

function centerDateTimestamp(value: string): number | null {
  if (!value) return null;
  const timestamp = new Date(`${value}T23:59:59`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

// Labels/badges for the per-center plan audit trail (center_plan_history).
const PLAN_HISTORY_LABEL: Record<string, { text: string; tone: StatusTone }> = {
  center_created: { text: 'إنشاء', tone: 'neutral' },
  plan_set: { text: 'تطبيق الباقة', tone: 'brand' },
  plan_activated: { text: 'تفعيل الاشتراك', tone: 'brand' },
  plan_renewed: { text: 'تجديد', tone: 'brand' },
  plan_settled: { text: 'تسوية', tone: 'brand' },
  plan_scheduled: { text: 'باقة مجدولة', tone: 'warning' },
  plan_applied: { text: 'تطبيق البرنامج', tone: 'brand' },
  schedule_cancelled: { text: 'إلغاء البرنامج', tone: 'neutral' },
  plan_removed: { text: 'إلغاء الاشتراك', tone: 'error' },
  trial_added: { text: 'أيام مقدمة', tone: 'brand' },
  renewal_approved: { text: 'قبول التجديد', tone: 'brand' },
  renewal_upgrade: { text: 'قبول تغيير الباقة', tone: 'brand' },
};

// Emplacements connus → libellés français (une valeur inconnue s'affiche telle quelle).
const AD_LOCATION_LABELS: Record<string, string> = {
  landing_page: 'الصفحة الرئيسية',
  center_admin: 'لوحة تحكم المراكز',
  both: 'الرئيسية + لوحات التحكم',
};

const adLocationLabel = (loc?: string) => (loc && AD_LOCATION_LABELS[loc]) || loc || '—';

type AdStatus = 'live' | 'draft' | 'scheduled' | 'paused' | 'expired';

function adStatusOf(ad: PlatformAdvertisement, now = Date.now()): AdStatus {
  if (!ad.isActive) return 'paused';
  const sod = new Date(now); sod.setHours(0, 0, 0, 0);
  const eod = new Date(now); eod.setHours(23, 59, 59, 999);
  if (ad.dateEnd < sod.getTime()) return 'expired';
  if (ad.dateStart > eod.getTime()) return 'scheduled';
  return ad.isPublished ? 'live' : 'draft';
}

const AD_STATUS_META: Record<AdStatus, { label: string; tone: StatusTone }> = {
  live: { label: 'متصل', tone: 'brand' },
  draft: { label: 'مسودة', tone: 'warning' },
  scheduled: { label: 'مجدولة', tone: 'brand' },
  paused: { label: 'متوقفة', tone: 'neutral' },
  expired: { label: 'منتهية', tone: 'error' },
};

const AD_STATUS_FILTERS: Array<{ value: 'all' | AdStatus; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'live', label: 'متصل' },
  { value: 'draft', label: 'مسودات' },
  { value: 'scheduled', label: 'مجدولة' },
  { value: 'paused', label: 'متوقفة' },
  { value: 'expired', label: 'منتهية' },
];

// ─── Advertisement create/edit modal ───────────────────────────────────────
// The platform dashboard's « إعلان جديد » / « تعديل » buttons open this form.
// One upload per file (same ImageKit path as the platform logo); at least one
// image and one center are required — same rules as the backend.
const AD_LOCATION_OPTIONS = [
  { value: 'landing_page', label: 'الصفحة الرئيسية (الواجهة)' },
  { value: 'center_admin', label: 'لوحة تحكم المراكز' },
  { value: 'both', label: 'الرئيسية + لوحات التحكم' },
  { value: '__custom__', label: 'موقع مخصص…' },
];

function adDateInput(ts: number): string {
  const d = new Date(ts || Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const PAGE_SIZE = 9; // Centres & Demandes : 9 cartes par page (3×3)

export {
  RENEWAL_STATUS_LABEL,
  PAGE_SIZE,
  MODULE_LABEL,
  normalizeCenterModules,
  parseModules,
  currentSchoolYear,
  PLAN_LABEL,
  PLAN_BADGE,
  CENTER_TYPES,
  CENTER_TYPE_LABEL,
  CENTER_TYPE_BADGE,
  normalizeCenterType,
  isModuleAllowedForCenterType,
  titleCaseName,
  normalizeText,
  STATUS_BADGE,
  STATUS_LABEL,
  REQ_STATUS_BADGE,
  REQ_STATUS_LABEL,
  REQ_TYPE_LABEL,
  daysLeft,
  normalizePhoneInput,
  isValidCenterPhone,
  AUTOMATIC_PLAN_KEYS,
  ANNUAL_DISCOUNT,
  calculateModuleTotal,
  calculatePlanTariff,
  addSubscriptionPeriod,
  formatTnd,
  invoiceStatusMeta,
  paymentMethodLabel,
  inferredSubscriptionStart,
  pageNumbers,
  centerDateInputValue,
  centerDateTimestamp,
  PLAN_HISTORY_LABEL,
  AD_LOCATION_LABELS,
  adLocationLabel,
  adStatusOf,
  AD_STATUS_META,
  AD_STATUS_FILTERS,
  AD_LOCATION_OPTIONS,
  adDateInput,
};

export type { PlatformAdminDashboardProps, AdStatus };
