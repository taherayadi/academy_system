import { describe, it, expect } from 'vitest';
import {
  getClientIp,
  json,
  readBody,
  hashPassword,
  verifyPassword,
  getSessionToken,
  isHttpsRequest,
  makeSessionCookie,
  clearSessionCookie,
  mapCenterRow,
  getCenterAccessState,
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
// getSessionToken
// ---------------------------------------------------------------------------
describe('getSessionToken', () => {
  it('extracts token from Cookie header', () => {
    const req = new Request('https://x.com', {
      headers: { Cookie: 'tc_session=abc123; other=xyz' },
    });
    expect(getSessionToken(req)).toBe('abc123');
  });

  it('returns null when no Cookie header', () => {
    const req = new Request('https://x.com');
    expect(getSessionToken(req)).toBeNull();
  });

  it('returns null when tc_session cookie not present', () => {
    const req = new Request('https://x.com', {
      headers: { Cookie: 'other=value' },
    });
    expect(getSessionToken(req)).toBeNull();
  });

  it('decodes URL-encoded token', () => {
    const req = new Request('https://x.com', {
      headers: { Cookie: 'tc_session=hello%20world' },
    });
    expect(getSessionToken(req)).toBe('hello world');
  });

  it('handles cookie with empty value', () => {
    const req = new Request('https://x.com', {
      headers: { Cookie: 'tc_session=; other=val' },
    });
    expect(getSessionToken(req)).toBeNull();
  });

  it('works with lowercase "cookie" header', () => {
    const req = new Request('https://x.com');
    req.headers.set('cookie', 'tc_session=token123');
    expect(getSessionToken(req)).toBe('token123');
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
    expect(cookie).toContain('tc_session=tok123');
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
    expect(cookie).toContain('tc_session=');
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

