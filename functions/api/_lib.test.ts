import { describe, it, expect } from 'vitest';
import {
  getClientIp,
  json,
  readBody,
  sha256Hex,
  getSessionToken,
  isHttpsRequest,
  makeSessionCookie,
  clearSessionCookie,
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
// sha256Hex
// ---------------------------------------------------------------------------
describe('sha256Hex', () => {
  it('produces correct SHA-256 for known input', async () => {
    // SHA-256 of "hello" = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const hash = await sha256Hex('hello');
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('produces correct hash for empty string', async () => {
    const hash = await sha256Hex('');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns 64-char hex string', async () => {
    const hash = await sha256Hex('test123');
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it('produces different hashes for different inputs', async () => {
    const h1 = await sha256Hex('aaa');
    const h2 = await sha256Hex('bbb');
    expect(h1).not.toBe(h2);
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
