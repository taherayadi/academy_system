import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost, onRequestDelete } from './suivi-notes';

// Régression / fonctionnalité : endpoint dédié /api/suivi-notes.
// - POST n'envoie que la note (studentId + matière + notes), PAS l'élève entier.
// - L'id est un UUID serveur (TEXT PK depuis migration 0002) : deux centres ne
//   peuvent pas entrer en collision.
// - Toutes les requêtes sont scopées au centre de la session.
// Le shim D1 exécute le SQL réel (node:sqlite, STRICT) : les erreurs de type
// de bind lèvent nativement, comme D1 en production.

const CENTER = 'c1';
const OTHER_CENTER = 'c2';
const STUDENT_ID = 'st_1';

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
      student_type TEXT NOT NULL DEFAULT 'regular',
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    ) STRICT;
    -- Schéma après migration 0002 : id TEXT (UUID) + subject_id, STRICT.
    CREATE TABLE subjects (
      id        TEXT PRIMARY KEY,
      center_id TEXT NOT NULL DEFAULT '',
      name      TEXT NOT NULL,
      UNIQUE (center_id, name)
    ) STRICT;
    CREATE TABLE suivi_notes (
      id          TEXT PRIMARY KEY,
      student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      trimester   INTEGER NOT NULL CHECK (trimester IN (1,2,3)),
      subject_id  TEXT NOT NULL REFERENCES subjects(id),
      devoir1     REAL,
      devoir2     REAL,
      synthese    REAL,
      UNIQUE (student_id, school_year, trimester, subject_id)
    ) STRICT;

    INSERT INTO centers (id, name, slug, center_type, plan, status, created_at, updated_at)
      VALUES ('${CENTER}', 'c', 'c', 'garderie', 'starter', 'trial', 1, 1),
             ('${OTHER_CENTER}', 'o', 'o', 'garderie', 'starter', 'trial', 1, 1);
    INSERT INTO students (id, center_id, first_name, last_name, created_at)
      VALUES ('${STUDENT_ID}', '${CENTER}', 'Taher', 'Ayadi', 1),
             ('st_other', '${OTHER_CENTER}', 'Other', 'Center', 1);
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

function postContext(body: unknown, centerId = CENTER) {
  return {
    env: { DB: db },
    request: new Request('https://app.example/api/suivi-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId, role: 'admin' } }
  } as any;
}

function getContext(query = '', centerId = CENTER) {
  return {
    env: { DB: db },
    request: new Request(`https://app.example/api/suivi-notes${query}`, { method: 'GET' }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId, role: 'admin' } }
  } as any;
}

function deleteContext(id: string, centerId = CENTER) {
  return {
    env: { DB: db },
    request: new Request(`https://app.example/api/suivi-notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId, role: 'admin' } }
  } as any;
}

const notePayload = {
  studentId: STUDENT_ID,
  schoolYear: '2026/2027',
  trimester: 1,
  subject: 'الرياضيات (Mathématiques)',
  devoir1: 15,
  devoir2: 10,
  synthese: 11
};

describe('POST /api/suivi-notes', () => {
  it('inserts a single note with a server-generated UUID id resolved via subject_id (no student payload)', async () => {
    const res = await onRequestPost(postContext(notePayload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = sqlite.prepare('SELECT n.*, s.name AS subject_name FROM suivi_notes n JOIN subjects s ON s.id = n.subject_id WHERE n.student_id = ?').get(STUDENT_ID) as any;
    expect(row.subject_name).toBe(notePayload.subject);
    expect(row.devoir1).toBe(15);
    // id = UUID v4 serveur, pas un AUTOINCREMENT
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // La matière a été résolue (auto-créée) pour CE centre avec un UUID
    expect(row.subject_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect((sqlite.prepare('SELECT center_id FROM subjects WHERE id = ?').get(row.subject_id) as any).center_id).toBe(CENTER);
  });

  it('upserts the same (student, year, trimester, subject) without duplicating rows', async () => {
    await onRequestPost(postContext(notePayload));
    await onRequestPost(postContext({ ...notePayload, devoir1: 18, devoir2: null, synthese: null }));
    const rows = sqlite.prepare('SELECT devoir1, devoir2, synthese FROM suivi_notes WHERE student_id = ?').all(STUDENT_ID) as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].devoir1).toBe(18);
    expect(rows[0].devoir2).toBeNull();
  });

  it('rejects a student from another center (tenancy)', async () => {
    const res = await onRequestPost(postContext({ ...notePayload, studentId: 'st_other' }));
    expect(res.status).toBe(404);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM suivi_notes').get() as any).n).toBe(0);
  });

  it('rejects invalid grades (outside 0..20) and invalid trimester/school year', async () => {
    expect((await onRequestPost(postContext({ ...notePayload, devoir1: 25 }))).status).toBe(400);
    expect((await onRequestPost(postContext({ ...notePayload, trimester: 4 }))).status).toBe(400);
    expect((await onRequestPost(postContext({ ...notePayload, schoolYear: '2026-2027' }))).status).toBe(400);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM suivi_notes').get() as any).n).toBe(0);
  });

  it('rejects a missing studentId with 400', async () => {
    const res = await onRequestPost(postContext({ ...notePayload, studentId: undefined }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/suivi-notes', () => {
  it('returns only the center notes, optionally filtered by studentId, with subject names', async () => {
    await onRequestPost(postContext(notePayload));
    await onRequestPost(postContext({ ...notePayload, subject: 'الفيزياء والكيمياء (Physique-Chimie)' }));
    // note d'un autre centre — ne doit JAMAIS fuir dans la réponse du centre c1
    sqlite.prepare("INSERT INTO subjects (id, center_id, name) VALUES ('sub-o', ?, 'Autre matière')").run(OTHER_CENTER);
    sqlite.prepare('INSERT INTO suivi_notes (id, student_id, school_year, trimester, subject_id, devoir1) VALUES (?, ?, ?, ?, ?, ?)')
      .run('note-other', 'st_other', '2026/2027', 1, 'sub-o', 9);

    const all = await onRequestGet(getContext());
    expect(all.status).toBe(200);
    const bodyAll = await (all.json() as Promise<{ notes: any[] }>);
    expect(bodyAll.notes.length).toBe(2);
    expect(bodyAll.notes.every((n: any) => n.student_id === STUDENT_ID)).toBe(true);

    const one = await onRequestGet(getContext(`?studentId=${STUDENT_ID}`));
    const bodyOne = await (one.json() as Promise<{ notes: any[] }>);
    expect(bodyOne.notes.length).toBe(2);
  });
});

describe('DELETE /api/suivi-notes', () => {
  it('accepts a subjectId from the client list (must belong to the center)', async () => {
    sqlite.prepare('INSERT INTO subjects (id, center_id, name) VALUES (?, ?, ?)').run('sub-x', CENTER, 'X');
    const ok = await onRequestPost(postContext({ ...notePayload, subject: undefined, subjectId: 'sub-x' }));
    expect(ok.status).toBe(200);
    const foreign = await onRequestPost(postContext({ ...notePayload, subject: undefined, subjectId: 'sub-other' }));
    expect(foreign.status).toBe(404);
  });

  it('deletes a note by id, scoped to the center', async () => {
    await onRequestPost(postContext(notePayload));
    const row = sqlite.prepare('SELECT id FROM suivi_notes WHERE student_id = ?').get(STUDENT_ID) as any;
    const res = await onRequestDelete(deleteContext(row.id));
    expect(res.status).toBe(200);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM suivi_notes').get() as any).n).toBe(0);
  });

  it('does not delete another center note', async () => {
    sqlite.prepare('INSERT INTO subjects (id, center_id, name) VALUES (?, ?, ?)').run('sub-o2', OTHER_CENTER, 'Matière');
    sqlite.prepare('INSERT INTO suivi_notes (id, student_id, school_year, trimester, subject_id) VALUES (?, ?, ?, ?, ?)')
      .run('note-other', 'st_other', '2026/2027', 1, 'sub-o2');
    const res = await onRequestDelete(deleteContext('note-other'));
    expect(res.status).toBe(200);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM suivi_notes').get() as any).n).toBe(1);
  });
});
