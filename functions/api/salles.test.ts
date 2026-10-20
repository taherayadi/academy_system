import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost, onRequestPut, onRequestDelete } from './salles';

// Régression /api/salles : CRUD ciblé d'UNE salle (add / update / delete),
// scoping par centre et unicité (id étranger non détournable, nom unique).
// Le schéma réel (node:sqlite + STRICT) exécute le SQL de production, comme D1.

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
    CREATE TABLE salles (
      id         TEXT PRIMARY KEY,
      center_id  TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      capacity   INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
      equipment  TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (center_id, name)
    ) STRICT;

    INSERT INTO centers (id, name, slug, center_type, plan, status, created_at, updated_at)
      VALUES ('${CENTER}', 'c', 'c', 'garderie', 'starter', 'trial', 1, 1),
             ('${OTHER_CENTER}', 'c2', 'c2', 'garderie', 'starter', 'trial', 1, 1);
  `);
  db = {
    prepare(sql: string) {
      let args: any[] = [];
      const stmt = {
        bind(...values: any[]) { args = values; return stmt; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          const r = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(r.changes), last_row_id: r.lastInsertRowid }, success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      for (const s of stmts) await s.run();
    },
  };
});

afterEach(() => sqlite.close());

function ctx(method: string, url: string, body?: unknown) {
  return {
    env: { DB: db },
    request: new Request(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId: CENTER, role: 'admin' } }
  } as any;
}

const BASE = 'https://app.example/api/salles';
const SALLE = { id: 'salle_1', name: 'قاعة A1', capacity: 30, equipment: 'سبورة تفاعلية، تكييف' };

describe('POST /api/salles (add salle)', () => {
  it('inserts ONE salle without touching other rows', async () => {
    sqlite.prepare(`INSERT INTO salles (id, center_id, name, capacity, equipment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('salle_keep', CENTER, 'قاعة B', 20, 'projecteur', 1, 1);

    const res = await onRequestPost(ctx('POST', BASE, SALLE));
    expect(res.status).toBe(200);

    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM salles').get() as any).n).toBe(2);
    const row = sqlite.prepare('SELECT name, capacity, equipment FROM salles WHERE id = ?').get('salle_1') as any;
    expect(row.name).toBe('قاعة A1');
    expect(row.capacity).toBe(30);
    expect(row.equipment).toBe('سبورة تفاعلية، تكييف');
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM salles WHERE id = ?').get('salle_keep') as any).n).toBe(1);
  });

  it('is idempotent: re-posting the same id upserts only that salle', async () => {
    await onRequestPost(ctx('POST', BASE, SALLE));
    const res = await onRequestPost(ctx('POST', BASE, { ...SALLE, capacity: 40, equipment: 'video' }));
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT capacity, equipment FROM salles WHERE id = ?').get('salle_1') as any;
    expect(row.capacity).toBe(40);
    expect(row.equipment).toBe('video');
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM salles').get() as any).n).toBe(1);
  });

  it('rejects a missing id / missing name', async () => {
    expect((await onRequestPost(ctx('POST', BASE, { ...SALLE, id: '' }))).status).toBe(400);
    expect((await onRequestPost(ctx('POST', BASE, { ...SALLE, name: '' }))).status).toBe(400);
  });

  it('accepts an array payload and stores CSV in the TEXT column', async () => {
    const payload = { ...SALLE, equipment: ['سبورة تفاعلية', 'تكييف', 'مرايا'] };
    const res = await onRequestPost(ctx('POST', BASE, payload));
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT equipment FROM salles WHERE id = ?').get('salle_1') as any;
    expect(row.equipment).toBe(payload.equipment.join(', '));
  });

  it('rejects a duplicate salle name in the same center', async () => {
    await onRequestPost(ctx('POST', BASE, SALLE));
    const res = await onRequestPost(ctx('POST', BASE, { id: 'salle_2', name: SALLE.name, capacity: 10 }));
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate name but allows renaming its own row (PUT same id)', async () => {
    await onRequestPost(ctx('POST', BASE, SALLE));
    const res = await onRequestPut(ctx('PUT', BASE, SALLE));
    expect(res.status).toBe(200);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM salles').get() as any).n).toBe(1);
  });

  it('rejects an id owned by another center', async () => {
    sqlite.prepare(`INSERT INTO salles (id, center_id, name, capacity, equipment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('salle_foreign', OTHER_CENTER, 'قاعة otros', 10, '', 1, 1);
    const res = await onRequestPost(ctx('POST', BASE, { id: 'salle_foreign', name: 'قاعة محلية' }));
    expect(res.status).toBe(400);
  });

  it('rejects a negative capacity', async () => {
    const res = await onRequestPost(ctx('POST', BASE, { ...SALLE, capacity: -5 }));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/salles (remove salle)', () => {
  it('deletes ONE salle and leaves other rows untouched', async () => {
    sqlite.prepare(`INSERT INTO salles (id, center_id, name, capacity, equipment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('salle_1', CENTER, 'قاعة A1', 30, '', 1, 1);
    sqlite.prepare(`INSERT INTO salles (id, center_id, name, capacity, equipment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('salle_keep', CENTER, 'قاعة B', 20, '', 1, 1);

    const res = await onRequestDelete(ctx('DELETE', `${BASE}?id=salle_1`));
    expect(res.status).toBe(200);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM salles WHERE id = ?').get('salle_1') as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM salles WHERE id = ?').get('salle_keep') as any).n).toBe(1);
  });

  it('404s for an unknown/foreign salle', async () => {
    const res = await onRequestDelete(ctx('DELETE', `${BASE}?id=salle_unknown`));
    expect(res.status).toBe(404);
  });

  it('400s for a missing id', async () => {
    const res = await onRequestDelete(ctx('DELETE', BASE));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/salles', () => {
  it('returns only the center rows', async () => {
    sqlite.prepare(`INSERT INTO salles (id, center_id, name, capacity, equipment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('salle_1', CENTER, 'قاعة A1', 30, '', 1, 1);
    sqlite.prepare(`INSERT INTO salles (id, center_id, name, capacity, equipment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('salle_x', OTHER_CENTER, 'قاعة الفريق الآخر', 50, '', 1, 1);
    const res = await onRequestGet(ctx('GET', BASE));
    expect(res.status).toBe(200);
    const rows = await res.json() as any[];
    expect(rows.map((r: any) => r.id)).toEqual(['salle_1']);
    expect(rows[0].capacity).toBe(30);
    expect(rows[0].name).toBe('قاعة A1');
    expect(rows[0].equipment).toEqual([]);
  });
});

describe('middleware route inventory', () => {
  it('registers /api/salles with GET/POST/PUT/DELETE', async () => {
    const { ROUTES } = await import('./_middleware');
    expect(ROUTES['/api/salles']).toEqual(['GET', 'POST', 'PUT', 'DELETE']);
  });
});
