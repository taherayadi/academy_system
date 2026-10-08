/// <reference types="@cloudflare/workers-types" />
import { isDeploymentRole } from './_deployment';

/**
 * Shared helpers for the Cloudflare Pages Functions.
 * Faithfully translated from server/data.ts (SQLite) to Cloudflare D1 (async).
 * All business logic, error messages, and data shapes preserved from production.
 */

export interface Env {
  DB: D1Database;
  /** ImageKit.io private API key — set via Cloudflare Pages env var / secret. */
  IMAGEKIT_PRIVATE_KEY?: string;
  // PubNub realtime keys — set via Cloudflare Pages → Settings → Environment
  // variables (Production AND Preview). All three are optional: when any of
  // them is missing the app silently falls back to polling (see _pubnub.ts).
  // NEVER store values in wrangler.toml [vars] (committed) — env bindings only.
  PUBNUB_PUBLISH_KEY?: string;
  PUBNUB_SUBSCRIBE_KEY?: string;
  PUBNUB_SECRET_KEY?: string;
}

// ---------------------------------------------------------------------------
// Primitive coercion helpers (identical to production data.ts)
// ---------------------------------------------------------------------------

function num(v: unknown): number { return typeof v === 'number' ? v : Number(v ?? 0) || 0; }
function bool(v: unknown): boolean { return !!v && v !== 0 && v !== '0' && v !== 'false'; }
function str(v: unknown): string { return typeof v === 'string' ? v : v == null ? '' : String(v); }
export function normalizePaymentService(service: unknown, month: unknown): string {
  const legacyService = str(service).replace(/\s+/g, ' ').trim();
  const isAnnual = str(month).startsWith('Annuel');
  if (legacyService === 'Inscription') return 'Inscription Suivi';
  if (legacyService === 'Bibliothèque' && isAnnual) return 'Inscription Bibliothèque';
  return legacyService;
}
function parseJson<T = any>(v: unknown, fallback: T): T {
  if (!v) return fallback;
  try { return JSON.parse(String(v)); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Default data (same as production)
// ---------------------------------------------------------------------------

const DEFAULT_SUBJECTS = [
  '\u0627\u0644\u0631\u064a\u0627\u0636\u064a\u0627\u062a (Math\u00e9matiques)',
  '\u0627\u0644\u0641\u064a\u0632\u064a\u0627\u0621 \u0648\u0627\u0644\u0643\u064a\u0645\u064a\u0627\u0621 (Physique-Chimie)',
  '\u0639\u0644\u0648\u0645 \u0627\u0644\u062d\u064a\u0627\u0629 \u0648\u0627\u0644\u0623\u0631\u0636 (SVT)',
  '\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 (Arabe)',
  '\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0641\u0631\u0646\u0633\u064a\u0629 (Fran\u00e7ais)',
  '\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629 (Anglais)',
  '\u0627\u0644\u0625\u0639\u0644\u0627\u0645\u064a\u0629 (Informatique)',
  '\u0627\u0644\u0641\u0644\u0633\u0641\u0629 (Philosophie)',
  '\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0648\u0627\u0644\u062c\u063a\u0631\u0627\u0641\u064a\u0627 (Histoire-G\u00e9o)',
  '\u0627\u0644\u0625\u0642\u062a\u0635\u0627\u062f \u0648\u0627\u0644\u062a\u0635\u0631\u0641 (\u00c9conomie-Gestion)'
];

const DEFAULT_ACADEMIC_YEARS = [
  '2022/2023', '2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'
];

function extractFeeValues(f: any): any {
  if (!f || typeof f !== 'object') {
    return { fraisAnnuelSuivi: 0, fraisMensuelSuivi: 0, fraisAnnuelBibliotheque: 0, fraisMensuelBibliotheque: 0, fraisAbonnementRepas: 0, fraisParRepas: 0, prixPlatTraiteur: 6, fraisAnnuelEtude: 0, fraisMensuelEtude: 0, fraisAssuranceCoursExternes: 0 };
  }
  const getNum = (camelKey: string, snakeKey: string, altKey?: string, fallback = 0): number => {
    if (f[camelKey] != null && f[camelKey] !== '') return Number(f[camelKey]) || 0;
    if (f[snakeKey] != null && f[snakeKey] !== '') return Number(f[snakeKey]) || 0;
    if (altKey && f[altKey] != null && f[altKey] !== '') return Number(f[altKey]) || 0;
    return fallback;
  };
  return {
    fraisAnnuelSuivi: getNum('fraisAnnuelSuivi', 'frais_annuel_suivi', 'suiviAnnualFee'),
    fraisMensuelSuivi: getNum('fraisMensuelSuivi', 'frais_mensuel_suivi', 'suiviMonthlyFee'),
    fraisAnnuelBibliotheque: getNum('fraisAnnuelBibliotheque', 'frais_annuel_bibliotheque', 'libraryAnnualFee'),
    fraisMensuelBibliotheque: getNum('fraisMensuelBibliotheque', 'frais_mensuel_bibliotheque', 'libraryMonthlyFee'),
    fraisAbonnementRepas: getNum('fraisAbonnementRepas', 'frais_abonnement_repas', 'mealMonthlyPrice'),
    fraisParRepas: getNum('fraisParRepas', 'frais_par_repas', 'mealUnitPrice'),
    prixPlatTraiteur: getNum('prixPlatTraiteur', 'prix_plat_traiteur', undefined, 6),
    fraisAnnuelEtude: getNum('fraisAnnuelEtude', 'frais_annuel_etude', 'etudeAnnualFee'),
    fraisMensuelEtude: getNum('fraisMensuelEtude', 'frais_mensuel_etude', 'etudeMonthlyFee'),
    fraisAssuranceCoursExternes: getNum('fraisAssuranceCoursExternes', 'frais_assurance_cours_externes', 'assuranceFee')
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

export async function readBody<T = any>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new Error('Corps de requ\u00eate invalide.');
  }
}

// ---------------------------------------------------------------------------
// Password hashing (bcrypt)
// ---------------------------------------------------------------------------

import * as bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Client IP
// ---------------------------------------------------------------------------

export function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (cfIp) return cfIp;
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// HTTPS detection
// ---------------------------------------------------------------------------

export function isHttpsRequest(request: Request): boolean {
  if (new URL(request.url).protocol === 'https:') return true;
  if (request.headers.get('x-forwarded-proto') === 'https') return true;
  const cfVisitor = request.headers.get('cf-visitor');
  if (cfVisitor && cfVisitor.includes('https')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Rate limiting (D1-backed, per IP)
// ---------------------------------------------------------------------------

export const AUTH_RATE_LIMIT = 10;
export const AUTH_RATE_WINDOW_MS = 60_000;

let rateLimitTableReady = false;
async function ensureRateLimitTable(db: D1Database): Promise<void> {
  if (rateLimitTableReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)').run();
  rateLimitTableReady = true;
}

export async function consumeAuthRateLimit(
  db: D1Database,
  request: Request,
  prefix = 'center:auth',
  maxLimit = AUTH_RATE_LIMIT,
  windowMs = AUTH_RATE_WINDOW_MS
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  await ensureRateLimitTable(db);
  const ip = getClientIp(request);
  const key = prefix + ':' + ip;
  const now = Date.now();
  const row = await db.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?').bind(key).first<{ count: number; window_start: number }>();
  if (!row || (now - row.window_start >= windowMs)) {
    await db.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = ?').bind(key, now, now).run();
    return { allowed: true };
  }
  if (row.count >= maxLimit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000)) };
  }
  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return { allowed: true };
}

export async function resetAuthRateLimit(db: D1Database, request: Request): Promise<void> {
  await ensureRateLimitTable(db);
  const ip = getClientIp(request);
  await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind('center:auth:' + ip).run();
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export const DEFAULT_CENTER_ID = 'e1000000-0000-4000-8000-000000000001';
const SESSION_COOKIE = 'tc_center_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

// Sessions : table `auth_sessions` (token_hash SHA-256 + user_id) — le token
// brut ne vit JAMAIS en base, seul son hash y est stocké.
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getSessionToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookieHeader = request.headers.get('Cookie') ?? request.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    if (name === SESSION_COOKIE) {
      const val = part.slice(eqIdx + 1).trim();
      try { return val ? decodeURIComponent(val) : null; } catch { return null; }
    }
  }
  return null;
}

export async function createSession(db: D1Database, email: string, centerId: string = DEFAULT_CENTER_ID): Promise<string> {
  const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<any>();
  if (!user) throw new Error('Utilisateur introuvable.');
  const token = crypto.randomUUID();
  const now = Date.now();
  await db.prepare('INSERT INTO auth_sessions (token_hash, user_id, center_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await hashToken(token), user.id, centerId, now, now + SESSION_DURATION_MS).run();
  return token;
}

export type CenterAccessState = 'trial_expired' | 'subscription_expired' | 'suspended' | 'expired';

/** Returns the lifecycle reason that prevents a center administrator from using the app. */
export function getCenterAccessState(center: any, now = Date.now()): CenterAccessState | null {
  if (!center) return null;
  if (center.status === 'suspended') return 'suspended';
  if (center.status === 'expired') return 'expired';

  if (center.status === 'trial') {
    const trialEndsAt = Number(center.trial_ends_at) || 0;
    return trialEndsAt > 0 && trialEndsAt <= now ? 'trial_expired' : null;
  }

  const subscriptionEndsAt = Number(center.subscription_ends_at) || 0;
  return subscriptionEndsAt > 0 && subscriptionEndsAt <= now ? 'subscription_expired' : null;
}

export async function validateSession(db: D1Database, request: Request): Promise<{ email: string; token: string; centerId: string; role?: string } | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  const row = await db.prepare(
    'SELECT u.email, u.role, s.center_id FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND s.center_id IS u.center_id'
  )
    .bind(await hashToken(token), Date.now())
    .first<{ email: string; role?: string; center_id: string | null }>();
  if (!row || !isDeploymentRole(row.role) || !row.center_id) return null;

  const center = await db.prepare('SELECT status, trial_ends_at, subscription_ends_at FROM centers WHERE id = ?')
    .bind(row.center_id).first<any>();
  if (!center || getCenterAccessState(center)) return null;

  return { email: row.email, token, centerId: row.center_id, role: row.role };
}

export function getContextCenterId(context: any): string {
  const session = context?.data?.session;
  if (!session?.centerId || !isDeploymentRole(session.role)) throw new Error('Missing center context');
  return session.centerId;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
}

export async function purgeExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').bind(Date.now()).run();
}

export function makeSessionCookie(token: string, request: Request): string {
  const secure = isHttpsRequest(request) ? '; Secure' : '';
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  return SESSION_COOKIE + '=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge + secure;
}

export function clearSessionCookie(request: Request): string {
  const secure = isHttpsRequest(request) ? '; Secure' : '';
  return SESSION_COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secure;
}

// ---------------------------------------------------------------------------
// Role enforcement
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// AppState interface
// ---------------------------------------------------------------------------

export interface AppState {
  settings: any;
  students: any[];
  staff: any[];
  slots: any[];
  courses: any[];
  sessions: any[];
  mealPlans: any[];
  expenses: any[];
  timesheets: any[];
  externalStudents: any[];
  revisionSeances: any[];
  studentTimeSheets: any[];
  formations: any[];
  mealForfaitClosures: any[];
  events: any[];
}

// ===========================================================================
// SETTINGS (nouveau schéma)
//  - center_settings (center_id, center_name, phone_number, location_city, currency, updated_at)
//  - center_service_prices (center_id, school_year, service_key, billing_period, valid_from, price, traiteur_share)
//  - subjects (center_id, name) — center_id '' = catalogue global de départ
//  - center_meal_mode_history — dernière ligne = mode cantine courant (lecture seule ici)
// ===========================================================================

// Mapping ancien champ CenterFeeSet → (service_key, billing_period) — sert
// uniquement à absorber les anciens payloads fees/feesByYear (import legacy).
// Vocabulaire billing_period = celui de la DB : CHECK IN ('month','unit','year').
const LEGACY_FEE_SERVICE_MAP: Record<string, { serviceKey: string; period: string }> = {
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

export async function readSettings(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any> {
  const [settingsRow, priceRows, subjectRows, etablissementRows, mealModeRow] = await Promise.all([
    db.prepare('SELECT * FROM center_settings WHERE center_id = ?').bind(centerId).first<any>(),
    db.prepare('SELECT school_year, service_key, billing_period, price FROM center_service_prices WHERE center_id = ?').bind(centerId).all(),
    db.prepare("SELECT name FROM subjects WHERE center_id = ? OR center_id = ''").bind(centerId).all(),
    db.prepare('SELECT name FROM etablissements WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT mode FROM center_meal_mode_history WHERE center_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').bind(centerId).first<any>()
  ]);

  const servicePrices: Record<string, Record<string, number>> = {};
  (priceRows.results || []).forEach((r: any) => {
    const year = str(r.school_year) || 'DEFAULT';
    const key = `${str(r.service_key)}:${str(r.billing_period)}`;
    const v = Number(r.price);
    if (!Number.isFinite(v)) return;
    (servicePrices[year] = servicePrices[year] || {})[key] = v;
  });

  const subjects = (subjectRows.results || []).map((r: any) => str(r.name)).filter(Boolean);
  const etablissements = (etablissementRows.results || []).map((r: any) => str(r.name)).filter(Boolean);

  return {
    centerName: settingsRow?.center_name || 'المركز',
    phoneNumber: settingsRow?.phone_number || '',
    locationCity: settingsRow?.location_city || '',
    currency: settingsRow?.currency || 'TND',
    servicePrices,
    ...(mealModeRow?.mode ? { mealOperatingMode: str(mealModeRow.mode) } : {}),
    subjects,
    etablissements
  };
}

export async function writeSettings(db: D1Database, settings: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  if (!settings || typeof settings !== 'object') return;
  const stmts: D1PreparedStatement[] = [];

  stmts.push(db.prepare(
    'INSERT INTO center_settings (center_id, center_name, phone_number, location_city, currency, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(center_id) DO UPDATE SET center_name = excluded.center_name, phone_number = excluded.phone_number, location_city = excluded.location_city, currency = excluded.currency, updated_at = excluded.updated_at'
  ).bind(
    centerId,
    str(settings.centerName || settings.center_name || 'المركز'),
    str(settings.phoneNumber || settings.phone_number || ''),
    str(settings.locationCity || settings.location_city || ''),
    str(settings.currency || 'TND'),
    Date.now()
  ));

  // Tarifs par service/année → center_service_prices. Le mode cantine n'est
  // PAS écrit ici : il appartient à la plateforme via center_meal_mode_history.
  const sp: Record<string, Record<string, number>> = (settings.servicePrices && typeof settings.servicePrices === 'object')
    ? JSON.parse(JSON.stringify(settings.servicePrices))
    : {};

  // Ancien payload fees/feesByYear (import legacy) → fusionné dans servicePrices.
  const legacyYears: Record<string, any> = {};
  if (settings.feesByYear && typeof settings.feesByYear === 'object') {
    for (const [year, fees] of Object.entries(settings.feesByYear)) legacyYears[year] = fees;
  }
  if (settings.fees && typeof settings.fees === 'object') {
    legacyYears['DEFAULT'] = { ...(legacyYears['DEFAULT'] || {}), ...settings.fees };
  } else if (settings.fraisAnnuelSuivi != null || settings.frais_annuel_suivi != null) {
    legacyYears['DEFAULT'] = settings;
  }
  for (const [year, rawFees] of Object.entries(legacyYears)) {
    if (!year || !rawFees || typeof rawFees !== 'object') continue;
    const feeSet = extractFeeValues(rawFees);
    for (const [field, map] of Object.entries(LEGACY_FEE_SERVICE_MAP)) {
      let v: unknown = (feeSet as any)[field];
      if (v == null) v = (rawFees as any)[field];
      if (v == null) continue;
      const key = `${map.serviceKey}:${map.period}`;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      // 0 = valeur par défaut legacy : ne l'écrit que si aucune vraie valeur n'existe déjà.
      if (n === 0 && field !== 'prixPlatTraiteur' && sp[year]?.[key] != null) continue;
      // prixPlatTraiteur (défaut d'affichage) ne doit jamais écraser un vrai
      // prix unitaire repas — la DB ne porte qu'UN prix lunch:unit.
      if (field === 'prixPlatTraiteur' && sp[year]?.[key] != null) continue;
      sp[year] = { ...(sp[year] || {}), [key]: n };
    }
  }

  stmts.push(db.prepare('DELETE FROM center_service_prices WHERE center_id = ?').bind(centerId));
  const today = new Date().toISOString().slice(0, 10);
  for (const [year, prices] of Object.entries(sp)) {
    if (!year || !prices || typeof prices !== 'object') continue;
    for (const [key, value] of Object.entries(prices as Record<string, unknown>)) {
      const sep = key.lastIndexOf(':');
      if (sep === -1) continue;
      const serviceKey = key.slice(0, sep);
      const period = key.slice(sep + 1);
      const n = Number(value);
      if (!serviceKey || !period || !Number.isFinite(n)) continue;
      // Garde-fou : la DB CHECK exige billing_period IN ('month','unit','year').
      // Une clé inconnue (ex. ancien pseudo-période 'traiteur' ou 'annual')
      // est ignorée au lieu de faire échouer tout le PUT /api/settings.
      if (!['month', 'unit', 'year'].includes(period)) continue;
      stmts.push(db.prepare(
        'INSERT INTO center_service_prices (center_id, school_year, service_key, billing_period, valid_from, price, traiteur_share) VALUES (?, ?, ?, ?, ?, ?, NULL)'
      ).bind(centerId, year, serviceKey, period, today, n));
    }
  }

  // Matières : UPSERT par centre — ne détruit ni le catalogue global ('')
  // ni les listes des autres centres.
  const subjectsToSave = Array.isArray(settings.subjects) && settings.subjects.length > 0
    ? Array.from(new Set(settings.subjects.map((s: any) => str(s).trim()).filter(Boolean)))
    : [];
  for (const s of subjectsToSave) {
    stmts.push(db.prepare('INSERT OR IGNORE INTO subjects (center_id, name) VALUES (?, ?)').bind(centerId, s));
  }

  // Établissements : table par centre (id, center_id, name), UNIQUE(center_id, name).
  const etabsToSave = Array.isArray(settings.etablissements) && settings.etablissements.length > 0
    ? Array.from(new Set(settings.etablissements.map((s: any) => str(s).trim()).filter(Boolean)))
    : [];
  for (const e of etabsToSave) {
    stmts.push(db.prepare('INSERT OR IGNORE INTO etablissements (id, center_id, name) VALUES (?, ?, ?)').bind(crypto.randomUUID(), centerId, e));
  }

  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// STUDENTS
// ===========================================================================

function buildSuiviNotes(rows: any[]): any[] {
  const byYear: Record<string, any> = {};
  rows.forEach(r => {
    if (!byYear[r.schoolYear]) byYear[r.schoolYear] = { schoolYear: r.schoolYear, trimesters: [] };
    const year = byYear[r.schoolYear];
    let tr = year.trimesters.find((t: any) => t.trimester === r.trimester);
    if (!tr) { tr = { trimester: r.trimester, subjects: {} }; year.trimesters.push(tr); }
    tr.subjects[r.subjectName ?? r.subject_id] = { devoir1: r.devoir1 == null ? undefined : r.devoir1, devoir2: r.devoir2 == null ? undefined : r.devoir2, synthese: r.synthese == null ? undefined : r.synthese };
  });
  return Object.values(byYear);
}

// ─── Helpers nouveau schéma (élèves normalisés) ────────────────────────────

// Année scolaire courante (rentrée en juillet) — ex: '2026/2027'.
function currentAcademicYear(now = new Date()): string {
  const y = now.getFullYear();
  return now.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

function schoolYearStart(schoolYear: string): string {
  const start = String(schoolYear).split('/')[0];
  return /^\d{4}$/.test(start) ? `${start}-09-01` : '2026-09-01';
}

// service_key → libellé affiché (table services côté plateforme). Le libellé
// « Inscription X » correspond au paiement annuel (billing_period='year').
const SERVICE_KEY_LABELS: Record<string, string> = {
  suivi: 'Suivi',
  etude: 'Étude',
  bibliotheque: 'Bibliothèque',
  lunch: 'Repas',
  gouter_matin: 'Goûter',
  gouter_apres_midi: 'Goûter',
  gouter_both: 'Goûter',
  assurance_externe: 'Assurance',
  external_course: 'Cours Particuliers',
  formation: 'Formation',
  revision: 'Revision',
  event: 'Événements'
};

function paymentServiceLabel(serviceKey: string, billingPeriod: string): string {
  const base = SERVICE_KEY_LABELS[str(serviceKey)] || str(serviceKey) || 'Autres';
  if (billingPeriod === 'year') {
    if (base === 'Suivi') return 'Inscription Suivi';
    if (base === 'Étude') return 'Inscription Étude';
    if (base === 'Bibliothèque') return 'Inscription Bibliothèque';
  }
  return base;
}

// Libellé affiché → (service_key, billing_period) à l'écriture.
const SERVICE_LABEL_KEYS: Record<string, { serviceKey: string; period: string }> = {
  'Suivi': { serviceKey: 'suivi', period: 'month' },
  'Inscription Suivi': { serviceKey: 'suivi', period: 'year' },
  'Étude': { serviceKey: 'etude', period: 'month' },
  'Inscription Étude': { serviceKey: 'etude', period: 'year' },
  'Bibliothèque': { serviceKey: 'bibliotheque', period: 'month' },
  'Inscription Bibliothèque': { serviceKey: 'bibliotheque', period: 'year' },
  'Repas': { serviceKey: 'lunch', period: 'unit' },
  'Goûter': { serviceKey: 'gouter_matin', period: 'unit' },
  'Assurance': { serviceKey: 'assurance_externe', period: 'year' },
  'Cours Particuliers': { serviceKey: 'external_course', period: 'unit' },
  'Revision': { serviceKey: 'revision', period: 'unit' },
  'Formation': { serviceKey: 'formation', period: 'unit' },
  'Événements': { serviceKey: 'event', period: 'unit' },
  'Autres': { serviceKey: 'autre', period: 'unit' }
};

// ─── Enum bridging: UI display labels ↔ DB STRICT CHECK values ─────────
// payments.method CHECK IN ('cash','cheque','transfer','card') and
// payments.payment_type CHECK IN ('full','partial','balance','advance')
// are violated by the client's French labels ('Espèces', 'Chèque'…).
// Normalizing here keeps every writer (POST /api/payments, PUT]
// /api/students legacy full-student writes) inside the schema.
export function paymentMethodKey(method: unknown): string {
  const m = str(method).trim().toLowerCase();
  if (m === 'chèque' || m === 'cheque' || m === 'par chèque') return 'cheque';
  if (m === 'virement') return 'transfer';
  if (m === 'carte') return 'card';
  if (m === 'cash' || m === 'espèces' || m === 'especes') return 'cash';
  return 'cash'; // 'Espèces' est la valeur par défaut de toute l'UI
}

// Sens inverse, à la LECTURE : la clé brute ('cash') n'a aucun sens pour le
// centre. Tout le front (filtres « p.method === 'Chèque' », groupement des
// chèques, colonnes « طريقة الخلاص ») compare des libellés d'affichage —
// on livre donc des libellés, comme l'ancien modèle.
export function paymentMethodLabelKey(method: unknown): string {
  const m = str(method).trim().toLowerCase();
  if (m === 'cheque') return 'Chèque';
  if (m === 'transfer') return 'Virement';
  if (m === 'card') return 'Carte';
  if (m === 'cash' || m === 'espèces' || m === 'especes') return 'Espèces';
  return str(method) || 'Espèces';
}

export function paymentTypeKey(type: unknown): string {
  const t = str(type).trim();
  return ['full', 'partial', 'balance', 'advance'].includes(t) ? t : 'full';
}

function paymentServiceKey(serviceLabel: unknown, month: unknown): { serviceKey: string; period: string } {
  const label = str(serviceLabel).replace(/\s+/g, ' ').trim();
  const isAnnual = str(month).startsWith('Annuel');
  if (label === 'Inscription') return SERVICE_LABEL_KEYS['Inscription Suivi'];
  const mapped = SERVICE_LABEL_KEYS[label] || { serviceKey: 'autre', period: 'unit' };
  // Anciens paiements « Bibliothèque » sur un mois « Annuel … » → inscription.
  if (isAnnual && mapped.serviceKey === 'bibliotheque' && label === 'Bibliothèque') return SERVICE_LABEL_KEYS['Inscription Bibliothèque'];
  return mapped;
}

export async function readStudents(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [studentsRows, parentsRows, siblingsRows, authRows, histRows, yearRows, enrollRows, paymentRows, mealRows, notesRows] = await Promise.all([
    db.prepare('SELECT * FROM students WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT p.* FROM student_parents p JOIN students s ON p.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT sib.* FROM siblings sib JOIN students s ON sib.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT a.* FROM authorized_persons a JOIN students s ON a.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT h.* FROM academic_history h JOIN students s ON h.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT y.*, e.name AS etablissement_name FROM student_years y LEFT JOIN etablissements e ON e.id = y.etablissement_id JOIN students s ON y.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT se.* FROM student_service_enrollments se JOIN students s ON se.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT pay.* FROM payments pay JOIN students s ON pay.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT m.* FROM meal_attendances m JOIN students s ON m.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT n.*, sub.name AS subject_name FROM suivi_notes n JOIN students s ON n.student_id = s.id LEFT JOIN subjects sub ON sub.id = n.subject_id WHERE s.center_id = ?').bind(centerId).all()
  ]);
  const parentsByStudent: Record<string, any> = {};
  parentsRows.results.forEach((r: any) => { const key = str(r.student_id); if (!parentsByStudent[key]) parentsByStudent[key] = {}; parentsByStudent[key][r.role] = { name: str(r.name), birthDate: str(r.birth_date), profession: str(r.profession), address: str(r.address), phoneFixed: str(r.phone_fixed), phoneMobile: str(r.phone_mobile), email: str(r.email), extraPhones: parseJson(r.extra_phones, undefined) }; });
  const siblingsByStudent: Record<string, any[]> = {};
  siblingsRows.results.forEach((r: any) => { (siblingsByStudent[str(r.student_id)] = siblingsByStudent[str(r.student_id)] || []).push({ id: str(r.id), name: str(r.name), age: num(r.age), grade: str(r.grade) }); });
  const authByStudent: Record<string, any[]> = {};
  authRows.results.forEach((r: any) => { (authByStudent[str(r.student_id)] = authByStudent[str(r.student_id)] || []).push({ id: str(r.id), name: str(r.name), phone: str(r.phone), relation: str(r.relation) }); });
  const histByStudent: Record<string, any> = {};
  histRows.results.forEach((r: any) => { const key = str(r.student_id); if (!histByStudent[key]) histByStudent[key] = {}; histByStudent[key]['nMinus' + num(r.n_minus)] = { school: str(r.school), grade: str(r.grade) }; });

  // Année scolaire courante de chaque élève = dernière ligne de student_years.
  const yearByStudent: Record<string, any> = {};
  yearRows.results.forEach((r: any) => {
    const key = str(r.student_id);
    const cur = yearByStudent[key];
    if (!cur || String(r.school_year) > String(cur.school_year)) yearByStudent[key] = r;
  });

  // Inscriptions aux services (année courante de l'élève seulement).
  const enrollByStudent: Record<string, any[]> = {};
  enrollRows.results.forEach((r: any) => {
    const key = str(r.student_id);
    const yr = yearByStudent[key];
    if (yr && str(r.school_year) !== str(yr.school_year)) return;
    (enrollByStudent[key] = enrollByStudent[key] || []).push(r);
  });

  const paymentsByStudent: Record<string, any[]> = {};
  paymentRows.results.forEach((r: any) => {
    const key = str(r.student_id);
    const billingPeriod = str(r.billing_period);
    const amount = num(r.amount);
    const totalRequired = num(r.total_required);
    const discount = r.discount == null ? 0 : num(r.discount);
    const isRefund = bool(r.is_refund);
    // Refunds reconstruits depuis montant positif + is_refund : l'affichage client
    // attend un montantPaid négatif (sémantique d'historique).
    const displayAmount = isRefund ? -Math.abs(amount) : amount;
    (paymentsByStudent[key] = paymentsByStudent[key] || []).push({
      id: str(r.id), date: str(r.date),
      amountPaid: displayAmount, totalRequired,
      remainingBalance: Math.max(0, totalRequired - Math.abs(amount)),
      service: paymentServiceLabel(r.service_key, billingPeriod),
      serviceKey: str(r.service_key), billingPeriod,
      schoolYear: r.school_year == null ? undefined : str(r.school_year),
      // period_month ('YYYY-MM') → libellé d'affichage ; même format que le client
      // ('Septembre (2026/2027)') pour que getStudentMonthStatus() (égalité sur
      // p.month) et les filtres par année retrouvent les paiements après reload.
      month: r.period_month == null
        ? (billingPeriod === 'year' ? `Annuel (${str(r.school_year)})` : '')
        : (monthLabelFromKey(str(r.period_month))
            ? `${monthLabelFromKey(str(r.period_month))} (${str(r.school_year)})`
            : str(r.period_month)),
      paymentType: str(r.payment_type), method: paymentMethodLabelKey(r.method),
      receiptNumber: str(r.receipt_number),
      notes: r.notes == null ? undefined : str(r.notes),
      discount: discount || undefined,
      refund: bool(r.is_refund) || undefined,
      refundOf: r.refund_of == null ? undefined : str(r.refund_of),
      refType: r.ref_type == null ? undefined : str(r.ref_type),
      refId: r.ref_id == null ? undefined : str(r.ref_id),
      chequeNumber: r.cheque_number == null ? undefined : str(r.cheque_number),
      chequeDate: r.cheque_date == null ? undefined : str(r.cheque_date),
      chequePaid: r.cheque_paid ? true : undefined
    });
  });

  const mealsByStudent: Record<string, any[]> = {};
  mealRows.results.forEach((r: any) => {
    const status = str(r.status);
    (mealsByStudent[str(r.student_id)] = mealsByStudent[str(r.student_id)] || []).push({
      date: str(r.date),
      service: str(r.service_key) || 'lunch',
      type: str(r.billing_mode) === 'unit' ? 'unit' : 'subscription',
      paid: status === 'paid' || status === 'covered_by_subscription',
      paidAt: r.created_at == null ? undefined : new Date(num(r.created_at)).toISOString().slice(0, 10),
      traiteurPrice: r.unit_price == null ? undefined : num(r.unit_price)
    });
  });

  const notesByStudent: Record<string, any[]> = {};
  notesRows.results.forEach((r: any) => { (notesByStudent[str(r.student_id)] = notesByStudent[str(r.student_id)] || []).push({ schoolYear: str(r.school_year), trimester: num(r.trimester), subject: str(r.subject), devoir1: r.devoir1 == null ? undefined : num(r.devoir1), devoir2: r.devoir2 == null ? undefined : num(r.devoir2), synthese: r.synthese == null ? undefined : num(r.synthese) }); });

  const enrolledFromRows = (rows: any[], serviceKey: string): any => rows.find((r: any) => str(r.service_key) === serviceKey);

  return studentsRows.results.map((r: any) => {
    const id = str(r.id);
    const yr = yearByStudent[id];
    const schoolYear = yr ? str(yr.school_year) : currentAcademicYear();
    const enrolls = enrollByStudent[id] || [];

    const suiviRow = enrolledFromRows(enrolls, 'suivi');
    const etudeRow = enrolledFromRows(enrolls, 'etude');
    const libraryRow = enrolledFromRows(enrolls, 'bibliotheque');
    const lunchRow = enrolledFromRows(enrolls, 'lunch');
    const matinRow = enrolledFromRows(enrolls, 'gouter_matin');
    const soirRow = enrolledFromRows(enrolls, 'gouter_apres_midi');
    const lunchSubscription = lunchRow && str(lunchRow.billing_mode) === 'subscription';
    const attended = mealsByStudent[id] || [];
    const consumedSubscription = attended.filter(a => a.type === 'subscription' && a.service === 'lunch').length;

    return {
      id, firstName: str(r.first_name), lastName: str(r.last_name), birthDate: str(r.birth_date), birthPlace: str(r.birth_place),
      grade: yr ? str(yr.grade) : '',
      etablissement: yr?.etablissement_name == null ? undefined : str(yr.etablissement_name),
      academicYear: schoolYear,
      mother: parentsByStudent[id]?.mother ?? { name: '', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '', email: '' },
      father: parentsByStudent[id]?.father ?? { name: '', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '', email: '' },
      parentalSituation: str(r.parental_situation), parentalComments: r.parental_comments == null ? undefined : str(r.parental_comments),
      siblings: siblingsByStudent[id] || [], authorizedPersons: authByStudent[id] || [], allergies: str(r.allergies),
      academicHistory: { nMinus1: histByStudent[id]?.nMinus1 ?? { school: '', grade: '' }, nMinus2: histByStudent[id]?.nMinus2 ?? { school: '', grade: '' }, nMinus3: histByStudent[id]?.nMinus3 ?? { school: '', grade: '' } },
      registration: { date: str(r.registration_date), location: str(r.registration_location), signedElectronically: bool(r.registration_signed_electronically), signatureName: r.registration_signature_name == null ? undefined : str(r.registration_signature_name) },
      enrolledServices: {
        suivi: !!suiviRow,
        etude: !!etudeRow,
        library: !!libraryRow,
        meals: !!lunchRow,
        gouterMatin: !!matinRow,
        gouterSoir: !!soirRow,
        gouterBoth: !!matinRow && !!soirRow
      },
      suiviFees: {
        annualRegistrationFee: suiviRow?.annual_price != null ? num(suiviRow.annual_price) : 0,
        monthlyFee: suiviRow?.monthly_price != null ? num(suiviRow.monthly_price) : 0
      },
      etudeFees: {
        annualRegistrationFee: etudeRow?.annual_price != null ? num(etudeRow.annual_price) : 0,
        monthlyFee: etudeRow?.monthly_price != null ? num(etudeRow.monthly_price) : 0
      },
      libraryFees: {
        annualRegistrationFee: libraryRow?.annual_price != null ? num(libraryRow.annual_price) : 0,
        monthlyFee: libraryRow?.monthly_price != null ? num(libraryRow.monthly_price) : 0
      },
      mealSubscription: {
        mode: lunchRow && str(lunchRow.billing_mode) === 'unit' ? 'unit' : 'subscription',
        monthlyPrice: lunchRow?.monthly_price != null ? num(lunchRow.monthly_price) : 0,
        unitPrice: lunchRow?.unit_price != null ? num(lunchRow.unit_price) : 0,
        prepaidMeals: 0,
        consumedMealsCount: consumedSubscription,
        active: !!lunchRow
      },
      mealAttendances: attended, payments: paymentsByStudent[id] || [], suiviNotes: buildSuiviNotes((notesByStudent[id] || []).map((r: any) => ({ ...r, schoolYear: r.school_year ?? r.schoolYear, trimester: r.trimester, subjectName: r.subject_name }))),
      timeSheetId: yr?.time_sheet_id == null ? undefined : str(yr.time_sheet_id),
      _schoolYear: schoolYear
    };
  });
}

async function resolveEtablissementIds(db: D1Database, centerId: string, names: string[]): Promise<Record<string, string | null>> {
  const map: Record<string, string | null> = {};
  const clean = Array.from(new Set(names.map(n => str(n).trim()).filter(Boolean)));
  for (const n of clean) {
    await db.prepare('INSERT OR IGNORE INTO etablissements (id, center_id, name) VALUES (?, ?, ?)').bind(crypto.randomUUID(), centerId, n).run();
  }
  if (clean.length > 0) {
    const rows = await db.prepare(`SELECT name, id FROM etablissements WHERE center_id = ? AND name IN (${clean.map(() => '?').join(',')})`).bind(centerId, ...clean).all();
    (rows.results || []).forEach((r: any) => { map[str(r.name)] = str(r.id); });
  }
  for (const n of clean) map[n] = map[n] || null;
  return map;
}

// ─── Subjects : catalogue par centre avec UUID serveur ──────────────────────
// La table subjects porte un id UUID (migration 0002) : les matières sont
// référencées par subject_id dans suivi_notes, external_courses,
// revision_seances, staff_subjects et formation_matieres. L'ajout passe par
// POST /api/subjects — plus par le modèle settings/élève.

const DEFAULT_SUBJECT_NAMES = [
  'الرياضيات (Mathématiques)', 'الفيزياء والكيمياء (Physique-Chimie)',
  'علوم الحياة والأرض (SVT)', 'اللغة العربية (Arabe)',
  'اللغة الفرنسية (Français)', 'اللغة الإنجليزية (Anglais)',
  'الإعلامية (Informatique)', 'الفلسفة (Philosophie)',
  'التاريخ والجغرافيا (Histoire-Géo)', 'الإقتصاد والتصرف (Économie-Gestion)'
];

/**
 * Au login (et au premier GET /api/subjects) : si le centre n'a AUCUNE
 * matière, on lui insère le catalogue de départ. Chaque centre obtient ses
 * propres lignes (center_id) avec des UUID, donc aucune collision.
 */
export async function ensureCenterSubjects(db: D1Database, centerId: string): Promise<void> {
  const row = await db.prepare('SELECT 1 AS ok FROM subjects WHERE center_id = ? LIMIT 1').bind(centerId).first<any>();
  if (row) return;
  const stmts = DEFAULT_SUBJECT_NAMES.map(name => db.prepare('INSERT OR IGNORE INTO subjects (id, center_id, name) VALUES (?, ?, ?)').bind(crypto.randomUUID(), centerId, name));
  if (stmts.length) await db.batch(stmts);
}

export async function readSubjects(db: D1Database, centerId: string): Promise<any[]> {
  await ensureCenterSubjects(db, centerId);
  const res = await db.prepare('SELECT id, name FROM subjects WHERE center_id = ? ORDER BY name COLLATE NOCASE').bind(centerId).all();
  return res.results || [];
}

/** Ajoute UNE matière (idempotent par (center_id, name)) — retourne l'id. */
export async function createSingleSubject(db: D1Database, name: string, centerId: string): Promise<string> {
  const clean = str(name).trim();
  if (!clean) throw new Error('اسم المادة مطلوب.');
  if (clean.length > 120) throw new Error('اسم المادة طويل جداً.');
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO subjects (id, center_id, name) VALUES (?, ?, ?) ON CONFLICT (center_id, name) DO NOTHING').bind(id, centerId, clean).run();
  const row = await db.prepare('SELECT id FROM subjects WHERE center_id = ? AND name = ?').bind(centerId, clean).first<any>();
  return str(row?.id) || id;
}

/**
 * Résout des noms de matières → subject_id (auto-création au besoin, comme
 * resolveEtablissementIds). Le centre reçoit TOUJOURS sa propre ligne —
 * jamais une référence au catalogue global ''.
 */
async function resolveSubjectIds(db: D1Database, centerId: string, names: string[]): Promise<Record<string, string | null>> {
  const map: Record<string, string | null> = {};
  const clean = Array.from(new Set(names.map(n => str(n).trim()).filter(Boolean)));
  for (const n of clean) {
    await db.prepare('INSERT OR IGNORE INTO subjects (id, center_id, name) VALUES (?, ?, ?)').bind(crypto.randomUUID(), centerId, n).run();
  }
  if (clean.length > 0) {
    const rows = await db.prepare(`SELECT name, id FROM subjects WHERE center_id = ? AND name IN (${clean.map(() => '?').join(',')})`).bind(centerId, ...clean).all();
    (rows.results || []).forEach((r: any) => { map[str(r.name)] = str(r.id); });
  }
  for (const n of clean) map[n] = map[n] || null;
  return map;
}

async function buildStudentsStmts(db: D1Database, students: any[], centerId: string = DEFAULT_CENTER_ID, mode: 'insert' | 'update' = 'insert'): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];
  const etabNames: string[] = [];
  for (const s of students || []) { if (s.etablissement && String(s.etablissement).trim()) etabNames.push(String(s.etablissement).trim()); }
  const etabIds = await resolveEtablissementIds(db, centerId, etabNames);

  for (const s of students || []) {
    const schoolYear = str(s.academicYear) || currentAcademicYear();
    // Mode « update » (PUT d'un élève existant) : la ligne students n'est PAS
    // supprimée. Un DELETE casserait les FK RESTRICT (formation_enrollments,
    // meal_forfait_closure_items) et CASCADE-effacerait des données hors payload
    // (student_attendance, course_session_attendance, revision_seance_students).
    const studentBind = [
      str((s as any).studentType) || 'regular', s.firstName, s.lastName, s.birthDate || null, s.birthPlace || null,
      str((s as any).contactPhone) || null, s.allergies ?? '', s.parentalSituation || null, s.parentalComments ?? null,
      s.registration?.date ?? null, s.registration?.location ?? null, s.registration?.signedElectronically ? 1 : 0, s.registration?.signatureName ?? null,
      str((s as any).status) || 'active'
    ];
    // NB: studentBind = 14 valeurs (SANS created_at). Le UPDATE n'a que 14
    // placeholders SET + 2 WHERE : binder la 15e valeur (Date.now()) ferait
    // échouer .bind() (« wrong number of parameters » → 500 sur tout PUT
    // d'un élève existant).
    if (mode === 'update') {
      stmts.push(db.prepare('UPDATE students SET student_type = ?, first_name = ?, last_name = ?, birth_date = ?, birth_place = ?, contact_phone = ?, allergies = ?, parental_situation = ?, parental_comments = ?, registration_date = ?, registration_location = ?, registration_signed_electronically = ?, registration_signature_name = ?, status = ? WHERE id = ? AND center_id = ?').bind(
        ...studentBind, s.id, centerId
      ));
    } else {
      stmts.push(db.prepare('INSERT INTO students (id, center_id, student_type, first_name, last_name, birth_date, birth_place, contact_phone, allergies, parental_situation, parental_comments, registration_date, registration_location, registration_signed_electronically, registration_signature_name, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
        s.id, centerId, ...studentBind, Date.now()
      ));
    }

    // Année scolaire (grade + établissement + emploi du temps vivent ici).
    stmts.push(db.prepare('INSERT OR IGNORE INTO student_years (student_id, center_id, school_year, grade, etablissement_id, time_sheet_id) VALUES (?, ?, ?, ?, ?, ?)').bind(
      s.id, centerId, schoolYear, str(s.grade) || '', (s.etablissement && etabIds[str(s.etablissement).trim()]) || null, s.timeSheetId ?? null
    ));

    // Inscriptions services (suivi/étude/biblio + repas/goûters).
    const enrollBase = { studentId: s.id as string, schoolYear, validFrom: schoolYearStart(schoolYear) };
    const pushEnrollment = (serviceKey: string, billingMode: 'subscription' | 'unit', prices: { monthly?: number; annual?: number; unit?: number }) => {
      stmts.push(db.prepare('INSERT OR IGNORE INTO student_service_enrollments (id, center_id, student_id, service_key, school_year, billing_mode, monthly_price, annual_price, unit_price, valid_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
        crypto.randomUUID(), centerId, enrollBase.studentId, serviceKey, enrollBase.schoolYear, billingMode,
        prices.monthly ?? null, prices.annual ?? null, prices.unit ?? null, enrollBase.validFrom
      ));
    };
    const es = s.enrolledServices || {};
    if (es.suivi) pushEnrollment('suivi', 'subscription', { monthly: num(s.suiviFees?.monthlyFee), annual: num(s.suiviFees?.annualRegistrationFee) });
    if (es.etude) pushEnrollment('etude', 'subscription', { monthly: num(s.etudeFees?.monthlyFee), annual: num(s.etudeFees?.annualRegistrationFee) });
    if (es.library) pushEnrollment('bibliotheque', 'subscription', { monthly: num(s.libraryFees?.monthlyFee), annual: num(s.libraryFees?.annualRegistrationFee) });
    if (es.meals) {
      if (s.mealSubscription?.mode === 'unit') pushEnrollment('lunch', 'unit', { unit: num(s.mealSubscription?.unitPrice) });
      else pushEnrollment('lunch', 'subscription', { monthly: num(s.mealSubscription?.monthlyPrice), unit: num(s.mealSubscription?.unitPrice) });
    }
    if (es.gouterMatin || es.gouterBoth) pushEnrollment('gouter_matin', 'subscription', {});
    if (es.gouterSoir || es.gouterBoth) pushEnrollment('gouter_apres_midi', 'subscription', {});

    const mother = s.mother || {}; const father = s.father || {};
    // extra_phones est NOT NULL (JSON array) : un bind explicite de NULL
    // contournerait le DEFAULT '[]' et ferait échouer l'insert (SQLITE_CONSTRAINT).
    stmts.push(db.prepare('INSERT INTO student_parents (student_id, role, name, birth_date, profession, address, phone_fixed, phone_mobile, email, extra_phones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, 'mother', mother.name ?? '', mother.birthDate ?? '', mother.profession ?? '', mother.address ?? '', mother.phoneFixed ?? '', mother.phoneMobile ?? '', mother.email ?? '', JSON.stringify(Array.isArray(mother.extraPhones) ? mother.extraPhones : [])));
    stmts.push(db.prepare('INSERT INTO student_parents (student_id, role, name, birth_date, profession, address, phone_fixed, phone_mobile, email, extra_phones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, 'father', father.name ?? '', father.birthDate ?? '', father.profession ?? '', father.address ?? '', father.phoneFixed ?? '', father.phoneMobile ?? '', father.email ?? '', JSON.stringify(Array.isArray(father.extraPhones) ? father.extraPhones : [])));
    for (const sib of s.siblings || []) stmts.push(db.prepare('INSERT INTO siblings (id, student_id, name, age, grade) VALUES (?, ?, ?, ?, ?)').bind(sib.id, s.id, sib.name, num(sib.age), sib.grade));
    for (const ap of s.authorizedPersons || []) stmts.push(db.prepare('INSERT INTO authorized_persons (id, student_id, name, phone, relation) VALUES (?, ?, ?, ?, ?)').bind(ap.id, s.id, ap.name, ap.phone, ap.relation));
    const hist = s.academicHistory || {};
    [['nMinus1', 1], ['nMinus2', 2], ['nMinus3', 3]].forEach(([key, n]) => { const h = hist[key]; stmts.push(db.prepare('INSERT INTO academic_history (student_id, n_minus, school, grade) VALUES (?, ?, ?, ?)').bind(s.id, n, h?.school ?? '', h?.grade ?? '')); });
    for (const p of s.payments || []) {
      const { serviceKey, period } = paymentServiceKey(p.service, p.month);
      // Normalize UI labels → DB STRICT enums + refund shape (see paymentMethodKey).
      const isRefund = p.amountPaid < 0 || !!p.refund;
      const methodKey = paymentMethodKey(isRefund && p.method === undefined ? 'Espèces' : p.method);
      stmts.push(db.prepare('INSERT INTO payments (id, center_id, student_id, date, service_key, billing_period, period_month, school_year, payment_type, method, amount, total_required, discount, receipt_number, notes, cheque_number, cheque_date, cheque_paid, is_refund, refund_of, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
        p.id, centerId, s.id, p.date, serviceKey, period, periodMonthFrom(p.month),
        p.schoolYear && /^\d{4}\/\d{4}$/.test(str(p.schoolYear)) ? str(p.schoolYear) : schoolYear,
        paymentTypeKey(p.paymentType), methodKey,
        isRefund ? -num(p.amountPaid) : num(p.amountPaid), num(p.totalRequired),  // montant positif stocké, signe → is_refund
        p.discount != null ? num(p.discount) : 0, p.receiptNumber, p.notes ?? null,
        methodKey === 'cheque' ? (p.chequeNumber ?? null) : null,
        methodKey === 'cheque' ? (p.chequeDate ?? null) : null,
        methodKey === 'cheque' && p.chequePaid ? 1 : 0,
        isRefund ? 1 : 0, isRefund ? (p.refundOf ?? null) : null, p.refType ?? null, p.refId ?? null, Date.now()
      ));
    }
    for (const m of s.mealAttendances || []) {
      stmts.push(db.prepare('INSERT OR IGNORE INTO meal_attendances (center_id, student_id, date, service_key, billing_mode, status, unit_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(
        centerId, s.id, m.date, str(m.service) || 'lunch', m.type === 'unit' ? 'unit' : 'subscription',
        m.paid ? 'paid' : 'unpaid', m.traiteurPrice != null ? num(m.traiteurPrice) : null, Date.now()
      ));
    }
    // Notes : PK = UUID serveur + référence subject_id (migration 0002). Le
    // flux normal passe par POST /api/suivi-notes (l'élève n'est plus renvoyé
    // entier) ; cette boucle ne sert qu'aux restaurations bulk.
    const subjectIdsForStudent = await resolveSubjectIds(db, centerId, (s.suiviNotes || []).flatMap((yr: any) => (yr.trimesters || []).flatMap((tr: any) => Object.keys(tr.subjects || {}))));
    for (const yr of s.suiviNotes || []) for (const tr of yr.trimesters || []) for (const [subject, grades] of Object.entries(tr.subjects || {})) { const g = grades as any; const sid = subjectIdsForStudent[subject]; if (!sid) continue; stmts.push(db.prepare('INSERT OR IGNORE INTO suivi_notes (id, student_id, school_year, trimester, subject_id, devoir1, devoir2, synthese) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), s.id, yr.schoolYear, tr.trimester, sid, g?.devoir1 ?? null, g?.devoir2 ?? null, g?.synthese ?? null)); }
  }
  return stmts;
}

export async function writeStudents(db: D1Database, students: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payments WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM student_service_enrollments WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM student_years WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM meal_attendances WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM suivi_notes WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM academic_history WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM authorized_persons WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM siblings WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM student_parents WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM students WHERE center_id = ?').bind(centerId),
    ...(await buildStudentsStmts(db, students, centerId))
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function createSingleStudent(db: D1Database, student: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = await buildStudentsStmts(db, [student], centerId);
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function updateSingleStudent(db: D1Database, student: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  // La ligne students n'est PAS supprimée (UPDATE sur place) : les FK RESTRICT
  // (formation_enrollments, meal_forfait_closure_items) bloqueraient le DELETE
  // pour un élève inscrit à une formation, et le DELETE CASCADE effacerait des
  // données hors payload (student_attendance, course_session_attendance,
  // revision_seance_students). enrollments + student_years sont supprimés
  // explicitement pour que les frais/grade mis à jour repartent du payload.
  const deleteStmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payments WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM meal_attendances WHERE student_id = ?').bind(student.id),
    // NB : suivi_notes n'est PAS supprimé ici — les notes sont gérées par
    // l'endpoint dédié /api/suivi-notes et ne font plus partie du payload
    // PUT /api/students. Un DELETE reconstruirait les notes depuis un
    // payload potentiellement périmé et les effacerait.
    db.prepare('DELETE FROM academic_history WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM authorized_persons WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM siblings WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM student_parents WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM student_service_enrollments WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM student_years WHERE student_id = ?').bind(student.id)
  ];
  const insertStmts = await buildStudentsStmts(db, [student], centerId, 'update');
  const all = [...deleteStmts, ...insertStmts];
  for (let i = 0; i < all.length; i += 500) await db.batch(all.slice(i, i + 500));
}

export async function deleteSingleStudent(db: D1Database, studentId: string, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payments WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM meal_attendances WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM suivi_notes WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM academic_history WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM authorized_persons WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM siblings WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM student_parents WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM students WHERE id = ? AND center_id = ?').bind(studentId, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}


// ===========================================================================
// STAFF
// ===========================================================================

export async function readStaff(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [staffRows, subjectsRows, scheduleRows, paymentRows, payslipRows, leaveRows, advanceRows] = await Promise.all([
    db.prepare('SELECT * FROM staff WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT sub.*, sj.name AS subject_name FROM staff_subjects sub LEFT JOIN subjects sj ON sj.id = sub.subject_id JOIN staff st ON sub.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT sc.* FROM staff_schedule sc JOIN staff st ON sc.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT p.* FROM staff_payments p JOIN staff st ON p.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT ps.* FROM staff_payslips ps JOIN staff st ON ps.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT l.* FROM staff_leave_requests l JOIN staff st ON l.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT a.* FROM staff_advances a JOIN staff st ON a.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all()
  ]);
  const subjectsByStaff: Record<string, string[]> = {};
  subjectsRows.results.forEach((r: any) => { const nm = str(r.subject_name); if (nm) (subjectsByStaff[str(r.staff_id)] = subjectsByStaff[str(r.staff_id)] || []).push(nm); });
  const scheduleByStaff: Record<string, any[]> = {};
  scheduleRows.results.forEach((r: any) => { (scheduleByStaff[str(r.staff_id)] = scheduleByStaff[str(r.staff_id)] || []).push({ day: str(r.day), slots: parseJson(r.slots, []) }); });
  const paymentsByStaff: Record<string, any[]> = {};
  paymentRows.results.forEach((r: any) => { (paymentsByStaff[str(r.staff_id)] = paymentsByStaff[str(r.staff_id)] || []).push({ id: str(r.id), month: str(r.month), amountPaid: num(r.amount_paid), bonus: r.bonus == null ? undefined : num(r.bonus), deduction: r.deduction == null ? undefined : num(r.deduction), netSalary: num(r.net_salary), date: str(r.date), receiptNumber: str(r.receipt_number), notes: r.notes == null ? undefined : str(r.notes) }); });
  const payslipsByStaff: Record<string, any[]> = {};
  payslipRows.results.forEach((r: any) => { (payslipsByStaff[str(r.staff_id)] = payslipsByStaff[str(r.staff_id)] || []).push({ id: str(r.id), staffId: str(r.staff_id), month: str(r.month), baseSalary: num(r.base_salary), bonus: num(r.bonus), bonusReason: r.bonus_reason == null ? undefined : str(r.bonus_reason), cnssDeduction: num(r.cnss_deduction), absenceDeductions: num(r.absence_deductions), advanceDeducted: num(r.advance_deducted), netSalary: num(r.net_salary), issueDate: str(r.issue_date), daysPresent: r.days_present == null ? undefined : num(r.days_present), daysAbsent: r.days_absent == null ? undefined : num(r.days_absent), daysRetard: r.days_retard == null ? undefined : num(r.days_retard), extraHours: r.extra_hours == null ? undefined : num(r.extra_hours), extraHourRate: r.extra_hour_rate == null ? undefined : num(r.extra_hour_rate), extraHoursAmount: r.extra_hours_amount == null ? undefined : num(r.extra_hours_amount) }); });
  const leaveByStaff: Record<string, any[]> = {};
  leaveRows.results.forEach((r: any) => { (leaveByStaff[str(r.staff_id)] = leaveByStaff[str(r.staff_id)] || []).push({ id: str(r.id), staffId: str(r.staff_id), startDate: str(r.start_date), endDate: str(r.end_date), reason: str(r.reason), type: str(r.type), status: str(r.status) }); });
  const advanceByStaff: Record<string, any[]> = {};
  advanceRows.results.forEach((r: any) => { (advanceByStaff[str(r.staff_id)] = advanceByStaff[str(r.staff_id)] || []).push({ id: str(r.id), staffId: str(r.staff_id), amount: num(r.amount), date: str(r.date), reason: str(r.reason), status: str(r.status) }); });
  return staffRows.results.map((r: any) => ({ id: str(r.id), firstName: str(r.first_name), lastName: str(r.last_name), cin: str(r.cin), cnssNumber: str(r.cnss_number), subjects: subjectsByStaff[str(r.id)] || [], salary: num(r.base_salary), phone: str(r.phone), role: str(r.role), contractStartDate: str(r.contract_start_date), contractType: r.contract_type == null ? undefined : str(r.contract_type), email: r.email == null ? undefined : str(r.email), address: r.address == null ? undefined : str(r.address), baseSalary: r.base_salary == null ? undefined : num(r.base_salary), cnssAmount: r.cnss_amount == null ? undefined : num(r.cnss_amount), hourlyRate: r.hourly_rate == null ? undefined : num(r.hourly_rate), leaveRequests: leaveByStaff[str(r.id)] || [], advances: advanceByStaff[str(r.id)] || [], payments: paymentsByStaff[str(r.id)] || [], payslips: payslipsByStaff[str(r.id)] || [], schedule: scheduleByStaff[str(r.id)] || [] }));
}

// staff_payments / staff_payslips : month DOIT être 'YYYY-MM' (GLOB en base).
// Le client envoie des libellés ('Octobre', parfois suffixés) — on convertit.
function staffMonthKey(label: unknown): string {
  const direct = /^\d{4}-\d{2}$/.exec(str(label).trim());
  if (direct) return direct[0];
  return monthKeyFromLabel(label) || new Date().toISOString().slice(0, 7);
}

function buildStaffStmts(db: D1Database, staff: any[], centerId: string = DEFAULT_CENTER_ID, subjectIds?: Record<string, string | null>): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  const ids = subjectIds || {};
  for (const s of staff || []) {
    // Nouveau schéma : base_salary NOT NULL (plus de salary/hire_date).
    stmts.push(db.prepare('INSERT INTO staff (id, center_id, first_name, last_name, cin, cnss_number, phone, email, address, role, contract_type, contract_start_date, base_salary, cnss_amount, hourly_rate, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, centerId, s.firstName, s.lastName, str(s.cin), s.cnssNumber ?? null, s.phone, s.email ?? null, s.address ?? null, s.role, s.contractType ?? null, s.contractStartDate, num(s.baseSalary ?? s.salary), s.cnssAmount ?? null, s.hourlyRate ?? null, 'active'));
    for (const sub of s.subjects || []) { const sid = ids[str(sub).trim()] ?? null; if (!sid) continue; stmts.push(db.prepare('INSERT INTO staff_subjects (staff_id, subject_id) VALUES (?, ?)').bind(s.id, sid)); }
    for (const slot of s.schedule || []) stmts.push(db.prepare('INSERT INTO staff_schedule (staff_id, day, slots) VALUES (?, ?, ?)').bind(s.id, slot.day, JSON.stringify(slot.slots || [])));
    for (const p of s.payments || []) stmts.push(db.prepare('INSERT INTO staff_payments (id, center_id, staff_id, month, amount_paid, bonus, deduction, net_salary, date, receipt_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(p.id, centerId, s.id, staffMonthKey(p.month), num(p.amountPaid), num(p.bonus ?? 0), num(p.deduction ?? 0), num(p.netSalary), p.date, p.receiptNumber, p.notes ?? null));
    for (const pl of s.payslips || []) stmts.push(db.prepare('INSERT INTO staff_payslips (id, center_id, staff_id, month, base_salary, bonus, bonus_reason, cnss_deduction, absence_deductions, advance_deducted, net_salary, issue_date, days_present, days_absent, days_retard, extra_hours, extra_hour_rate, extra_hours_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(pl.id, centerId, s.id, staffMonthKey(pl.month), num(pl.baseSalary), num(pl.bonus), pl.bonusReason ?? null, num(pl.cnssDeduction), num(pl.absenceDeductions), num(pl.advanceDeducted), num(pl.netSalary), pl.issueDate, pl.daysPresent ?? null, pl.daysAbsent ?? null, pl.daysRetard ?? null, pl.extraHours ?? null, pl.extraHourRate ?? null, pl.extraHoursAmount ?? null));
    for (const lr of s.leaveRequests || []) stmts.push(db.prepare('INSERT INTO staff_leave_requests (id, staff_id, start_date, end_date, reason, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(lr.id, s.id, lr.startDate, lr.endDate, lr.reason, lr.type, lr.status));
    for (const adv of s.advances || []) stmts.push(db.prepare('INSERT INTO staff_advances (id, center_id, staff_id, amount, date, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(adv.id, centerId, s.id, num(adv.amount), adv.date, adv.reason, adv.status));
  }
  return stmts;
}

export async function writeStaff(db: D1Database, staff: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const subjectIds = await resolveSubjectIds(db, centerId, (staff || []).flatMap((s: any) => s.subjects || []));
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM staff_payslips WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_payments WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_advances WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_leave_requests WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_schedule WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_subjects WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff WHERE center_id = ?').bind(centerId),
    ...buildStaffStmts(db, staff, centerId, subjectIds)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function createSingleStaff(db: D1Database, staffMember: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const subjectIds = await resolveSubjectIds(db, centerId, staffMember?.subjects || []);
  const stmts = buildStaffStmts(db, [staffMember], centerId, subjectIds);
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function updateSingleStaff(db: D1Database, staffMember: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const deleteStmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM staff_payslips WHERE staff_id = ?').bind(staffMember.id),
    db.prepare('DELETE FROM staff_payments WHERE staff_id = ?').bind(staffMember.id),
    db.prepare('DELETE FROM staff_advances WHERE staff_id = ?').bind(staffMember.id),
    db.prepare('DELETE FROM staff_leave_requests WHERE staff_id = ?').bind(staffMember.id),
    db.prepare('DELETE FROM staff_schedule WHERE staff_id = ?').bind(staffMember.id),
    db.prepare('DELETE FROM staff_subjects WHERE staff_id = ?').bind(staffMember.id),
    db.prepare('DELETE FROM staff WHERE id = ? AND center_id = ?').bind(staffMember.id, centerId)
  ];
  const subjectIds = await resolveSubjectIds(db, centerId, staffMember?.subjects || []);
  const insertStmts = buildStaffStmts(db, [staffMember], centerId, subjectIds);
  const all = [...deleteStmts, ...insertStmts];
  for (let i = 0; i < all.length; i += 500) await db.batch(all.slice(i, i + 500));
}

export async function deleteSingleStaff(db: D1Database, staffId: string, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM staff_payslips WHERE staff_id = ?').bind(staffId),
    db.prepare('DELETE FROM staff_payments WHERE staff_id = ?').bind(staffId),
    db.prepare('DELETE FROM staff_advances WHERE staff_id = ?').bind(staffId),
    db.prepare('DELETE FROM staff_leave_requests WHERE staff_id = ?').bind(staffId),
    db.prepare('DELETE FROM staff_schedule WHERE staff_id = ?').bind(staffId),
    db.prepare('DELETE FROM staff_subjects WHERE staff_id = ?').bind(staffId),
    db.prepare('DELETE FROM staff WHERE id = ? AND center_id = ?').bind(staffId, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}


// ===========================================================================
// TIMESHEETS
// ===========================================================================

export async function readTimesheets(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  return (await db.prepare('SELECT * FROM timesheets WHERE center_id = ?').bind(centerId).all()).results.map((r: any) => ({ id: str(r.id), staffId: str(r.staff_id), date: str(r.date), slotTime: r.slot_time == null ? undefined : str(r.slot_time), status: str(r.status), leaveReason: r.leave_reason == null ? undefined : str(r.leave_reason), leaveStatus: r.leave_status == null ? undefined : str(r.leave_status), notes: r.notes == null ? undefined : str(r.notes), hoursWorked: r.hours_worked == null ? undefined : num(r.hours_worked), extraHours: r.extra_hours == null ? undefined : num(r.extra_hours) }));
}

function buildTimesheetsStmts(db: D1Database, timesheets: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  return (timesheets || []).map((t: any) => db.prepare('INSERT INTO timesheets (id, center_id, staff_id, date, slot_time, status, leave_reason, leave_status, notes, hours_worked, extra_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(t.id, centerId, t.staffId, t.date, t.slotTime ?? null, t.status, t.leaveReason ?? null, t.leaveStatus ?? null, t.notes ?? null, t.hoursWorked ?? null, t.extraHours ?? null));
}

export async function writeTimesheets(db: D1Database, timesheets: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [db.prepare('DELETE FROM timesheets WHERE center_id = ?').bind(centerId), ...buildTimesheetsStmts(db, timesheets, centerId)];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// ÉTUDE SLOTS
// ===========================================================================

// etude_slots : le nouveau schéma stocke weekday INTEGER (1=Lundi … 6=Samedi,
// 7=Dimanche) au lieu du libellé `day`.
const SLOT_DAY_NAMES = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const SLOT_DAY_NUMBERS: Record<string, number> = { 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6, 'Dimanche': 7 };

export async function readSlots(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [slotRows, enrollRows] = await Promise.all([
    db.prepare('SELECT * FROM etude_slots WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT e.* FROM slot_enrollments e JOIN etude_slots s ON e.slot_id = s.id WHERE s.center_id = ?').bind(centerId).all()
  ]);
  const enrollBySlot: Record<string, string[]> = {};
  enrollRows.results.forEach((r: any) => { (enrollBySlot[str(r.slot_id)] = enrollBySlot[str(r.slot_id)] || []).push(str(r.student_id)); });
  return slotRows.results.map((r: any) => ({ id: str(r.id), day: SLOT_DAY_NAMES[num(r.weekday)] || '', startTime: str(r.start_time), endTime: str(r.end_time), gradeLevel: str(r.grade_level), teacherId: str(r.teacher_id), enrolledStudentIds: enrollBySlot[str(r.id)] || [], isExtra: r.is_extra ? true : undefined }));
}

function buildSlotsStmts(db: D1Database, slots: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const s of slots || []) {
    const weekday = SLOT_DAY_NUMBERS[str(s.day)] || 1;
    stmts.push(db.prepare('INSERT INTO etude_slots (id, center_id, weekday, start_time, end_time, grade_level, teacher_id, is_extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, centerId, weekday, s.startTime, s.endTime, s.gradeLevel, s.teacherId, s.isExtra ? 1 : 0));
    for (const sid of s.enrolledStudentIds || []) stmts.push(db.prepare('INSERT INTO slot_enrollments (slot_id, student_id) VALUES (?, ?)').bind(s.id, sid));
  }
  return stmts;
}

export async function writeSlots(db: D1Database, slots: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM slot_enrollments WHERE slot_id IN (SELECT id FROM etude_slots WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM etude_slots WHERE center_id = ?').bind(centerId),
    ...buildSlotsStmts(db, slots, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// EXTERNAL COURSES
// ===========================================================================

export async function readCourses(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [courseRows, enrollRows] = await Promise.all([
    db.prepare('SELECT c.*, sub.name AS subject_name FROM external_courses c LEFT JOIN subjects sub ON sub.id = c.subject_id WHERE c.center_id = ?').bind(centerId).all(),
    // Table course_enrollments: simple (course_id, student_id) join. The
    // per-student roster fields (name, phone, assurance…) live on the
    // external_students register / per-student data — the course row keeps
    // only the IDs. When the table is absent (older deployment) the roster
    // falls back to empty and enrollments are skipped on write.
    readCourseEnrollments(db, centerId)
  ]);
  const enrollByCourse: Record<string, string[]> = {};
  enrollRows.forEach((r: any) => { (enrollByCourse[str(r.course_id)] = enrollByCourse[str(r.course_id)] || []).push(str(r.student_id)); });
  return courseRows.results.map((r: any) => ({
    id: str(r.id), schoolYear: str(r.school_year), trimester: str(r.trimester), gradeLevel: str(r.grade_level), subject: str(r.subject_name), subjectId: str(r.subject_id),
    teacherName: str(r.teacher_name), teacherPhone: str(r.teacher_phone),
    monthlyFee: num(r.monthly_fee), teacherShare: num(r.teacher_share), centerShare: num(r.center_share),
    // Montant d'assurance propre à ce cours (synchro DEFAULT du service assurance_externe)
    assuranceAmount: r.assurance_amount == null ? 0 : num(r.assurance_amount),
    // Legacy external-student roster rows are no longer stored per course:
    // enrolledStudents keeps only real students (the UI derives the display
    // roster from externalStudents via studentId).
    enrolledStudents: (enrollByCourse[str(r.id)] || []).map((sid: string) => ({ studentId: sid }))
  }));
}

async function readCourseEnrollments(db: D1Database, centerId: string): Promise<any[]> {
  try {
    const out = await db.prepare(
      'SELECT e.course_id, e.student_id FROM course_enrollments e JOIN external_courses c ON e.course_id = c.id WHERE c.center_id = ?'
    ).bind(centerId).all();
    return out.results || [];
  } catch {
    return [];
  }
}

function buildCoursesStmts(db: D1Database, courses: any[], centerId: string = DEFAULT_CENTER_ID, skipEnrollments = false, subjectIds?: Record<string, string | null>): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  const ids = subjectIds || {};
  for (const c of courses || []) {
    const sid = ids[str(c.subject).trim()] ?? null;
    if (!sid) continue;
    stmts.push(db.prepare('INSERT INTO external_courses (id, school_year, trimester, grade_level, subject_id, teacher_name, teacher_phone, monthly_fee, teacher_share, center_share, assurance_amount, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(c.id, c.schoolYear, c.trimester, c.gradeLevel, sid, c.teacherName, c.teacherPhone, num(c.monthlyFee), num(c.teacherShare), num(c.centerShare), c.assuranceAmount != null ? num(c.assuranceAmount) : 0, centerId));
    if (skipEnrollments) continue;
    for (const es of c.enrolledStudents || []) { const studentId = str(es.studentId || es.id); if (studentId) stmts.push(db.prepare('INSERT OR IGNORE INTO course_enrollments (course_id, student_id, enrolled_at) VALUES (?, ?, ?)').bind(c.id, studentId, Date.now())); }
  }
  return stmts;
}

export async function writeCourses(db: D1Database, courses: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const subjectIds = await resolveSubjectIds(db, centerId, (courses || []).map((c: any) => c.subject));
  const stmts = [
    db.prepare('DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM external_courses WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_courses WHERE center_id = ?').bind(centerId)
  ];
  for (let i = 0; i < courses.length; i += 500) {
    const slice = (courses || []).slice(i, i + 500);
    try {
      await db.batch(stmts.concat(buildCoursesStmts(db, slice, centerId, false, subjectIds)));
    } catch {
      // Table course_enrollments absente (déploiement antérieur) : réessaie
      // en insérant les cours seuls.
      await db.batch(stmts.concat(buildCoursesStmts(db, slice, centerId, true, subjectIds)));
    }
  }
}

// ===========================================================================
// EXTERNAL COURSE SESSIONS
// ===========================================================================

// Séances de cours particuliers : une seule table course_session_attendance
// (session_id, student_id, present, seance_status, seance_amount,
// paid_payment_id) remplace les cinq tables session_* de l'ancien schéma.
// Les « élèves externes one-time » n'existent plus en base : le client garde
// ce liste localement (elle repartira vide après rechargement).
export async function readSessions(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [sessionRows, attRows] = await Promise.all([
    db.prepare('SELECT * FROM external_course_sessions WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT a.* FROM course_session_attendance a JOIN external_course_sessions s ON a.session_id = s.id WHERE s.center_id = ?').bind(centerId).all()
  ]);
  const presentBySession: Record<string, string[]> = {};
  const monthPaidBySession: Record<string, Record<string, boolean>> = {};
  const statusBySession: Record<string, Record<string, string>> = {};
  const amountBySession: Record<string, Record<string, number>> = {};
  attRows.results.forEach((r: any) => {
    const key = str(r.session_id);
    const sid = str(r.student_id);
    if (r.present) (presentBySession[key] = presentBySession[key] || []).push(sid);
    const status = str(r.seance_status);
    if (status) {
      (statusBySession[key] = statusBySession[key] || {})[sid] = status;
      if (status === 'paie_mois') (monthPaidBySession[key] = monthPaidBySession[key] || {})[sid] = true;
      if (status === 'paie_mois' || status === 'paie_seance') (amountBySession[key] = amountBySession[key] || {})[sid] = num(r.seance_amount);
    }
  });
  return sessionRows.results.map((r: any) => {
    const id = str(r.id); const statusMap = statusBySession[id]; const amountMap = amountBySession[id]; const hasAdvancedData = statusMap && Object.keys(statusMap).length > 0;
    return { id, courseId: str(r.course_id), date: str(r.date), presentStudentIds: presentBySession[id] || [], oneTimeStudents: [], monthPaidMap: monthPaidBySession[id] || {}, seanceStatusMap: hasAdvancedData ? statusMap : undefined, seanceAmountMap: amountMap && Object.keys(amountMap).length > 0 ? amountMap : undefined, periodName: r.period_name == null ? undefined : str(r.period_name) };
  });
}

function buildSessionsStmts(db: D1Database, sessions: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const s of sessions || []) {
    stmts.push(db.prepare('INSERT INTO external_course_sessions (id, center_id, course_id, date, period_name) VALUES (?, ?, ?, ?, ?)').bind(s.id, centerId, s.courseId, s.date, s.periodName ?? null));
    const statusMap = (s.seanceStatusMap || {}) as Record<string, string>;
    const amountMap = (s.seanceAmountMap || {}) as Record<string, number>;
    const touched = new Set<string>([
      ...(s.presentStudentIds || []),
      ...Object.keys(statusMap),
      ...Object.keys(amountMap),
      ...Object.entries(s.monthPaidMap || {}).filter(([, paid]) => paid).map(([sid]) => sid)
    ]);
    for (const sid of touched) {
      const status = str(statusMap[sid]) || (s.monthPaidMap?.[sid] ? 'paie_mois' : (s.presentStudentIds || []).includes(sid) ? 'present' : '');
      const amount = amountMap[sid] != null ? num(amountMap[sid]) : 0;
      stmts.push(db.prepare('INSERT OR IGNORE INTO course_session_attendance (session_id, student_id, present, seance_status, seance_amount) VALUES (?, ?, ?, ?, ?)')
        .bind(s.id, sid, (s.presentStudentIds || []).includes(sid) || status === 'present' ? 1 : 0, status || null, amount));
    }
  }
  return stmts;
}

export async function writeSessions(db: D1Database, sessions: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM course_session_attendance WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_course_sessions WHERE center_id = ?').bind(centerId),
    ...buildSessionsStmts(db, sessions, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// EXTERNAL STUDENTS
// ===========================================================================

// ===========================================================================
// EXTERNAL STUDENTS (hors-liste)
// Nouveau schéma : les tables external_students / external_payments n'existent
// plus. Un externe est un `students` (student_type='external') ; ses paiements
// vivront dans `payments` (service_key 'external_course' / 'assurance_externe')
// et ses présences dans external_attendance. En attendant la refonte UI du
// registre, l'API répond une liste vide et absorbe les écritures — le module
// reste utilisable sans crash, le registre se vide au rechargement.
// ===========================================================================

export async function readExternalStudents(_db: D1Database, _centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  return [];
}

function buildExternalStudentsStmts(_db: D1Database, _externalStudents: any[], _centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  return [];
}

export async function writeExternalStudents(_db: D1Database, _externalStudents: any[], _centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  // no-op volontaire — voir note ci-dessus.
}

// ===========================================================================
// MEAL PLANS
// ===========================================================================

export async function readMealPlans(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  // Nouveau schéma : meal_plan_days perd sa colonne day + la table
  // meal_plan_attendees n'existe plus. `day` est dérivé de la date ; les
  // participants du jour passent par meal_attendances.
  const planRows = await db.prepare('SELECT * FROM meal_plan_days WHERE center_id = ?').bind(centerId).all();
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return planRows.results.map((r: any) => {
    const date = str(r.date);
    const d = new Date(date + 'T00:00:00');
    const day = isNaN(d.getTime()) ? '' : dayNames[d.getDay()];
    return { id: str(r.id), day, date, dishName: str(r.dish_name), description: str(r.description), attendees: [] };
  });
}

function buildMealPlansStmts(db: D1Database, mealPlans: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const p of mealPlans || []) {
    // UNIQUE(center_id, date) : un seul plan par date — le upsert écrase le
    // plat du jour. (id régénéré si le client a fourni un id stale.)
    stmts.push(db.prepare('INSERT INTO meal_plan_days (id, center_id, date, dish_name, description) VALUES (?, ?, ?, ?, ?) ON CONFLICT(center_id, date) DO UPDATE SET dish_name = excluded.dish_name, description = excluded.description')
      .bind(p.id, centerId, p.date, p.dishName, p.description ?? ''));
  }
  return stmts;
}

export async function writeMealPlans(db: D1Database, mealPlans: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM meal_plan_days WHERE center_id = ?').bind(centerId),
    ...buildMealPlansStmts(db, mealPlans, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// EXPENSES
// ===========================================================================

export async function readExpenses(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  return (await db.prepare('SELECT * FROM expenses WHERE center_id = ?').bind(centerId).all()).results.map((r: any) => ({ id: str(r.id), date: str(r.date), category: str(r.category), amount: num(r.amount), description: str(r.description), receiptRef: str(r.receipt_ref) }));
}

function buildExpensesStmts(db: D1Database, expenses: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  // amount > 0 (CHECK) : les dépenses à 0 du client ne sont jamais écrites.
  return (expenses || [])
    .filter((e: any) => num(e.amount) > 0)
    .map((e: any) => db.prepare('INSERT INTO expenses (id, center_id, date, category, amount, description, receipt_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(e.id, centerId, e.date, e.category, num(e.amount), e.description, e.receiptRef ?? null, Date.now()));
}

export async function writeExpenses(db: D1Database, expenses: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [db.prepare('DELETE FROM expenses WHERE center_id = ?').bind(centerId), ...buildExpensesStmts(db, expenses, centerId)];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function createSingleExpense(db: D1Database, expense: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  await db.prepare('INSERT INTO expenses (id, center_id, date, category, amount, description, receipt_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(
    expense.id, centerId, expense.date, expense.category, num(expense.amount), expense.description, expense.receiptRef ?? null, Date.now()
  ).run();
}

export async function deleteSingleExpense(db: D1Database, expenseId: string, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  await db.prepare('DELETE FROM expenses WHERE id = ? AND center_id = ?').bind(expenseId, centerId).run();
}

// ===========================================================================
// MEAL FORFAIT CLOSURES (Case C - "forfait ferme")
// ===========================================================================

export async function readMealForfaitClosures(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [closureRows, itemRows] = await Promise.all([
    db.prepare('SELECT * FROM meal_forfait_closures WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT i.* FROM meal_forfait_closure_items i JOIN meal_forfait_closures c ON i.closure_id = c.id WHERE c.center_id = ?').bind(centerId).all()
  ]);
  const itemsByClosure: Record<string, any[]> = {};
  itemRows.results.forEach((r: any) => {
    (itemsByClosure[str(r.closure_id)] = itemsByClosure[str(r.closure_id)] || []).push({
      studentId: str(r.student_id),
      studentName: str(r.student_name),
      netPaid: num(r.net_paid),
      consumedSubscriptionMeals: num(r.consumed_subscription_meals),
      fraisParRepas: r.unit_price == null ? 0 : num(r.unit_price),
      amount: num(r.amount)
    });
  });
  return closureRows.results.map((r: any) => ({
    id: str(r.id),
    // Le client attend « Septembre » — la table stocke '2026-09'.
    month: monthLabelFromKey(str(r.month)) || str(r.month),
    schoolYear: str(r.school_year),
    createdAt: str(r.created_at),
    items: itemsByClosure[str(r.id)] || []
  }));
}

// '2026-09' → 'Septembre' (labels académiques FR du client).
function monthLabelFromKey(key: string): string {
  const labels = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const m = /^\d{4}-(\d{2})$/.exec(key);
  if (!m) return '';
  const idx = Number(m[1]);
  return idx >= 1 && idx <= 12 ? labels[idx - 1] : '';
}

// 'Septembre 2026' | 'Septembre' → '2026-09' (clé stockée en base).
function monthKeyFromLabel(label: unknown): string {
  const labels = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const first = str(label).trim().split(/\s+/)[0];
  const idx = labels.indexOf(first);
  if (idx === -1) return '';
  const now = new Date();
  const year = idx >= 8 ? now.getFullYear() : (idx <= 4 ? now.getFullYear() + 1 : now.getFullYear());
  return `${year}-${String(idx + 1).padStart(2, '0')}`;
}

/**
 * period_month (colonne payments) : NULL ou 'YYYY-MM' STRICT (CHECK GLOB).
 * La couche UI envoie des libellés d'affichage (« Septembre 2026 »,
 * « Annuel (2026/2027) », « Annuel »…) : on les convertit ici, à la frontière
 * d'écriture, pour qu'aucun payload client ne puisse violer la CHECK.
 * Règles :
 *   • 'YYYY-MM' déjà conforme       → tel quel
 *   • libellé de mois (fr)          → clé annuaire (monthKeyFromLabel)
 *   • 'Annuel…' / vide / inconnu    → NULL (paiement annuel ou sans mois)
 */
function periodMonthFrom(raw: unknown): string | null {
  const s = str(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^annuel/i.test(s)) return null;
  return monthKeyFromLabel(s) || null;
}

export async function createMealForfaitClosure(db: D1Database, closure: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT INTO meal_forfait_closures (id, center_id, month, school_year, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(closure.id, centerId, monthKeyFromLabel(closure.month) || str(closure.month), closure.schoolYear, Date.now())
  ];
  for (const item of closure.items || []) {
    if (item) {
      stmts.push(
        db.prepare('INSERT INTO meal_forfait_closure_items (id, closure_id, student_id, student_name, net_paid, consumed_subscription_meals, unit_price, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), closure.id, item.studentId, item.studentName, num(item.netPaid), num(item.consumedSubscriptionMeals), num(item.fraisParRepas), num(item.amount))
      );
    }
  }
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function writeMealForfaitClosures(db: D1Database, closures: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM meal_forfait_closure_items WHERE closure_id IN (SELECT id FROM meal_forfait_closures WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM meal_forfait_closures WHERE center_id = ?').bind(centerId)
  ];
  for (const closure of closures || []) {
    stmts.push(
      db.prepare('INSERT INTO meal_forfait_closures (id, center_id, month, school_year, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(closure.id, centerId, monthKeyFromLabel(closure.month) || str(closure.month), closure.schoolYear, Date.now())
    );
    for (const item of closure.items || []) {
      if (item) {
        stmts.push(
          db.prepare('INSERT INTO meal_forfait_closure_items (id, closure_id, student_id, student_name, net_paid, consumed_subscription_meals, unit_price, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(crypto.randomUUID(), closure.id, item.studentId, item.studentName, num(item.netPaid), num(item.consumedSubscriptionMeals), num(item.fraisParRepas), num(item.amount))
        );
      }
    }
  }
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}


// ===========================================================================
// REVISION SEANCES
// ===========================================================================

export async function readRevisionSeances(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [seanceRows, studentRows] = await Promise.all([
    db.prepare('SELECT r.*, sub.name AS subject_name FROM revision_seances r LEFT JOIN subjects sub ON sub.id = r.subject_id WHERE r.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT st.* FROM revision_seance_students st JOIN revision_seances s ON st.seance_id = s.id WHERE s.center_id = ?').bind(centerId).all()
  ]);
  const studentsBySeance: Record<string, any[]> = {};
  studentRows.results.forEach((r: any) => { (studentsBySeance[str(r.seance_id)] = studentsBySeance[str(r.seance_id)] || []).push({ id: str(r.student_id), studentId: str(r.student_id), name: str(r.student_id), studentName: str(r.student_id), parentPhone: '', paidSeance: r.paid_payment_id != null, present: !!r.present }); });
  return seanceRows.results.map((r: any) => ({ id: str(r.id), schoolYear: str(r.school_year), trimester: str(r.trimester), gradeLevel: str(r.grade_level), subject: str(r.subject_name), subjectId: str(r.subject_id), teacherName: str(r.teacher_name), teacherPhone: str(r.teacher_phone), date: str(r.date), teacherShare: num(r.teacher_share), centerShare: num(r.center_share), students: studentsBySeance[str(r.id)] || [] }));
}

function buildRevisionSeancesStmts(db: D1Database, seances: any[], centerId: string = DEFAULT_CENTER_ID, subjectIds?: Record<string, string | null>): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  const ids = subjectIds || {};
  for (const s of seances || []) {
    const sid = ids[str(s.subject).trim()] ?? null;
    if (!sid) continue;
    stmts.push(db.prepare('INSERT INTO revision_seances (id, school_year, trimester, grade_level, subject_id, teacher_name, teacher_phone, date, teacher_share, center_share, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, s.schoolYear, s.trimester, s.gradeLevel, sid, s.teacherName, s.teacherPhone, s.date, num(s.teacherShare), num(s.centerShare), centerId));
    for (const st of s.students || []) { const studentId = str(st.studentId || st.id); if (studentId) stmts.push(db.prepare('INSERT INTO revision_seance_students (seance_id, student_id, student_name, parent_phone, paid_seance, present) VALUES (?, ?, ?, ?, ?, ?)').bind(s.id, studentId, str(st.studentName || st.name || ''), str(st.parentPhone || ''), st.paidSeance ? 1 : 0, st.present ? 1 : 0)); }
  }
  return stmts;
}

export async function writeRevisionSeances(db: D1Database, seances: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const subjectIds = await resolveSubjectIds(db, centerId, (seances || []).map((s: any) => s.subject));
  const stmts = [
    db.prepare('DELETE FROM revision_seance_students WHERE seance_id IN (SELECT id FROM revision_seances WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM revision_seances WHERE center_id = ?').bind(centerId),
    ...buildRevisionSeancesStmts(db, seances, centerId, subjectIds)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// STUDENT TIME SHEETS
// ===========================================================================

export async function readStudentTimeSheets(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  return (await db.prepare('SELECT * FROM student_time_sheets WHERE center_id = ?').bind(centerId).all()).results.map((r: any) => ({ id: str(r.id), schoolYear: str(r.school_year), establishmentName: str(r.establishment_name), gradeLevel: str(r.grade_level), branch: r.branch == null ? undefined : str(r.branch), className: r.class_name == null ? undefined : str(r.class_name), weeklySchedule: parseJson(r.weekly_schedule, []), createdAt: str(r.created_at), updatedAt: str(r.updated_at) }));
}

function buildStudentTimeSheetsStmts(db: D1Database, sheets: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  // created_at/updated_at sont des colonnes STRICT INTEGER : le client envoie
  // soit un ISO « 2026-10-07T… » (nouveau sheet), soit la valeur GET en
  // epoch-ms sous forme de chaîne. On normalise TOUT en nombre — un bind
  // texte ferait échouer le PUT (500) sur D1.
  const now = Date.now();
  const toEpoch = (v: any, fallback: number): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const t = str(v).trim();
    if (/^\d+$/.test(t)) return Number(t);
    const parsed = Date.parse(t);
    return Number.isNaN(parsed) ? fallback : parsed;
  };
  for (const s of sheets || []) {
    const name = s.establishmentName + ' - ' + s.schoolYear;
    const createdAt = toEpoch(s.createdAt, now);
    const updatedAt = toEpoch(s.updatedAt, createdAt);
    stmts.push(db.prepare('INSERT INTO student_time_sheets (id, school_year, establishment_name, grade_level, branch, class_name, weekly_schedule, created_at, updated_at, name, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, s.schoolYear, s.establishmentName, s.gradeLevel, s.branch ?? null, s.className ?? null, JSON.stringify(s.weeklySchedule || []), createdAt, updatedAt, name, centerId));
    // Référencer l'établissement dans la table centralisée (comme
    // resolveEtablissementIds) : colonnes id + center_id NOT NULL obligatoires,
    // OR IGNORE absorbe le doublon UNIQUE (center_id, name).
    if (s.establishmentName && String(s.establishmentName).trim()) {
      stmts.push(db.prepare('INSERT OR IGNORE INTO etablissements (id, center_id, name) VALUES (?, ?, ?)').bind(crypto.randomUUID(), centerId, String(s.establishmentName).trim()));
    }
  }
  return stmts;
}

export async function writeStudentTimeSheets(db: D1Database, sheets: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM student_time_sheets WHERE center_id = ?').bind(centerId),
    ...buildStudentTimeSheetsStmts(db, sheets, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// JARDIN STUDENT ATTENDANCE
// ===========================================================================

export async function readStudentAttendance(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  return (await db.prepare('SELECT * FROM student_attendance WHERE center_id = ? ORDER BY date DESC, student_id').bind(centerId).all()).results.map((r: any) => ({
    id: str(r.id),
    studentId: str(r.student_id),
    date: str(r.date),
    status: r.status === 'absent' ? 'absent' : 'present',
    notes: r.notes == null ? undefined : str(r.notes),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at)
  }));
}

function buildStudentAttendanceStmts(db: D1Database, records: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const now = Date.now();
  return (records || []).map((record: any) => db.prepare(
    'INSERT INTO student_attendance (id, center_id, student_id, date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    str(record.id),
    centerId,
    str(record.studentId),
    str(record.date),
    record.status === 'absent' ? 'absent' : 'present',
    record.notes ?? null,
    Date.parse(record.createdAt) || now,
    Date.parse(record.updatedAt) || now
  ));
}

export async function writeStudentAttendance(db: D1Database, records: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const deduped = new Map<string, any>();
  for (const record of records || []) {
    if (!record || !record.studentId || !record.date) continue;
    deduped.set(`${record.studentId}:${record.date}`, record);
  }
  const stmts = [
    db.prepare('DELETE FROM student_attendance WHERE center_id = ?').bind(centerId),
    ...buildStudentAttendanceStmts(db, Array.from(deduped.values()), centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// FORMATIONS
// ===========================================================================

// ===========================================================================
// FORMATIONS — nouveau schéma : formation_enrollments (FK students.id) +
// formation_enrollment_matieres. L'ancien bloc dénormalisé formation_students
// (nom + téléphone + paiements inline) n'existe plus :
//  - l'élève est résolu (ou créé) dans `students` (student_type='formation') ;
//  - le nom/téléphone vivent dans students.first_name/last_name/contact_phone ;
//  - le paiement est une ligne de `payments` (service_key='formation',
//    ref_type='formation_enrollment', ref_id=enrollment.id).
// ===========================================================================

export async function readFormations(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [formationRows, matiereRows, enrollmentRows, paymentRows] = await Promise.all([
    db.prepare('SELECT * FROM formations WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT m.*, sub.name AS subject_name FROM formation_matieres m LEFT JOIN subjects sub ON sub.id = m.subject_id JOIN formations f ON m.formation_id = f.id WHERE f.center_id = ?').bind(centerId).all(),
    db.prepare(`SELECT fe.*, s.first_name, s.last_name, s.contact_phone FROM formation_enrollments fe
                JOIN formations f ON fe.formation_id = f.id
                LEFT JOIN students s ON s.id = fe.student_id
                WHERE f.center_id = ?`).bind(centerId).all(),
    db.prepare(`SELECT p.* FROM payments p JOIN formations f ON p.ref_type = 'formation_enrollment' AND p.ref_id IN
                (SELECT fe.id FROM formation_enrollments fe JOIN formations f2 ON fe.formation_id = f2.id WHERE f2.center_id = ?)
                `).bind(centerId).all()
  ]);
  const matieresByFormation: Record<string, any[]> = {};
  matiereRows.results.forEach((m: any) => {
    const fid = str(m.formation_id);
    (matieresByFormation[fid] = matieresByFormation[fid] || []).push({ id: str(m.id), subject: str(m.subject_name), subjectId: str(m.subject_id) });
  });
  const matieresByEnrollment: Record<string, string[]> = {};
  try {
    const linkRows = await db.prepare(`SELECT lem.enrollment_id, lem.matiere_id FROM formation_enrollment_matieres lem
                                       JOIN formation_enrollments fe ON lem.enrollment_id = fe.id
                                       JOIN formations f ON fe.formation_id = f.id WHERE f.center_id = ?`).bind(centerId).all();
    linkRows.results.forEach((sm: any) => {
      const sid = str(sm.enrollment_id);
      (matieresByEnrollment[sid] = matieresByEnrollment[sid] || []).push(str(sm.matiere_id));
    });
  } catch { /* table absente — pas de matières par élève */ }

  const paymentsByEnrollment: Record<string, any[]> = {};
  paymentRows.results.forEach((r: any) => {
    const key = str(r.ref_id);
    (paymentsByEnrollment[key] = paymentsByEnrollment[key] || []).push(r);
  });

  const studentsByFormation: Record<string, any[]> = {};
  enrollmentRows.results.forEach((st: any) => {
    const fid = str(st.formation_id);
    const sid = str(st.id);
    const pays = (paymentsByEnrollment[sid] || []).slice().sort((a: any, b: any) => num(a.created_at) - num(b.created_at));
    const nonRefund = pays.filter((p: any) => !bool(p.is_refund));
    const amountPaid = nonRefund.reduce((sum: number, p: any) => sum + num(p.amount), 0);
    const totalRequired = pays.length > 0 ? Math.max(...pays.map((p: any) => num(p.total_required))) : 0;
    const last = pays[pays.length - 1];
    (studentsByFormation[fid] = studentsByFormation[fid] || []).push({
      id: sid,
      studentName: `${str(st.first_name)} ${str(st.last_name)}`.trim(),
      parentPhone: str(st.contact_phone),
      isPack: bool(st.is_pack),
      enrolledMatiereIds: matieresByEnrollment[sid] || [],
      amountPaid,
      totalRequired,
      remainingBalance: Math.max(0, totalRequired - amountPaid),
      paymentMethod: str(last?.method) === 'Chèque' ? 'cheque' : 'espece',
      chequeNumber: last?.cheque_number == null ? undefined : str(last.cheque_number),
      chequeDate: last?.cheque_date == null ? undefined : str(last.cheque_date),
      chequePaid: last ? bool(last.cheque_paid) : false,
      discount: num(st.discount),
      isAdvance: bool(st.is_advance),
      paidAt: last?.date == null ? undefined : str(last.date),
      notes: st.notes == null ? undefined : str(st.notes),
      enrolledAt: st.enrolled_at == null ? '' : new Date(num(st.enrolled_at)).toISOString()
    });
  });
  return formationRows.results.map((f: any) => {
    const fid = str(f.id);
    return {
      id: fid,
      name: str(f.name),
      schoolYear: str(f.school_year),
      startDate: str(f.start_date),
      endDate: str(f.end_date),
      packPrice: num(f.pack_price),
      matieres: matieresByFormation[fid] || [],
      students: studentsByFormation[fid] || [],
      schedule: (() => { const s = parseJson<unknown>(f.schedule, []); return Array.isArray(s) ? s : []; })(),
      createdAt: str(f.created_at)
    };
  });
}

async function buildFormationsStmts(db: D1Database, formations: any[], centerId: string = DEFAULT_CENTER_ID, subjectIds?: Record<string, string | null>): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];
  const ids = subjectIds || {};
  // Nom d'élève de formation → students.id (créé au besoin, type 'formation').
  const ensureFormationStudent = async (name: string, phone: string): Promise<string | null> => {
    const clean = str(name).trim();
    if (!clean) return null;
    const parts = clean.split(/\s+/);
    const firstName = parts[0] || clean;
    const lastName = parts.slice(1).join(' ');
    const existing = await db.prepare('SELECT id FROM students WHERE center_id = ? AND first_name = ? AND last_name = ? LIMIT 1')
      .bind(centerId, firstName, lastName).first<any>();
    if (existing) return str(existing.id);
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO students (id, center_id, student_type, first_name, last_name, contact_phone, allergies, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, centerId, 'formation', firstName, lastName, str(phone) || null, '', 'active', Date.now()).run();
    return id;
  };

  for (const f of formations || []) {
    stmts.push(db.prepare('INSERT INTO formations (id, center_id, name, school_year, start_date, end_date, pack_price, schedule, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(f.id, centerId, f.name, f.schoolYear, f.startDate, f.endDate, num(f.packPrice), JSON.stringify(f.schedule || []), num(f.createdAt) || Date.now()));
    for (const m of f.matieres || []) { const sid = ids[str(m.subject).trim()] ?? null; if (!sid) continue; stmts.push(db.prepare('INSERT INTO formation_matieres (id, formation_id, subject_id) VALUES (?, ?, ?)').bind(m.id, f.id, sid)); }
    const validMatIds = new Set((f.matieres || []).map((m: any) => m.id));
    for (const st of f.students || []) {
      const studentId = await ensureFormationStudent(st.studentName, st.parentPhone);
      if (!studentId) continue;
      stmts.push(db.prepare('INSERT INTO formation_enrollments (id, center_id, formation_id, student_id, is_pack, is_advance, discount, notes, enrolled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(st.id, centerId, f.id, studentId, st.isPack ? 1 : 0, st.isAdvance ? 1 : 0, num(st.discount) || 0, st.notes ?? null, st.enrolledAt ? (new Date(st.enrolledAt).getTime() || Date.now()) : Date.now()));
      for (const mid of st.enrolledMatiereIds || []) {
        if (validMatIds.has(mid)) stmts.push(db.prepare('INSERT OR IGNORE INTO formation_enrollment_matieres (enrollment_id, matiere_id) VALUES (?, ?)').bind(st.id, mid));
      }
      // Paiement agrégé du client → une ligne canonique `payments`.
      if (num(st.amountPaid) > 0 || num(st.totalRequired) > 0) {
        stmts.push(db.prepare('INSERT OR REPLACE INTO payments (id, center_id, student_id, date, service_key, billing_period, period_month, school_year, payment_type, method, amount, total_required, discount, receipt_number, notes, cheque_number, cheque_date, cheque_paid, is_refund, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(
            'fmt_' + str(st.id), centerId, studentId,
            st.paidAt || new Date().toISOString().slice(0, 10),
            'formation', 'unit', null, f.schoolYear,
            st.isAdvance ? 'advance' : 'full',
            str(st.paymentMethod) === 'cheque' ? 'Chèque' : 'Espèces',
            num(st.amountPaid), num(st.totalRequired), num(st.discount) || 0,
            '', st.notes ?? null,
            st.chequeNumber ?? null, st.chequeDate ?? null, st.chequePaid ? 1 : 0, 0, Date.now()
          ));
        stmts.push(db.prepare("UPDATE payments SET ref_type = 'formation_enrollment', ref_id = ? WHERE id = ?").bind(str(st.id), 'fmt_' + str(st.id)));
      }
    }
  }
  return stmts;
}

export async function writeFormations(db: D1Database, formations: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const subjectIds = await resolveSubjectIds(db, centerId, (formations || []).flatMap((f: any) => (f.matieres || []).map((m: any) => m.subject)));
  const deleteStmts: D1PreparedStatement[] = [
    db.prepare("DELETE FROM payments WHERE ref_type = 'formation_enrollment' AND ref_id IN (SELECT id FROM formation_enrollments WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?))").bind(centerId),
    db.prepare('DELETE FROM formation_enrollment_matieres WHERE enrollment_id IN (SELECT id FROM formation_enrollments WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?))').bind(centerId),
    db.prepare('DELETE FROM formation_enrollments WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM formation_matieres WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM formations WHERE center_id = ?').bind(centerId)
  ];
  for (let i = 0; i < deleteStmts.length; i += 500) await db.batch(deleteStmts.slice(i, i + 500));
  const insertStmts = await buildFormationsStmts(db, formations, centerId, subjectIds);
  for (let i = 0; i < insertStmts.length; i += 500) await db.batch(insertStmts.slice(i, i + 500));
}

// ===========================================================================
// EVENTS (Événements & Sorties)
// ===========================================================================

/**
 * Lit les événements du centre. La table `events` est créée par la migration
 * SQL appliquée manuellement dans Cloudflare D1 (dépôt admin propriétaire du
 * schéma, aucune migration concurrente créée ici) : tant qu'elle n'est pas
 * déployée, on renvoie une liste vide plutôt que de casser /api/state.
 */
export async function readEvents(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM events WHERE center_id = ? ORDER BY date DESC').bind(centerId).all();
    return (results || []).map((r: any) => ({
      id: str(r.id),
      name: str(r.name),
      description: r.description == null ? undefined : str(r.description),
      category: str(r.category) || 'other',
      date: str(r.date),
      time: r.time == null ? undefined : str(r.time),
      location: str(r.location),
      priceStudent: num(r.price_student),
      priceParent: num(r.price_parent),
      priceSibling: num(r.price_sibling),
      priceExternal: num(r.price_external),
      maxCapacity: r.max_capacity == null ? undefined : num(r.max_capacity),
      busIncluded: bool(r.bus_included),
      status: str(r.status) || 'planned',
      schoolYear: str(r.school_year),
      participants: parseJson<any[]>(r.participants, []),
      createdAt: str(r.created_at)
    }));
  } catch {
    return [];
  }
}

function buildEventsStmts(db: D1Database, events: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const e of events || []) {
    if (!e || !e.id) continue;
    stmts.push(db.prepare(
      'INSERT INTO events (id, center_id, name, description, category, date, time, location, price_student, price_parent, price_sibling, price_external, max_capacity, bus_included, status, school_year, participants, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, category = excluded.category, date = excluded.date, time = excluded.time, location = excluded.location, price_student = excluded.price_student, price_parent = excluded.price_parent, price_sibling = excluded.price_sibling, price_external = excluded.price_external, max_capacity = excluded.max_capacity, bus_included = excluded.bus_included, status = excluded.status, school_year = excluded.school_year, participants = excluded.participants'
    ).bind(
      str(e.id), centerId, str(e.name), e.description ?? null, str(e.category) || 'other',
      str(e.date), e.time ?? null, str(e.location),
      num(e.priceStudent), num(e.priceParent), num(e.priceSibling), num(e.priceExternal),
      e.maxCapacity == null || e.maxCapacity === '' ? null : num(e.maxCapacity),
      e.busIncluded ? 1 : 0,
      str(e.status) || 'planned', str(e.schoolYear),
      JSON.stringify(e.participants || []),
      num(e.createdAt) || Date.now()
    ));
  }
  return stmts;
}

/**
 * Synchronisation par upsert : on insère/met à jour les événements reçus sans
 * jamais vider la table. Un wipe complet (DELETE + réinsertion) a déjà détruit
 * des événements existants quand le client envoyait un snapshot incomplet
 * (ex. état local vide au login). Seules les lignes connues du client et
 * absentes de son payload sont supprimées (suppression réelle depuis l'UI),
 * et un payload vide n'efface rien.
 * No-op silencieux si la table `events` n'existe pas encore (migration D1 pas
 * encore appliquée) afin de ne jamais faire échouer l'enregistrement de l'état.
 */
export async function writeEvents(db: D1Database, events: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  try {
    // Dédupliquer par id : un seul upsert par événement.
    const clean: any[] = [];
    const seen = new Set<string>();
    for (const e of events || []) {
      if (!e || e.id == null || seen.has(String(e.id))) continue;
      seen.add(String(e.id));
      clean.push(e);
    }

    const stmts = buildEventsStmts(db, clean, centerId);

    // D1 limite chaque requête à 100 paramètres liés : lots de 50 ids.
    if (clean.length > 0) {
      const ids = clean.map(e => String(e.id));
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        stmts.push(db.prepare(
          `DELETE FROM events WHERE center_id = ? AND id NOT IN (${chunk.map(() => '?').join(',')})`
        ).bind(centerId, ...chunk));
      }
    }

    for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
  } catch (err) {
    console.error('writeEvents skipped (events table unavailable):', err);
  }
}

// ===========================================================================
// ACTIVITIES (Activités & Planning)
// ===========================================================================

const ACTIVITY_CATEGORIES = new Set(['motricite', 'art', 'musique', 'jeu']);

/** Règles data-model : titre requis, catégorie de l'enum, timeStart < timeEnd, weekday 0–6 XOR date. */
function isValidActivity(a: any): boolean {
  if (!a || typeof a !== 'object') return false;
  if (!str(a.title).trim()) return false;
  if (!ACTIVITY_CATEGORIES.has(str(a.category))) return false;
  const ts = str(a.timeStart);
  const te = str(a.timeEnd);
  if (!/^\d{1,2}:\d{2}$/.test(ts) || !/^\d{1,2}:\d{2}$/.test(te) || ts >= te) return false;
  const hasDate = !!str(a.date);
  if (!hasDate) {
    const wd = Number(a.weekday);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) return false;
  }
  return true;
}

/**
 * Lit les activités du centre. Les tables sont créées par la migration SQL
 * appliquée manuellement dans Cloudflare D1 (dépôt admin propriétaire du
 * schéma) : tant qu'elle n'est pas déployée, on renvoie une liste vide.
 */
export async function readActivities(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM activities WHERE center_id = ? ORDER BY created_at, time_start').bind(centerId).all();
    return (results || []).map((r: any) => ({
      id: str(r.id),
      centerId: str(r.center_id),
      title: str(r.title),
      category: str(r.category),
      weekday: r.weekday == null ? undefined : num(r.weekday),
      date: r.date == null ? undefined : str(r.date),
      timeStart: str(r.time_start),
      timeEnd: str(r.time_end),
      location: r.location == null || str(r.location) === '' ? undefined : str(r.location),
      levelClass: r.level_class == null || str(r.level_class) === '' ? undefined : str(r.level_class),
      staffId: r.staff_id == null || str(r.staff_id) === '' ? undefined : str(r.staff_id),
      createdAt: str(r.created_at)
    }));
  } catch {
    return [];
  }
}

function buildActivitiesStmts(db: D1Database, activities: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const a of activities || []) {
    if (!a || !a.id || !isValidActivity(a)) continue;
    stmts.push(db.prepare(
      'INSERT OR REPLACE INTO activities (id, center_id, title, category, weekday, date, time_start, time_end, location, level_class, staff_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      str(a.id), centerId, str(a.title).trim(), str(a.category),
      a.date ? null : Number(a.weekday),
      str(a.date) || null,
      str(a.timeStart), str(a.timeEnd),
      str(a.location) || null, str(a.levelClass) || null, str(a.staffId) || null,
      str(a.createdAt) || new Date().toISOString()
    ));
  }
  return stmts;
}

export async function writeActivities(db: D1Database, activities: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  try {
    // Dédupliquer par id : un seul upsert par activité (premier gagne).
    const clean: any[] = [];
    const seen = new Set<string>();
    for (const a of activities || []) {
      if (!a || a.id == null || seen.has(String(a.id))) continue;
      if (!isValidActivity(a)) continue; // lignes invalides ignorées, jamais écrites
      seen.add(String(a.id));
      clean.push(a);
    }

    const stmts = buildActivitiesStmts(db, clean, centerId);

    if (clean.length > 0) {
      const ids = clean.map(a => String(a.id));
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        stmts.push(db.prepare(
          `DELETE FROM activities WHERE center_id = ? AND id NOT IN (${chunk.map(() => '?').join(',')})`
        ).bind(centerId, ...chunk));
      }
    } else {
      stmts.push(db.prepare('DELETE FROM activities WHERE center_id = ?').bind(centerId));
    }

    for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
  } catch (err) {
    console.error('writeActivities skipped (activities table unavailable):', err);
  }
}

// ===========================================================================
// SKILLS (Compétences & Skills)
// ===========================================================================

const SKILL_DOMAINS = new Set(['langage', 'motricite', 'social', 'autonomie']);
const SKILL_LEVELS = new Set(['non_evalue', 'emergent', 'en_cours', 'acquis']);

function isValidSkill(s: any): boolean {
  if (!s || typeof s !== 'object') return false;
  if (!str(s.label).trim()) return false;
  if (!SKILL_DOMAINS.has(str(s.domain))) return false;
  const hasFrom = s.ageFrom != null && s.ageFrom !== '';
  const hasTo = s.ageTo != null && s.ageTo !== '';
  if (hasFrom && (!Number.isFinite(Number(s.ageFrom)) || Number(s.ageFrom) < 0)) return false;
  if (hasTo && (!Number.isFinite(Number(s.ageTo)) || Number(s.ageTo) < 0)) return false;
  if (hasFrom && hasTo && Number(s.ageTo) < Number(s.ageFrom)) return false;
  return true;
}

/** Discriminateur : exactement un évaluateur (staff id XOR nom libre). */
function isValidEvaluation(e: any): boolean {
  if (!e || typeof e !== 'object') return false;
  if (!str(e.studentId).trim() || !str(e.skillId).trim()) return false;
  if (!SKILL_LEVELS.has(str(e.level))) return false;
  if (!str(e.evaluatedAt).trim()) return false;
  const byStaff = !!str(e.evaluatedByStaffId).trim();
  const byName = !!str(e.evaluatedByName).trim();
  return byStaff !== byName; // XOR strict
}

/**
 * Lit le document compétences du centre (catalogue + évaluations). Tables
 * créées par la migration admin ; renvoie un document vide tant qu'elles
 * n'existent pas.
 */
export async function readSkills(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<{ catalog: any[]; evaluations: any[] }> {
  try {
    const [skillRows, evalRows] = await Promise.all([
      db.prepare('SELECT * FROM skills WHERE center_id = ? ORDER BY domain, label').bind(centerId).all(),
      db.prepare('SELECT * FROM skill_evaluations WHERE center_id = ?').bind(centerId).all()
    ]);
    return {
      catalog: (skillRows.results || []).map((r: any) => ({
        id: str(r.id),
        centerId: str(r.center_id),
        domain: str(r.domain),
        label: str(r.label),
        ageFrom: r.age_from == null ? undefined : num(r.age_from),
        ageTo: r.age_to == null ? undefined : num(r.age_to),
        createdAt: str(r.created_at)
      })),
      evaluations: (evalRows.results || []).map((r: any) => ({
        id: str(r.id),
        centerId: str(r.center_id),
        studentId: str(r.student_id),
        skillId: str(r.skill_id),
        level: str(r.level),
        evaluatedByStaffId: r.evaluated_by_staff_id == null || str(r.evaluated_by_staff_id) === '' ? undefined : str(r.evaluated_by_staff_id),
        evaluatedByName: r.evaluated_by_name == null || str(r.evaluated_by_name) === '' ? undefined : str(r.evaluated_by_name),
        evaluatedAt: str(r.evaluated_at)
      }))
    };
  } catch {
    return { catalog: [], evaluations: [] };
  }
}

export async function writeSkills(db: D1Database, doc: { catalog?: any[]; evaluations?: any[] }, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  try {
    // 1. Catalogue valide de CETTE écriture — il définit ce qui survit.
    const skills: any[] = [];
    const seenSkills = new Set<string>();
    for (const s of (doc && doc.catalog) || []) {
      if (!s || s.id == null || seenSkills.has(String(s.id)) || !isValidSkill(s)) continue;
      seenSkills.add(String(s.id));
      skills.push(s);
    }

    // 2. Élèves du centre — une évaluation référençant un élève étranger est jetée.
    let validStudentIds = new Set<string>();
    try {
      const { results } = await db.prepare('SELECT id FROM students WHERE center_id = ?').bind(centerId).all();
      validStudentIds = new Set((results || []).map((r: any) => str(r.id)));
    } catch { /* table students indisponible : pas de filtrage possible */ }

    // 3. Évaluations valides, rattachées au catalogue de la même écriture
    //    (cascade : suppression d'une compétence => ses évaluations tombent)
    //    et à un élève du centre. Dédup (studentId, skillId) : la dernière gagne.
    const evals: any[] = [];
    const evalIndex = new Map<string, any>();
    for (const e of (doc && doc.evaluations) || []) {
      if (!e || e.id == null || !isValidEvaluation(e)) continue;
      if (!seenSkills.has(String(e.skillId))) continue; // cascade catalog
      if (validStudentIds.size > 0 && !validStudentIds.has(String(e.studentId))) continue; // isolation
      evalIndex.set(`${String(e.studentId)}|${String(e.skillId)}`, e); // latest-save-wins
    }
    const seenEvalIds = new Set<string>();
    for (const e of evalIndex.values()) {
      if (seenEvalIds.has(String(e.id))) continue;
      seenEvalIds.add(String(e.id));
      evals.push(e);
    }

    const stmts: D1PreparedStatement[] = [];
    for (const s of skills) {
      stmts.push(db.prepare(
        'INSERT OR REPLACE INTO skills (id, center_id, domain, label, age_from, age_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        str(s.id), centerId, str(s.domain), str(s.label).trim(),
        s.ageFrom != null && s.ageFrom !== '' ? Number(s.ageFrom) : null,
        s.ageTo != null && s.ageTo !== '' ? Number(s.ageTo) : null,
        str(s.createdAt) || new Date().toISOString()
      ));
    }
    for (const e of evals) {
      stmts.push(db.prepare(
        'INSERT OR REPLACE INTO skill_evaluations (id, center_id, student_id, skill_id, level, evaluated_by_staff_id, evaluated_by_name, evaluated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        str(e.id), centerId, str(e.studentId), str(e.skillId), str(e.level),
        str(e.evaluatedByStaffId) || null, str(e.evaluatedByName) || null, str(e.evaluatedAt)
      ));
    }

    // 4. Purge : compétences/évaluations absentes de l'écriture + évaluations
    //    orphelines (compétence retirée) dans la même transaction logique.
    if (skills.length > 0) {
      const ids = skills.map(s => String(s.id));
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        stmts.push(db.prepare(
          `DELETE FROM skills WHERE center_id = ? AND id NOT IN (${chunk.map(() => '?').join(',')})`
        ).bind(centerId, ...chunk));
      }
    } else {
      stmts.push(db.prepare('DELETE FROM skills WHERE center_id = ?').bind(centerId));
    }
    if (evals.length > 0) {
      const ids = evals.map(e => String(e.id));
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        stmts.push(db.prepare(
          `DELETE FROM skill_evaluations WHERE center_id = ? AND id NOT IN (${chunk.map(() => '?').join(',')})`
        ).bind(centerId, ...chunk));
      }
    } else {
      stmts.push(db.prepare('DELETE FROM skill_evaluations WHERE center_id = ?').bind(centerId));
    }

    for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
  } catch (err) {
    console.error('writeSkills skipped (skills tables unavailable):', err);
  }
}

// ===========================================================================
// FULL STATE
// ===========================================================================

export async function readState(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<AppState> {
  const [settings, students, staff, slots, courses, sessions, mealPlans, expenses, timesheets, externalStudents, revisionSeances, studentTimeSheets, formations, mealForfaitClosures, events] = await Promise.all([
    readSettings(db, centerId), readStudents(db, centerId), readStaff(db, centerId), readSlots(db, centerId), readCourses(db, centerId),
    readSessions(db, centerId), readMealPlans(db, centerId), readExpenses(db, centerId), readTimesheets(db, centerId),
    readExternalStudents(db, centerId), readRevisionSeances(db, centerId), readStudentTimeSheets(db, centerId), readFormations(db, centerId), readMealForfaitClosures(db, centerId),
    readEvents(db, centerId)
  ]);
  return { settings, students, staff, slots, courses, sessions, mealPlans, expenses, timesheets, externalStudents, revisionSeances, studentTimeSheets, formations, mealForfaitClosures, events };
}

export async function writeState(db: D1Database, state: AppState, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const dedupe = (rows: any[] | null | undefined): any[] => {
    if (!rows) return [];
    const seen = new Set<string>(); const out: any[] = [];
    for (const r of rows) { if (!r || r.id == null) continue; if (seen.has(String(r.id))) continue; seen.add(String(r.id)); out.push(r); }
    return out;
  };

  const deleteStmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payments WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM student_service_enrollments WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM student_years WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM meal_attendances WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM suivi_notes WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM academic_history WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM authorized_persons WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM siblings WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM student_parents WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM students WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM staff_payslips WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_payments WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_advances WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_leave_requests WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_schedule WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_subjects WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM timesheets WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM slot_enrollments WHERE slot_id IN (SELECT id FROM etude_slots WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM etude_slots WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM external_courses WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_courses WHERE center_id = ?').bind(centerId),
    db.prepare('DELETE FROM course_session_attendance WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_course_sessions WHERE center_id = ?').bind(centerId),

    // Registre « élèves externes hors-liste » : plus de table dédiée. Les
    // externes sont des students (student_type='external') ; ce bloc ne
    // supprime donc RIEN. Les appels buildExternalStudentsStmts sont neutralisés.

    db.prepare('DELETE FROM meal_plan_days WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM expenses WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM revision_seance_students WHERE seance_id IN (SELECT id FROM revision_seances WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM revision_seances WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM student_time_sheets WHERE center_id = ?').bind(centerId),

    db.prepare("DELETE FROM payments WHERE ref_type = 'formation_enrollment' AND ref_id IN (SELECT id FROM formation_enrollments WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?))").bind(centerId),
    db.prepare('DELETE FROM formation_enrollment_matieres WHERE enrollment_id IN (SELECT id FROM formation_enrollments WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?))').bind(centerId),
    db.prepare('DELETE FROM formation_enrollments WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM formation_matieres WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM formations WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM meal_forfait_closure_items WHERE closure_id IN (SELECT id FROM meal_forfait_closures WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM meal_forfait_closures WHERE center_id = ?').bind(centerId)
  ];

  const buildMealForfaitClosuresStmts = (closures: any[]): D1PreparedStatement[] => {
    const stmts: D1PreparedStatement[] = [];
    for (const closure of closures || []) {
      stmts.push(
        db.prepare('INSERT INTO meal_forfait_closures (id, center_id, month, school_year, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(closure.id, centerId, monthKeyFromLabel(closure.month) || str(closure.month), closure.schoolYear, Date.now())
      );
      for (const item of closure.items || []) {
        if (item) {
          stmts.push(
            db.prepare('INSERT INTO meal_forfait_closure_items (id, closure_id, student_id, student_name, net_paid, consumed_subscription_meals, unit_price, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(crypto.randomUUID(), closure.id, item.studentId, item.studentName, num(item.netPaid), num(item.consumedSubscriptionMeals), num(item.fraisParRepas), num(item.amount))
          );
        }
      }
    }
    return stmts;
  };

  const allDataStmts = [
    ...(await buildStudentsStmts(db, dedupe(state.students), centerId)),
    ...buildStaffStmts(db, dedupe(state.staff), centerId, await resolveSubjectIds(db, centerId, (dedupe(state.staff) || []).flatMap((s: any) => s.subjects || []))),
    ...buildSlotsStmts(db, dedupe(state.slots), centerId),
    ...buildCoursesStmts(db, dedupe(state.courses), centerId, false, await resolveSubjectIds(db, centerId, (dedupe(state.courses) || []).map((c: any) => c.subject))),
    ...buildSessionsStmts(db, dedupe(state.sessions), centerId),
    ...buildMealPlansStmts(db, dedupe(state.mealPlans), centerId),
    ...buildExpensesStmts(db, dedupe(state.expenses), centerId),
    ...buildTimesheetsStmts(db, dedupe(state.timesheets), centerId),
    ...buildExternalStudentsStmts(db, dedupe(state.externalStudents), centerId),
    ...buildRevisionSeancesStmts(db, dedupe(state.revisionSeances), centerId, await resolveSubjectIds(db, centerId, (dedupe(state.revisionSeances) || []).map((s: any) => s.subject))),
    ...buildStudentTimeSheetsStmts(db, dedupe(state.studentTimeSheets), centerId),
    ...(await buildFormationsStmts(db, dedupe(state.formations), centerId, await resolveSubjectIds(db, centerId, (dedupe(state.formations) || []).flatMap((f: any) => (f.matieres || []).map((m: any) => m.subject))))),
    ...buildMealForfaitClosuresStmts(dedupe(state.mealForfaitClosures))
  ];

  for (let i = 0; i < deleteStmts.length; i += 500) await db.batch(deleteStmts.slice(i, i + 500));
  for (let i = 0; i < allDataStmts.length; i += 500) await db.batch(allDataStmts.slice(i, i + 500));
  if (state.settings && typeof state.settings === 'object') await writeSettings(db, state.settings, centerId);
  // Les événements sont écrits à part : si la table `events` n'est pas encore
  // déployée, writeEvents() absorbe l'erreur sans faire échouer tout l'état.
  if (Array.isArray(state.events)) await writeEvents(db, dedupe(state.events), centerId);
}


export async function createSinglePayment(db: D1Database, payment: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  if (!payment || typeof payment !== 'object' || !payment.id) throw new Error('payment requires id');
  // Tenancy precheck: the FK (center_id, student_id) would 500; give a clean 404-ish error instead.
  const owner = await db.prepare('SELECT 1 AS ok FROM students WHERE id = ? AND center_id = ?').bind(payment.studentId, centerId).first<any>();
  if (!owner) throw new Error('Élève introuvable dans ce centre.');
  const { serviceKey, period } = paymentServiceKey(payment.service, payment.month);
  const isRefund = num(payment.amountPaid) < 0 || !!payment.refund;
  const methodKey = paymentMethodKey(isRefund && payment.method === undefined ? 'Espèces' : payment.method);
  // Chèque sans numéro → tant pis pour la CHECK : on le rejette avant l'INSERT.
  if (methodKey === 'cheque' && !str(payment.chequeNumber)) throw new Error('Numéro de chèque requis.');
  // schoolYear : champ explicite, sinon année extraite du libellé
  // ('Annuel (2026/2027)') sinon année académique courante du serveur.
  const monthYearMatch = /(\d{4}\/\d{4})/.exec(str(payment.month));
  const schoolYearRaw = payment.schoolYear != null && str(payment.schoolYear) !== '' ? payment.schoolYear : monthYearMatch?.[1];
  const schoolYearVal = /^\d{4}\/\d{4}$/.test(str(schoolYearRaw)) ? str(schoolYearRaw) : currentAcademicYear();
  const totalRequiredVal = num(payment.totalRequired);
  const discountVal = payment.discount != null ? num(payment.discount) : 0;
  if (totalRequiredVal <= 0 && num(payment.amountPaid) === 0) throw new Error('Montant du paiement nul.');
  await db.prepare('INSERT INTO payments (id, center_id, student_id, date, service_key, billing_period, period_month, school_year, payment_type, method, amount, total_required, discount, receipt_number, notes, cheque_number, cheque_date, cheque_paid, is_refund, refund_of, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
    payment.id, centerId, payment.studentId, payment.date, serviceKey, period, periodMonthFrom(payment.month),
    schoolYearVal,
    paymentTypeKey(payment.paymentType), methodKey,
    isRefund ? -num(payment.amountPaid) : num(payment.amountPaid),  // montant stocké positif ; signe → is_refund
    totalRequiredVal, discountVal,
    payment.receiptNumber, payment.notes ?? null,
    methodKey === 'cheque' ? (payment.chequeNumber ?? null) : null,
    methodKey === 'cheque' ? (payment.chequeDate ?? null) : null,
    methodKey === 'cheque' && payment.chequePaid ? 1 : 0,
    isRefund ? 1 : 0, isRefund ? (payment.refundOf ?? null) : null,
    payment.refType ?? null, payment.refId ?? null, Date.now()
  ).run();
}

export async function deleteSinglePayment(db: D1Database, paymentId: string, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  // Scopé au centre : sans ce filtre, un id d'un autre centre pourrait être supprimé.
  await db.prepare('DELETE FROM payments WHERE id = ? AND center_id = ?').bind(paymentId, centerId).run();
}

/**
 * Mise à jour partielle d'un paiement (ex. encaissement de chèque) —
 * champ par champ, scoppé au centre. Les champs absents sont conservés
 * (COALESCE) : le client n'envoie que { id, chequePaid }.
 */
export async function updateSinglePayment(db: D1Database, patch: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  if (!patch || !patch.id) throw new Error('payment patch requires id');
  // chequePaid → 1/0 explicitement, ou NULL (absent) pour conserver la valeur actuelle
  const chequePaidVal = patch.chequePaid === true ? 1 : patch.chequePaid === false ? 0 : null;
  const res = await db.prepare(
    'UPDATE payments SET cheque_paid = COALESCE(?, cheque_paid), cheque_number = COALESCE(?, cheque_number), cheque_date = COALESCE(?, cheque_date), notes = COALESCE(?, notes) WHERE id = ? AND center_id = ?'
  ).bind(
    chequePaidVal,
    patch.chequeNumber ?? null, patch.chequeDate ?? null, patch.notes ?? null,
    patch.id, centerId
  ).run();
  if (!res.meta.changes) throw new Error('Paiement introuvable dans ce centre.');
}


// ─── Center tenant row mapping (snake_case DB row → camelCase API shape) ───
// Used by /api/auth/login, /api/auth/me and /api/centers so the client
// receives the same CenterTenant shape. Nouveau schéma : les modules actifs
// ne sont plus une colonne JSON de `centers` mais la table center_modules —
// ils sont joints ici et livrés dans le champ `modules` du payload. Le mode
// cantine (center_meal_mode_history) est livré par /api/settings.
export async function mapCenterRow(db: D1Database, c: any): Promise<any> {
  let modules: string[] = [];
  try {
    const modRows = await db.prepare('SELECT module_key FROM center_modules WHERE center_id = ? ORDER BY module_key').bind(c.id).all();
    modules = (modRows.results || []).map((r: any) => str(r.module_key)).filter(Boolean);
  } catch {
    modules = [];
  }
  return {
    id: c.id,
    name: c.name,
    slug: c.slug || '',
    phoneNumber: c.phone_number || '',
    locationCity: c.location_city || '',
    plan: c.plan || 'starter',
    modules,
    status: c.status || 'active',
    trialEndsAt: c.trial_ends_at || null,
    subscriptionEndsAt: c.subscription_ends_at || null,
    billingCycle: c.billing_cycle || 'monthly',
    monthlyPrice: c.monthly_price !== null && c.monthly_price !== undefined ? Number(c.monthly_price) : 0,
    centerType: c.center_type || '',
    logoUrl: c.logo_url || '',
    createdAt: c.created_at || Date.now()
  };
}

// ===========================================================================
// SUIVI NOTES (notes / devoirs) — endpoint dédié /api/suivi-notes
// ===========================================================================

/**
 * GET /api/suivi-notes?studentId=… — toutes les notes d'un élève du centre,
 * ou toutes les notes du centre si studentId est absent.
 */
export async function readSuiviNotes(db: D1Database, centerId: string, studentId?: string | null): Promise<any[]> {
  if (studentId) {
    const res = await db.prepare(
      'SELECT n.*, sub.name AS subject FROM suivi_notes n JOIN students s ON n.student_id = s.id LEFT JOIN subjects sub ON sub.id = n.subject_id WHERE s.center_id = ? AND n.student_id = ? ORDER BY n.school_year, n.trimester, sub.name'
    ).bind(centerId, studentId).all();
    return res.results || [];
  }
  const res = await db.prepare(
    'SELECT n.*, sub.name AS subject FROM suivi_notes n JOIN students s ON n.student_id = s.id LEFT JOIN subjects sub ON sub.id = n.subject_id WHERE s.center_id = ? ORDER BY n.school_year, n.trimester, sub.name'
  ).bind(centerId).all();
  return res.results || [];
}

export interface SuiviNoteInput {
  studentId: string;
  schoolYear: string;
  trimester: number;
  /** Nom de la matière (résolu en subject_id serveur) — ou subjectId direct. */
  subject?: string;
  subjectId?: string;
  devoir1?: number | null;
  devoir2?: number | null;
  synthese?: number | null;
}

/**
 * Insère (ou met à jour) UNE note — l'élève n'est PAS renvoyé entier.
 * L'id est un UUID v4 généré côté serveur (crypto.randomUUID) : deux centres
 * ne peuvent pas entrer en collision. L'unicité (student_id, school_year,
 * trimester, subject) rend l'upsert idempotent : re-saisir une note pour la
 * même matière remplace la valeur au lieu de dupliquer la ligne.
 */
export async function upsertSingleSuiviNote(db: D1Database, note: SuiviNoteInput, centerId: string): Promise<void> {
  if (!note || typeof note !== 'object' || !str(note.studentId)) throw new Error('معرّف التلميذ مطلوب.');
  const trimester = num(note.trimester);
  if (![1, 2, 3].includes(trimester)) throw new Error('الثلاثي غير صالح (1، 2 أو 3).');
  const schoolYear = str(note.schoolYear);
  if (!/^\d{4}\/\d{4}$/.test(schoolYear)) throw new Error('السنة الدراسية غير صالحة (مثال: 2026/2027).');
  const gradeVal = (v: unknown) => (v == null || v === '' ? null : num(v));
  // Tenancy precheck : le FK student_id seul ne connaît pas le centre.
  const owner = await db.prepare('SELECT 1 AS ok FROM students WHERE id = ? AND center_id = ?').bind(str(note.studentId), centerId).first<any>();
  if (!owner) throw new Error('التلميذ غير موجود في هذا المركز.');
  // subjectId direct du client (liste /api/subjects) OU nom résolu serveur.
  let subjectId = str(note.subjectId);
  if (subjectId) {
    const sub = await db.prepare('SELECT 1 AS ok FROM subjects WHERE id = ? AND center_id = ?').bind(subjectId, centerId).first<any>();
    if (!sub) throw new Error('المادة غير موجودة في هذا المركز.');
  } else {
    if (!str(note.subject)) throw new Error('المادة مطلوبة.');
    const resolved = await resolveSubjectIds(db, centerId, [str(note.subject)]);
    subjectId = resolved[str(note.subject)] || '';
    if (!subjectId) throw new Error('المادة غير موجودة في هذا المركز.');
  }
  const grades = [gradeVal(note.devoir1), gradeVal(note.devoir2), gradeVal(note.synthese)];
  if (grades.some(g => g !== null && (g < 0 || g > 20))) throw new Error('النقطة يجب أن تكون بين 0 و 20.');
  await db.prepare(
    `INSERT INTO suivi_notes (id, student_id, school_year, trimester, subject_id, devoir1, devoir2, synthese)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (student_id, school_year, trimester, subject_id) DO UPDATE SET
       devoir1 = excluded.devoir1, devoir2 = excluded.devoir2, synthese = excluded.synthese`
  ).bind(crypto.randomUUID(), str(note.studentId), schoolYear, trimester, subjectId, grades[0], grades[1], grades[2]).run();
}

/** Supprime UNE note par id, scoppée au centre. */
export async function deleteSingleSuiviNote(db: D1Database, noteId: string, centerId: string): Promise<void> {
  await db.prepare(
    'DELETE FROM suivi_notes WHERE id = ? AND student_id IN (SELECT id FROM students WHERE center_id = ?)'
  ).bind(noteId, centerId).run();
}
