/// <reference types="@cloudflare/workers-types" />

/**
 * Shared helpers for the SaaS platform administration API (Cloudflare Pages
 * Functions).
 *
 * This is the platform-only subset of what used to be the combined app's data
 * layer: everything about students, staff, meals, scheduling, attendance and
 * operational finance now lives exclusively in the center application
 * (repository academy_system). What stays here is authentication for the
 * platform console, the center-tenant lifecycle helpers the platform manages
 * (trial/subscription/suspension state), and the shared HTTP/rate-limit
 * primitives.
 *
 * Session isolation (hard rule):
 *   • This app ONLY honours `platform_sessions` rows and the
 *     `tc_platform_session` cookie (plus Bearer tokens stored in that same
 *     table). The legacy `sessions` table / `tc_session` cookie belong to the
 *     center application and are NEVER consulted here — a center credential
 *     (valid, expired or otherwise) cannot authenticate against this backend.
 *   • Only `platform_super_admin` accounts may hold a platform session: the
 *     role is checked at login AND re-checked on every request by
 *     validateSession (JOIN on users). `admin`, `super_admin` and
 *     `restricted_admin` are CENTER roles and never grant platform access.
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

/**
 * Legacy default center id kept ONLY so platform code that reads tenant rows
 * (e.g. the historical single-center install) has a stable fallback. It is
 * never used to mint or validate a session.
 */
export const DEFAULT_CENTER_ID = 'e1000000-0000-4000-8000-000000000001';

/** The one and only role allowed to authenticate to this application. */
export const PLATFORM_ROLE = 'platform_super_admin';

// ---------------------------------------------------------------------------
// Primitive coercion helpers (identical to production data.ts)
// ---------------------------------------------------------------------------

function num(v: unknown): number { return typeof v === 'number' ? v : Number(v ?? 0) || 0; }
function str(v: unknown): string { return typeof v === 'string' ? v : v == null ? '' : String(v); }

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/**
 * Controlled answer for routes that no longer exist in the SaaS
 * administration app (all student/staff/meals/… operations moved to the
 * center application). Returns 404 JSON — never the SPA fallback HTML — so a
 * stale tab or script gets a clear machine-readable rejection.
 */
export function removedRouteResponse(): Response {
  return json(
    {
      error: 'هذه الوظيفة لم تعد متوفرة في تطبيق إدارة المنصة (SaaS). انتقلت إلى تطبيق المركز.',
      code: 'ROUTE_REMOVED',
    },
    404
  );
}

export async function readBody<T = any>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new Error('Corps de requête invalide.');
  }
}

// ---------------------------------------------------------------------------
// Input validation helpers — one place for the shape rules the platform
// handlers apply to untrusted request bodies (names, emails, passwords,
// plans, prices). Rejection is explicit; nothing here throws.
// ---------------------------------------------------------------------------

/** Simplified RFC 5322-style email check (local@domain.tld), length-capped. */
export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const value = email.trim();
  if (value.length === 0 || value.length > 254) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
}

/** Password strength rule: 8–128 chars. Returns null when OK, else an error message. */
export function validatePasswordStrength(password: unknown): string | null {
  const value = typeof password === 'string' ? password : String(password ?? '');
  if (value.length < 8) return 'كلمة السر يجب أن تتكون من 8 أحرف على الأقل.';
  if (value.length > 128) return 'كلمة السر طويلة جداً (الحد الأقصى 128 حرفاً).';
  return null;
}

/** The only plan values the DB CHECK constraint accepts (storage values). */
export const VALID_PLANS = ['starter', 'growth', 'pro', 'custom'] as const;

/** true when the plan is a whitelisted storage value (`basic` normalizes to `starter`). */
export function isValidPlan(plan: unknown): boolean {
  const value = typeof plan === 'string' ? plan.trim() : '';
  return (VALID_PLANS as readonly string[]).includes(value === 'basic' ? 'starter' : value);
}

/** Clamps a monthly price (TND) to a sane [0, 1_000_000] window. */
export function clampMonthlyPrice(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(n, 1_000_000));
}

/** Trims and hard-truncates a free-text field to `maxLen` characters. */
export function truncateField(value: unknown, maxLen: number): string {
  const s = typeof value === 'string' ? value : value == null ? '' : String(value);
  return s.trim().slice(0, maxLen);
}

/**
 * Adds CORS headers to the response if the request Origin is same-origin.
 * Reflects the Origin header back as Access-Control-Allow-Origin.
 * Also sets Access-Control-Allow-Methods and Access-Control-Allow-Headers.
 */
export function addCorsHeaders(response: Response, request: Request): Response {
  const origin = request.headers.get('Origin');
  if (!origin) return response;

  const url = new URL(request.url);
  const isSameOrigin = origin === `${url.protocol}//${url.host}`;

  if (isSameOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }

  return response;
}

/**
 * Adds security headers to every API response.
 * X-Frame-Options: DENY — prevent clickjacking via iframe.
 * X-Content-Type-Options: nosniff — prevent MIME-type sniffing.
 * Referrer-Policy: strict-origin-when-cross-origin — limit referrer leakage.
 * Strict-Transport-Security: 1 year — enforce HTTPS (only on HTTPS requests).
 */
export function addSecurityHeaders(response: Response, request: Request): Response {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (isHttpsRequest(request)) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // The platform console is a React SPA: all JS comes from 'self', styles from
  // the Tailwind bundle (inline styles needed for dynamic layout), images from
  // the ImageKit CDN (center logos / ad creatives), and WebSockets from PubNub
  // `ps.pndsn.com` (the only third-party endpoint the SPA ever talks to). This
  // mirrors the policy served on static assets via public/_headers — keep the
  // two in sync. frame-ancestors 'none' blocks clickjacking of API responses.
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://ik.imagekit.io data:; connect-src 'self' https://ps.pndsn.com; frame-ancestors 'none'"
  );

  return response;
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

/**
 * Throwaway bcrypt hash used ONLY to normalise login response timing.
 * The legacy login path verifies an unsalted SHA-256 digest in microseconds,
 * and a missing account performs no hash work at all, while a bcrypt-hashed
 * account takes ~100 ms of real bcrypt work. The login handler runs one real
 * bcrypt compare against this hash in those two branches, so all three
 * outcomes cost ~one bcrypt and a remote attacker cannot time the response to
 * tell "no account" / "legacy-hashed account" apart from "bcrypt account".
 * Its plaintext is deliberately meaningless; only format validity matters.
 */
export const AUTH_TIMING_DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// ---------------------------------------------------------------------------
// Legacy unsalted SHA-256 support — ONE-TIME UPGRADE PATH, login only
// ---------------------------------------------------------------------------
// Accounts seeded before the bcrypt "salt fix" commit (notably the platform
// admin from migration 0020) can still carry an unsalted hex SHA-256 digest
// in `users.password_hash`. bcrypt can never validate that format, so —
// without migration 0036 or an out-of-band reset — even the rightful owner is
// locked out forever. The platform LOGIN endpoint may therefore accept that
// format exactly once per account: on a successful check the caller MUST
// immediately rewrite the row with a fresh bcrypt hash, retiring this path
// permanently for that account. Hard rules:
//   * triggers ONLY when the stored value matches ^[0-9a-f]{64}$ — any
//     bcrypt-hashed account never consults the legacy path;
//   * used by LOGIN ONLY — never by session validation, bearer compat, or
//     the password-change handler;
//   * the caller enforces the platform role gate BEFORE any rewrite, so
//     center-role rows are never touched from this app;
//   * the seeded legacy digest (and its plaintext) is public in git history,
//     so the UI must prompt an immediate password rotation after the first
//     upgraded login.

const LEGACY_SHA256_RE = /^[0-9a-f]{64}$/;

export function isLegacySha256Hash(hash: unknown): hash is string {
  return typeof hash === 'string' && LEGACY_SHA256_RE.test(hash);
}

/** SHA-256 hex digest via WebCrypto (available in Workers and Node >= 18). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time compare of SHA-256(password) against the stored digest. */
export async function verifyLegacySha256(password: string, storedHash: string): Promise<boolean> {
  if (!isLegacySha256Hash(storedHash)) return false;
  const computed = await sha256Hex(password);
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
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
/**
 * Key prefix for this app's login attempts. Distinct from the center
 * application's `auth:` prefix on purpose: the two apps share the D1 database
 * (and therefore the rate_limits table) but must not be able to lock each
 * other's login endpoint out from the same IP.
 */
export const PLATFORM_AUTH_RATE_PREFIX = 'platform-auth';

let rateLimitTableReady = false;
async function ensureRateLimitTable(db: D1Database): Promise<void> {
  if (rateLimitTableReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)').run();
  rateLimitTableReady = true;
}

export async function consumeAuthRateLimit(
  db: D1Database,
  request: Request,
  prefix = PLATFORM_AUTH_RATE_PREFIX,
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

export async function resetAuthRateLimit(
  db: D1Database,
  request: Request,
  prefix = PLATFORM_AUTH_RATE_PREFIX
): Promise<void> {
  await ensureRateLimitTable(db);
  const ip = getClientIp(request);
  await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(prefix + ':' + ip).run();
}

// ---------------------------------------------------------------------------
// Platform session management (platform_sessions table — NEVER `sessions`)
// ---------------------------------------------------------------------------

export const PLATFORM_SESSION_COOKIE = 'tc_platform_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

let platformSessionsTableReady = false;
export async function ensurePlatformSessionsTable(db: D1Database): Promise<void> {
  if (platformSessionsTableReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS platform_sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)').run();
  platformSessionsTableReady = true;
}

/**
 * Reads this app's session token: the `tc_platform_session` cookie, or a
 * Bearer token as a compatibility path. Bearer tokens are validated ONLY
 * against platform_sessions (same rule as the cookie), and the browser client
 * stores them in its own `tc_platform_token` localStorage namespace so the
 * two applications never read each other's credentials.
 */
export function getPlatformSessionToken(request: Request): string | null {
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
    if (name === PLATFORM_SESSION_COOKIE) {
      const val = part.slice(eqIdx + 1).trim();
      return val ? decodeURIComponent(val) : null;
    }
  }
  return null;
}

export async function createPlatformSession(db: D1Database, email: string): Promise<string> {
  await ensurePlatformSessionsTable(db);
  const token = crypto.randomUUID();
  const now = Date.now();
  await db.prepare('INSERT INTO platform_sessions (token, email, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(token, email, now, now + SESSION_DURATION_MS).run();
  return token;
}

export interface PlatformSession {
  email: string;
  token: string;
  role: string;
}

/**
 * Validates a platform session on every request:
 *   • the token must exist in platform_sessions and not be expired;
 *   • the account must still exist (deleted user ⇒ immediate revocation);
 *   • the account's role must STILL be platform_super_admin (role downgrade,
 *     or an attempt to forge a session row for a center user, ⇒ rejection);
 *   • center credentials (legacy `sessions` / `tc_session`) are not looked at,
 *     so they can never satisfy this check.
 */
export async function validateSession(db: D1Database, request: Request): Promise<PlatformSession | null> {
  const token = getPlatformSessionToken(request);
  if (!token) return null;
  await ensurePlatformSessionsTable(db);
  const row = await db
    .prepare(
      `SELECT s.token, s.email, u.role
       FROM platform_sessions s
       JOIN users u ON u.email = s.email
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .bind(token, Date.now())
    .first<{ token: string; email: string; role: string }>();
  if (!row) return null;
  if (row.role !== PLATFORM_ROLE) return null;
  return { email: row.email, token: row.token, role: row.role };
}

/** Alias kept for readability at handler call sites. */
export const validatePlatformSession = validateSession;

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM platform_sessions WHERE token = ?').bind(token).run();
}

export async function purgeExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM platform_sessions WHERE expires_at < ?').bind(Date.now()).run();
}

/**
 * Host-only session cookie: scoped to this app's host by the browser (the
 * center app lives on its own host), HttpOnly (JS can never read it),
 * SameSite=Lax (top-level navigations only; the admin console has no
 * cross-site POST targets), Path=/ and Secure whenever the request is HTTPS.
 * The name `tc_platform_session` is disjoint from the center app's
 * `tc_session`, so both apps can coexist under a shared parent domain
 * without ever seeing each other's cookie.
 */
export function makeSessionCookie(token: string, request: Request): string {
  const secure = isHttpsRequest(request) ? '; Secure' : '';
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  return PLATFORM_SESSION_COOKIE + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAge + secure;
}

export function clearSessionCookie(request: Request): string {
  const secure = isHttpsRequest(request) ? '; Secure' : '';
  return PLATFORM_SESSION_COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + secure;
}

// ---------------------------------------------------------------------------
// Center tenant helpers (the platform MANAGES centers; it never reads their
// operational data beyond the aggregate counts the centers list shows)
// ---------------------------------------------------------------------------

export type CenterAccessState = 'trial_expired' | 'subscription_expired' | 'suspended' | 'expired';

/** Returns the lifecycle reason that prevents a center administrator from using the center app. */
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

/** Maps a raw `centers` DB row (snake_case) to the camelCase CenterTenant shape. */
export function mapCenterRow(c: any): any {
  let modules: string[] = [];
  try {
    modules = typeof c.enabled_modules === 'string' ? JSON.parse(c.enabled_modules) : (c.enabled_modules || []);
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
    enabledModules: Array.isArray(modules) ? modules : [],
    mealOperatingMode: c.meal_operating_mode || 'external_traiteur',
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
