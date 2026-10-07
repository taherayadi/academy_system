import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPut } from './student-time-sheets';

// Régression : PUT /api/student-time-sheets → 500 « تعذر حفظ جداول التوقيت »
// created_at/updated_at sont des colonnes STRICT INTEGER ; le client envoie
// des ISO strings (« 2026-10-07T14:39:35.879Z ») pour un nouveau sheet et des
// epoch-ms en chaîne pour un sheet relu. Le serveur doit normaliser en nombre.
// Le shim exécute le SQL réel (node:sqlite) : un bind texte lève comme D1.

const CENTER = 'c1';

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
    CREATE TABLE etablissements (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      UNIQUE (center_id, name)
    ) STRICT;
    CREATE TABLE student_time_sheets (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      establishment_name TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      branch TEXT,
      class_name TEXT,
      weekly_schedule TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(weekly_schedule)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    INSERT INTO centers (id, name, slug, center_type, plan, status, created_at, updated_at)
      VALUES ('${CENTER}', 'c', 'c', 'formation', 'starter', 'trial', 1, 1);
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

function putRequest(body: unknown) {
  return new Request('https://app.example/api/student-time-sheets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function context(body: unknown) {
  return {
    env: { DB: db },
    request: putRequest(body),
    data: { session: { email: 'x@example.invalid', token: 't', centerId: CENTER, role: 'admin' } }
  } as any;
}

// Payload exact qui a fait le 500 en production.
const failingPayload = [{
  id: '19c4526f-3075-41aa-9d31-a90f70d29506',
  schoolYear: '2026/2027',
  establishmentName: 'jawhara',
  gradeLevel: 'Lycée 1ère Année',
  className: '1',
  weeklySchedule: [{ day: 'الأثنين', startTime: '08:00', endTime: '10:00', id: 'fee17185-84e6-485b-ad1a-75a1f60beecf' }],
  createdAt: '2026-10-07T14:39:35.879Z',
  updatedAt: '2026-10-07T14:39:35.879Z'
}];

describe('PUT /api/student-time-sheets', () => {
  it('accepts ISO createdAt strings from the client (no TEXT-in-INTEGER 500)', async () => {
    const res = await onRequestPut(context(failingPayload));
    expect(res.status).toBe(200);

    const row = sqlite.prepare('SELECT school_year, establishment_name, created_at, updated_at, typeof(created_at) AS t FROM student_time_sheets WHERE id = ?')
      .get('19c4526f-3075-41aa-9d31-a90f70d29506') as any;
    expect(row.establishment_name).toBe('jawhara');
    expect(row.t).toBe('integer');
    // 2026-10-07T14:39:35.879Z → 1791383975879 ms
    expect(row.created_at).toBe(Date.parse('2026-10-07T14:39:35.879Z'));

    // L'établissement est référencé dans la table centralisée (id + center_id NOT NULL)
    const etab = sqlite.prepare('SELECT id FROM etablissements WHERE center_id = ? AND name = ?').get(CENTER, 'jawhara') as any;
    expect(etab).toBeTruthy();
  });

  it('accepts epoch-ms strings echoed back by GET (round-trip save)', async () => {
    const epoch = Date.parse('2026-10-07T14:39:35.879Z');
    const res = await onRequestPut(context([{ ...failingPayload[0], createdAt: String(epoch), updatedAt: String(epoch) }]));
    expect(res.status).toBe(200);
    const row = sqlite.prepare('SELECT created_at FROM student_time_sheets WHERE id = ?')
      .get('19c4526f-3075-41aa-9d31-a90f70d29506') as any;
    expect(row.created_at).toBe(epoch);
  });
});
