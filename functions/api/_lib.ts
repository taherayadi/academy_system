/// <reference types="@cloudflare/workers-types" />

/**
 * Shared helpers for the Cloudflare Pages Functions.
 * Faithfully translated from server/data.ts (SQLite) to Cloudflare D1 (async).
 * All business logic, error messages, and data shapes preserved from production.
 */

export interface Env {
  DB: D1Database;
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
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
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
// Password hashing (WebCrypto)
// ---------------------------------------------------------------------------

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
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
  prefix = 'auth',
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
  await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind('auth:' + ip).run();
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export const DEFAULT_CENTER_ID = 'e1000000-0000-4000-8000-000000000001';
const SESSION_COOKIE = 'tc_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

let sessionsTableReady = false;
export async function ensureSessionsTable(db: D1Database): Promise<void> {
  if (sessionsTableReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, center_id TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)').run();
  try { await db.prepare('ALTER TABLE sessions ADD COLUMN center_id TEXT').run(); } catch {}
  sessionsTableReady = true;
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
      return val ? decodeURIComponent(val) : null;
    }
  }
  return null;
}

export async function createSession(db: D1Database, email: string, centerId: string = DEFAULT_CENTER_ID): Promise<string> {
  await ensureSessionsTable(db);
  const token = crypto.randomUUID();
  const now = Date.now();
  await db.prepare('INSERT INTO sessions (token, email, center_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(token, email, centerId, now + SESSION_DURATION_MS, now).run();
  return token;
}

export async function validateSession(db: D1Database, request: Request): Promise<{ email: string; token: string; centerId: string; role?: string } | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  await ensureSessionsTable(db);
  const row = await db.prepare('SELECT s.email, s.token, COALESCE(s.center_id, u.center_id, ?) as center_id, u.role FROM sessions s LEFT JOIN users u ON s.email = u.email WHERE s.token = ? AND s.expires_at > ?')
    .bind(DEFAULT_CENTER_ID, token, Date.now())
    .first<{ email: string; token: string; center_id: string; role?: string }>();
  if (!row) return null;
  return { email: row.email, token: row.token, centerId: row.center_id || DEFAULT_CENTER_ID, role: row.role };
}

export function getContextCenterId(context: any): string {
  const session = context?.data?.session;
  return session?.centerId || DEFAULT_CENTER_ID;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function purgeExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
}

export function makeSessionCookie(token: string, request: Request): string {
  const secure = isHttpsRequest(request) ? '; Secure' : '';
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  return SESSION_COOKIE + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAge + secure;
}

export function clearSessionCookie(request: Request): string {
  const secure = isHttpsRequest(request) ? '; Secure' : '';
  return SESSION_COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + secure;
}

// ---------------------------------------------------------------------------
// Role enforcement
// ---------------------------------------------------------------------------

export async function requireSuperAdmin(db: D1Database, email: string): Promise<void> {
  const row = await db.prepare('SELECT role FROM users WHERE email = ?').bind(email).first<{ role: string }>();
  if (!row || row.role !== 'super_admin') {
    throw Object.assign(new Error('Acc\u00e8s refus\u00e9. Droits insuffisants.'), { status: 403 });
  }
}

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
}

// ===========================================================================
// SETTINGS
// ===========================================================================

export async function readSettings(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any> {
  let settingsRow = await db.prepare('SELECT * FROM center_settings WHERE center_id = ?').bind(centerId).first<any>();
  if (!settingsRow && centerId === DEFAULT_CENTER_ID) {
    settingsRow = await db.prepare('SELECT * FROM settings WHERE id = 1').first<any>();
  }
  let feeRows = (await db.prepare('SELECT * FROM center_fee_sets WHERE center_id = ?').bind(centerId).all()).results;
  if ((!feeRows || feeRows.length === 0) && centerId === DEFAULT_CENTER_ID) {
    feeRows = (await db.prepare('SELECT * FROM fee_sets').all()).results;
  }
  const subjectRows = (await db.prepare('SELECT name FROM subjects').all()).results;
  const etablissementRows = (await db.prepare('SELECT name FROM etablissements').all()).results;

  const feesByYear: Record<string, any> = {};
  let defaultFees: any = null;
  feeRows.forEach((row: any) => {
    const fees = {
      fraisAnnuelSuivi: num(row.frais_annuel_suivi),
      fraisMensuelSuivi: num(row.frais_mensuel_suivi),
      fraisAnnuelBibliotheque: num(row.frais_annuel_bibliotheque),
      fraisMensuelBibliotheque: num(row.frais_mensuel_bibliotheque),
      fraisAbonnementRepas: num(row.frais_abonnement_repas),
      fraisParRepas: num(row.frais_par_repas),
      prixPlatTraiteur: row.prix_plat_traiteur == null ? 6 : num(row.prix_plat_traiteur),
      fraisAnnuelEtude: num(row.frais_annuel_etude),
      fraisMensuelEtude: num(row.frais_mensuel_etude),
      fraisAssuranceCoursExternes: num(row.frais_assurance_cours_externes),
      fraisGouterMatinMensuel: num(row.frais_gouter_matin_mensuel || 0),
      fraisGouterMatinUnitaire: num(row.frais_gouter_matin_unitaire || 0),
      fraisGouterSoirMensuel: num(row.frais_gouter_soir_mensuel || 0),
      fraisGouterSoirUnitaire: num(row.frais_gouter_soir_unitaire || 0),
      fraisDeuxGoutersMensuel: num(row.frais_deux_gouters_mensuel || 0)
    };
    if (row.year === 'DEFAULT') defaultFees = fees;
    else feesByYear[row.year] = fees;
  });

  const baseFees = defaultFees || (feeRows.length > 0 ? {
    fraisAnnuelSuivi: num((feeRows[0] as any).frais_annuel_suivi),
    fraisMensuelSuivi: num((feeRows[0] as any).frais_mensuel_suivi),
    fraisAnnuelBibliotheque: num((feeRows[0] as any).frais_annuel_bibliotheque),
    fraisMensuelBibliotheque: num((feeRows[0] as any).frais_mensuel_bibliotheque),
    fraisAbonnementRepas: num((feeRows[0] as any).frais_abonnement_repas),
    fraisParRepas: num((feeRows[0] as any).frais_par_repas),
    prixPlatTraiteur: (feeRows[0] as any).prix_plat_traiteur == null ? 6 : num((feeRows[0] as any).prix_plat_traiteur),
    fraisAnnuelEtude: num((feeRows[0] as any).frais_annuel_etude),
    fraisMensuelEtude: num((feeRows[0] as any).frais_mensuel_etude),
    fraisAssuranceCoursExternes: num((feeRows[0] as any).frais_assurance_cours_externes),
    fraisGouterMatinMensuel: num((feeRows[0] as any).frais_gouter_matin_mensuel || 0),
    fraisGouterMatinUnitaire: num((feeRows[0] as any).frais_gouter_matin_unitaire || 0),
    fraisGouterSoirMensuel: num((feeRows[0] as any).frais_gouter_soir_mensuel || 0),
    fraisGouterSoirUnitaire: num((feeRows[0] as any).frais_gouter_soir_unitaire || 0),
    fraisDeuxGoutersMensuel: num((feeRows[0] as any).frais_deux_gouters_mensuel || 0)
  } : { fraisAnnuelSuivi: 0, fraisMensuelSuivi: 0, fraisAnnuelBibliotheque: 0, fraisMensuelBibliotheque: 0, fraisAbonnementRepas: 0, fraisParRepas: 0, prixPlatTraiteur: 6, fraisAnnuelEtude: 0, fraisMensuelEtude: 0, fraisAssuranceCoursExternes: 0, fraisGouterMatinMensuel: 0, fraisGouterMatinUnitaire: 0, fraisGouterSoirMensuel: 0, fraisGouterSoirUnitaire: 0, fraisDeuxGoutersMensuel: 0 });

  DEFAULT_ACADEMIC_YEARS.forEach(yr => { if (!feesByYear[yr]) feesByYear[yr] = { ...baseFees }; });

  const subjects = subjectRows.length > 0
    ? subjectRows.map((r: any) => str(r.name)).filter(Boolean)
    : [...DEFAULT_SUBJECTS];

  const etablissements = etablissementRows.length > 0
    ? etablissementRows.map((r: any) => str(r.name)).filter(Boolean)
    : [];

  return {
    centerName: settingsRow?.center_name || 'المركز',
    phoneNumber: settingsRow?.phone_number || '',
    locationCity: settingsRow?.location_city || '',
    geminiApiKey: settingsRow?.gemini_api_key || '',
    mealOperatingMode: settingsRow?.meal_operating_mode || 'external_traiteur',
    fees: baseFees, feesByYear, subjects, etablissements
  };
}

export async function writeSettings(db: D1Database, settings: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  if (!settings || typeof settings !== 'object') return;
  const stmts: D1PreparedStatement[] = [];
  stmts.push(db.prepare(
    'INSERT INTO center_settings (center_id, center_name, phone_number, location_city, gemini_api_key, meal_operating_mode) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(center_id) DO UPDATE SET center_name = excluded.center_name, phone_number = excluded.phone_number, location_city = excluded.location_city, gemini_api_key = excluded.gemini_api_key, meal_operating_mode = excluded.meal_operating_mode'
  ).bind(
    centerId,
    str(settings.centerName || settings.center_name || 'المركز'),
    str(settings.phoneNumber || settings.phone_number || ''),
    str(settings.locationCity || settings.location_city || ''),
    str(settings.geminiApiKey || settings.gemini_api_key || ''),
    str(settings.mealOperatingMode || settings.meal_operating_mode || 'external_traiteur')
  ));

  if (centerId === DEFAULT_CENTER_ID) {
    stmts.push(db.prepare(
      'INSERT INTO settings (id, center_name, phone_number, location_city, gemini_api_key) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET center_name = excluded.center_name, phone_number = excluded.phone_number, location_city = excluded.location_city, gemini_api_key = excluded.gemini_api_key'
    ).bind(str(settings.centerName || settings.center_name || 'المركز'), str(settings.phoneNumber || settings.phone_number || ''), str(settings.locationCity || settings.location_city || ''), str(settings.geminiApiKey || settings.gemini_api_key || '')));
  }

  stmts.push(db.prepare('DELETE FROM center_fee_sets WHERE center_id = ?').bind(centerId));
  if (centerId === DEFAULT_CENTER_ID) {
    stmts.push(db.prepare('DELETE FROM fee_sets'));
  }
  stmts.push(db.prepare('DELETE FROM subjects'));
  stmts.push(db.prepare('DELETE FROM etablissements'));

  const addFee = (yearKey: string, rawFeeObj: any) => {
    const fee = extractFeeValues(rawFeeObj);
    stmts.push(db.prepare('INSERT OR REPLACE INTO center_fee_sets (center_id, year, frais_annuel_suivi, frais_mensuel_suivi, frais_annuel_bibliotheque, frais_mensuel_bibliotheque, frais_abonnement_repas, frais_par_repas, frais_abonnement_repas_traiteur, frais_par_repas_traiteur, prix_plat_traiteur, frais_annuel_etude, frais_mensuel_etude, frais_assurance_cours_externes, frais_gouter_matin_mensuel, frais_gouter_matin_unitaire, frais_gouter_soir_mensuel, frais_gouter_soir_unitaire, frais_deux_gouters_mensuel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
      centerId, yearKey, fee.fraisAnnuelSuivi, fee.fraisMensuelSuivi, fee.fraisAnnuelBibliotheque, fee.fraisMensuelBibliotheque, fee.fraisAbonnementRepas, fee.fraisParRepas, null, null, fee.prixPlatTraiteur, fee.fraisAnnuelEtude, fee.fraisMensuelEtude, fee.fraisAssuranceCoursExternes,
      num((rawFeeObj as any)?.fraisGouterMatinMensuel || 0), num((rawFeeObj as any)?.fraisGouterMatinUnitaire || 0), num((rawFeeObj as any)?.fraisGouterSoirMensuel || 0), num((rawFeeObj as any)?.fraisGouterSoirUnitaire || 0), num((rawFeeObj as any)?.fraisDeuxGoutersMensuel || 0)
    ));
    if (centerId === DEFAULT_CENTER_ID) {
      stmts.push(db.prepare('INSERT OR REPLACE INTO fee_sets (year, frais_annuel_suivi, frais_mensuel_suivi, frais_annuel_bibliotheque, frais_mensuel_bibliotheque, frais_abonnement_repas, frais_par_repas, frais_abonnement_repas_traiteur, frais_par_repas_traiteur, prix_plat_traiteur, frais_annuel_etude, frais_mensuel_etude, frais_assurance_cours_externes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(yearKey, fee.fraisAnnuelSuivi, fee.fraisMensuelSuivi, fee.fraisAnnuelBibliotheque, fee.fraisMensuelBibliotheque, fee.fraisAbonnementRepas, fee.fraisParRepas, null, null, fee.prixPlatTraiteur, fee.fraisAnnuelEtude, fee.fraisMensuelEtude, fee.fraisAssuranceCoursExternes));
    }
  };

  let baseFeeObj = settings.fees;
  if (!baseFeeObj || typeof baseFeeObj !== 'object') { if (settings.fraisAnnuelSuivi != null || settings.frais_annuel_suivi != null) baseFeeObj = settings; }
  if (baseFeeObj) addFee('DEFAULT', baseFeeObj);
  if (settings.feesByYear && typeof settings.feesByYear === 'object') { for (const [year, yFees] of Object.entries(settings.feesByYear)) { if (!year) continue; addFee(String(year), yFees); } }
  if (baseFeeObj) { DEFAULT_ACADEMIC_YEARS.forEach(yr => { if (!settings.feesByYear || !settings.feesByYear[yr]) addFee(yr, baseFeeObj); }); }
  const subjectsToSave = Array.isArray(settings.subjects) && settings.subjects.length > 0 ? Array.from(new Set(settings.subjects.map((s: any) => str(s).trim()).filter(Boolean))) : DEFAULT_SUBJECTS;
  for (const s of subjectsToSave) stmts.push(db.prepare('INSERT OR IGNORE INTO subjects (name) VALUES (?)').bind(s));
  const etablissementsToSave = Array.isArray(settings.etablissements) && settings.etablissements.length > 0 ? Array.from(new Set(settings.etablissements.map((s: any) => str(s).trim()).filter(Boolean))) : [];
  for (const e of etablissementsToSave) stmts.push(db.prepare('INSERT OR IGNORE INTO etablissements (name) VALUES (?)').bind(e));
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
    tr.subjects[r.subject] = { devoir1: r.devoir1 == null ? undefined : r.devoir1, devoir2: r.devoir2 == null ? undefined : r.devoir2, synthese: r.synthese == null ? undefined : r.synthese };
  });
  return Object.values(byYear);
}

export async function readStudents(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [studentsRows, parentsRows, siblingsRows, authRows, histRows, paymentRows, mealRows, notesRows] = await Promise.all([
    db.prepare('SELECT * FROM students WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT p.* FROM student_parents p JOIN students s ON p.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT sib.* FROM siblings sib JOIN students s ON sib.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT a.* FROM authorized_persons a JOIN students s ON a.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT h.* FROM academic_history h JOIN students s ON h.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT pay.* FROM payments pay JOIN students s ON pay.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT m.* FROM meal_attendances m JOIN students s ON m.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT n.* FROM suivi_notes n JOIN students s ON n.student_id = s.id WHERE s.center_id = ?').bind(centerId).all()
  ]);
  const parentsByStudent: Record<string, any> = {};
  parentsRows.results.forEach((r: any) => { const key = str(r.student_id); if (!parentsByStudent[key]) parentsByStudent[key] = {}; parentsByStudent[key][r.role] = { name: str(r.name), birthDate: str(r.birth_date), profession: str(r.profession), address: str(r.address), phoneFixed: str(r.phone_fixed), phoneMobile: str(r.phone_mobile), email: str(r.email), extraPhones: parseJson(r.extra_phones, undefined) }; });
  const siblingsByStudent: Record<string, any[]> = {};
  siblingsRows.results.forEach((r: any) => { (siblingsByStudent[str(r.student_id)] = siblingsByStudent[str(r.student_id)] || []).push({ id: str(r.id), name: str(r.name), age: num(r.age), grade: str(r.grade) }); });
  const authByStudent: Record<string, any[]> = {};
  authRows.results.forEach((r: any) => { (authByStudent[str(r.student_id)] = authByStudent[str(r.student_id)] || []).push({ id: str(r.id), name: str(r.name), phone: str(r.phone), relation: str(r.relation) }); });
  const histByStudent: Record<string, any> = {};
  histRows.results.forEach((r: any) => { const key = str(r.student_id); if (!histByStudent[key]) histByStudent[key] = {}; histByStudent[key]['nMinus' + num(r.n_minus)] = { school: str(r.school), grade: str(r.grade) }; });
  const paymentsByStudent: Record<string, any[]> = {};
  paymentRows.results.forEach((r: any) => { const key = str(r.student_id); const month = str(r.month); (paymentsByStudent[key] = paymentsByStudent[key] || []).push({ id: str(r.id), date: str(r.date), amountPaid: num(r.amount_paid), totalRequired: num(r.total_required), remainingBalance: num(r.remaining_balance), service: normalizePaymentService(r.service, month), month, paymentType: str(r.payment_type), method: str(r.method), receiptNumber: str(r.receipt_number), notes: r.notes == null ? undefined : str(r.notes), discount: r.discount == null ? undefined : num(r.discount), refund: bool(r.refund), refundOf: r.refund_of == null ? undefined : str(r.refund_of), chequeNumber: r.cheque_number == null ? undefined : str(r.cheque_number), chequeDate: r.cheque_date == null ? undefined : str(r.cheque_date), chequePaid: r.cheque_paid ? true : undefined }); });
  const mealsByStudent: Record<string, any[]> = {};
  mealRows.results.forEach((r: any) => { (mealsByStudent[str(r.student_id)] = mealsByStudent[str(r.student_id)] || []).push({ date: str(r.date), service: r.service ? str(r.service) : 'lunch', type: str(r.type), paid: bool(r.paid), paidAt: r.paid_at == null ? undefined : str(r.paid_at), traiteurPrice: r.traiteur_price != null ? num(r.traiteur_price) : undefined }); });
  const notesByStudent: Record<string, any[]> = {};
  notesRows.results.forEach((r: any) => { (notesByStudent[str(r.student_id)] = notesByStudent[str(r.student_id)] || []).push({ schoolYear: str(r.school_year), trimester: num(r.trimester), subject: str(r.subject), devoir1: r.devoir1 == null ? undefined : num(r.devoir1), devoir2: r.devoir2 == null ? undefined : num(r.devoir2), synthese: r.synthese == null ? undefined : num(r.synthese) }); });

  return studentsRows.results.map((r: any) => {
    const id = str(r.id);
    return {
      id, firstName: str(r.first_name), lastName: str(r.last_name), birthDate: str(r.birth_date), birthPlace: str(r.birth_place), grade: str(r.grade),
      etablissement: r.etablissement == null ? undefined : str(r.etablissement),
      academicYear: r.academic_year == null ? undefined : str(r.academic_year),
      mother: parentsByStudent[id]?.mother ?? { name: '', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '', email: '' },
      father: parentsByStudent[id]?.father ?? { name: '', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '', email: '' },
      parentalSituation: str(r.parental_situation), parentalComments: r.parental_comments == null ? undefined : str(r.parental_comments),
      siblings: siblingsByStudent[id] || [], authorizedPersons: authByStudent[id] || [], allergies: str(r.allergies),
      academicHistory: { nMinus1: histByStudent[id]?.nMinus1 ?? { school: '', grade: '' }, nMinus2: histByStudent[id]?.nMinus2 ?? { school: '', grade: '' }, nMinus3: histByStudent[id]?.nMinus3 ?? { school: '', grade: '' } },
      registration: { date: str(r.registration_date), location: str(r.registration_location), signedElectronically: bool(r.registration_signed_electronically), signatureName: r.registration_signature_name == null ? undefined : str(r.registration_signature_name) },
      enrolledServices: { suivi: bool(r.enrolled_suivi), etude: bool(r.enrolled_etude), library: bool(r.enrolled_library), meals: bool(r.enrolled_meals) },
      suiviFees: { annualRegistrationFee: num(r.suivi_annual_fee), monthlyFee: num(r.suivi_monthly_fee) },
      etudeFees: { annualRegistrationFee: num(r.etude_annual_fee), monthlyFee: num(r.etude_monthly_fee) },
      libraryFees: { annualRegistrationFee: num(r.library_annual_fee), monthlyFee: num(r.library_monthly_fee) },
      mealSubscription: { mode: str(r.meal_mode) === 'subscription' ? 'subscription' : 'unit', monthlyPrice: num(r.meal_monthly_price), unitPrice: num(r.meal_unit_price), prepaidMeals: num(r.meal_prepaid), consumedMealsCount: num(r.meal_consumed), active: bool(r.meal_active) },
      mealAttendances: mealsByStudent[id] || [], payments: paymentsByStudent[id] || [], suiviNotes: buildSuiviNotes(notesByStudent[id] || []),
      timeSheetId: r.time_sheet_id == null ? undefined : str(r.time_sheet_id)
    };
  });
}

function buildStudentsStmts(db: D1Database, students: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const s of students || []) {
    stmts.push(db.prepare('INSERT INTO students (id, first_name, last_name, birth_date, birth_place, grade, etablissement, academic_year, parental_situation, parental_comments, allergies, registration_date, registration_location, registration_signed_electronically, registration_signature_name, enrolled_suivi, enrolled_etude, enrolled_library, enrolled_meals, suivi_annual_fee, suivi_monthly_fee, etude_annual_fee, etude_monthly_fee, library_annual_fee, library_monthly_fee, meal_mode, meal_monthly_price, meal_unit_price, meal_prepaid, meal_consumed, meal_active, time_sheet_id, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, s.firstName, s.lastName, s.birthDate, s.birthPlace, s.grade, s.etablissement ?? null, s.academicYear ?? null, s.parentalSituation, s.parentalComments ?? null, s.allergies, s.registration?.date ?? null, s.registration?.location ?? null, s.registration?.signedElectronically ? 1 : 0, s.registration?.signatureName ?? null, s.enrolledServices?.suivi ? 1 : 0, s.enrolledServices?.etude ? 1 : 0, s.enrolledServices?.library ? 1 : 0, s.enrolledServices?.meals ? 1 : 0, num(s.suiviFees?.annualRegistrationFee), num(s.suiviFees?.monthlyFee), num(s.etudeFees?.annualRegistrationFee), num(s.etudeFees?.monthlyFee), num(s.libraryFees?.annualRegistrationFee), num(s.libraryFees?.monthlyFee), s.mealSubscription?.mode === 'subscription' ? 'subscription' : 'unit', num(s.mealSubscription?.monthlyPrice), num(s.mealSubscription?.unitPrice), num(s.mealSubscription?.prepaidMeals), num(s.mealSubscription?.consumedMealsCount), s.mealSubscription?.active ? 1 : 0, s.timeSheetId ?? null, centerId));
    if (s.etablissement && String(s.etablissement).trim()) {
      stmts.push(db.prepare('INSERT OR IGNORE INTO etablissements (name) VALUES (?)').bind(String(s.etablissement).trim()));
    }
    const mother = s.mother || {}; const father = s.father || {};
    stmts.push(db.prepare('INSERT INTO student_parents (student_id, role, name, birth_date, profession, address, phone_fixed, phone_mobile, email, extra_phones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, 'mother', mother.name ?? '', mother.birthDate ?? '', mother.profession ?? '', mother.address ?? '', mother.phoneFixed ?? '', mother.phoneMobile ?? '', mother.email ?? '', mother.extraPhones ? JSON.stringify(mother.extraPhones) : null));
    stmts.push(db.prepare('INSERT INTO student_parents (student_id, role, name, birth_date, profession, address, phone_fixed, phone_mobile, email, extra_phones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, 'father', father.name ?? '', father.birthDate ?? '', father.profession ?? '', father.address ?? '', father.phoneFixed ?? '', father.phoneMobile ?? '', father.email ?? '', father.extraPhones ? JSON.stringify(father.extraPhones) : null));
    for (const sib of s.siblings || []) stmts.push(db.prepare('INSERT INTO siblings (id, student_id, name, age, grade) VALUES (?, ?, ?, ?, ?)').bind(sib.id, s.id, sib.name, num(sib.age), sib.grade));
    for (const ap of s.authorizedPersons || []) stmts.push(db.prepare('INSERT INTO authorized_persons (id, student_id, name, phone, relation) VALUES (?, ?, ?, ?, ?)').bind(ap.id, s.id, ap.name, ap.phone, ap.relation));
    const hist = s.academicHistory || {};
    [['nMinus1', 1], ['nMinus2', 2], ['nMinus3', 3]].forEach(([key, n]) => { const h = hist[key]; stmts.push(db.prepare('INSERT INTO academic_history (student_id, n_minus, school, grade) VALUES (?, ?, ?, ?)').bind(s.id, n, h?.school ?? '', h?.grade ?? '')); });
    for (const p of s.payments || []) stmts.push(db.prepare('INSERT INTO payments (id, student_id, date, amount_paid, total_required, remaining_balance, service, month, payment_type, method, receipt_number, notes, discount, refund, refund_of, cheque_number, cheque_date, cheque_paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(p.id, s.id, p.date, num(p.amountPaid), num(p.totalRequired), num(p.remainingBalance), normalizePaymentService(p.service, p.month), p.month, p.paymentType, p.method, p.receiptNumber, p.notes ?? null, p.discount ?? null, p.refund ? 1 : 0, p.refundOf ?? null, p.chequeNumber ?? null, p.chequeDate ?? null, p.chequePaid ? 1 : 0));
    for (const m of s.mealAttendances || []) stmts.push(db.prepare('INSERT INTO meal_attendances (student_id, date, service, type, paid, paid_at, traiteur_price) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(s.id, m.date, m.service || 'lunch', m.type, m.paid ? 1 : 0, m.paidAt ?? null, m.traiteurPrice != null ? num(m.traiteurPrice) : null));
    for (const yr of s.suiviNotes || []) for (const tr of yr.trimesters || []) for (const [subject, grades] of Object.entries(tr.subjects || {})) { const g = grades as any; stmts.push(db.prepare('INSERT INTO suivi_notes (student_id, school_year, trimester, subject, devoir1, devoir2, synthese) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(s.id, yr.schoolYear, tr.trimester, subject, g?.devoir1 ?? null, g?.devoir2 ?? null, g?.synthese ?? null)); }
  }
  return stmts;
}

export async function writeStudents(db: D1Database, students: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payments WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM meal_attendances WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM suivi_notes WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM academic_history WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM authorized_persons WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM siblings WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM student_parents WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM students WHERE center_id = ?').bind(centerId),
    ...buildStudentsStmts(db, students, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function createSingleStudent(db: D1Database, student: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = buildStudentsStmts(db, [student], centerId);
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function updateSingleStudent(db: D1Database, student: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const deleteStmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payments WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM meal_attendances WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM suivi_notes WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM academic_history WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM authorized_persons WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM siblings WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM student_parents WHERE student_id = ?').bind(student.id),
    db.prepare('DELETE FROM students WHERE id = ? AND center_id = ?').bind(student.id, centerId)
  ];
  const insertStmts = buildStudentsStmts(db, [student], centerId);
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
    db.prepare('SELECT sub.* FROM staff_subjects sub JOIN staff st ON sub.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT sc.* FROM staff_schedule sc JOIN staff st ON sc.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT p.* FROM staff_payments p JOIN staff st ON p.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT ps.* FROM staff_payslips ps JOIN staff st ON ps.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT l.* FROM staff_leave_requests l JOIN staff st ON l.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT a.* FROM staff_advances a JOIN staff st ON a.staff_id = st.id WHERE st.center_id = ?').bind(centerId).all()
  ]);
  const subjectsByStaff: Record<string, string[]> = {};
  subjectsRows.results.forEach((r: any) => { (subjectsByStaff[str(r.staff_id)] = subjectsByStaff[str(r.staff_id)] || []).push(str(r.subject)); });
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
  return staffRows.results.map((r: any) => ({ id: str(r.id), firstName: str(r.first_name), lastName: str(r.last_name), cin: str(r.cin), cnssNumber: str(r.cnss_number), subjects: subjectsByStaff[str(r.id)] || [], salary: num(r.salary), phone: str(r.phone), role: str(r.role), contractStartDate: str(r.contract_start_date), contractType: r.contract_type == null ? undefined : str(r.contract_type), email: r.email == null ? undefined : str(r.email), address: r.address == null ? undefined : str(r.address), baseSalary: r.base_salary == null ? undefined : num(r.base_salary), cnssAmount: r.cnss_amount == null ? undefined : num(r.cnss_amount), hourlyRate: r.hourly_rate == null ? undefined : num(r.hourly_rate), hireDate: r.hire_date == null ? undefined : str(r.hire_date), leaveRequests: leaveByStaff[str(r.id)] || [], advances: advanceByStaff[str(r.id)] || [], payments: paymentsByStaff[str(r.id)] || [], payslips: payslipsByStaff[str(r.id)] || [], schedule: scheduleByStaff[str(r.id)] || [] }));
}

function buildStaffStmts(db: D1Database, staff: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const s of staff || []) {
    stmts.push(db.prepare('INSERT INTO staff (id, first_name, last_name, cin, cnss_number, salary, phone, role, contract_start_date, contract_type, email, address, base_salary, cnss_amount, hourly_rate, hire_date, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, s.firstName, s.lastName, s.cin, s.cnssNumber, num(s.salary), s.phone, s.role, s.contractStartDate, s.contractType ?? null, s.email ?? null, s.address ?? null, s.baseSalary ?? null, s.cnssAmount ?? null, s.hourlyRate ?? null, s.hireDate ?? null, centerId));
    for (const sub of s.subjects || []) stmts.push(db.prepare('INSERT INTO staff_subjects (staff_id, subject) VALUES (?, ?)').bind(s.id, sub));
    for (const slot of s.schedule || []) stmts.push(db.prepare('INSERT INTO staff_schedule (staff_id, day, slots) VALUES (?, ?, ?)').bind(s.id, slot.day, JSON.stringify(slot.slots || [])));
    for (const p of s.payments || []) stmts.push(db.prepare('INSERT INTO staff_payments (id, staff_id, month, amount_paid, bonus, deduction, net_salary, date, receipt_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(p.id, s.id, p.month, num(p.amountPaid), p.bonus ?? null, p.deduction ?? null, num(p.netSalary), p.date, p.receiptNumber, p.notes ?? null));
    for (const pl of s.payslips || []) stmts.push(db.prepare('INSERT INTO staff_payslips (id, staff_id, month, base_salary, bonus, bonus_reason, cnss_deduction, absence_deductions, advance_deducted, net_salary, issue_date, days_present, days_absent, days_retard, extra_hours, extra_hour_rate, extra_hours_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(pl.id, s.id, pl.month, num(pl.baseSalary), num(pl.bonus), pl.bonusReason ?? null, num(pl.cnssDeduction), num(pl.absenceDeductions), num(pl.advanceDeducted), num(pl.netSalary), pl.issueDate, pl.daysPresent ?? null, pl.daysAbsent ?? null, pl.daysRetard ?? null, pl.extraHours ?? null, pl.extraHourRate ?? null, pl.extraHoursAmount ?? null));
    for (const lr of s.leaveRequests || []) stmts.push(db.prepare('INSERT INTO staff_leave_requests (id, staff_id, start_date, end_date, reason, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(lr.id, s.id, lr.startDate, lr.endDate, lr.reason, lr.type, lr.status));
    for (const adv of s.advances || []) stmts.push(db.prepare('INSERT INTO staff_advances (id, staff_id, amount, date, reason, status) VALUES (?, ?, ?, ?, ?, ?)').bind(adv.id, s.id, num(adv.amount), adv.date, adv.reason, adv.status));
  }
  return stmts;
}

export async function writeStaff(db: D1Database, staff: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM staff_payslips WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_payments WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_advances WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_leave_requests WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_schedule WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff_subjects WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM staff WHERE center_id = ?').bind(centerId),
    ...buildStaffStmts(db, staff, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function createSingleStaff(db: D1Database, staffMember: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = buildStaffStmts(db, [staffMember], centerId);
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
  const insertStmts = buildStaffStmts(db, [staffMember], centerId);
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
  return (timesheets || []).map((t: any) => db.prepare('INSERT INTO timesheets (id, staff_id, date, slot_time, status, leave_reason, leave_status, notes, hours_worked, extra_hours, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(t.id, t.staffId, t.date, t.slotTime ?? null, t.status, t.leaveReason ?? null, t.leaveStatus ?? null, t.notes ?? null, t.hoursWorked ?? null, t.extraHours ?? null, centerId));
}

export async function writeTimesheets(db: D1Database, timesheets: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [db.prepare('DELETE FROM timesheets WHERE center_id = ?').bind(centerId), ...buildTimesheetsStmts(db, timesheets, centerId)];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// ÉTUDE SLOTS
// ===========================================================================

export async function readSlots(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [slotRows, enrollRows] = await Promise.all([
    db.prepare('SELECT * FROM etude_slots WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT e.* FROM slot_enrollments e JOIN etude_slots s ON e.slot_id = s.id WHERE s.center_id = ?').bind(centerId).all()
  ]);
  const enrollBySlot: Record<string, string[]> = {};
  enrollRows.results.forEach((r: any) => { (enrollBySlot[str(r.slot_id)] = enrollBySlot[str(r.slot_id)] || []).push(str(r.student_id)); });
  return slotRows.results.map((r: any) => ({ id: str(r.id), day: str(r.day), startTime: str(r.start_time), endTime: str(r.end_time), gradeLevel: str(r.grade_level), teacherId: str(r.teacher_id), enrolledStudentIds: enrollBySlot[str(r.id)] || [], isExtra: r.is_extra ? true : undefined }));
}

function buildSlotsStmts(db: D1Database, slots: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const s of slots || []) {
    stmts.push(db.prepare('INSERT INTO etude_slots (id, day, start_time, end_time, grade_level, teacher_id, is_extra, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, s.day, s.startTime, s.endTime, s.gradeLevel, s.teacherId, s.isExtra ? 1 : 0, centerId));
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
    db.prepare('SELECT * FROM external_courses WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT e.* FROM course_enrolled_students e JOIN external_courses c ON e.course_id = c.id WHERE c.center_id = ?').bind(centerId).all()
  ]);
  const enrollByCourse: Record<string, any[]> = {};
  enrollRows.results.forEach((r: any) => { (enrollByCourse[str(r.course_id)] = enrollByCourse[str(r.course_id)] || []).push({ studentId: str(r.student_id), studentName: str(r.student_name), parentPhone: str(r.parent_phone), isExternal: r.is_external ? true : undefined, assurancePaid: r.assurance_paid ? true : undefined, assuranceAmount: r.assurance_amount == null ? undefined : num(r.assurance_amount), assuranceDate: r.assurance_date == null ? undefined : str(r.assurance_date), enrolledAt: r.enrolled_at == null ? undefined : str(r.enrolled_at) }); });
  return courseRows.results.map((r: any) => ({ id: str(r.id), schoolYear: str(r.school_year), trimester: str(r.trimester), gradeLevel: str(r.grade_level), subject: str(r.subject), teacherName: str(r.teacher_name), teacherPhone: str(r.teacher_phone), monthlyFee: num(r.monthly_fee), teacherShare: num(r.teacher_share), centerShare: num(r.center_share), enrolledStudents: enrollByCourse[str(r.id)] || [] }));
}

function buildCoursesStmts(db: D1Database, courses: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const c of courses || []) {
    stmts.push(db.prepare('INSERT INTO external_courses (id, school_year, trimester, grade_level, subject, teacher_name, teacher_phone, monthly_fee, teacher_share, center_share, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(c.id, c.schoolYear, c.trimester, c.gradeLevel, c.subject, c.teacherName, c.teacherPhone, num(c.monthlyFee), num(c.teacherShare), num(c.centerShare), centerId));
    for (const es of c.enrolledStudents || []) { const studentId = str(es.studentId || es.id); if (studentId) stmts.push(db.prepare('INSERT INTO course_enrolled_students (course_id, student_id, student_name, parent_phone, is_external, assurance_paid, assurance_amount, assurance_date, enrolled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(c.id, studentId, str(es.studentName || es.name || ''), str(es.parentPhone || ''), es.isExternal ? 1 : 0, es.assurancePaid ? 1 : 0, es.assuranceAmount ?? null, es.assuranceDate ?? null, es.enrolledAt ?? null)); }
  }
  return stmts;
}

export async function writeCourses(db: D1Database, courses: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM course_enrolled_students WHERE course_id IN (SELECT id FROM external_courses WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_courses WHERE center_id = ?').bind(centerId),
    ...buildCoursesStmts(db, courses, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// EXTERNAL COURSE SESSIONS
// ===========================================================================

export async function readSessions(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [sessionRows, presentRows, oneTimeRows, monthPaidRows, statusRows, amountRows] = await Promise.all([
    db.prepare('SELECT * FROM external_course_sessions WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT p.* FROM session_present_students p JOIN external_course_sessions s ON p.session_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT o.* FROM session_one_time_students o JOIN external_course_sessions s ON o.session_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT m.* FROM session_month_paid m JOIN external_course_sessions s ON m.session_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT st.* FROM session_seance_status st JOIN external_course_sessions s ON st.session_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT a.* FROM session_seance_amount a JOIN external_course_sessions s ON a.session_id = s.id WHERE s.center_id = ?').bind(centerId).all()
  ]);
  const presentBySession: Record<string, string[]> = {};
  presentRows.results.forEach((r: any) => { (presentBySession[str(r.session_id)] = presentBySession[str(r.session_id)] || []).push(str(r.student_id)); });
  const oneTimeBySession: Record<string, any[]> = {};
  oneTimeRows.results.forEach((r: any) => { (oneTimeBySession[str(r.session_id)] = oneTimeBySession[str(r.session_id)] || []).push({ id: str(r.id), name: str(r.name), parentPhone: str(r.parent_phone), paidUnit: !!r.paid_unit }); });
  const monthPaidBySession: Record<string, Record<string, boolean>> = {};
  monthPaidRows.results.forEach((r: any) => { const key = str(r.session_id); (monthPaidBySession[key] = monthPaidBySession[key] || {})[str(r.student_id)] = !!r.paid; });
  const statusBySession: Record<string, Record<string, string>> = {};
  statusRows.results.forEach((r: any) => { const key = str(r.session_id); (statusBySession[key] = statusBySession[key] || {})[str(r.student_id)] = str(r.status); });
  const amountBySession: Record<string, Record<string, number>> = {};
  amountRows.results.forEach((r: any) => { const key = str(r.session_id); (amountBySession[key] = amountBySession[key] || {})[str(r.student_id)] = num(r.amount); });
  return sessionRows.results.map((r: any) => {
    const id = str(r.id); const statusMap = statusBySession[id]; const amountMap = amountBySession[id]; const hasAdvancedData = statusMap && Object.keys(statusMap).length > 0;
    return { id, courseId: str(r.course_id), date: str(r.date), presentStudentIds: presentBySession[id] || [], oneTimeStudents: oneTimeBySession[id] || [], monthPaidMap: monthPaidBySession[id] || {}, seanceStatusMap: hasAdvancedData ? statusMap : undefined, seanceAmountMap: amountMap && Object.keys(amountMap).length > 0 ? amountMap : undefined, periodName: r.period_name == null ? undefined : str(r.period_name) };
  });
}

function buildSessionsStmts(db: D1Database, sessions: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const s of sessions || []) {
    stmts.push(db.prepare('INSERT INTO external_course_sessions (id, course_id, date, period_name, center_id) VALUES (?, ?, ?, ?, ?)').bind(s.id, s.courseId, s.date, s.periodName ?? null, centerId));
    for (const sid of s.presentStudentIds || []) stmts.push(db.prepare('INSERT INTO session_present_students (session_id, student_id) VALUES (?, ?)').bind(s.id, sid));
    for (const ot of s.oneTimeStudents || []) stmts.push(db.prepare('INSERT INTO session_one_time_students (session_id, id, name, parent_phone, paid_unit) VALUES (?, ?, ?, ?, ?)').bind(s.id, ot.id, ot.name, ot.parentPhone, ot.paidUnit ? 1 : 0));
    for (const [sid, paid] of Object.entries(s.monthPaidMap || {})) stmts.push(db.prepare('INSERT INTO session_month_paid (session_id, student_id, paid) VALUES (?, ?, ?)').bind(s.id, sid, paid ? 1 : 0));
    const sm = s.seanceStatusMap || {}; if (Object.keys(sm).length > 0) { for (const [sid, status] of Object.entries(sm)) stmts.push(db.prepare('INSERT INTO session_seance_status (session_id, student_id, status) VALUES (?, ?, ?)').bind(s.id, sid, status)); for (const [sid, amount] of Object.entries(s.seanceAmountMap || {})) stmts.push(db.prepare('INSERT INTO session_seance_amount (session_id, student_id, amount) VALUES (?, ?, ?)').bind(s.id, sid, num(amount))); }
  }
  return stmts;
}

export async function writeSessions(db: D1Database, sessions: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM session_seance_amount WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM session_seance_status WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM session_month_paid WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM session_one_time_students WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM session_present_students WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_course_sessions WHERE center_id = ?').bind(centerId),
    ...buildSessionsStmts(db, sessions, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// EXTERNAL STUDENTS
// ===========================================================================

export async function readExternalStudents(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [studentRows, paymentRows, attendanceRows] = await Promise.all([
    db.prepare('SELECT * FROM external_students WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT p.* FROM external_payments p JOIN external_students s ON p.student_id = s.id WHERE s.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT a.* FROM external_attendance a JOIN external_students s ON a.student_id = s.id WHERE s.center_id = ?').bind(centerId).all()
  ]);
  const paymentsByStudent: Record<string, any[]> = {};
  paymentRows.results.forEach((r: any) => { (paymentsByStudent[str(r.student_id)] = paymentsByStudent[str(r.student_id)] || []).push({ id: str(r.id), studentId: str(r.student_id), courseId: r.course_id == null ? undefined : str(r.course_id), courseName: str(r.course_name), schoolYear: str(r.school_year), amountPaid: num(r.amount_paid), date: str(r.date), method: str(r.method), notes: r.notes == null ? undefined : str(r.notes) }); });
  const attendanceByStudent: Record<string, any[]> = {};
  attendanceRows.results.forEach((r: any) => { (attendanceByStudent[str(r.student_id)] = attendanceByStudent[str(r.student_id)] || []).push({ id: str(r.id), studentId: str(r.student_id), courseId: r.course_id == null ? undefined : str(r.course_id), courseName: str(r.course_name), date: str(r.date), status: str(r.status) }); });
  return studentRows.results.map((r: any) => ({ id: str(r.id), name: str(r.name), parentPhone: str(r.parent_phone), grade: str(r.grade), schoolYear: r.school_year == null ? undefined : str(r.school_year), assurancePaid: !!r.assurance_paid, assuranceAmount: num(r.assurance_amount), assuranceDate: r.assurance_date == null ? undefined : str(r.assurance_date), payments: paymentsByStudent[str(r.id)] || [], attendance: attendanceByStudent[str(r.id)] || [], createdAt: str(r.created_at) }));
}

function buildExternalStudentsStmts(db: D1Database, externalStudents: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const s of externalStudents || []) {
    stmts.push(db.prepare('INSERT INTO external_students (id, name, parent_phone, grade, school_year, assurance_paid, assurance_amount, assurance_date, created_at, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, s.name, s.parentPhone, s.grade, s.schoolYear ?? null, s.assurancePaid ? 1 : 0, num(s.assuranceAmount), s.assuranceDate ?? null, s.createdAt, centerId));
    for (const p of s.payments || []) stmts.push(db.prepare('INSERT INTO external_payments (id, student_id, course_id, course_name, school_year, amount_paid, date, method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(p.id, s.id, p.courseId ?? null, p.courseName, p.schoolYear, num(p.amountPaid), p.date, p.method, p.notes ?? null));
    for (const a of s.attendance || []) stmts.push(db.prepare('INSERT INTO external_attendance (id, student_id, course_id, course_name, date, status) VALUES (?, ?, ?, ?, ?, ?)').bind(a.id, s.id, a.courseId ?? null, a.courseName, a.date, a.status));
  }
  return stmts;
}

export async function writeExternalStudents(db: D1Database, externalStudents: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM external_attendance WHERE student_id IN (SELECT id FROM external_students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_payments WHERE student_id IN (SELECT id FROM external_students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_students WHERE center_id = ?').bind(centerId),
    ...buildExternalStudentsStmts(db, externalStudents, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// MEAL PLANS
// ===========================================================================

export async function readMealPlans(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [planRows, attendeeRows] = await Promise.all([
    db.prepare('SELECT * FROM meal_plan_days WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT a.* FROM meal_plan_attendees a JOIN meal_plan_days d ON a.meal_plan_id = d.id WHERE d.center_id = ?').bind(centerId).all()
  ]);
  const attendeesByPlan: Record<string, any[]> = {};
  attendeeRows.results.forEach((r: any) => { (attendeesByPlan[str(r.meal_plan_id)] = attendeesByPlan[str(r.meal_plan_id)] || []).push({ studentId: str(r.student_id), isOneTime: !!r.is_one_time, paidUnit: !!r.paid_unit }); });
  return planRows.results.map((r: any) => ({ id: str(r.id), day: str(r.day), date: str(r.date), dishName: str(r.dish_name), description: str(r.description), attendees: attendeesByPlan[str(r.id)] || [] }));
}

function buildMealPlansStmts(db: D1Database, mealPlans: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const p of mealPlans || []) {
    stmts.push(db.prepare('INSERT INTO meal_plan_days (id, day, date, dish_name, description, center_id) VALUES (?, ?, ?, ?, ?, ?)').bind(p.id, p.day, p.date, p.dishName, p.description, centerId));
    for (const a of p.attendees || []) stmts.push(db.prepare('INSERT INTO meal_plan_attendees (meal_plan_id, student_id, is_one_time, paid_unit) VALUES (?, ?, ?, ?)').bind(p.id, a.studentId, a.isOneTime ? 1 : 0, a.paidUnit ? 1 : 0));
  }
  return stmts;
}

export async function writeMealPlans(db: D1Database, mealPlans: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM meal_plan_attendees WHERE meal_plan_id IN (SELECT id FROM meal_plan_days WHERE center_id = ?)').bind(centerId),
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
  return (expenses || []).map((e: any) => db.prepare('INSERT INTO expenses (id, date, category, amount, description, receipt_ref, center_id) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(e.id, e.date, e.category, num(e.amount), e.description, e.receiptRef, centerId));
}

export async function writeExpenses(db: D1Database, expenses: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [db.prepare('DELETE FROM expenses WHERE center_id = ?').bind(centerId), ...buildExpensesStmts(db, expenses, centerId)];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

export async function createSingleExpense(db: D1Database, expense: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  await db.prepare('INSERT INTO expenses (id, date, category, amount, description, receipt_ref, center_id) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
    expense.id, expense.date, expense.category, num(expense.amount), expense.description, expense.receiptRef ?? null, centerId
  ).run();
}

export async function deleteSingleExpense(db: D1Database, expenseId: string, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  await db.prepare('DELETE FROM expenses WHERE id = ? AND center_id = ?').bind(expenseId, centerId).run();
}


// ===========================================================================
// REVISION SEANCES
// ===========================================================================

export async function readRevisionSeances(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [seanceRows, studentRows] = await Promise.all([
    db.prepare('SELECT * FROM revision_seances WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT st.* FROM revision_seance_students st JOIN revision_seances s ON st.seance_id = s.id WHERE s.center_id = ?').bind(centerId).all()
  ]);
  const studentsBySeance: Record<string, any[]> = {};
  studentRows.results.forEach((r: any) => { (studentsBySeance[str(r.seance_id)] = studentsBySeance[str(r.seance_id)] || []).push({ id: str(r.student_id), studentId: str(r.student_id), name: str(r.student_name), studentName: str(r.student_name), parentPhone: str(r.parent_phone), paidSeance: !!r.paid_seance, present: !!r.present }); });
  return seanceRows.results.map((r: any) => ({ id: str(r.id), schoolYear: str(r.school_year), trimester: str(r.trimester), gradeLevel: str(r.grade_level), subject: str(r.subject), teacherName: str(r.teacher_name), teacherPhone: str(r.teacher_phone), date: str(r.date), teacherShare: num(r.teacher_share), centerShare: num(r.center_share), students: studentsBySeance[str(r.id)] || [] }));
}

function buildRevisionSeancesStmts(db: D1Database, seances: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const s of seances || []) {
    stmts.push(db.prepare('INSERT INTO revision_seances (id, school_year, trimester, grade_level, subject, teacher_name, teacher_phone, date, teacher_share, center_share, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, s.schoolYear, s.trimester, s.gradeLevel, s.subject, s.teacherName, s.teacherPhone, s.date, num(s.teacherShare), num(s.centerShare), centerId));
    for (const st of s.students || []) { const studentId = str(st.studentId || st.id); if (studentId) stmts.push(db.prepare('INSERT INTO revision_seance_students (seance_id, student_id, student_name, parent_phone, paid_seance, present) VALUES (?, ?, ?, ?, ?, ?)').bind(s.id, studentId, str(st.studentName || st.name || ''), str(st.parentPhone || ''), st.paidSeance ? 1 : 0, st.present ? 1 : 0)); }
  }
  return stmts;
}

export async function writeRevisionSeances(db: D1Database, seances: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM revision_seance_students WHERE seance_id IN (SELECT id FROM revision_seances WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM revision_seances WHERE center_id = ?').bind(centerId),
    ...buildRevisionSeancesStmts(db, seances, centerId)
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
  for (const s of sheets || []) {
    const name = s.establishmentName + ' - ' + s.schoolYear;
    stmts.push(db.prepare('INSERT INTO student_time_sheets (id, school_year, establishment_name, grade_level, branch, class_name, weekly_schedule, created_at, updated_at, name, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(s.id, s.schoolYear, s.establishmentName, s.gradeLevel, s.branch ?? null, s.className ?? null, JSON.stringify(s.weeklySchedule || []), s.createdAt, s.updatedAt, name, centerId));
    if (s.establishmentName && String(s.establishmentName).trim()) {
      stmts.push(db.prepare('INSERT OR IGNORE INTO etablissements (name) VALUES (?)').bind(String(s.establishmentName).trim()));
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
// FORMATIONS
// ===========================================================================

export async function readFormations(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<any[]> {
  const [formationRows, matiereRows, studentRows, studentMatiereRows] = await Promise.all([
    db.prepare('SELECT * FROM formations WHERE center_id = ?').bind(centerId).all(),
    db.prepare('SELECT m.* FROM formation_matieres m JOIN formations f ON m.formation_id = f.id WHERE f.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT s.* FROM formation_students s JOIN formations f ON s.formation_id = f.id WHERE f.center_id = ?').bind(centerId).all(),
    db.prepare('SELECT sm.* FROM formation_student_matieres sm JOIN formation_students fs ON sm.formation_student_id = fs.id JOIN formations f ON fs.formation_id = f.id WHERE f.center_id = ?').bind(centerId).all()
  ]);
  const matieresByFormation: Record<string, any[]> = {};
  matiereRows.results.forEach((m: any) => {
    const fid = str(m.formation_id);
    (matieresByFormation[fid] = matieresByFormation[fid] || []).push({ id: str(m.id), subject: str(m.subject) });
  });
  const matieresByStudent: Record<string, string[]> = {};
  studentMatiereRows.results.forEach((sm: any) => {
    const sid = str(sm.formation_student_id);
    (matieresByStudent[sid] = matieresByStudent[sid] || []).push(str(sm.formation_matiere_id));
  });
  const studentsByFormation: Record<string, any[]> = {};
  studentRows.results.forEach((st: any) => {
    const fid = str(st.formation_id);
    const sid = str(st.id);
    (studentsByFormation[fid] = studentsByFormation[fid] || []).push({
      id: sid,
      studentName: str(st.student_name),
      parentPhone: str(st.parent_phone),
      isPack: bool(st.is_pack),
      enrolledMatiereIds: matieresByStudent[sid] || [],
      amountPaid: num(st.amount_paid),
      totalRequired: num(st.total_required),
      remainingBalance: num(st.remaining_balance),
      paymentMethod: str(st.payment_method) === 'cheque' ? 'cheque' : 'espece',
      chequeNumber: st.cheque_number == null ? undefined : str(st.cheque_number),
      chequeDate: st.cheque_date == null ? undefined : str(st.cheque_date),
      chequePaid: bool(st.cheque_paid),
      discount: num(st.discount),
      isAdvance: bool(st.is_advance),
      paidAt: st.paid_at == null ? undefined : str(st.paid_at),
      notes: st.notes == null ? undefined : str(st.notes),
      enrolledAt: str(st.enrolled_at)
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

function buildFormationsStmts(db: D1Database, formations: any[], centerId: string = DEFAULT_CENTER_ID): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const f of formations || []) {
    stmts.push(db.prepare('INSERT INTO formations (id, name, school_year, start_date, end_date, pack_price, schedule, created_at, center_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(f.id, f.name, f.schoolYear, f.startDate, f.endDate, num(f.packPrice), JSON.stringify(f.schedule || []), f.createdAt, centerId));
    for (const m of f.matieres || []) stmts.push(db.prepare('INSERT INTO formation_matieres (id, formation_id, subject) VALUES (?, ?, ?)').bind(m.id, f.id, m.subject));
    const validMatIds = new Set((f.matieres || []).map((m: any) => m.id));
    for (const st of f.students || []) {
      stmts.push(db.prepare('INSERT INTO formation_students (id, formation_id, student_name, parent_phone, is_pack, amount_paid, total_required, remaining_balance, payment_method, cheque_number, cheque_date, cheque_paid, discount, is_advance, paid_at, notes, enrolled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(st.id, f.id, st.studentName, st.parentPhone, st.isPack ? 1 : 0, num(st.amountPaid), num(st.totalRequired), num(st.remainingBalance), st.paymentMethod || 'espece', st.chequeNumber ?? null, st.chequeDate ?? null, st.chequePaid ? 1 : 0, num(st.discount), st.isAdvance ? 1 : 0, st.paidAt ?? null, st.notes ?? null, st.enrolledAt || new Date().toISOString()));
      for (const mid of st.enrolledMatiereIds || []) {
        if (validMatIds.has(mid)) stmts.push(db.prepare('INSERT INTO formation_student_matieres (formation_student_id, formation_matiere_id) VALUES (?, ?)').bind(st.id, mid));
      }
    }
  }
  return stmts;
}

export async function writeFormations(db: D1Database, formations: any[], centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM formation_student_matieres WHERE formation_student_id IN (SELECT id FROM formation_students WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?))').bind(centerId),
    db.prepare('DELETE FROM formation_students WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM formation_matieres WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM formations WHERE center_id = ?').bind(centerId),
    ...buildFormationsStmts(db, formations, centerId)
  ];
  for (let i = 0; i < stmts.length; i += 500) await db.batch(stmts.slice(i, i + 500));
}

// ===========================================================================
// FULL STATE
// ===========================================================================

export async function readState(db: D1Database, centerId: string = DEFAULT_CENTER_ID): Promise<AppState> {
  const [settings, students, staff, slots, courses, sessions, mealPlans, expenses, timesheets, externalStudents, revisionSeances, studentTimeSheets, formations] = await Promise.all([
    readSettings(db, centerId), readStudents(db, centerId), readStaff(db, centerId), readSlots(db, centerId), readCourses(db, centerId),
    readSessions(db, centerId), readMealPlans(db, centerId), readExpenses(db, centerId), readTimesheets(db, centerId),
    readExternalStudents(db, centerId), readRevisionSeances(db, centerId), readStudentTimeSheets(db, centerId), readFormations(db, centerId)
  ]);
  return { settings, students, staff, slots, courses, sessions, mealPlans, expenses, timesheets, externalStudents, revisionSeances, studentTimeSheets, formations };
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

    db.prepare('DELETE FROM course_enrolled_students WHERE course_id IN (SELECT id FROM external_courses WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_courses WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM session_seance_amount WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM session_seance_status WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM session_month_paid WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM session_one_time_students WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM session_present_students WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_course_sessions WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM external_attendance WHERE student_id IN (SELECT id FROM external_students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_payments WHERE student_id IN (SELECT id FROM external_students WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM external_students WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM meal_plan_attendees WHERE meal_plan_id IN (SELECT id FROM meal_plan_days WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM meal_plan_days WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM expenses WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM revision_seance_students WHERE seance_id IN (SELECT id FROM revision_seances WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM revision_seances WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM student_time_sheets WHERE center_id = ?').bind(centerId),

    db.prepare('DELETE FROM formation_student_matieres WHERE formation_student_id IN (SELECT id FROM formation_students WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?))').bind(centerId),
    db.prepare('DELETE FROM formation_students WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM formation_matieres WHERE formation_id IN (SELECT id FROM formations WHERE center_id = ?)').bind(centerId),
    db.prepare('DELETE FROM formations WHERE center_id = ?').bind(centerId)
  ];

  const allDataStmts = [
    ...buildStudentsStmts(db, dedupe(state.students), centerId),
    ...buildStaffStmts(db, dedupe(state.staff), centerId),
    ...buildSlotsStmts(db, dedupe(state.slots), centerId),
    ...buildCoursesStmts(db, dedupe(state.courses), centerId),
    ...buildSessionsStmts(db, dedupe(state.sessions), centerId),
    ...buildMealPlansStmts(db, dedupe(state.mealPlans), centerId),
    ...buildExpensesStmts(db, dedupe(state.expenses), centerId),
    ...buildTimesheetsStmts(db, dedupe(state.timesheets), centerId),
    ...buildExternalStudentsStmts(db, dedupe(state.externalStudents), centerId),
    ...buildRevisionSeancesStmts(db, dedupe(state.revisionSeances), centerId),
    ...buildStudentTimeSheetsStmts(db, dedupe(state.studentTimeSheets), centerId),
    ...buildFormationsStmts(db, dedupe(state.formations), centerId)
  ];

  for (let i = 0; i < deleteStmts.length; i += 500) await db.batch(deleteStmts.slice(i, i + 500));
  for (let i = 0; i < allDataStmts.length; i += 500) await db.batch(allDataStmts.slice(i, i + 500));
  if (state.settings && typeof state.settings === 'object') await writeSettings(db, state.settings, centerId);
}


export async function createSinglePayment(db: D1Database, payment: any, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  const service = normalizePaymentService(payment.service, payment.month);
  await db.prepare('INSERT OR REPLACE INTO payments (id, student_id, date, amount_paid, total_required, remaining_balance, service, month, payment_type, method, receipt_number, notes, discount, refund, refund_of, cheque_number, cheque_date, cheque_paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
    payment.id, payment.studentId, payment.date, num(payment.amountPaid), num(payment.totalRequired), num(payment.remainingBalance),
    service, payment.month, payment.paymentType, payment.method, payment.receiptNumber, payment.notes ?? null, payment.discount ?? null,
    payment.refund ? 1 : 0, payment.refundOf ?? null, payment.chequeNumber ?? null, payment.chequeDate ?? null, payment.chequePaid ? 1 : 0
  ).run();
}

export async function deleteSinglePayment(db: D1Database, paymentId: string, centerId: string = DEFAULT_CENTER_ID): Promise<void> {
  await db.prepare('DELETE FROM payments WHERE id = ?').bind(paymentId).run();
}
