import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost, onRequestPut, onRequestDelete } from './student-years';
import { onRequestPut as onStudentTimeSheetsPut, onRequestGet as onStudentTimeSheetsGet } from './student-time-sheets';

// Régression /api/student-years : assignation ciblée d'un emploi du temps
// (table student_years) sans renvoyer l'élève entier — le schéma réel
// (node:sqlite + STRICT) exécute le SQL de production, comme D1.

const CENTER = 'c1';
const OTHER_CENTER = 'c2';
const ST1 = 'st1';
const ST2 = 'st2';
const YEAR = '2026/2027';

let sqlite: DatabaseSync;
let db: any;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE centers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
      phone_number TEXT, location_city TEXT, logo_url TEXT,
      center_type TEXT NOT NULL, plan TEXT NOT NULL,
      billing_cycle TEXT, monthly_price REAL NOT NULL DEFAULT 0,
      max_students INTEGER, status TEXT NOT NULL,
      trial_ends_at INTEGER, subscription_ends_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE etablissements (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      UNIQUE (center_id, name)
    ) STRICT;
    CREATE TABLE students (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      student_type TEXT NOT NULL DEFAULT 'regular' CHECK (student_type IN ('regular','external','one_time')),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      birth_date TEXT,
      birth_place TEXT,
      contact_phone TEXT,
      allergies TEXT NOT NULL DEFAULT '',
      parental_situation TEXT,
      parental_comments TEXT,
      registration_date TEXT,
      registration_location TEXT,
      registration_signed_electronically INTEGER NOT NULL DEFAULT 0,
      registration_signature_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      UNIQUE (center_id, id)
    ) STRICT;
    CREATE TABLE student_years (
      student_id TEXT NOT NULL,
      center_id TEXT NOT NULL,
      school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      grade TEXT NOT NULL,
      etablissement_id TEXT REFERENCES etablissements(id) ON DELETE SET NULL,
      time_sheet_id TEXT,
      PRIMARY KEY (student_id, school_year),
      FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE CASCADE
    ) STRICT;
    CREATE TABLE student_time_sheets (
      id                TEXT PRIMARY KEY,
      center_id         TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      name              TEXT NOT NULL DEFAULT '',
      school_year       TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      establishment_name TEXT NOT NULL,
      etablissement_id  TEXT REFERENCES etablissements(id) ON DELETE SET NULL,
      grade_level       TEXT NOT NULL,
      branch            TEXT,
      class_name        TEXT,
      weekly_schedule   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(weekly_schedule)),
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    ) STRICT;

    INSERT INTO centers (id, name, slug, center_type, plan, status, created_at, updated_at)
      VALUES ('${CENTER}', 'c', 'c', 'garderie', 'starter', 'trial', 1, 1),
             ('${OTHER_CENTER}', 'c2', 'c2', 'garderie', 'starter', 'trial', 1, 1);
    INSERT INTO students (id, center_id, first_name, last_name, created_at) VALUES
      ('${ST1}', '${CENTER}', 'Taher', 'Ayadi', 1),
      ('${ST2}', '${CENTER}', 'Ali', 'Salah', 1),
      ('stX', '${OTHER_CENTER}', 'Autre', 'Centre', 1);
    INSERT INTO etablissements (id, center_id, name) VALUES ('et1', '${CENTER}', 'jawhara');
    INSERT INTO student_time_sheets (id, center_id, school_year, establishment_name, grade_level, created_at, updated_at)
      VALUES ('ts9', '${CENTER}', '${YEAR}', 'jawhara', 'Collège 7ème', 1, 1);
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
          // D1 renvoie { meta: { changes } } — mimé pour res.meta.changes.
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

const BASE = 'https://app.example/api/student-years';

describe('GET /api/student-years', () => {
  it('lists center rows only, with etablissement name join', async () => {
    sqlite.prepare(`INSERT INTO student_years (student_id, center_id, school_year, grade, etablissement_id) VALUES (?, ?, ?, ?, ?)`)
      .run(ST1, CENTER, YEAR, 'Collège 7ème', 'et1');
    sqlite.prepare(`INSERT INTO student_years (student_id, center_id, school_year, grade) VALUES (?, ?, ?, ?)`)
      .run('stX', OTHER_CENTER, YEAR, 'Baccalauréat');
    const res = await onRequestGet(ctx('GET', BASE));
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ studentId: ST1, schoolYear: YEAR, grade: 'Collège 7ème', etablissementId: 'et1', etablissementName: 'jawhara' });
  });
});

describe('POST /api/student-years (upsert)', () => {
  it('assigns a timesheet to one student without touching the student row', async () => {
    sqlite.prepare(`INSERT INTO student_years (student_id, center_id, school_year, grade) VALUES (?, ?, ?, ?)`)
      .run(ST1, CENTER, YEAR, 'Collège 7ème');
    const res = await onRequestPost(ctx('POST', BASE, { studentId: ST1, schoolYear: YEAR, timeSheetId: 'ts9' }));
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT grade, time_sheet_id FROM student_years WHERE student_id = ? AND school_year = ?').get(ST1, YEAR) as any;
    expect(row.grade).toBe('Collège 7ème'); // inchangé
    expect(row.time_sheet_id).toBe('ts9');
    // l'élève lui-même n'a pas été réécrit (pas de DELETE/INSERT cascades)
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM students').get() as any).n).toBe(3);
  });

  it('creates the year row when missing', async () => {
    const res = await onRequestPost(ctx('POST', BASE, { studentId: ST2, schoolYear: YEAR, grade: 'Primaire 3ème', etablissementId: 'et1', timeSheetId: 'ts9' }));
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT grade, etablissement_id, time_sheet_id FROM student_years WHERE student_id = ? AND school_year = ?').get(ST2, YEAR) as any;
    expect(row).toEqual({ grade: 'Primaire 3ème', etablissement_id: 'et1', time_sheet_id: 'ts9' });
  });

  it('rejects a timesheet or etablissement owned by another center', async () => {
    const res = await onRequestPost(ctx('POST', BASE, { studentId: ST1, schoolYear: YEAR, timeSheetId: 'ts_foreign' }));
    expect(res.status).toBe(400);
  });

  it('rejects a student of another center (tenancy)', async () => {
    const res = await onRequestPost(ctx('POST', BASE, { studentId: 'stX', schoolYear: YEAR, grade: 'x' }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/student-years (partial update)', () => {
  it('clears time_sheet_id (null) while keeping grade and etablissement', async () => {
    sqlite.prepare(`INSERT INTO student_years (student_id, center_id, school_year, grade, etablissement_id, time_sheet_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(ST1, CENTER, YEAR, 'Collège 7ème', 'et1', 'ts9');
    const res = await onRequestPut(ctx('PUT', BASE, { studentId: ST1, schoolYear: YEAR, timeSheetId: null }));
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT grade, etablissement_id, time_sheet_id FROM student_years WHERE student_id = ? AND school_year = ?').get(ST1, YEAR) as any;
    expect(row.grade).toBe('Collège 7ème');
    expect(row.etablissement_id).toBe('et1');
    expect(row.time_sheet_id).toBeNull();
  });

  it('404s when the (student, year) row does not exist', async () => {
    const res = await onRequestPut(ctx('PUT', BASE, { studentId: ST2, schoolYear: YEAR, timeSheetId: null }));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/student-years', () => {
  it('removes one (student, year) row, center-scoped', async () => {
    sqlite.prepare(`INSERT INTO student_years (student_id, center_id, school_year, grade) VALUES (?, ?, ?, ?)`)
      .run(ST1, CENTER, YEAR, 'Collège 7ème');
    const res = await onRequestDelete(ctx('DELETE', `${BASE}?studentId=${ST1}&schoolYear=${YEAR}`));
    expect(res.status).toBe(200);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM student_years WHERE student_id = ?').get(ST1) as any).n).toBe(0);
  });

  it('404s for a foreign-center student', async () => {
    const res = await onRequestDelete(ctx('DELETE', `${BASE}?studentId=stX&schoolYear=${YEAR}`));
    expect(res.status).toBe(404);
  });
});

describe('student_time_sheets etablissement_id', () => {
  it('resolves establishment name → etablissements.id on PUT and exposes it on GET', async () => {
    const sheets = [{
      id: 'ts9', schoolYear: YEAR, establishmentName: 'jawhara', gradeLevel: 'Collège 7ème',
      weeklySchedule: [], createdAt: 1, updatedAt: 1
    }];
    const put = await onStudentTimeSheetsPut(ctx('PUT', 'https://app.example/api/student-time-sheets', sheets));
    expect(put.status).toBe(200);
    const row = sqlite.prepare('SELECT etablissement_id FROM student_time_sheets WHERE id = ?').get('ts9') as any;
    expect(row.etablissement_id).toBe('et1');

    const get = await onStudentTimeSheetsGet(ctx('GET', 'https://app.example/api/student-time-sheets'));
    expect(get.status).toBe(200);
    const list = await get.json();
    expect(list[0].etablissementId).toBe('et1');
  });

  it('keeps establishment_name when no etablissements row matches (NULL id, no loss)', async () => {
    const put = await onStudentTimeSheetsPut(ctx('PUT', 'https://app.example/api/student-time-sheets', [{
      id: 'ts10', schoolYear: YEAR, establishmentName: 'inconnue', gradeLevel: 'Baccalauréat',
      weeklySchedule: [], createdAt: 1, updatedAt: 1
    }]));
    expect(put.status).toBe(200);
    // resolveEtablissementIds auto-crée la ligne par nom (comme les élèves)
    const created = sqlite.prepare('SELECT id FROM etablissements WHERE center_id = ? AND name = ?').get(CENTER, 'inconnue') as any;
    const row = sqlite.prepare('SELECT establishment_name, etablissement_id FROM student_time_sheets WHERE id = ?').get('ts10') as any;
    expect(row.establishment_name).toBe('inconnue');
    expect(row.etablissement_id).toBe(created.id);
  });
});
