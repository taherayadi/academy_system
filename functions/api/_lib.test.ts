import { describe, it, expect } from 'vitest';
import {
  getClientIp,
  json,
  readBody,
  hashPassword,
  verifyPassword,
  isLegacySha256Hash,
  sha256Hex,
  verifyLegacySha256,
  getPlatformSessionToken,
  isHttpsRequest,
  makeSessionCookie,
  clearSessionCookie,
  mapCenterRow,
  getCenterAccessState,
  removedRouteResponse,
  PLATFORM_SESSION_COOKIE,
  isValidEmail,
  validatePasswordStrength,
  VALID_PLANS,
  isValidPlan,
  clampMonthlyPrice,
  truncateField,
  addCorsHeaders,
  addSecurityHeaders,
} from './_lib';

// ---------------------------------------------------------------------------
// getClientIp
// ---------------------------------------------------------------------------
describe('getClientIp', () => {
  it('returns CF-Connecting-IP when present', () => {
    const req = new Request('https://x.com', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to X-Forwarded-For first value', () => {
    const req = new Request('https://x.com', {
      headers: { 'X-Forwarded-For': '5.6.7.8, 9.10.11.12' },
    });
    expect(getClientIp(req)).toBe('5.6.7.8');
  });

  it('returns "unknown" when no IP headers', () => {
    const req = new Request('https://x.com');
    expect(getClientIp(req)).toBe('unknown');
  });

  it('prefers CF-Connecting-IP over X-Forwarded-For', () => {
    const req = new Request('https://x.com', {
      headers: {
        'CF-Connecting-IP': '1.1.1.1',
        'X-Forwarded-For': '2.2.2.2',
      },
    });
    expect(getClientIp(req)).toBe('1.1.1.1');
  });
});

// ---------------------------------------------------------------------------
// json
// ---------------------------------------------------------------------------
describe('json', () => {
  it('creates a Response with JSON content type', () => {
    const res = json({ hello: 'world' });
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('defaults to status 200', () => {
    const res = json({});
    expect(res.status).toBe(200);
  });

  it('uses custom status', () => {
    const res = json({ error: 'not found' }, 404);
    expect(res.status).toBe(404);
  });

  it('serializes data correctly', async () => {
    const res = json({ count: 42 });
    const body = await res.json();
    expect(body).toEqual({ count: 42 });
  });
});

// ---------------------------------------------------------------------------
// readBody
// ---------------------------------------------------------------------------
describe('readBody', () => {
  it('parses JSON body', async () => {
    const req = new Request('https://x.com', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await readBody(req);
    expect(result).toEqual({ name: 'test' });
  });

  it('throws on invalid JSON', async () => {
    const req = new Request('https://x.com', {
      method: 'POST',
      body: 'not-json',
    });
    await expect(readBody(req)).rejects.toThrow('Corps de requête invalide');
  });
});

// ---------------------------------------------------------------------------
// hashPassword & verifyPassword
// ---------------------------------------------------------------------------
describe('hashPassword & verifyPassword', () => {
  it('hashes and successfully verifies a correct password', async () => {
    const pwd = 'TestPassword123!';
    const hash = await hashPassword(pwd);
    expect(hash).not.toBe(pwd);
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')).toBe(true);

    const isValid = await verifyPassword(pwd, hash);
    expect(isValid).toBe(true);
  });

  it('rejects incorrect password during verification', async () => {
    const hash = await hashPassword('correctPassword');
    const isValid = await verifyPassword('wrongPassword', hash);
    expect(isValid).toBe(false);
  });

  it('produces different hashes with unique salts for identical passwords', async () => {
    const pwd = 'commonPassword';
    const hash1 = await hashPassword(pwd);
    const hash2 = await hashPassword(pwd);
    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(pwd, hash1)).toBe(true);
    expect(await verifyPassword(pwd, hash2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getPlatformSessionToken — platform cookie ONLY, never the center app's
// ---------------------------------------------------------------------------
describe('legacy unsalted SHA-256 helpers (one-time upgrade path)', () => {
  it('isLegacySha256Hash accepts only a full 64-char lowercase-hex digest', () => {
    expect(isLegacySha256Hash('7bbf0487d35eea207efbc20ae0cbaa8166201777c4a38d7607ddf868490dcca1')).toBe(true);
    expect(isLegacySha256Hash('A'.repeat(64).toLowerCase())).toBe(true);
    expect(isLegacySha256Hash('a'.repeat(63))).toBe(false);
    expect(isLegacySha256Hash('a'.repeat(65))).toBe(false);
    expect(isLegacySha256Hash('zz' + 'a'.repeat(62))).toBe(false);
    expect(isLegacySha256Hash('$2b$10$abcdefghijklmnopqrstuv')).toBe(false);
    expect(isLegacySha256Hash('')).toBe(false);
    expect(isLegacySha256Hash(undefined)).toBe(false);
    expect(isLegacySha256Hash(null)).toBe(false);
  });

  it('sha256Hex matches node crypto for the known seeded credential', async () => {
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update('PlatformAdmin2026!').digest('hex');
    await expect(sha256Hex('PlatformAdmin2026!')).resolves.toBe(expected);
    // The value actually stored by historical migration 0020:
    await expect(sha256Hex('PlatformAdmin2026!')).resolves.toBe('7bbf0487d35eea207efbc20ae0cbaa8166201777c4a38d7607ddf868490dcca1');
  });

  it('verifyLegacySha256: correct password true, wrong false, non-legacy stored value false', async () => {
    const stored = await sha256Hex('S3cret-Passw0rd');
    await expect(verifyLegacySha256('S3cret-Passw0rd', stored)).resolves.toBe(true);
    await expect(verifyLegacySha256('S3cret-Passw0rd ', stored)).resolves.toBe(false);
    await expect(verifyLegacySha256('wrong', stored)).resolves.toBe(false);
    // A bcrypt-stored account must never be checked through this path.
    const bcryptHash = await hashPassword('whatever');
    await expect(verifyLegacySha256('whatever', bcryptHash)).resolves.toBe(false);
  });
});

describe('getPlatformSessionToken', () => {
  it('extracts token from Cookie header', () => {
    const req = new Request('https://x.com', {
      headers: { Cookie: 'tc_platform_session=abc123; other=xyz' },
    });
    expect(getPlatformSessionToken(req)).toBe('abc123');
  });

  it('returns null when no Cookie header', () => {
    const req = new Request('https://x.com');
    expect(getPlatformSessionToken(req)).toBeNull();
  });

  it('returns null when the platform cookie is not present', () => {
    const req = new Request('https://x.com', {
      headers: { Cookie: 'other=value' },
    });
    expect(getPlatformSessionToken(req)).toBeNull();
  });

  it('IGNORES the center application\'s tc_session cookie (session isolation)', () => {
    const req = new Request('https://x.com', {
      headers: { Cookie: 'tc_session=center-credential; x=1' },
    });
    expect(getPlatformSessionToken(req)).toBeNull();
  });

  it('reads the Bearer token (validated later against platform_sessions only)', () => {
    const req = new Request('https://x.com', { headers: { Authorization: 'Bearer bearer-1' } });
    expect(getPlatformSessionToken(req)).toBe('bearer-1');
  });

  it('decodes URL-encoded token', () => {
    const req = new Request('https://x.com', {
      headers: { Cookie: 'tc_platform_session=hello%20world' },
    });
    expect(getPlatformSessionToken(req)).toBe('hello world');
  });

  it('handles cookie with empty value', () => {
    const req = new Request('https://x.com', {
      headers: { Cookie: 'tc_platform_session=; other=val' },
    });
    expect(getPlatformSessionToken(req)).toBeNull();
  });

  it('works with lowercase "cookie" header', () => {
    const req = new Request('https://x.com');
    req.headers.set('cookie', 'tc_platform_session=token123');
    expect(getPlatformSessionToken(req)).toBe('token123');
  });
});

// ---------------------------------------------------------------------------
// isHttpsRequest
// ---------------------------------------------------------------------------
describe('isHttpsRequest', () => {
  it('returns true for https URL', () => {
    const req = new Request('https://example.com');
    expect(isHttpsRequest(req)).toBe(true);
  });

  it('returns false for http URL without proxy headers', () => {
    const req = new Request('http://example.com');
    expect(isHttpsRequest(req)).toBe(false);
  });

  it('returns true when X-Forwarded-Proto is https', () => {
    const req = new Request('http://example.com', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(isHttpsRequest(req)).toBe(true);
  });

  it('returns true when cf-visitor contains https', () => {
    const req = new Request('http://example.com', {
      headers: { 'cf-visitor': '{"scheme":"https"}' },
    });
    expect(isHttpsRequest(req)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// makeSessionCookie
// ---------------------------------------------------------------------------
describe('makeSessionCookie', () => {
  it('builds cookie with HttpOnly and SameSite=Lax', () => {
    const req = new Request('https://example.com');
    const cookie = makeSessionCookie('tok123', req);
    expect(cookie).toContain('tc_platform_session=tok123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=');
  });

  it('includes Secure flag for HTTPS', () => {
    const req = new Request('https://example.com');
    const cookie = makeSessionCookie('tok', req);
    expect(cookie).toContain('Secure');
  });

  it('omits Secure flag for HTTP', () => {
    const req = new Request('http://example.com');
    const cookie = makeSessionCookie('tok', req);
    expect(cookie).not.toContain('Secure');
  });
});

// ---------------------------------------------------------------------------
// clearSessionCookie
// ---------------------------------------------------------------------------
describe('clearSessionCookie', () => {
  it('sets Max-Age=0', () => {
    const req = new Request('https://example.com');
    const cookie = clearSessionCookie(req);
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('tc_platform_session=');
  });
});

// ---------------------------------------------------------------------------
// mapCenterRow — snake_case DB row → camelCase CenterTenant (auth login/me)
// ---------------------------------------------------------------------------
describe('mapCenterRow', () => {
  it('maps a raw centers row to the camelCase API shape used by the client', () => {
    const row = {
      id: 'c1',
      name: 'Centre Test',
      slug: 'centre-test',
      phone_number: '20123456',
      location_city: 'Tunis',
      plan: 'custom',
      enabled_modules: JSON.stringify(['scolaire', 'finance', 'etude']),
      meal_operating_mode: 'in_house_kitchen',
      status: 'trial',
      trial_ends_at: 1750000000000,
      subscription_ends_at: null,
      billing_cycle: 'annual',
      monthly_price: 90,
      center_type: 'jardin',
      logo_url: 'https://ik.imagekit.io/abc/logo.png',
      created_at: 1700000000000
    };

    expect(mapCenterRow(row)).toEqual({
      id: 'c1',
      name: 'Centre Test',
      slug: 'centre-test',
      phoneNumber: '20123456',
      locationCity: 'Tunis',
      plan: 'custom',
      enabledModules: ['scolaire', 'finance', 'etude'],
      mealOperatingMode: 'in_house_kitchen',
      status: 'trial',
      trialEndsAt: 1750000000000,
      subscriptionEndsAt: null,
      billingCycle: 'annual',
      monthlyPrice: 90,
      centerType: 'jardin',
      logoUrl: 'https://ik.imagekit.io/abc/logo.png',
      createdAt: 1700000000000
    });
  });

  it('parses enabled_modules and defaults to [] on invalid JSON or missing fields', () => {
    expect(mapCenterRow({ id: 'c1', name: 'X', enabled_modules: 'not-json' }).enabledModules).toEqual([]);
    expect(mapCenterRow({ id: 'c2', name: 'Y' }).enabledModules).toEqual([]);
    expect(mapCenterRow({ id: 'c2', name: 'Y' }).logoUrl).toBe('');
    expect(mapCenterRow({ id: 'c2', name: 'Y' }).plan).toBe('starter');
    expect(mapCenterRow({ id: 'c2', name: 'Y', monthly_price: null }).monthlyPrice).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getCenterAccessState — trial/subscription lifecycle gate
// ---------------------------------------------------------------------------
describe('getCenterAccessState', () => {
  const now = 1_700_000_000_000;

  it('allows a center while its trial is still active', () => {
    expect(getCenterAccessState({ status: 'trial', trial_ends_at: now + 1_000 }, now)).toBeNull();
  });

  it('blocks an expired trial and an expired paid subscription', () => {
    expect(getCenterAccessState({ status: 'trial', trial_ends_at: now - 1 }, now)).toBe('trial_expired');
    expect(getCenterAccessState({ status: 'active', subscription_ends_at: now - 1 }, now)).toBe('subscription_expired');
  });

  it('blocks explicitly suspended or expired centers', () => {
    expect(getCenterAccessState({ status: 'suspended' }, now)).toBe('suspended');
    expect(getCenterAccessState({ status: 'expired' }, now)).toBe('expired');
  });

  it('keeps legacy paid centers without an end date usable', () => {
    expect(getCenterAccessState({ status: 'active', subscription_ends_at: null }, now)).toBeNull();
  });
});


// ---------------------------------------------------------------------------
// Platform cookie flags + controlled 404
// ---------------------------------------------------------------------------
describe('makeSessionCookie — platform session flags', () => {
  it('uses the platform cookie name with HttpOnly/SameSite=Lax/Path=/', () => {
    const req = new Request('https://admin.example.tn/api/auth/login', { method: 'POST' });
    const cookie = makeSessionCookie('tok-1', req);
    expect(cookie.startsWith('tc_platform_session=tok-1;')).toBe(true);
    expect(PLATFORM_SESSION_COOKIE).toBe('tc_platform_session');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure'); // https request
    expect(cookie).not.toContain('tc_session='); // never the center cookie name
  });

  it('omits Secure over plain http (local wrangler dev) but stays HttpOnly', () => {
    const req = new Request('http://localhost:8788/api/auth/login', { method: 'POST' });
    const cookie = makeSessionCookie('tok-1', req);
    expect(cookie).not.toContain('Secure');
    expect(cookie).toContain('HttpOnly');
  });

  it('clearSessionCookie expires the platform cookie', () => {
    const req = new Request('https://admin.example.tn/api/auth/logout', { method: 'POST' });
    const cookie = clearSessionCookie(req);
    expect(cookie).toContain('tc_platform_session=;');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('removedRouteResponse', () => {
  it('answers removed center routes with a controlled JSON 404', async () => {
    const res = removedRouteResponse();
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const data = await res.json() as any;
    expect(data.code).toBe('ROUTE_REMOVED');
    expect(typeof data.error).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Input validation helpers (centers POST/PATCH)
// ---------------------------------------------------------------------------
describe('isValidEmail', () => {
  it('accepts well-formed emails', () => {
    expect(isValidEmail('admin@example.tn')).toBe(true);
    expect(isValidEmail('user.name+tag@sub.domain.co')).toBe(true);
    expect(isValidEmail('  spaced@example.com  ')).toBe(true);
  });

  it('rejects malformed emails and non-strings', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false); // no TLD
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user@.com')).toBe(false);
    expect(isValidEmail('user name@example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(42)).toBe(false);
    expect(isValidEmail('a'.repeat(250) + '@example.com')).toBe(false); // > 254
  });
});

describe('validatePasswordStrength', () => {
  it('accepts 8–128 char passwords', () => {
    expect(validatePasswordStrength('8chars!?')).toBeNull();
    expect(validatePasswordStrength('x'.repeat(128))).toBeNull();
  });

  it('rejects too-short and too-long passwords with a message', () => {
    expect(validatePasswordStrength('short')).toBe('كلمة السر يجب أن تتكون من 8 أحرف على الأقل.');
    expect(validatePasswordStrength('')).toBe('كلمة السر يجب أن تتكون من 8 أحرف على الأقل.');
    expect(validatePasswordStrength('x'.repeat(129))).toBe('كلمة السر طويلة جداً (الحد الأقصى 128 حرفاً).');
    expect(validatePasswordStrength(null)).toBe('كلمة السر يجب أن تتكون من 8 أحرف على الأقل.');
  });
});

describe('VALID_PLANS / isValidPlan', () => {
  it('exposes the four DB-accepted storage plans', () => {
    expect(VALID_PLANS).toEqual(['starter', 'growth', 'pro', 'custom']);
  });

  it('accepts whitelisted plans and normalizes basic → starter', () => {
    for (const plan of ['starter', 'growth', 'pro', 'custom']) expect(isValidPlan(plan)).toBe(true);
    expect(isValidPlan('basic')).toBe(true); // UI alias, stored as starter
    expect(isValidPlan(' starter ')).toBe(true);
  });

  it('rejects unknown, empty and non-string plans', () => {
    expect(isValidPlan('trial')).toBe(false); // trial is a status, not a plan
    expect(isValidPlan('enterprise')).toBe(false);
    expect(isValidPlan('')).toBe(false);
    expect(isValidPlan(null)).toBe(false);
    expect(isValidPlan(42)).toBe(false);
  });
});

describe('clampMonthlyPrice', () => {
  it('clamps to the [0, 1_000_000] window', () => {
    expect(clampMonthlyPrice(0)).toBe(0);
    expect(clampMonthlyPrice(240)).toBe(240);
    expect(clampMonthlyPrice(-50)).toBe(0);
    expect(clampMonthlyPrice(5_000_000)).toBe(1_000_000);
  });

  it('falls back to 0 on non-numeric input', () => {
    expect(clampMonthlyPrice(undefined)).toBe(0);
    expect(clampMonthlyPrice(null)).toBe(0);
    expect(clampMonthlyPrice('abc')).toBe(0);
    expect(clampMonthlyPrice('')).toBe(0);
  });
});

describe('truncateField', () => {
  it('trims and slices to maxLen', () => {
    expect(truncateField('  hello  ', 5)).toBe('hello');
    expect(truncateField('a'.repeat(600), 500)).toBe('a'.repeat(500));
    expect(truncateField('', 5)).toBe('');
  });

  it('handles null/undefined', () => {
    expect(truncateField(null, 5)).toBe('');
    expect(truncateField(undefined, 5)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// addCorsHeaders
// ---------------------------------------------------------------------------
describe('addCorsHeaders', () => {
  it('reflects Origin when same-origin', () => {
    const req = new Request('https://admin.example.tn/api/centers', {
      headers: { Origin: 'https://admin.example.tn' },
    });
    const res = addCorsHeaders(new Response('ok'), req);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.tn');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });

  it('does NOT set CORS headers for cross-origin requests', () => {
    const req = new Request('https://admin.example.tn/api/centers', {
      headers: { Origin: 'https://evil.com' },
    });
    const res = addCorsHeaders(new Response('ok'), req);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('does NOT set CORS headers when Origin is absent', () => {
    const req = new Request('https://admin.example.tn/api/centers');
    const res = addCorsHeaders(new Response('ok'), req);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addSecurityHeaders
// ---------------------------------------------------------------------------
describe('addSecurityHeaders', () => {
  it('sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy', () => {
    const req = new Request('http://admin.example.tn/api/centers');
    const res = addSecurityHeaders(new Response('ok'), req);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets a strict content security policy on every response', () => {
    const req = new Request('https://admin.example.tn/api/centers');
    const res = addSecurityHeaders(new Response('ok'), req);
    const csp = res.headers.get('Content-Security-Policy') || '';
    // 'self' only — no inline scripts, no eval, no unsafe script sources.
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    // frame-ancestors 'none' — API responses cannot be framed.
    expect(csp).toContain("frame-ancestors 'none'");
    // Inline styles stay permitted (Tailwind dynamic styles) and PubNub is the
    // only external connect target (wildcard for cluster hosts like ps12.pndsn.com).
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain('https://*.pndsn.com');
    expect(csp).toContain('blob:');
  });

  it('adds HSTS for HTTPS requests', () => {
    const req = new Request('https://admin.example.tn/api/centers');
    const res = addSecurityHeaders(new Response('ok'), req);
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('omits HSTS for HTTP requests', () => {
    const req = new Request('http://admin.example.tn/api/centers');
    const res = addSecurityHeaders(new Response('ok'), req);
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });
});
