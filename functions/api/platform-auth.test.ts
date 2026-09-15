import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { onRequestPost as login } from './auth/login';
import { onRequestPost as logout } from './auth/logout';
import { onRequestGet as me } from './auth/me';
import { onRequestPost as changePassword } from './auth/password';
import {
  validateSession,
  createPlatformSession,
  getPlatformSessionToken,
  PLATFORM_SESSION_COOKIE,
} from './_lib';
import * as lib from './_lib';

/**
 * Integration-style negative tests for the platform authentication boundary.
 *
 * These run the REAL handlers against the REAL _lib session code, with only
 * D1 faked. They prove the security contract of the split:
 *   • center roles can authenticate to the center app — never here;
 *   • only platform_sessions rows + tc_platform_session cookies work;
 *   • legacy center credentials (sessions / tc_session) are inert against
 *     this backend;
 *   • deleted accounts and role changes are re-checked per request.
 */

interface FakeDb {
  users: Map<string, { email: string; name: string; role: string; description: string; password_hash: string; center_id: string | null }>;
  sessions: Map<string, { token: string; email: string; created_at: number; expires_at: number }>;
  legacySessions: Map<string, { token: string; email: string }>;
  queries: string[];
}

function makeDb(): FakeDb {
  return { users: new Map(), sessions: new Map(), legacySessions: new Map(), queries: [] };
}

function d1(db: FakeDb): any {
  const stmt = (sql: string, args: any[] = []) => ({
    async first<T = any>(): Promise<T | null> {
      db.queries.push(sql);
      if (sql.includes('FROM users WHERE email = ?')) return (db.users.get(String(args[0])) as any) ?? null;
      if (sql.includes('FROM platform_sessions s') && sql.includes('JOIN users u')) {
        const s = db.sessions.get(String(args[0]));
        if (!s || s.expires_at <= Date.now()) return null;
        const u = db.users.get(s.email);
        if (!u) return null;
        return { token: s.token, email: s.email, role: u.role } as any;
      }
      if (sql.includes('FROM platform_sessions WHERE token = ?')) {
        const s = db.sessions.get(String(args[0]));
        return s ? ({ token: s.token, email: s.email } as any) : null;
      }
      if (sql.includes('FROM rate_limits WHERE key = ?')) return null;
      return null;
    },
    async run(): Promise<{ meta: { changes: number } }> {
      db.queries.push(sql);
      if (sql.startsWith('INSERT INTO platform_sessions')) {
        const [token, email, created, expires] = args as string[] as any[];
        db.sessions.set(String(token), { token: String(token), email: String(email), created_at: Number(created), expires_at: Number(expires) });
      } else if (sql.startsWith('DELETE FROM platform_sessions WHERE token = ?')) {
        db.sessions.delete(String(args[0]));
      } else if (sql.startsWith('DELETE FROM platform_sessions WHERE email = ?')) {
        for (const [t, s] of db.sessions) if (s.email === args[0]) db.sessions.delete(t);
      } else if (sql.startsWith('UPDATE users SET password_hash')) {
        const [hash, email] = args as any[];
        const u = db.users.get(String(email));
        if (u) u.password_hash = String(hash);
      } else if (sql.startsWith('DELETE FROM sessions WHERE center_id')) {
        // The CENTER app's table — the platform must never write it.
        throw new Error('PLATFORM MUST NOT WRITE THE CENTER sessions TABLE');
      }
      return { meta: { changes: 1 } };
    },
    async all(): Promise<{ results: any[] }> {
      db.queries.push(sql);
      return { results: [] };
    },
    batch: async (statements: any[]) => { for (const s of statements) await s.run(); },
  });
  return {
    prepare(sql: string) {
      let bound: any[] = [];
      return {
        bind(...args: any[]) { bound = args; return stmt(sql, args); },
        first: () => stmt(sql, bound).first(),
        run: () => stmt(sql, bound).run(),
        all: () => stmt(sql, bound).all(),
      };
    },
  };
}

async function seedUser(db: FakeDb, email: string, role: string, password = 'Str0ng-Pass!23') {
  db.users.set(email, {
    email, name: role === 'platform_super_admin' ? 'Plateforme' : 'Gérant',
    role, description: '', password_hash: await bcrypt.hash(password, 4),
    center_id: role === 'platform_super_admin' ? null : 'c1',
  });
  return password;
}

function post(body: unknown, cookie?: string) {
  return new Request('https://admin.example.tn/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

/** Seed an account whose row still holds the pre-salt-fix UNSALTED SHA-256 digest. */
function seedLegacyUser(db: FakeDb, email: string, role: string, password: string) {
  db.users.set(email, {
    email, name: 'Legacy', role, description: '',
    password_hash: createHash('sha256').update(password).digest('hex'),
    center_id: role === 'platform_super_admin' ? null : 'c1',
  });
}

beforeEach(() => {
  // Fresh module state is not needed (no cross-test globals beyond the db).
});

describe('POST /api/auth/login — platform_super_admin ONLY', () => {
  it('platform_super_admin: 200 + platform cookie + a platform_sessions row', async () => {
    const db = makeDb();
    const pw = await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const res = await login({ env: { DB: d1(db) } as any, request: post({ email: 'SA@p.tn', password: pw }) } as any);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.user.role).toBe('platform_super_admin');
    const setCookie = res.headers.get('Set-Cookie') || '';
    expect(setCookie).toContain(`${PLATFORM_SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(db.sessions.size).toBe(1);
    expect(db.sessions.values().next().value!.email).toBe('sa@p.tn');
  });

  it.each([
    ['admin', 'owner@c1.tn'],
    ['super_admin', 'boss@c1.tn'],
    ['restricted_admin', 'staff@c1.tn'],
  ])('center role %s with the CORRECT password: 401, no session, no cookie', async (role, email) => {
    const db = makeDb();
    const pw = await seedUser(db, email, role);
    const res = await login({ env: { DB: d1(db) } as any, request: post({ email, password: pw }) } as any);
    expect(res.status).toBe(401);
    const data: any = await res.json();
    // Enumeration-safe: identical message to a wrong password.
    expect(data.error).toBe('كلمة السر غير صحيحة');
    expect(db.sessions.size).toBe(0);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('unknown email and wrong password are indistinguishable', async () => {
    const db = makeDb();
    const pw = await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const unknown = await login({ env: { DB: d1(db) } as any, request: post({ email: 'ghost@p.tn', password: pw }) } as any);
    const wrongPw = await login({ env: { DB: d1(db) } as any, request: post({ email: 'sa@p.tn', password: 'nope' }) } as any);
    expect(unknown.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrongPw.json());
  });
});

describe('POST /api/auth/login — legacy unsalted SHA-256 one-time upgrade', () => {
  it('accepts the legacy-format account ONCE, then stores a bcrypt hash and flags the upgrade', async () => {
    const db = makeDb();
    seedLegacyUser(db, 'old@p.tn', 'platform_super_admin', 'PlatformAdmin2026!');
    const before = db.users.get('old@p.tn')!.password_hash;
    expect(before).toMatch(/^[0-9a-f]{64}$/);

    const res = await login({ env: { DB: d1(db) } as any, request: post({ email: 'old@p.tn', password: 'PlatformAdmin2026!' }) } as any);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.passwordUpgraded).toBe(true);
    expect(db.sessions.size).toBe(1);

    // The row is rewritten with a real bcrypt hash of the same password.
    const after = db.users.get('old@p.tn')!.password_hash;
    expect(after).not.toBe(before);
    expect(after).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(await bcrypt.compare('PlatformAdmin2026!', after)).toBe(true);

    // Second login goes through the normal bcrypt path: no flag, works fine.
    const res2 = await login({ env: { DB: d1(db) } as any, request: post({ email: 'old@p.tn', password: 'PlatformAdmin2026!' }) } as any);
    expect(res2.status).toBe(200);
    expect((await res2.json() as any).passwordUpgraded).toBeUndefined();
  });

  it('wrong password against a legacy hash: 401, row untouched', async () => {
    const db = makeDb();
    seedLegacyUser(db, 'old@p.tn', 'platform_super_admin', 'PlatformAdmin2026!');
    const before = db.users.get('old@p.tn')!.password_hash;
    const res = await login({ env: { DB: d1(db) } as any, request: post({ email: 'old@p.tn', password: 'guessed-wrong' }) } as any);
    expect(res.status).toBe(401);
    expect(db.users.get('old@p.tn')!.password_hash).toBe(before);
    expect(db.sessions.size).toBe(0);
  });

  it('center-role account with a legacy hash: 401 AND its row is NEVER rewritten', async () => {
    const db = makeDb();
    seedLegacyUser(db, 'boss@c1.tn', 'super_admin', 'CenterBoss!2026');
    const before = db.users.get('boss@c1.tn')!.password_hash;
    const res = await login({ env: { DB: d1(db) } as any, request: post({ email: 'boss@c1.tn', password: 'CenterBoss!2026' }) } as any);
    expect(res.status).toBe(401);
    expect(db.users.get('boss@c1.tn')!.password_hash).toBe(before);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('64-hex lookalikes that are not SHA-256(password) are rejected', async () => {
    const db = makeDb();
    db.users.set('fake@p.tn', {
      email: 'fake@p.tn', name: 'x', role: 'platform_super_admin', description: '',
      password_hash: 'a'.repeat(64), center_id: null,
    });
    const res = await login({ env: { DB: d1(db) } as any, request: post({ email: 'fake@p.tn', password: 'whatever' }) } as any);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/login — timing normalisation (no account / legacy vs bcrypt)', () => {
  it('unknown-email branch burns one real bcrypt compare against the dummy hash', async () => {
    const db = makeDb();
    await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const spy = vi.spyOn(lib, 'verifyPassword');
    const res = await login({ env: { DB: d1(db) } as any, request: post({ email: 'ghost@p.tn', password: 'whatever' }) } as any);
    expect(res.status).toBe(401);
    expect(spy).toHaveBeenCalledWith('whatever', lib.AUTH_TIMING_DUMMY_HASH);
    spy.mockRestore();
  });

  it('legacy-hash path also burns one bcrypt (wrong password included)', async () => {
    const db = makeDb();
    seedLegacyUser(db, 'old@p.tn', 'platform_super_admin', 'LegacyPass!2026');
    const spy = vi.spyOn(lib, 'verifyPassword');
    const wrong = await login({ env: { DB: d1(db) } as any, request: post({ email: 'old@p.tn', password: 'wrong-pw' }) } as any);
    expect(wrong.status).toBe(401);
    expect(spy).toHaveBeenCalledWith('wrong-pw', lib.AUTH_TIMING_DUMMY_HASH);
    spy.mockRestore();
  });
});

describe('validateSession — platform_sessions semantics', () => {
  it('accepts a fresh platform session from the cookie', async () => {
    const db = makeDb();
    await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const token = await createPlatformSession(d1(db), 'sa@p.tn');
    const session = await validateSession(d1(db), post({}, `${PLATFORM_SESSION_COOKIE}=${token}`));
    expect(session).toMatchObject({ email: 'sa@p.tn', role: 'platform_super_admin' });
  });

  it('accepts the Bearer compatibility path but ONLY against platform_sessions', async () => {
    const db = makeDb();
    await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const token = await createPlatformSession(d1(db), 'sa@p.tn');
    const viaBearer = await validateSession(d1(db), new Request('https://admin.example.tn/api/centers', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(viaBearer?.email).toBe('sa@p.tn');

    // A token that exists only in the CENTER `sessions` table resolves to
    // nothing here: the legacy store is not consulted at all.
    db.legacySessions.set('center-token', { token: 'center-token', email: 'sa@p.tn' });
    const forged = await validateSession(d1(db), new Request('https://admin.example.tn/api/centers', {
      headers: { Authorization: 'Bearer center-token' },
    }));
    expect(forged).toBeNull();
    // The platform query stream never touched the legacy table.
    expect(db.queries.some(q => /FROM sessions s LEFT JOIN users u/.test(q))).toBe(false);
    expect(db.queries.some(q => /INSERT INTO sessions /.test(q))).toBe(false);
  });

  it('ignores the center app cookie name tc_session even with a real value', async () => {
    const db = makeDb();
    await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const token = await createPlatformSession(d1(db), 'sa@p.tn');
    const res = await validateSession(d1(db), post({}, `tc_session=${token}`));
    expect(res).toBeNull(); // right value, wrong cookie name ⇒ nothing
  });

  it('rejects an expired platform session', async () => {
    const db = makeDb();
    await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const token = await createPlatformSession(d1(db), 'sa@p.tn');
    db.sessions.get(token)!.expires_at = Date.now() - 1000; // simulate expiry
    expect(await validateSession(d1(db), post({}, `${PLATFORM_SESSION_COOKIE}=${token}`))).toBeNull();
  });

  it('rejects immediately when the account is DELETED (session row can outlive it, the JOIN cannot)', async () => {
    const db = makeDb();
    await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const token = await createPlatformSession(d1(db), 'sa@p.tn');
    db.users.delete('sa@p.tn');
    expect(db.sessions.size).toBe(1); // row still present…
    expect(await validateSession(d1(db), post({}, `${PLATFORM_SESSION_COOKIE}=${token}`))).toBeNull(); // …but useless
  });

  it.each(['admin', 'super_admin', 'restricted_admin'])(
    'rejects a session whose account role was changed to %s (center role ≠ platform access)',
    async (role) => {
      const db = makeDb();
      await seedUser(db, 'sa@p.tn', 'platform_super_admin');
      const token = await createPlatformSession(d1(db), 'sa@p.tn');
      db.users.get('sa@p.tn')!.role = role; // privilege removed post-login
      expect(await validateSession(d1(db), post({}, `${PLATFORM_SESSION_COOKIE}=${token}`))).toBeNull();
    }
  );
});

describe('GET /api/auth/me + POST /api/auth/logout', () => {
  it('me returns ONLY the platform account — no center tenant payload', async () => {
    const db = makeDb();
    await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const token = await createPlatformSession(d1(db), 'sa@p.tn');
    const res = await me({
      env: { DB: d1(db) },
      request: new Request('https://admin.example.tn/api/auth/me', { headers: { Cookie: `${PLATFORM_SESSION_COOKIE}=${token}` } }),
    } as any);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.user.role).toBe('platform_super_admin');
    expect(data.center).toBeUndefined(); // tenant payload is a center-app concern
  });

  it('me answers 401 for a center cookie carrying a valid center token', async () => {
    const res = await me({
      env: { DB: d1(makeDb()) },
      request: new Request('https://admin.example.tn/api/auth/me', { headers: { Cookie: 'tc_session=whatever' } }),
    } as any);
    expect(res.status).toBe(401);
  });

  it('logout deletes the platform_sessions row and clears the platform cookie', async () => {
    const db = makeDb();
    await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const token = await createPlatformSession(d1(db), 'sa@p.tn');
    const res = await logout({
      env: { DB: d1(db) },
      request: new Request('https://admin.example.tn/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: `${PLATFORM_SESSION_COOKIE}=${token}` },
      }),
    } as any);
    expect(res.status).toBe(200);
    expect(db.sessions.size).toBe(0);
    const cleared = res.headers.get('Set-Cookie') || '';
    expect(cleared).toContain(`${PLATFORM_SESSION_COOKIE}=;`);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).not.toContain('tc_session=;'); // never clears the center cookie
  });

  it('logout without a session is still a safe 200 (idempotent)', async () => {
    const res = await logout({
      env: { DB: d1(makeDb()) },
      request: new Request('https://admin.example.tn/api/auth/logout', { method: 'POST' }),
    } as any);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/password — self-service, session identity', () => {
  it('changes the SESSION owner password and ignores any body email', async () => {
    const db = makeDb();
    const pw = await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    await seedUser(db, 'victim@p.tn', 'platform_super_admin', 'other-secret');
    const token = await createPlatformSession(d1(db), 'sa@p.tn');

    const res = await changePassword({
      env: { DB: d1(db) },
      request: post({ email: 'victim@p.tn', currentPassword: pw, newPassword: 'Rotated-Pw-99' }, `${PLATFORM_SESSION_COOKIE}=${token}`),
    } as any);
    // The victim's hash must be untouched — the body email is ignored.
    expect(bcrypt.compareSync('other-secret', db.users.get('victim@p.tn')!.password_hash)).toBe(true);
    expect(res.status).toBe(200);
    expect(bcrypt.compareSync('Rotated-Pw-99', db.users.get('sa@p.tn')!.password_hash)).toBe(true);
    // All platform sessions revoked, including the caller's.
    expect(db.sessions.size).toBe(0);
  });

  it('rejects anonymous and center-role callers (401)', async () => {
    const db = makeDb();
    await seedUser(db, 'boss@c1.tn', 'super_admin');
    const anon = await changePassword({
      env: { DB: d1(db) },
      request: post({ currentPassword: 'x', newPassword: 'yyyyyyyy' }),
    } as any);
    expect(anon.status).toBe(401);
    expect(db.sessions.size).toBe(0);
  });

  it('enforces the platform password policy (>= 8 chars, changed)', async () => {
    const db = makeDb();
    const pw = await seedUser(db, 'sa@p.tn', 'platform_super_admin');
    const token = await createPlatformSession(d1(db), 'sa@p.tn');
    const short = await changePassword({
      env: { DB: d1(db) },
      request: post({ currentPassword: pw, newPassword: 'short' }, `${PLATFORM_SESSION_COOKIE}=${token}`),
    } as any);
    expect(short.status).toBe(400);
  });
});
