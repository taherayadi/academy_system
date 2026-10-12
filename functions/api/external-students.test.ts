import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCourses, readExternalStudents, readStudents, writeCourses, writeExternalStudents, writeStudents } from './_lib';

// Exécute le SQL réel (node:sqlite) avec PRAGMA foreign_keys = ON : les
// régressions de FK (élève externe absent de `students`, effectifs effacés)
// lèvent ici comme en production D1.
//
// Modèle cible : un externe EST un `students` (student_type='external'), ses
// paiements vivent dans `payments` (service_key external_course /
// assurance_externe) et ses présences dans `external_attendance`.

const CENTER = 'c1';
const YEAR = '2026/2027';
const SUBJECT_ID = 'sub_1';
const COURSE_ID = 'course_1';
const REG_ID = 'reg_1';

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
    CREATE TABLE subjects (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
      UNIQUE (center_id, name)
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
    CREATE TABLE external_courses (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      trimester TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id),
      teacher_name TEXT NOT NULL,
      teacher_phone TEXT NOT NULL,
      monthly_fee REAL NOT NULL CHECK (monthly_fee >= 0),
      teacher_share REAL NOT NULL CHECK (teacher_share >= 0),
      center_share REAL NOT NULL CHECK (center_share >= 0),
      assurance_amount REAL NOT NULL DEFAULT 0,
      CHECK (teacher_share + center_share = monthly_fee)
    ) STRICT;
    CREATE TABLE course_enrollments (
      course_id TEXT NOT NULL REFERENCES external_courses(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      enrolled_at INTEGER NOT NULL,
      PRIMARY KEY (course_id, student_id)
    ) STRICT;
    CREATE TABLE external_attendance (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES external_courses(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL
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
      method TEXT NOT NULL CHECK (method IN ('cash','cheque','transfer','card')),
      amount REAL NOT NULL CHECK (amount > 0),
      total_required REAL NOT NULL CHECK (total_required >= 0),
      discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
      receipt_number TEXT NOT NULL,
      notes TEXT,
      cheque_number TEXT, cheque_date TEXT,
      cheque_paid INTEGER NOT NULL DEFAULT 0 CHECK (cheque_paid IN (0,1)),
      is_refund INTEGER NOT NULL DEFAULT 0 CHECK (is_refund IN (0,1)),
      refund_of TEXT,
      ref_type TEXT CHECK (ref_type IS NULL OR ref_type IN ('external_course','revision_seance','formation','event')),
      ref_id TEXT,
      created_by TEXT, created_at INTEGER NOT NULL,
      UNIQUE (center_id, id),
      UNIQUE (center_id, receipt_number),
      CHECK (method = 'cheque' OR (cheque_number IS NULL AND cheque_date IS NULL AND cheque_paid = 0)),
      CHECK ((ref_type IS NULL) = (ref_id IS NULL)),
      FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE RESTRICT
    ) STRICT;
    CREATE TABLE meal_attendances (
      center_id TEXT NOT NULL, student_id TEXT NOT NULL, date TEXT NOT NULL,
      service_key TEXT NOT NULL, billing_mode TEXT NOT NULL, status TEXT NOT NULL,
      unit_price REAL, created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE suivi_notes (
      student_id TEXT NOT NULL, school_year TEXT NOT NULL, trimester TEXT NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id), devoir1 REAL, devoir2 REAL, synthese REAL
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
      ('external_course', 'course', 'Cours particulier', 'درس خصوصي', 'coursParticuliers'),
      ('assurance_externe', 'course', 'Assurance cours ext.', 'تأمين الدروس الخارجية', 'coursParticuliers');
    INSERT INTO subjects (id, center_id, name) VALUES ('${SUBJECT_ID}', '${CENTER}', 'Mathématiques');
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

function makeCourse(overrides: Record<string, unknown> = {}) {
  return {
    id: COURSE_ID,
    schoolYear: YEAR,
    trimester: 'Trimestre 1',
    gradeLevel: 'Collège 7ème Année',
    subject: 'Mathématiques',
    teacherName: 'Ali',
    teacherPhone: '25141141',
    monthlyFee: 80,
    teacherShare: 70,
    centerShare: 10,
    assuranceAmount: 50,
    enrolledStudents: [],
    ...overrides
  };
}

function makeRegister(overrides: Record<string, unknown> = {}) {
  return {
    id: REG_ID,
    name: 'Ali Ayadi',
    parentPhone: '25141141',
    grade: 'Collège 7ème Année',
    schoolYear: YEAR,
    assurancePaid: true,
    assuranceAmount: 50,
    assuranceDate: '2026-10-09',
    assuranceMethod: 'Chèque',
    assuranceChequeNumber: 'CHQ-77',
    assuranceChequeDate: '2026-10-11',
    createdAt: '2026-10-09',
    payments: [
      {
        id: 'pay_1', studentId: REG_ID, courseId: COURSE_ID,
        courseName: 'Mathématiques (Collège 7ème Année)', schoolYear: YEAR,
        amountPaid: 80, date: '2026-10-09', method: 'Espèces'
      }
    ],
    attendance: [
      { id: 'att_1', studentId: REG_ID, courseId: COURSE_ID, courseName: 'Mathématiques (Collège 7ème Année)', date: '2026-10-09', status: 'present' }
    ],
    ...overrides
  };
}

function makeRegularStudent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'st_1', firstName: 'Sami', lastName: 'Ben', academicYear: YEAR,
    grade: 'Lycée 1ère Année', siblings: [], authorizedPersons: [],
    academicHistory: {}, mother: {}, father: {}, registration: {},
    enrolledServices: {}, payments: [], mealAttendances: [], suiviNotes: [],
    ...overrides
  };
}

describe('external students persistence', () => {
  it('round-trips identity, course payments and attendance', async () => {
    await writeCourses(db, [makeCourse()], CENTER);
    await writeExternalStudents(db, [makeRegister()], CENTER);

    const row = sqlite.prepare("SELECT student_type, first_name, last_name, contact_phone FROM students WHERE id = ?").get(REG_ID) as any;
    expect(row.student_type).toBe('external');
    expect(row.first_name).toBe('Ali');
    expect(row.last_name).toBe('Ayadi');
    expect(row.contact_phone).toBe('25141141');

    const list = await readExternalStudents(db, CENTER);
    expect(list).toHaveLength(1);
    const reg = list[0];
    expect(reg.name).toBe('Ali Ayadi');
    expect(reg.parentPhone).toBe('25141141');
    expect(reg.grade).toBe('Collège 7ème Année');
    expect(reg.schoolYear).toBe(YEAR);
    expect(reg.assurancePaid).toBe(true);
    expect(reg.assuranceAmount).toBe(50);
    expect(reg.assuranceDate).toBe('2026-10-09');
    expect(reg.assuranceMethod).toBe('Chèque');
    expect(reg.assuranceChequeNumber).toBe('CHQ-77');
    expect(reg.assuranceChequeDate).toBe('2026-10-11');
    expect(reg.payments).toHaveLength(1);
    expect(reg.payments[0]).toMatchObject({ courseId: COURSE_ID, amountPaid: 80, date: '2026-10-09', method: 'Espèces' });
    expect(reg.attendance).toHaveLength(1);
    expect(reg.attendance[0]).toMatchObject({ courseId: COURSE_ID, date: '2026-10-09', status: 'present' });

    // Le paiement cours + l'assurance vivent dans `payments`.
    const services = sqlite.prepare('SELECT service_key FROM payments WHERE student_id = ? ORDER BY service_key').all(REG_ID).map((r: any) => r.service_key);
    expect(services).toEqual(['assurance_externe', 'external_course']);
  });

  it('supports assurance paid in instalments (top-up)', async () => {
    await writeCourses(db, [makeCourse()], CENTER);
    await writeExternalStudents(db, [makeRegister({
      assurancePaid: false,
      assuranceAmount: 30,
      assuranceRequired: 50,
      assuranceMethod: 'Espèces',
      assuranceChequeNumber: undefined,
      assuranceChequeDate: undefined,
      assurancePayments: [{ id: 'asr_a', date: '2026-10-09', amount: 30, method: 'Espèces' }]
    })], CENTER);

    let list = await readExternalStudents(db, CENTER);
    expect(list[0].assuranceAmount).toBe(30);
    expect(list[0].assuranceRequired).toBe(50);
    expect(list[0].assurancePaid).toBe(false);
    expect(list[0].assurancePayments).toHaveLength(1);
    expect(list[0].assurancePayments![0]).toMatchObject({ amount: 30, method: 'Espèces' });

    // Deuxième versement : le solde est soldé -> assurance payée.
    const first = list[0];
    await writeExternalStudents(db, [makeRegister({
      ...first,
      assurancePaid: true,
      assuranceAmount: 50,
      assuranceRequired: 50,
      assurancePayments: [...(first.assurancePayments || []), { id: 'asr_b', date: '2026-10-20', amount: 20, method: 'Espèces' }]
    })], CENTER);

    list = await readExternalStudents(db, CENTER);
    expect(list[0].assuranceAmount).toBe(50);
    expect(list[0].assurancePaid).toBe(true);
    expect(list[0].assurancePayments).toHaveLength(2);
    const groups = sqlite.prepare('SELECT service_key, COUNT(*) AS n FROM payments WHERE student_id = ? GROUP BY service_key').all(REG_ID) as any[];
    // 1 paiement de cours + 2 versements d'assurance.
    expect(groups.find(g => g.service_key === 'assurance_externe').n).toBe(2);
    expect(groups.find(g => g.service_key === 'external_course').n).toBe(1);
  });

  it('persists the discounted amount due (course fee minus discount) across reloads', async () => {
    await writeCourses(db, [makeCourse()], CENTER);
    // Assurance 50 − تخفيض 10 = 40 dus ; 20 versés.
    await writeExternalStudents(db, [makeRegister({
      assurancePaid: false, assuranceAmount: 20, assuranceRequired: 40,
      assuranceMethod: 'Espèces', assuranceChequeNumber: undefined, assuranceChequeDate: undefined,
      assurancePayments: [{ id: 'asr_a', date: '2026-10-09', amount: 20, method: 'Espèces' }]
    })], CENTER);

    const list = await readExternalStudents(db, CENTER);
    expect(list[0].assuranceRequired).toBe(40);
    expect(list[0].assuranceAmount).toBe(20);
    expect(list[0].assurancePaid).toBe(false);
    const row = sqlite.prepare("SELECT total_required FROM payments WHERE service_key = 'assurance_externe'").get() as any;
    expect(row.total_required).toBe(40);
  });

  it('stores cash assurance with null cheque fields and null refs (no CHECK violation)', async () => {
    await writeCourses(db, [makeCourse()], CENTER);
    await writeExternalStudents(db, [makeRegister({
      assurancePaid: true, assuranceAmount: 50, assuranceRequired: 50,
      assuranceMethod: 'Espèces', assuranceChequeNumber: undefined, assuranceChequeDate: undefined,
      assurancePayments: [{ id: 'asr_cash', date: '2026-10-09', amount: 50, method: 'Espèces' }]
    })], CENTER);
    const row = sqlite.prepare("SELECT method, cheque_number, cheque_date, ref_type, ref_id FROM payments WHERE service_key = 'assurance_externe'").get() as any;
    expect(row.method).toBe('cash');
    expect(row.cheque_number).toBeNull();
    expect(row.cheque_date).toBeNull();
    expect(row.ref_type).toBeNull();
    expect(row.ref_id).toBeNull();
  });

  it('removes externals dropped from the payload (and their payments)', async () => {
    await writeCourses(db, [makeCourse()], CENTER);
    await writeExternalStudents(db, [makeRegister()], CENTER);
    await writeExternalStudents(db, [], CENTER);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM students').get() as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get() as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM external_attendance').get() as any).n).toBe(0);
  });

  it('is excluded from readStudents but preserved by writeStudents', async () => {
    await writeCourses(db, [makeCourse()], CENTER);
    await writeExternalStudents(db, [makeRegister()], CENTER);
    await writeStudents(db, [makeRegularStudent()], CENTER);

    // L'externe ne doit PAS fuiter dans le module Élèves.
    const students = await readStudents(db, CENTER);
    expect(students.map((s: any) => s.id)).toEqual(['st_1']);

    // …mais writeStudents (PUT /api/students) ne doit pas l'effacer.
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM students WHERE id = ?').get(REG_ID) as any).n).toBe(1);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM payments WHERE student_id = ?').get(REG_ID) as any).n).toBe(2);
  });
});

describe('course enrollments hydration', () => {
  it('hydrates roster names, external flag and assurance after reload', async () => {
    await writeCourses(db, [makeCourse()], CENTER);
    await writeExternalStudents(db, [makeRegister()], CENTER);
    await writeCourses(db, [makeCourse({
      enrolledStudents: [{
        studentId: REG_ID, studentName: 'Ali Ayadi', parentPhone: '25141141',
        isExternal: true, assurancePaid: true, assuranceAmount: 50, enrolledAt: '2026-10-09'
      }]
    })], CENTER);

    const courses = await readCourses(db, CENTER);
    expect(courses).toHaveLength(1);
    expect(courses[0].enrolledStudents).toHaveLength(1);
    expect(courses[0].enrolledStudents[0]).toMatchObject({
      studentId: REG_ID,
      studentName: 'Ali Ayadi',
      parentPhone: '25141141',
      isExternal: true,
      assurancePaid: true,
      assuranceAmount: 50,
      enrolledAt: '2026-10-09'
    });

    // enrolled_at stocké = date client (ms), pas Date.now().
    const enrolledAt = (sqlite.prepare('SELECT enrolled_at FROM course_enrollments WHERE student_id = ?').get(REG_ID) as any).enrolled_at;
    expect(new Date(enrolledAt).toISOString().slice(0, 10)).toBe('2026-10-09');
  });

  it('fails loudly when an enrollment references an unknown student', async () => {
    await writeCourses(db, [makeCourse()], CENTER);
    await expect(
      writeCourses(db, [makeCourse({ enrolledStudents: [{ studentId: 'ghost' }] })], CENTER)
    ).rejects.toThrow();
  });
});
