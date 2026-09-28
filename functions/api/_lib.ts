/// <reference types="@cloudflare/workers-types" />

/**
 * Shared helpers for the Cloudflare Pages Functions of the LANDING backend.
 *
 * This deployment exposes only the public landing endpoints:
 *   GET  /api/public-pricing         — public read-only pricing
 *   GET  /api/advertisements/active  — public active advertisements
 *   POST /api/demo-requests          — public demo/trial request submission
 *
 * There are no authenticated routes here: sessions, centers and all center
 * data live in the center application's own backend.
 */

export interface Env {
  DB: D1Database;
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
// Rate limiting (D1-backed, per IP) — used by the public demo-request route
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
