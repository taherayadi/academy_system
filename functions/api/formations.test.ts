import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPost, onRequestDelete, onRequestPut, onRequestGet } from './formations';
import { onRequestPut as onSchedulePut, onRequestPost as onSchedulePost } from './formation-schedule';
import { addFormationStudent, removeFormationStudent } from './_lib';

// Régression /api/formations : ajout ciblé d'UNE formation (POST) et suppression
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
    CREATE TABLE subjects (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
      UNIQUE (center_id, name)
    ) STRICT;
    CREATE TABLE students (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      student_type TEXT NOT NULL DEFAULT 'regular' CHECK (student_type IN ('regular','external','one_time')),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      contact_phone TEXT,
      allergies TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE formations (
      id          TEXT PRIMARY KEY,
      center_id   TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      start_date  TEXT NOT NULL,
      end_date    TEXT NOT NULL,
      pack_price  REAL NOT NULL DEFAULT 0 CHECK (pack_price >= 0),
      schedule    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(schedule)),
      created_at  INTEGER NOT NULL,
      CHECK (end_date >= start_date)
    ) STRICT;
    CREATE TABLE formation_matieres (
      id           TEXT PRIMARY KEY,
      formation_id TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
      subject_id   TEXT NOT NULL REFERENCES subjects(id)
    ) STRICT;
    CREATE TABLE formation_enrollments (
      id           TEXT PRIMARY KEY,
      center_id    TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      formation_id TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
      student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      is_pack      INTEGER NOT NULL DEFAULT 0 CHECK (is_pack IN (0,1)),
      is_advance   INTEGER NOT NULL DEFAULT 0 CHECK (is_advance IN (0,1)),
      discount     REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
      notes        TEXT,
      enrolled_at  INTEGER NOT NULL,
      UNIQUE (formation_id, student_id)
    ) STRICT;
    CREATE TABLE formation_enrollment_matieres (
      enrollment_id TEXT NOT NULL REFERENCES formation_enrollments(id) ON DELETE CASCADE,
      matiere_id    TEXT NOT NULL REFERENCES formation_matieres(id) ON DELETE CASCADE,
      PRIMARY KEY (enrollment_id, matiere_id)
    ) STRICT;
    CREATE TABLE payments (
      id             TEXT PRIMARY KEY,
      center_id      TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      student_id     TEXT NOT NULL,
      date           TEXT CHECK (date IS NULL OR date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      service_key    TEXT,
      billing_period TEXT,
      period_month   TEXT,
      school_year    TEXT,
      payment_type   TEXT,
      method         TEXT CHECK (method IS NULL OR method IN ('cash','cheque','transfer','card')),
      amount         REAL NOT NULL DEFAULT 0,
      total_required REAL NOT NULL DEFAULT 0,
      discount       REAL NOT NULL DEFAULT 0,
      receipt_number TEXT,
      notes          TEXT,
      cheque_number  TEXT,
      cheque_date    TEXT,
      cheque_paid    INTEGER NOT NULL DEFAULT 0,
      is_refund      INTEGER NOT NULL DEFAULT 0,
      ref_type       TEXT CHECK (ref_type IS NULL OR ref_type IN ('external_course','revision_seance','formation','event')),
      ref_id         TEXT,
      created_at     INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE revision_seance_students (
      seance_id       TEXT NOT NULL,
      student_id      TEXT NOT NULL,
      present         INTEGER NOT NULL DEFAULT 0,
      paid_payment_id TEXT,
      PRIMARY KEY (seance_id, student_id)
    ) STRICT;

    INSERT INTO centers (id, name, slug, center_type, plan, status, created_at, updated_at)
      VALUES ('${CENTER}', 'c', 'c', 'garderie', 'starter', 'trial', 1, 1),
             ('${OTHER_CENTER}', 'c2', 'c2', 'garderie', 'starter', 'trial', 1, 1);
    INSERT INTO students (id, center_id, first_name, last_name, created_at) VALUES
      ('st1', '${CENTER}', 'Taher', 'Ayadi', 1),
      ('stX', '${OTHER_CENTER}', 'Autre', 'Centre', 1);
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

const BASE = 'https://app.example/api/formations';
const FORMATION = {
  id: 'form_1', name: 'تكوين الحساب', schoolYear: '2025/2026',
  startDate: '2025-09-01', endDate: '2026-06-30', packPrice: 1500,
  matieres: [{ id: 'mat_1', subject: 'الرياضيات' }], students: [], schedule: [], createdAt: 1
};

function seedFormation(id: string, centerId: string) {
  sqlite.prepare(`INSERT INTO formations (id, center_id, name, school_year, start_date, end_date, pack_price, schedule, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, centerId, 'تكوين', '2025/2026', '2025-09-01', '2026-06-30', 0, '[]', 1);
}

describe('POST /api/formations (one formation)', () => {
  it('inserts ONE formation with its matieres without touching other rows', async () => {
    seedFormation('form_keep', CENTER);

    const res = await onRequestPost(ctx('POST', BASE, FORMATION));
    expect(res.status).toBe(200);

    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formations').get() as any).n).toBe(2);
    const row = sqlite.prepare('SELECT name, school_year, pack_price FROM formations WHERE id = ?').get('form_1') as any;
    expect(row.name).toBe('تكوين الحساب');
    expect(row.school_year).toBe('2025/2026');
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_matieres WHERE formation_id = ?').get('form_1') as any).n).toBe(1);
    // L'autre formation n'a pas été touchée.
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formations WHERE id = ?').get('form_keep') as any).n).toBe(1);
  });

  it('is idempotent: re-posting the same id rewrites only that formation', async () => {
    seedFormation('form_keep', CENTER);
    await onRequestPost(ctx('POST', BASE, FORMATION));
    const res = await onRequestPost(ctx('POST', BASE, { ...FORMATION, name: 'تكوين معدّل', matieres: [] }));
    expect(res.status).toBe(200);
    expect((sqlite.prepare('SELECT name FROM formations WHERE id = ?').get('form_1') as any).name).toBe('تكوين معدّل');
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_matieres WHERE formation_id = ?').get('form_1') as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formations').get() as any).n).toBe(2);
  });

  it('rejects a missing id or name', async () => {
    expect((await onRequestPost(ctx('POST', BASE, { ...FORMATION, id: '' }))).status).toBe(400);
    expect((await onRequestPost(ctx('POST', BASE, { ...FORMATION, name: '' }))).status).toBe(400);
  });

  it('rejects hijacking a formation id owned by another center', async () => {
    seedFormation('form_1', OTHER_CENTER);
    const res = await onRequestPost(ctx('POST', BASE, FORMATION));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/formations (one formation)', () => {
  it('deletes ONE formation, its matieres, enrollments and payments', async () => {
    seedFormation('form_1', CENTER);
    seedFormation('form_keep', CENTER);
    sqlite.prepare("INSERT INTO subjects (id, center_id, name) VALUES ('sub_1', ?, 'علوم')").run(CENTER);
    sqlite.prepare("INSERT INTO formation_matieres (id, formation_id, subject_id) VALUES ('mat_1', 'form_1', 'sub_1')").run();
    sqlite.prepare(`INSERT INTO formation_enrollments (id, center_id, formation_id, student_id, enrolled_at) VALUES ('en_1', ?, 'form_1', 'st1', 1)`).run(CENTER);
    sqlite.prepare("INSERT INTO formation_enrollment_matieres (enrollment_id, matiere_id) VALUES ('en_1', 'mat_1')").run();
    sqlite.prepare(`INSERT INTO payments (id, center_id, student_id, ref_type, ref_id, amount, total_required, created_at) VALUES ('p1', ?, 'st1', 'formation', 'en_1', 100, 100, 1)`).run(CENTER);

    const res = await onRequestDelete(ctx('DELETE', `${BASE}?id=form_1`));
    expect(res.status).toBe(200);

    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formations WHERE id = ?').get('form_1') as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_matieres').get() as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_enrollments').get() as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_enrollment_matieres').get() as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get() as any).n).toBe(0);
    // L'autre formation est intacte.
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formations WHERE id = ?').get('form_keep') as any).n).toBe(1);
  });

  it('rejects (400) an unknown/foreign formation', async () => {
    const res = await onRequestDelete(ctx('DELETE', `${BASE}?id=form_unknown`));
    expect(res.status).toBe(400);
  });
});

describe('formation students (targeted POST / DELETE)', () => {
  function seedFormationWithMatiere() {
    seedFormation('form_1', CENTER);
    sqlite.prepare("INSERT INTO subjects (id, center_id, name) VALUES ('sub_1', ?, 'علوم')").run(CENTER);
    sqlite.prepare("INSERT INTO formation_matieres (id, formation_id, subject_id) VALUES ('mat_1', 'form_1', 'sub_1')").run();
  }

  const STUDENT = {
    id: 'fst_1', studentName: 'amir', parentPhone: '55555555', isPack: true,
    enrolledMatiereIds: ['mat_1'], amountPaid: 100, totalRequired: 100,
    paymentMethod: 'espece', isAdvance: false, enrolledAt: '2026-10-14T08:55:12.590Z'
  };

  it('adds ONE student as an external `students` row + enrollment + payment', async () => {
    seedFormationWithMatiere();
    await addFormationStudent(db, 'form_1', STUDENT, CENTER);

    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_enrollments WHERE formation_id = ?').get('form_1') as any).n).toBe(1);
    const s = sqlite.prepare("SELECT student_type, first_name, contact_phone FROM students WHERE first_name = 'amir'").get() as any;
    expect(s).toBeTruthy();
    expect(s.student_type).toBe('external');
    expect(s.contact_phone).toBe('55555555');
    // L'inscription porte bien l'id client (fst_1) comme identifiant d'inscription.
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_enrollments WHERE id = ?').get('fst_1') as any).n).toBe(1);
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE ref_type = 'formation' AND ref_id = ?").get('fst_1') as any).n).toBe(1);
  });

  it('is idempotent: re-adding the same student rewrites only that enrollment/payment', async () => {
    seedFormationWithMatiere();
    await addFormationStudent(db, 'form_1', STUDENT, CENTER);
    await addFormationStudent(db, 'form_1', { ...STUDENT, amountPaid: 200, totalRequired: 200 }, CENTER);

    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_enrollments').get() as any).n).toBe(1);
    expect((sqlite.prepare("SELECT amount FROM payments WHERE ref_id = ?").get('fst_1') as any).amount).toBe(200);
  });

  it('rejects adding to an unknown/foreign formation (400)', async () => {
    const res = await onRequestPost(ctx('POST', 'https://app.example/api/formation-students', { formationId: 'form_x', student: STUDENT }));
    expect(res.status).toBe(400);
  });

  it('removes ONE student: enrollment, payment and backing student row are gone', async () => {
    seedFormationWithMatiere();
    await addFormationStudent(db, 'form_1', STUDENT, CENTER);

    await removeFormationStudent(db, 'form_1', 'fst_1', CENTER);

    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_enrollments').get() as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get() as any).n).toBe(0);
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM students WHERE student_type = 'external'").get() as any).n).toBe(0);
  });

  it('keeps the shared student row when still enrolled in another formation', async () => {
    seedFormation('form_1', CENTER);
    seedFormation('form_2', CENTER);
    await addFormationStudent(db, 'form_1', STUDENT, CENTER);
    await addFormationStudent(db, 'form_2', { ...STUDENT, id: 'fst_2' }, CENTER);

    await removeFormationStudent(db, 'form_1', 'fst_1', CENTER);

    // Le même « amir » (dédupliqué par nom) reste inscrit en form_2.
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM students WHERE student_type = 'external'").get() as any).n).toBe(1);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_enrollments').get() as any).n).toBe(1);
  });

  it('persists formation students as external through the full PUT rewrite', async () => {
    const formation = {
      ...FORMATION,
      students: [{ ...STUDENT, id: 'fst_put' }]
    };
    const res = await onRequestPut(ctx('PUT', BASE, [formation]));
    expect(res.status).toBe(200);
    const s = sqlite.prepare("SELECT student_type FROM students WHERE first_name = 'amir'").get() as any;
    expect(s?.student_type).toBe('external');
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_enrollments').get() as any).n).toBe(1);
  });
});

describe('formation schedule (targeted PUT / POST)', () => {
  const SCHEDULE = [{ id: 'se_1', day: 'الأثنين', startTime: '09:00', endTime: '10:30', matiere: 'الرياضيات', students: ['fst_1'] }];

  it('updates ONLY the schedule column, leaving matieres/students/other rows intact', async () => {
    seedFormation('form_1', CENTER);
    seedFormation('form_keep', CENTER);
    sqlite.prepare("INSERT INTO subjects (id, center_id, name) VALUES ('sub_1', ?, 'علوم')").run(CENTER);
    sqlite.prepare("INSERT INTO formation_matieres (id, formation_id, subject_id) VALUES ('mat_1', 'form_1', 'sub_1')").run();
    await addFormationStudent(db, 'form_1', {
      id: 'fst_1', studentName: 'amir', parentPhone: '55555555', isPack: true,
      enrolledMatiereIds: ['mat_1'], amountPaid: 100, totalRequired: 100,
      paymentMethod: 'espece', isAdvance: false, enrolledAt: '2026-10-14T08:55:12.590Z'
    }, CENTER);

    const res = await onSchedulePut(ctx('PUT', 'https://app.example/api/formation-schedule', { formationId: 'form_1', schedule: SCHEDULE }));
    expect(res.status).toBe(200);

    const stored = JSON.parse((sqlite.prepare('SELECT schedule FROM formations WHERE id = ?').get('form_1') as any).schedule);
    expect(stored).toEqual(SCHEDULE);
    // Le reste de la formation est intact.
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_matieres WHERE formation_id = ?').get('form_1') as any).n).toBe(1);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM formation_enrollments').get() as any).n).toBe(1);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get() as any).n).toBe(1);
    // L'autre formation n'a pas été touchée.
    expect(JSON.parse((sqlite.prepare('SELECT schedule FROM formations WHERE id = ?').get('form_keep') as any).schedule)).toEqual([]);
  });

  it('accepts POST as well', async () => {
    seedFormation('form_1', CENTER);
    const res = await onSchedulePost(ctx('POST', 'https://app.example/api/formation-schedule', { formationId: 'form_1', schedule: SCHEDULE }));
    expect(res.status).toBe(200);
    expect(JSON.parse((sqlite.prepare('SELECT schedule FROM formations WHERE id = ?').get('form_1') as any).schedule)).toEqual(SCHEDULE);
  });

  it('rejects (400) an unknown/foreign formation', async () => {
    const res = await onSchedulePut(ctx('PUT', 'https://app.example/api/formation-schedule', { formationId: 'form_x', schedule: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects (400) a missing formationId or a non-object body', async () => {
    expect((await onSchedulePut(ctx('PUT', 'https://app.example/api/formation-schedule', { schedule: [] }))).status).toBe(400);
    expect((await onSchedulePut(ctx('PUT', 'https://app.example/api/formation-schedule', [1, 2]))).status).toBe(400);
  });
});

describe('GET /api/formations', () => {
  it('returns only the center rows', async () => {
    seedFormation('form_1', CENTER);
    seedFormation('form_x', OTHER_CENTER);
    const res = await onRequestGet(ctx('GET', BASE));
    expect(res.status).toBe(200);
    const rows = await res.json() as any[];
    expect(rows.map((r: any) => r.id)).toEqual(['form_1']);
  });
});
