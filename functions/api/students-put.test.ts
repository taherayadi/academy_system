import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPut } from './students';

// Régression : PUT /api/students (élève existant) → 500
// « Incorrect number of bindings supplied. The current statement uses 16, and
// there are 17 supplied. » — updateSingleStudent(bind UPDATE) bindait
// Date.now() (created_at) qui n'a pas de placeholder dans l'UPDATE.
// Le shim ci-dessous exécute le SQL réel (node:sqlite) : un nombre de
// paramètres incorrect lève, comme D1 en production.

const CENTER = 'c1';
const STUDENT_ID = 'st_reg_1';
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
    CREATE TABLE services (
      key TEXT PRIMARY KEY, category TEXT NOT NULL,
      label_fr TEXT NOT NULL, label_ar TEXT NOT NULL, module_key TEXT NOT NULL
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
      birth_date TEXT CHECK (birth_date IS NULL OR birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      birth_place TEXT,
      contact_phone TEXT,
      allergies TEXT NOT NULL DEFAULT '',
      parental_situation TEXT,
      parental_comments TEXT,
      registration_date TEXT,
      registration_location TEXT,
      registration_signed_electronically INTEGER NOT NULL DEFAULT 0 CHECK (registration_signed_electronically IN (0,1)),
      registration_signature_name TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
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
    CREATE TABLE student_service_enrollments (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      service_key TEXT NOT NULL REFERENCES services(key),
      school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      billing_mode TEXT NOT NULL CHECK (billing_mode IN ('subscription','unit')),
      monthly_price REAL CHECK (monthly_price IS NULL OR monthly_price >= 0),
      annual_price REAL CHECK (annual_price IS NULL OR annual_price >= 0),
      unit_price REAL CHECK (unit_price IS NULL OR unit_price >= 0),
      valid_from TEXT NOT NULL CHECK (valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      valid_to TEXT CHECK (valid_to IS NULL OR valid_to >= valid_from),
      UNIQUE (student_id, service_key, school_year, valid_from),
      FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE CASCADE
    ) STRICT;
    CREATE TABLE student_parents (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('mother','father')),
      name TEXT NOT NULL,
      birth_date TEXT, profession TEXT, address TEXT,
      phone_fixed TEXT, phone_mobile TEXT, email TEXT,
      extra_phones TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(extra_phones)),
      PRIMARY KEY (student_id, role)
    ) STRICT;
    CREATE TABLE academic_history (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      n_minus INTEGER NOT NULL CHECK (n_minus IN (1,2,3)),
      school TEXT NOT NULL,
      grade TEXT NOT NULL,
      PRIMARY KEY (student_id, n_minus)
    ) STRICT;
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      service_key TEXT NOT NULL REFERENCES services(key),
      billing_period TEXT NOT NULL CHECK (billing_period IN ('month','unit','year')),
      period_month TEXT,
      school_year TEXT NOT NULL,
      payment_type TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      total_required REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      receipt_number TEXT NOT NULL,
      notes TEXT, cheque_number TEXT, cheque_date TEXT,
      cheque_paid INTEGER NOT NULL DEFAULT 0,
      is_refund INTEGER NOT NULL DEFAULT 0,
      refund_of TEXT,
      ref_type TEXT, ref_id TEXT,
      created_by TEXT, created_at INTEGER NOT NULL,
      UNIQUE (center_id, id),
      UNIQUE (center_id, receipt_number)
    ) STRICT;
    CREATE TABLE meal_attendances (
      center_id TEXT NOT NULL, student_id TEXT NOT NULL, date TEXT NOT NULL,
      service_key TEXT NOT NULL, billing_mode TEXT NOT NULL, status TEXT NOT NULL,
      unit_price REAL, created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE suivi_notes (
      student_id TEXT NOT NULL, school_year TEXT NOT NULL, trimester TEXT NOT NULL,
      subject TEXT NOT NULL, devoir1 REAL, devoir2 REAL, synthese REAL
    ) STRICT;
    CREATE TABLE siblings (
      id TEXT PRIMARY KEY, student_id TEXT NOT NULL,
      name TEXT NOT NULL, age REAL, grade TEXT
    ) STRICT;
    CREATE TABLE authorized_persons (
      id TEXT PRIMARY KEY, student_id TEXT NOT NULL,
      name TEXT NOT NULL, phone TEXT, relation TEXT
    ) STRICT;

    INSERT INTO centers (id, name, slug, center_type, plan, status, created_at, updated_at)
      VALUES ('${CENTER}', 'c', 'c', 'garderie', 'starter', 'trial', 1, 1);
    INSERT INTO services (key, category, label_fr, label_ar, module_key) VALUES
      ('suivi', 'scolaire', 'Suivi scolaire', 'المتابعة الدراسية', 'scolaire'),
      ('etude', 'scolaire', 'Étude', 'الدراسة', 'etude');
    INSERT INTO students (id, center_id, first_name, last_name, birth_date, created_at)
      VALUES ('${STUDENT_ID}', '${CENTER}', 'Ayadi', 'Taher', '2021-02-07', 1);
    INSERT INTO student_years (student_id, center_id, school_year, grade)
      VALUES ('${STUDENT_ID}', '${CENTER}', '${YEAR}', 'Lycée 1ère Année');
    INSERT INTO student_parents (student_id, role, name) VALUES ('${STUDENT_ID}', 'mother', ''), ('${STUDENT_ID}', 'father', '');
    INSERT INTO academic_history (student_id, n_minus, school, grade) VALUES
      ('${STUDENT_ID}', 1, '', ''), ('${STUDENT_ID}', 2, '', ''), ('${STUDENT_ID}', 3, '', '');
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
  return new Request('https://app.example/api/students', {
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

// Payload réel capturé (extrait) : élève existant, établissement « jawhara »
// nouvellement ajouté, services suivi + étude activés.
const studentPayload = {
  id: STUDENT_ID,
  firstName: 'Ayadi',
  lastName: 'Taher',
  birthDate: '2021-02-07',
  birthPlace: '',
  grade: 'Lycée 1ère Année',
  etablissement: 'jawhara',
  academicYear: YEAR,
  mother: { name: '', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '', email: '' },
  father: { name: '', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '', email: '' },
  parentalSituation: 'mariés',
  parentalComments: '',
  siblings: [],
  authorizedPersons: [],
  allergies: '',
  academicHistory: { nMinus1: { school: '', grade: '' }, nMinus2: { school: '', grade: '' }, nMinus3: { school: '', grade: '' } },
  registration: { date: '2026-10-07', location: 'sfax', signedElectronically: true, signatureName: 'Ayadi ali' },
  enrolledServices: { suivi: true, etude: true, library: false, meals: false, gouterMatin: false, gouterSoir: false, gouterBoth: false },
  suiviFees: { annualRegistrationFee: 0, monthlyFee: 0 },
  etudeFees: { annualRegistrationFee: 0, monthlyFee: 0 },
  libraryFees: { annualRegistrationFee: 0, monthlyFee: 0 },
  mealSubscription: { mode: 'subscription', monthlyPrice: 0, unitPrice: 0, prepaidMeals: 18, consumedMealsCount: 0, active: false },
  payments: [],
  mealAttendances: [],
  suiviNotes: []
};

describe('PUT /api/students (single, existing student)', () => {
  it('updates in place with a new etablissement (no bind-count 500)', async () => {
    const res = await onRequestPut(context(studentPayload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, student: studentPayload });

    // La ligne students a bien été mise à jour sur place (pas de DELETE/INSERT)
    const row = sqlite.prepare('SELECT first_name, last_name, birth_place FROM students WHERE id = ?')
      .get(STUDENT_ID) as any;
    expect(row.first_name).toBe('Ayadi');
    // '' est normalisé en NULL par le serveur (s.birthPlace || null)
    expect(row.birth_place).toBeNull();

    // grade + etablissement résolus vers etablissements.id
    const yr = sqlite.prepare('SELECT grade, etablissement_id FROM student_years WHERE student_id = ? AND school_year = ?')
      .get(STUDENT_ID, YEAR) as any;
    expect(yr.grade).toBe('Lycée 1ère Année');
    expect(yr.etablissement_id).toBe(
      (sqlite.prepare('SELECT id FROM etablissements WHERE center_id = ? AND name = ?').get(CENTER, 'jawhara') as any).id
    );

    // enfants reconstruits depuis le payload
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM student_service_enrollments WHERE student_id = ?').get(STUDENT_ID) as any).n).toBe(2);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM student_parents WHERE student_id = ?').get(STUDENT_ID) as any).n).toBe(2);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM academic_history WHERE student_id = ?').get(STUDENT_ID) as any).n).toBe(3);
  });

  it('resolves a brand-new etablissement name by auto-creating the row', async () => {
    const res = await onRequestPut(context({ ...studentPayload, etablissement: 'ibn khouldoun' }));
    expect(res.status).toBe(200);
    const created = sqlite.prepare('SELECT id FROM etablissements WHERE center_id = ? AND name = ?').get(CENTER, 'ibn khouldoun') as any;
    expect(created).toBeTruthy();
    const yr = sqlite.prepare('SELECT etablissement_id FROM student_years WHERE student_id = ? AND school_year = ?')
      .get(STUDENT_ID, YEAR) as any;
    expect(yr.etablissement_id).toBe(created.id);
  });
});
