import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost } from './subjects';
import { ensureCenterSubjects } from './_lib';

// Endpoint dédié /api/subjects :
// - GET renvoie les matières du centre (id UUID + nom), seedée si vide.
// - POST ajoute UNE matière avec un UUID serveur (idempotent par nom).
// - Toutes les requêtes sont scopées au centre de la session.

const CENTER = 'c1';
const OTHER_CENTER = 'c2';

let sqlite: DatabaseSync;
let db: any;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE centers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
      center_type TEXT NOT NULL, plan TEXT NOT NULL, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE subjects (
      id        TEXT PRIMARY KEY,
      center_id TEXT NOT NULL DEFAULT '',
      name      TEXT NOT NULL,
      UNIQUE (center_id, name)
    ) STRICT;

    INSERT INTO centers (id, name, slug, center_type, plan, status, created_at, updated_at)
      VALUES ('${CENTER}', 'c', 'c', 'garderie', 'starter', 'trial', 1, 1),
             ('${OTHER_CENTER}', 'o', 'o', 'garderie', 'starter', 'trial', 1, 1);
  `);
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
    async batch(stmts: any[]) {
      for (const s of stmts) await s.run();
    },
  };
});

afterEach(() => sqlite.close());

function ctx(method: 'GET' | 'POST', body?: unknown, centerId = CENTER) {
  return {
    env: { DB: db },
    request: new Request('https://app.example/api/subjects', {
      method,
      ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId, role: 'admin' } }
  } as any;
}

describe('GET /api/subjects', () => {
  it('seeds the default catalogue when the center has no subject', async () => {
    const res = await onRequestGet(ctx('GET'));
    expect(res.status).toBe(200);
    const body = await res.json() as { subjects: any[] };
    expect(body.subjects.length).toBeGreaterThanOrEqual(10);
    // Toutes les lignes seedées appartiennent au centre (pas de catalogue '')
    expect(body.subjects.every((s: any) => s.center_id === CENTER || s.center_id === undefined)).toBe(true);
    expect(body.subjects.every((s: any) => /^[0-9a-f-]{36}$/.test(s.id))).toBe(true);
    // idempotent : un deuxième GET ne duplique pas
    await onRequestGet(ctx('GET'));
    const n = (sqlite.prepare('SELECT COUNT(*) AS n FROM subjects WHERE center_id = ?').get(CENTER) as any).n;
    expect(n).toBe(body.subjects.length);
  });

  it('does not leak another center subjects (fresh seed, own ids)', async () => {
    await ensureCenterSubjects(db, OTHER_CENTER);
    const otherRows = (sqlite.prepare('SELECT id FROM subjects WHERE center_id = ?').all(OTHER_CENTER) as any[]).map(r => r.id);
    const res = await onRequestGet(ctx('GET'));
    const body = await res.json() as { subjects: any[] };
    // c1 était vide → seedé pour c1, mais avec des lignes PROPRES (jamais celles de c2)
    expect(body.subjects.length).toBeGreaterThanOrEqual(10);
    expect(body.subjects.some((s: any) => otherRows.includes(s.id))).toBe(false);
  });
});

describe('POST /api/subjects', () => {
  it('adds a subject with a server-generated UUID, center-scoped', async () => {
    const res = await onRequestPost(ctx('POST', { name: 'مادة جديدة (Nouvelle)' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; id: string; name: string };
    expect(body.ok).toBe(true);
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const row = sqlite.prepare('SELECT center_id, name FROM subjects WHERE id = ?').get(body.id) as any;
    expect(row.center_id).toBe(CENTER);
    expect(row.name).toBe('مادة جديدة (Nouvelle)');
  });

  it('is idempotent per (center, name) — no duplicate rows', async () => {
    const a = await onRequestPost(ctx('POST', { name: 'Math' }));
    const b = await onRequestPost(ctx('POST', { name: 'Math' }));
    const ia = ((await a.json()) as any).id;
    const ib = ((await b.json()) as any).id;
    expect(ia).toBe(ib);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM subjects WHERE name = ?').all('Math') as any).length).toBe(1);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM subjects WHERE name = ?').get('Math') as any).n).toBe(1);
  });

  it('rejects an empty name with 400', async () => {
    const res = await onRequestPost(ctx('POST', { name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('scopes subjects per center — same name, different ids', async () => {
    const a = await onRequestPost(ctx('POST', { name: 'Math' }));
    const b = await onRequestPost(ctx('POST', { name: 'Math' }, OTHER_CENTER));
    const ia = ((await a.json()) as any).id;
    const ib = ((await b.json()) as any).id;
    expect(ia).not.toBe(ib);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM subjects WHERE name = ?').get('Math') as any).n).toBe(2);
  });
});

describe('ensureCenterSubjects (login seeding)', () => {
  it('inserts the default catalogue exactly once per center', async () => {
    await ensureCenterSubjects(db, CENTER);
    await ensureCenterSubjects(db, CENTER);
    const n = (sqlite.prepare('SELECT COUNT(*) AS n FROM subjects WHERE center_id = ?').get(CENTER) as any).n;
    expect(n).toBeGreaterThanOrEqual(10);
    const distinct = (sqlite.prepare('SELECT COUNT(DISTINCT name) AS n FROM subjects WHERE center_id = ?').get(CENTER) as any).n;
    expect(distinct).toBe(n);
  });
});
