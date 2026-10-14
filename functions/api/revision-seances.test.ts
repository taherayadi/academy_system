import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addRevisionStudent, createRevisionSeance, deleteRevisionSeance, readExternalStudents, readRevisionSeances, removeRevisionStudent, writeExternalStudents, writeRevisionSeances
} from './_lib';

// Vérifie que la persistance des séances de révision est fidèle au schéma :
// un tuteur de révision EST un `students` (student_type='external') référencé
// par revision_seance_students.student_id, et le paiement d'une séance est une
// ligne `payments` (service 'revision', ref 'revision_seance') référencée par
// paid_payment_id. FK réelles (node:sqlite) = régression levée comme en D1.

const CENTER = 'c1';
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
      etablissement_id TEXT,
      time_sheet_id TEXT,
      PRIMARY KEY (student_id, school_year),
      FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE CASCADE
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
    CREATE TABLE external_attendance (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES external_courses(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL
    ) STRICT;
    CREATE TABLE revision_seances (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      trimester TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id),
      teacher_name TEXT NOT NULL,
      teacher_phone TEXT NOT NULL,
      date TEXT NOT NULL,
      teacher_share REAL NOT NULL CHECK (teacher_share >= 0),
      center_share REAL NOT NULL CHECK (center_share >= 0)
    ) STRICT;
    CREATE TABLE revision_seance_students (
      seance_id TEXT NOT NULL REFERENCES revision_seances(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      present INTEGER NOT NULL DEFAULT 0 CHECK (present IN (0,1)),
      paid_payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
      PRIMARY KEY (seance_id, student_id)
    ) STRICT;
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      service_key TEXT NOT NULL REFERENCES services(key),
      billing_period TEXT NOT NULL CHECK (billing_period IN ('month','unit','year')),
      period_month TEXT,
      school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
      payment_type TEXT NOT NULL CHECK (payment_type IN ('full','partial','balance','advance')),
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

    INSERT INTO centers (id, name, slug, center_type, plan, status, created_at, updated_at)
      VALUES ('${CENTER}', 'c', 'c', 'garderie', 'starter', 'trial', 1, 1);
    INSERT INTO services (key, category, label_fr, label_ar, module_key) VALUES
      ('external_course', 'course', 'Cours particulier', 'درس خصوصي', 'coursParticuliers'),
      ('revision', 'course', 'Séance de révision', 'حصة مراجعة', 'revision'),
      ('assurance_externe', 'course', 'Assurance cours ext.', 'تأمين الدروس الخارجية', 'coursParticuliers');
    INSERT INTO subjects (id, center_id, name) VALUES ('sub_1', '${CENTER}', 'Mathématiques');
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

function seance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rev_1',
    schoolYear: YEAR,
    trimester: 'Trimestre 1',
    gradeLevel: 'Baccalauréat',
    subject: 'Mathématiques',
    teacherName: 'M. Karim',
    teacherPhone: '22123456',
    date: '2026-10-01',
    teacherShare: 30,
    centerShare: 5,
    students: [
      { studentId: 'rev_st_a', studentName: 'Ali Ben Salah', parentPhone: '98111111', paidSeance: true, present: true },
      { studentId: 'rev_st_b', studentName: 'Sami Trabelsi', parentPhone: '22222222', paidSeance: false, present: false }
    ],
    ...overrides
  };
}

describe('revision seances persistence', () => {
  it('creates one seance with external tutor + payments, and reads it back', async () => {
    await createRevisionSeance(db, seance(), CENTER);

    const rows = sqlite.prepare("SELECT * FROM revision_seances WHERE id = 'rev_1'").all() as any[];
    expect(rows.length).toBe(1);
    const students = sqlite.prepare("SELECT * FROM students WHERE id IN ('rev_st_a','rev_st_b')").all() as any[];
    expect(students.length).toBe(2);
    expect(students.every((s: any) => s.student_type === 'external')).toBe(true);

    const paid = sqlite.prepare("SELECT * FROM payments WHERE service_key = 'revision'").all() as any[];
    expect(paid.length).toBe(1);
    expect(paid[0].ref_type).toBe('revision_seance');
    expect(paid[0].ref_id).toBe('rev_1');
    expect(paid[0].amount).toBe(35);

    const links = sqlite.prepare('SELECT * FROM revision_seance_students').all() as any[];
    expect(links.length).toBe(2);
    expect(links.find((l: any) => l.student_id === 'rev_st_a').paid_payment_id).toBe(paid[0].id);
    expect(links.find((l: any) => l.student_id === 'rev_st_b').paid_payment_id).toBeNull();

    const read = await readRevisionSeances(db, CENTER);
    expect(read.length).toBe(1);
    expect(read[0].subject).toBe('Mathématiques');
    expect(read[0].students[0].studentName).toBe('Ali Ben Salah');
    expect(read[0].students[0].parentPhone).toBe('98111111');
    expect(read[0].students[0].paidSeance).toBe(true);
    expect(read[0].students[1].paidSeance).toBe(false);
  });

  it('adds a single student to an existing seance without touching the others', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    await addRevisionStudent(db, 'rev_1', { studentId: 'rev_st_c', studentName: 'Omar Haddad', parentPhone: '33333333', paidSeance: true, present: true }, CENTER);

    const read = await readRevisionSeances(db, CENTER);
    expect(read[0].students.length).toBe(3);
    const added = read[0].students.find((s: any) => s.studentId === 'rev_st_c');
    expect(added.studentName).toBe('Omar Haddad');
    expect(added.paidSeance).toBe(true);
    const payments = sqlite.prepare("SELECT * FROM payments WHERE service_key = 'revision'").all() as any[];
    expect(payments.length).toBe(2);
  });

  it('rejects adding a student to a seance of another center', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    await expect(addRevisionStudent(db, 'rev_1', { studentId: 'rev_st_c', studentName: 'Omar', parentPhone: '', paidSeance: false, present: false }, 'other_center')).rejects.toThrow('غير موجود');
  });

  it('unpays a student with a single call and removes the detached payment', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    await addRevisionStudent(db, 'rev_1', { studentId: 'rev_st_a', studentName: 'Ali Ben Salah', parentPhone: '98111111', paidSeance: false, present: true }, CENTER);

    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE service_key = 'revision'").get() as any).n).toBe(0);
    const read = await readRevisionSeances(db, CENTER);
    expect(read[0].students.find((s: any) => s.studentId === 'rev_st_a').paidSeance).toBe(false);
  });

  it('removes one student from a seance with a targeted delete', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    await removeRevisionStudent(db, 'rev_1', 'rev_st_a', CENTER);

    const links = sqlite.prepare('SELECT * FROM revision_seance_students').all() as any[];
    expect(links.map((l: any) => l.student_id)).toEqual(['rev_st_b']);
    const students = sqlite.prepare("SELECT id FROM students WHERE student_type = 'external'").all() as any[];
    expect(students.map((s: any) => s.id)).toEqual(['rev_st_b']);
    const payments = sqlite.prepare("SELECT * FROM payments WHERE service_key = 'revision'").all() as any[];
    expect(payments.length).toBe(0);

    const read = await readRevisionSeances(db, CENTER);
    expect(read.length).toBe(1);
    expect(read[0].students.map((s: any) => s.studentId)).toEqual(['rev_st_b']);
  });

  it('rejects removing a student from a seance of another center', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    await expect(removeRevisionStudent(db, 'rev_1', 'rev_st_a', 'other_center')).rejects.toThrow('غير موجود');
  });

  it('deletes one seance with a targeted delete (payments + orphans cleaned)', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    await createRevisionSeance(db, seance({ id: 'rev_2', students: [{ studentId: 'rev_st_b', studentName: 'Sami Trabelsi', parentPhone: '22222222', paidSeance: false, present: true }] }), CENTER);

    await deleteRevisionSeance(db, 'rev_1', CENTER);

    const seances = sqlite.prepare('SELECT id FROM revision_seances').all() as any[];
    expect(seances.map((s: any) => s.id)).toEqual(['rev_2']);
    // rev_st_a n'était que dans rev_1 → supprimé ; rev_st_b reste (rev_2).
    const students = sqlite.prepare("SELECT id FROM students WHERE student_type = 'external'").all() as any[];
    expect(students.map((s: any) => s.id)).toEqual(['rev_st_b']);
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE service_key = 'revision'").get() as any).n).toBe(0);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM revision_seance_students').get() as any).n).toBe(1);

    const read = await readRevisionSeances(db, CENTER);
    expect(read.map((s: any) => s.id)).toEqual(['rev_2']);
  });

  it('rejects deleting a seance of another center', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    await expect(deleteRevisionSeance(db, 'rev_1', 'other_center')).rejects.toThrow('غير موجود');
  });

  it('single-seance PUT (pointage) rewrites only that seance', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    await createRevisionSeance(db, seance({ id: 'rev_2' }), CENTER);
    await createRevisionSeance(db, seance({ id: 'rev_1', students: [{ studentId: 'rev_st_a', studentName: 'Ali Ben Salah', parentPhone: '98111111', paidSeance: false, present: true }] }), CENTER);

    const seances = sqlite.prepare('SELECT * FROM revision_seances').all() as any[];
    expect(seances.map((s: any) => s.id).sort()).toEqual(['rev_1', 'rev_2']);
    const read = await readRevisionSeances(db, CENTER);
    const rev1 = read.find((s: any) => s.id === 'rev_1');
    expect(rev1.students).toHaveLength(1);
    expect(rev1.students[0].paidSeance).toBe(false);
    const rev2 = read.find((s: any) => s.id === 'rev_2');
    expect(rev2.students).toHaveLength(2);
  });

  it('hides revision tutors from the external register and preserves them', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    await writeExternalStudents(db, [{ id: 'ext_1', name: 'Externe Réel', schoolYear: YEAR, grade: 'Baccalauréat', payments: [], assurancePayments: [] }], CENTER);

    const external = await readExternalStudents(db, CENTER);
    expect(external.map((s: any) => s.id)).toEqual(['ext_1']);

    const remaining = sqlite.prepare("SELECT id FROM students WHERE student_type = 'external'").all() as any[];
    expect(remaining.map((r: any) => r.id).sort()).toEqual(['ext_1', 'rev_st_a', 'rev_st_b']);
    const links = sqlite.prepare('SELECT * FROM revision_seance_students').all() as any[];
    expect(links.length).toBe(2);
  });

  it('full-list write round-trips and replaces payments', async () => {
    await createRevisionSeance(db, seance(), CENTER);
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM payments WHERE service_key = 'revision'").get() as any).n).toBe(1);

    await writeRevisionSeances(db, [seance({ id: 'rev_2', students: [{ studentId: 'rev_st_x', studentName: 'Nouveau', parentPhone: '44444444', paidSeance: true, present: true }] })], CENTER);

    const seances = sqlite.prepare('SELECT * FROM revision_seances').all() as any[];
    expect(seances.map((s: any) => s.id)).toEqual(['rev_2']);
    const payments = sqlite.prepare("SELECT * FROM payments WHERE service_key = 'revision'").all() as any[];
    expect(payments.length).toBe(1);
    expect(payments[0].ref_id).toBe('rev_2');

    const read = await readRevisionSeances(db, CENTER);
    expect(read.length).toBe(1);
    expect(read[0].students).toHaveLength(1);
    expect(read[0].students[0].studentName).toBe('Nouveau');
    expect(read[0].students[0].paidSeance).toBe(true);
  });
});