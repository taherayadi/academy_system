import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPost, onRequestDelete, onRequestGet } from './slots';

// Régression /api/slots : ajout ciblé d'UNE séance (POST) et suppression
// ciblée (DELETE ?id=) — plus de réécriture complète du domaine via PUT.
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
    CREATE TABLE students (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      student_type TEXT NOT NULL DEFAULT 'regular' CHECK (student_type IN ('regular','external','one_time')),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      UNIQUE (center_id, id)
    ) STRICT;
    CREATE TABLE staff (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT ''
    ) STRICT;
    CREATE TABLE etude_slots (
      id          TEXT PRIMARY KEY,
      center_id   TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      start_time  TEXT NOT NULL,
      end_time    TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      teacher_id  TEXT REFERENCES staff(id) ON DELETE SET NULL,
      is_extra    INTEGER NOT NULL DEFAULT 0 CHECK (is_extra IN (0,1)),
      CHECK (end_time > start_time)
    ) STRICT;
    CREATE TABLE slot_enrollments (
      slot_id    TEXT NOT NULL REFERENCES etude_slots(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (slot_id, student_id)
    ) STRICT;

    INSERT INTO centers (id, name, slug, center_type, plan, status, created_at, updated_at)
      VALUES ('${CENTER}', 'c', 'c', 'garderie', 'starter', 'trial', 1, 1),
             ('${OTHER_CENTER}', 'c2', 'c2', 'garderie', 'starter', 'trial', 1, 1);
    INSERT INTO students (id, center_id, first_name, last_name, created_at) VALUES
      ('st1', '${CENTER}', 'Taher', 'Ayadi', 1),
      ('stX', '${OTHER_CENTER}', 'Autre', 'Centre', 1);
    INSERT INTO staff (id, center_id, first_name, last_name) VALUES ('sf1', '${CENTER}', 'Prof', 'Un');
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

const BASE = 'https://app.example/api/slots';
const SLOT = {
  id: 'slot_1', day: 'Lundi', startTime: '08:00', endTime: '10:00',
  gradeLevel: 'Collège 7ème', teacherId: 'sf1', enrolledStudentIds: ['st1']
};

describe('POST /api/slots (one séance)', () => {
  it('inserts ONE séance with its enrollments without touching other rows', async () => {
    // Existing séance that must survive the targeted add.
    sqlite.prepare(`INSERT INTO etude_slots (id, center_id, weekday, start_time, end_time, grade_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('slot_keep', CENTER, 2, '10:00', '12:00', 'Primaire 3ème');

    const res = await onRequestPost(ctx('POST', BASE, SLOT));
    expect(res.status).toBe(200);

    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM etude_slots').get() as any).n).toBe(2);
    const row = sqlite.prepare('SELECT weekday, start_time, end_time, teacher_id, is_extra FROM etude_slots WHERE id = ?').get('slot_1') as any;
    expect(row.weekday).toBe(1);
    expect(row.teacher_id).toBe('sf1');
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM slot_enrollments WHERE slot_id = ?').get('slot_1') as any).n).toBe(1);
    // L'ancienne séance et ses inscriptions sont intactes.
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM etude_slots WHERE id = ?').get('slot_keep') as any).n).toBe(1);
  });

  it('is idempotent: re-posting the same id rewrites only that séance', async () => {
    sqlite.prepare(`INSERT INTO etude_slots (id, center_id, weekday, start_time, end_time, grade_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('slot_keep', CENTER, 2, '10:00', '12:00', 'Primaire 3ème');
    await onRequestPost(ctx('POST', BASE, SLOT));
    const res = await onRequestPost(ctx('POST', BASE, { ...SLOT, endTime: '11:00', enrolledStudentIds: [] }));
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT end_time FROM etude_slots WHERE id = ?').get('slot_1') as any;
    expect(row.end_time).toBe('11:00');
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM slot_enrollments WHERE slot_id = ?').get('slot_1') as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM etude_slots').get() as any).n).toBe(2);
  });

  it('rejects a teacher of another center', async () => {
    const res = await onRequestPost(ctx('POST', BASE, { ...SLOT, teacherId: 'sf_foreign' }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing id', async () => {
    const res = await onRequestPost(ctx('POST', BASE, { ...SLOT, id: '' }));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/slots (one séance)', () => {
  it('deletes ONE séance and cascades its enrollments', async () => {
    sqlite.prepare(`INSERT INTO etude_slots (id, center_id, weekday, start_time, end_time, grade_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('slot_1', CENTER, 1, '08:00', '10:00', 'Collège 7ème');
    sqlite.prepare(`INSERT INTO etude_slots (id, center_id, weekday, start_time, end_time, grade_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('slot_keep', CENTER, 2, '10:00', '12:00', 'Primaire 3ème');
    sqlite.prepare('INSERT INTO slot_enrollments (slot_id, student_id) VALUES (?, ?)').run('slot_1', 'st1');

    const res = await onRequestDelete(ctx('DELETE', `${BASE}?id=slot_1`));
    expect(res.status).toBe(200);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM etude_slots WHERE id = ?').get('slot_1') as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM etude_slots WHERE id = ?').get('slot_keep') as any).n).toBe(1);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM slot_enrollments').get() as any).n).toBe(0);
  });

  it('404s for an unknown/foreign séance', async () => {
    const res = await onRequestDelete(ctx('DELETE', `${BASE}?id=slot_unknown`));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/slots', () => {
  it('returns only the center rows', async () => {
    sqlite.prepare(`INSERT INTO etude_slots (id, center_id, weekday, start_time, end_time, grade_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('slot_1', CENTER, 1, '08:00', '10:00', 'Collège 7ème');
    sqlite.prepare(`INSERT INTO etude_slots (id, center_id, weekday, start_time, end_time, grade_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('slot_x', OTHER_CENTER, 3, '10:00', '12:00', 'Bac');
    const res = await onRequestGet(ctx('GET', BASE));
    expect(res.status).toBe(200);
    const rows = await res.json() as any[];
    expect(rows.map((r: any) => r.id)).toEqual(['slot_1']);
  });
});
