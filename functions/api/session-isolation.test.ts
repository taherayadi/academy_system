import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APPLICATION } from './_deployment';
import { createSession, validateSession, makeSessionCookie, getSessionToken } from './_lib';
import { onRequestPost as login } from './auth/login';
import { onRequestPost as logout } from './auth/logout';
import { hashSync } from 'bcryptjs';

const own: string = String(APPLICATION);
const foreign = own === 'center' ? 'platform' : 'center';
const role = own === 'center' ? 'admin' : 'platform_super_admin';
const wrongRole = own === 'center' ? 'platform_super_admin' : 'super_admin';
const password = 'integration-test-only-password';
const hash = hashSync(password, 4); // Fast fixture; production hashPassword uses 10 rounds.
let sqlite: DatabaseSync;
let db: any;
function request(token?: string, cookie = false) {
  return new Request('https://app.example/api/auth/me', { headers: token ? cookie ? { Cookie: `tc_${own}_session=${token}` } : { Authorization: `Bearer ${token}` } : {} });
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users (email TEXT PRIMARY KEY, name TEXT, role TEXT, description TEXT, password_hash TEXT, center_id TEXT);
    CREATE TABLE centers (id TEXT PRIMARY KEY, name TEXT, status TEXT, trial_ends_at INTEGER, subscription_ends_at INTEGER);
    CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL);
    CREATE TABLE center_sessions (token TEXT PRIMARY KEY, email TEXT, center_id TEXT, expires_at INTEGER, created_at INTEGER);
    CREATE TABLE platform_sessions (token TEXT PRIMARY KEY, email TEXT, center_id TEXT, expires_at INTEGER, created_at INTEGER);
    INSERT INTO centers VALUES ('c1', 'Center 1', 'active', 0, 0);`);
  sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run('user@example.invalid', 'Test user', role, '', hash, own === 'center' ? 'c1' : null);
  db = {
    prepare(sql: string) {
      let args: any[] = [];
      const stmt = {
        bind(...values: any[]) { args = values; return stmt; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { return sqlite.prepare(sql).run(...args); },
      };
      return stmt;
    },
  };
});
afterEach(() => sqlite.close());
describe('real SQL session isolation', () => {
  it('writes only its own session table and accepts its own bearer/cookie', async () => {
    const token = await createSession(db, 'user@example.invalid', 'c1');
    expect(sqlite.prepare(`SELECT COUNT(*) n FROM ${own}_sessions`).get()!.n).toBe(1);
    expect(sqlite.prepare(`SELECT COUNT(*) n FROM ${foreign}_sessions`).get()!.n).toBe(0);
    expect((await validateSession(db, request(token)))?.role).toBe(role);
    expect((await validateSession(db, request(token, true)))?.role).toBe(role);
  });
  it('does not accept a token stored in the other application table, even with an allowed user role', async () => {
    sqlite.prepare(`INSERT INTO ${foreign}_sessions VALUES (?, ?, ?, ?, ?)`).run('foreign-token', 'user@example.invalid', 'c1', Date.now() + 60000, Date.now());
    expect(await validateSession(db, request('foreign-token'))).toBeNull();
    expect(await validateSession(db, request('foreign-token', true))).toBeNull();
  });
  it('does not accept the legacy or other application cookie', () => {
    for (const name of ['tc_session', `tc_${foreign}_session`]) expect(getSessionToken(new Request('https://app.example', { headers: { Cookie: `${name}=old-token` } }))).toBeNull();
  });
  it('emits a distinct host-only HttpOnly cookie', () => {
    const cookie = makeSessionCookie('test-token', request());
    expect(cookie).toContain(`tc_${own}_session=`);
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure');
    expect(cookie).not.toContain('Domain=');
  });
  it('rejects a current token after role change or user deletion', async () => {
    const token = await createSession(db, 'user@example.invalid', 'c1');
    sqlite.prepare('UPDATE users SET role = ?').run(wrongRole);
    expect(await validateSession(db, request(token))).toBeNull();
    sqlite.exec('DELETE FROM users');
    expect(await validateSession(db, request(token))).toBeNull();
  });
  it('rejects expired sessions', async () => {
    const token = await createSession(db, 'user@example.invalid', 'c1');
    sqlite.exec(`UPDATE ${own}_sessions SET expires_at = 0`);
    expect(await validateSession(db, request(token))).toBeNull();
  });
  it('logs in only its own role and creates no foreign session', async () => {
    const req = () => new Request('https://app.example/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'user@example.invalid', password }) });
    const ok = await login({ env: { DB: db }, request: req() } as any);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Set-Cookie')).toContain(`tc_${own}_session=`);
    sqlite.prepare('UPDATE users SET role = ?').run(wrongRole);
    expect((await login({ env: { DB: db }, request: req() } as any)).status).toBe(401);
    expect(sqlite.prepare(`SELECT COUNT(*) n FROM ${own}_sessions`).get()!.n).toBe(1);
    expect(sqlite.prepare(`SELECT COUNT(*) n FROM ${foreign}_sessions`).get()!.n).toBe(0);
  });
  it('revokes the presented token on logout even if the center was suspended', async () => {
    const token = await createSession(db, 'user@example.invalid', 'c1');
    sqlite.exec("UPDATE centers SET status = 'suspended'");
    expect((await logout({ env: { DB: db }, request: request(token) } as any)).status).toBe(200);
    expect(sqlite.prepare(`SELECT COUNT(*) n FROM ${own}_sessions`).get()!.n).toBe(0);
  });
  if (own === 'center') {
    it('rejects missing, suspended or reassigned centers', async () => {
      const token = await createSession(db, 'user@example.invalid', 'c1');
      sqlite.exec("UPDATE centers SET status = 'suspended'");
      expect(await validateSession(db, request(token))).toBeNull();
      sqlite.exec("UPDATE centers SET status = 'active'; UPDATE users SET center_id = 'c2'");
      expect(await validateSession(db, request(token))).toBeNull();
      sqlite.exec("UPDATE users SET center_id = 'c1'; DELETE FROM centers");
      expect(await validateSession(db, request(token))).toBeNull();
    });
  }
});
