-- System Academy D1 schema (fully normalized) + seed data
-- Applies to the academy_system D1 database.
-- NOTE: D1 rejects explicit BEGIN/COMMIT (transactions are implicit per statement).

-- ============================================================
-- SETTINGS / CONFIG
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  center_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  location_city TEXT NOT NULL,
  gemini_api_key TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS fee_sets (
  year TEXT PRIMARY KEY,                 -- 'DEFAULT' or '2025/2026', ...
  frais_annuel_suivi REAL NOT NULL,
  frais_mensuel_suivi REAL NOT NULL,
  frais_annuel_bibliotheque REAL NOT NULL,
  frais_mensuel_bibliotheque REAL NOT NULL,
  frais_abonnement_repas REAL NOT NULL,
  frais_par_repas REAL NOT NULL,
  frais_abonnement_repas_traiteur REAL,
  frais_par_repas_traiteur REAL,
  prix_plat_traiteur REAL DEFAULT 6,
  frais_annuel_etude REAL NOT NULL,
  frais_mensuel_etude REAL NOT NULL,
  frais_assurance_cours_externes REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS etablissements (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'restricted_admin')),
  description TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

-- ============================================================
-- STUDENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  birth_place TEXT NOT NULL,
  grade TEXT NOT NULL,
  etablissement TEXT,
  time_sheet_id TEXT,
  academic_year TEXT,
  parental_situation TEXT NOT NULL,
  parental_comments TEXT,
  allergies TEXT NOT NULL,
  registration_date TEXT,
  registration_location TEXT,
  registration_signed_electronically INTEGER NOT NULL DEFAULT 0,
  registration_signature_name TEXT,
  enrolled_suivi INTEGER NOT NULL DEFAULT 0,
  enrolled_etude INTEGER NOT NULL DEFAULT 0,
  enrolled_library INTEGER NOT NULL DEFAULT 0,
  enrolled_meals INTEGER NOT NULL DEFAULT 0,
  suivi_annual_fee REAL NOT NULL DEFAULT 0,
  suivi_monthly_fee REAL NOT NULL DEFAULT 0,
  etude_annual_fee REAL NOT NULL DEFAULT 0,
  etude_monthly_fee REAL NOT NULL DEFAULT 0,
  library_annual_fee REAL NOT NULL DEFAULT 0,
  library_monthly_fee REAL NOT NULL DEFAULT 0,
  meal_mode TEXT NOT NULL DEFAULT 'unit' CHECK (meal_mode IN ('subscription', 'unit')),
  meal_monthly_price REAL NOT NULL DEFAULT 0,
  meal_unit_price REAL NOT NULL DEFAULT 0,
  meal_prepaid INTEGER NOT NULL DEFAULT 0,
  meal_consumed INTEGER NOT NULL DEFAULT 0,
  meal_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS student_parents (
  student_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('mother', 'father')),
  name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  profession TEXT NOT NULL,
  address TEXT NOT NULL,
  phone_fixed TEXT NOT NULL,
  phone_mobile TEXT NOT NULL,
  email TEXT NOT NULL,
  extra_phones TEXT,                    -- JSON array
  PRIMARY KEY (student_id, role),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS siblings (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  grade TEXT NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS authorized_persons (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  relation TEXT NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS academic_history (
  student_id TEXT NOT NULL,
  n_minus INTEGER NOT NULL CHECK (n_minus IN (1, 2, 3)),
  school TEXT NOT NULL,
  grade TEXT NOT NULL,
  PRIMARY KEY (student_id, n_minus),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount_paid REAL NOT NULL,
  total_required REAL NOT NULL,
  remaining_balance REAL NOT NULL,
  service TEXT NOT NULL,
  month TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  method TEXT NOT NULL,
  receipt_number TEXT NOT NULL,
  notes TEXT,
  discount REAL,
  refund INTEGER NOT NULL DEFAULT 0,
  refund_of TEXT,
  cheque_number TEXT,
  cheque_date TEXT,
  cheque_paid INTEGER DEFAULT 0,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_attendances (
  student_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('subscription', 'unit')),
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  PRIMARY KEY (student_id, date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS suivi_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  school_year TEXT NOT NULL,
  trimester INTEGER NOT NULL CHECK (trimester IN (1, 2, 3)),
  subject TEXT NOT NULL,
  devoir1 REAL,
  devoir2 REAL,
  synthese REAL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ============================================================
-- STAFF
-- ============================================================

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  cin TEXT NOT NULL,
  cnss_number TEXT NOT NULL,
  salary REAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('salarié', 'externe')),
  phone TEXT NOT NULL,
  role TEXT NOT NULL,
  contract_start_date TEXT NOT NULL,
  contract_type TEXT,
  email TEXT,
  address TEXT,
  base_salary REAL,
  cnss_amount REAL,
  hourly_rate REAL,
  hire_date TEXT
);

CREATE TABLE IF NOT EXISTS staff_subjects (
  staff_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  PRIMARY KEY (staff_id, subject),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_schedule (
  staff_id TEXT NOT NULL,
  day TEXT NOT NULL,
  slots TEXT NOT NULL,                  -- JSON array of slot strings
  PRIMARY KEY (staff_id, day),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_payments (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount_paid REAL NOT NULL,
  bonus REAL,
  deduction REAL,
  net_salary REAL NOT NULL,
  date TEXT NOT NULL,
  receipt_number TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_payslips (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  month TEXT NOT NULL,
  base_salary REAL NOT NULL,
  bonus REAL NOT NULL DEFAULT 0,
  bonus_reason TEXT,
  cnss_deduction REAL NOT NULL DEFAULT 0,
  absence_deductions REAL NOT NULL DEFAULT 0,
  advance_deducted REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL,
  issue_date TEXT NOT NULL,
  days_present INTEGER,
  days_absent INTEGER,
  days_retard INTEGER,
  extra_hours REAL,
  extra_hour_rate REAL,
  extra_hours_amount REAL,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_leave_requests (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_advances (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

-- ============================================================
-- TIMESHEETS
-- ============================================================

CREATE TABLE IF NOT EXISTS timesheets (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  date TEXT NOT NULL,
  slot_time TEXT,
  status TEXT NOT NULL,
  leave_reason TEXT,
  leave_status TEXT,
  notes TEXT,
  hours_worked REAL,
  extra_hours REAL,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_time_sheets (
  id TEXT PRIMARY KEY,
  school_year TEXT NOT NULL,
  establishment_name TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  branch TEXT,
  class_name TEXT,
  weekly_schedule TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  name TEXT DEFAULT ''
);

-- ============================================================
-- ÉTUDE SLOTS
-- ============================================================

CREATE TABLE IF NOT EXISTS etude_slots (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  is_extra INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS slot_enrollments (
  slot_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  PRIMARY KEY (slot_id, student_id),
  FOREIGN KEY (slot_id) REFERENCES etude_slots(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ============================================================
-- EXTERNAL COURSES
-- ============================================================

CREATE TABLE IF NOT EXISTS external_courses (
  id TEXT PRIMARY KEY,
  school_year TEXT NOT NULL,
  trimester TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher_name TEXT NOT NULL,
  teacher_phone TEXT NOT NULL,
  monthly_fee REAL NOT NULL,
  teacher_share REAL NOT NULL,
  center_share REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS course_enrolled_students (
  course_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  is_external INTEGER NOT NULL DEFAULT 0,
  assurance_paid INTEGER NOT NULL DEFAULT 0,
  assurance_amount REAL,
  assurance_date TEXT,
  enrolled_at TEXT,
  PRIMARY KEY (course_id, student_id),
  FOREIGN KEY (course_id) REFERENCES external_courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS external_course_sessions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  date TEXT NOT NULL,
  period_name TEXT,
  FOREIGN KEY (course_id) REFERENCES external_courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_present_students (
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES external_course_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_one_time_students (
  session_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  paid_unit INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, id),
  FOREIGN KEY (session_id) REFERENCES external_course_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_month_paid (
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES external_course_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_seance_status (
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES external_course_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_seance_amount (
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES external_course_sessions(id) ON DELETE CASCADE
);

-- ============================================================
-- EXTERNAL STUDENT REGISTER
-- ============================================================

CREATE TABLE IF NOT EXISTS external_students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  grade TEXT NOT NULL,
  school_year TEXT,
  assurance_paid INTEGER NOT NULL DEFAULT 0,
  assurance_amount REAL NOT NULL DEFAULT 0,
  assurance_date TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS external_payments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  course_id TEXT,
  course_name TEXT NOT NULL,
  school_year TEXT NOT NULL,
  amount_paid REAL NOT NULL,
  date TEXT NOT NULL,
  method TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (student_id) REFERENCES external_students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS external_attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  course_id TEXT,
  course_name TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (student_id) REFERENCES external_students(id) ON DELETE CASCADE
);

-- ============================================================
-- MEAL PLANS
-- ============================================================

CREATE TABLE IF NOT EXISTS meal_plan_days (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  date TEXT NOT NULL,
  dish_name TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_plan_attendees (
  meal_plan_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  is_one_time INTEGER NOT NULL DEFAULT 0,
  paid_unit INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meal_plan_id, student_id),
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plan_days(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ============================================================
-- EXPENSES
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  receipt_ref TEXT NOT NULL
);

-- ============================================================
-- REVISION SEANCES
-- ============================================================

CREATE TABLE IF NOT EXISTS revision_seances (
  id TEXT PRIMARY KEY,
  school_year TEXT NOT NULL,
  trimester TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher_name TEXT NOT NULL,
  teacher_phone TEXT NOT NULL,
  date TEXT NOT NULL,
  teacher_share REAL NOT NULL,
  center_share REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS revision_seance_students (
  seance_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  paid_seance INTEGER NOT NULL DEFAULT 0,
  present INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (seance_id, student_id),
  FOREIGN KEY (seance_id) REFERENCES revision_seances(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,          -- crypto.randomUUID()
  email      TEXT    NOT NULL,             -- references users(email)
  expires_at INTEGER NOT NULL,             -- Unix ms timestamp
  created_at INTEGER NOT NULL,             -- Unix ms timestamp
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_email   ON sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suivi_notes_unique
  ON suivi_notes(student_id, school_year, trimester, subject);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_cin_unique
  ON staff(cin);

-- ============================================================
-- INDEXES ON FOREIGN KEY COLUMNS
-- Speeds up JOINs, DELETE CASCADE, and filtered lookups.
-- ============================================================

-- Student child tables
CREATE INDEX IF NOT EXISTS idx_payments_student_id          ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_service             ON payments(service);
CREATE INDEX IF NOT EXISTS idx_payments_month               ON payments(month);
CREATE INDEX IF NOT EXISTS idx_suivi_notes_student_id       ON suivi_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_siblings_student_id          ON siblings(student_id);
CREATE INDEX IF NOT EXISTS idx_authorized_persons_student_id ON authorized_persons(student_id);
CREATE INDEX IF NOT EXISTS idx_student_parents_student_id   ON student_parents(student_id);

-- Meal attendances (PK is composite, but date-range scans benefit from index)
CREATE INDEX IF NOT EXISTS idx_meal_attendances_student_id  ON meal_attendances(student_id);

-- Slot & course enrollments
CREATE INDEX IF NOT EXISTS idx_slot_enrollments_student_id  ON slot_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_slot_enrollments_slot_id     ON slot_enrollments(slot_id);
CREATE INDEX IF NOT EXISTS idx_course_enrolled_student_id   ON course_enrolled_students(student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrolled_course_id    ON course_enrolled_students(course_id);

-- External course sessions
CREATE INDEX IF NOT EXISTS idx_ec_sessions_course_id        ON external_course_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_ec_sessions_date             ON external_course_sessions(date);

-- Session child tables
CREATE INDEX IF NOT EXISTS idx_session_present_session_id   ON session_present_students(session_id);
CREATE INDEX IF NOT EXISTS idx_session_present_student_id   ON session_present_students(student_id);
CREATE INDEX IF NOT EXISTS idx_session_month_paid_session_id ON session_month_paid(session_id);
CREATE INDEX IF NOT EXISTS idx_session_month_paid_student_id ON session_month_paid(student_id);
CREATE INDEX IF NOT EXISTS idx_session_seance_st_session_id ON session_seance_status(session_id);
CREATE INDEX IF NOT EXISTS idx_session_seance_st_student_id ON session_seance_status(student_id);
CREATE INDEX IF NOT EXISTS idx_session_seance_amt_session_id ON session_seance_amount(session_id);
CREATE INDEX IF NOT EXISTS idx_session_seance_amt_student_id ON session_seance_amount(student_id);

-- External student register
CREATE INDEX IF NOT EXISTS idx_ext_payments_student_id      ON external_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_ext_attendance_student_id    ON external_attendance(student_id);

-- Meal plan attendees
CREATE INDEX IF NOT EXISTS idx_meal_plan_attendees_student_id ON meal_plan_attendees(student_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_attendees_plan_id    ON meal_plan_attendees(meal_plan_id);

-- Revision seance students
CREATE INDEX IF NOT EXISTS idx_rev_seance_students_seance_id ON revision_seance_students(seance_id);

-- Staff child tables
CREATE INDEX IF NOT EXISTS idx_staff_payments_staff_id      ON staff_payments(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_payslips_staff_id      ON staff_payslips(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_leave_requests_staff_id ON staff_leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_advances_staff_id      ON staff_advances(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_subjects_staff_id      ON staff_subjects(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedule_staff_id      ON staff_schedule(staff_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_staff_id          ON timesheets(staff_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_date              ON timesheets(date);

-- Per-IP auth rate-limit counters (5 POSTs / 60s on /api/auth/*)
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT    PRIMARY KEY,        -- 'auth:<ip>'
  count        INTEGER NOT NULL,           -- requests in the current window
  window_start INTEGER NOT NULL            -- Unix ms timestamp of window start
);

-- ============================================================
-- FORMATIONS / COURSES (System Academy module)
-- ============================================================

CREATE TABLE IF NOT EXISTS formations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  school_year TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  pack_price REAL NOT NULL DEFAULT 0,
  schedule TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS formation_matieres (
  id TEXT PRIMARY KEY,
  formation_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS formation_students (
  id TEXT PRIMARY KEY,
  formation_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  is_pack INTEGER NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  total_required REAL NOT NULL DEFAULT 0,
  remaining_balance REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'espece',
  cheque_number TEXT,
  cheque_date TEXT,
  cheque_paid INTEGER DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  is_advance INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  notes TEXT,
  enrolled_at TEXT NOT NULL,
  FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS formation_student_matieres (
  formation_student_id TEXT NOT NULL,
  formation_matiere_id TEXT NOT NULL,
  PRIMARY KEY (formation_student_id, formation_matiere_id),
  FOREIGN KEY (formation_student_id) REFERENCES formation_students(id) ON DELETE CASCADE,
  FOREIGN KEY (formation_matiere_id) REFERENCES formation_matieres(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_formation_matieres_formation_id ON formation_matieres(formation_id);
CREATE INDEX IF NOT EXISTS idx_formation_students_formation_id ON formation_students(formation_id);
CREATE INDEX IF NOT EXISTS idx_formation_student_matieres_student_id ON formation_student_matieres(formation_student_id);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Settings (single row)
INSERT INTO settings (id, center_name, phone_number, location_city)
VALUES (1, 'System Academy', '+216 71 000 000', 'Sfax / تونس');

-- Fee sets (default + per-year overrides)
INSERT INTO fee_sets (
  year, frais_annuel_suivi, frais_mensuel_suivi, frais_annuel_bibliotheque,
  frais_mensuel_bibliotheque, frais_abonnement_repas, frais_par_repas,
  frais_abonnement_repas_traiteur, frais_par_repas_traiteur,
  frais_annuel_etude, frais_mensuel_etude,
  frais_assurance_cours_externes
) VALUES
  ('DEFAULT', 150, 250, 20, 30, 120, 8, 100, 6, 100, 180, 50),
  ('2022/2023', 150, 250, 20, 30, 120, 8, 100, 6, 100, 180, 50),
  ('2023/2024', 150, 250, 20, 30, 120, 8, 100, 6, 100, 180, 50),
  ('2024/2025', 150, 250, 20, 30, 120, 8, 100, 6, 100, 180, 50),
  ('2025/2026', 150, 250, 20, 30, 120, 8, 100, 6, 100, 180, 50),
  ('2026/2027', 200, 300, 20, 30, 120, 8, 100, 6, 100, 180, 50),
  ('2027/2028', 200, 300, 20, 30, 120, 8, 100, 6, 100, 180, 50),
  ('2028/2029', 200, 300, 20, 30, 120, 8, 100, 6, 100, 180, 50);

-- Subjects (shared list)
INSERT INTO subjects (name) VALUES
  ('الرياضيات (Mathématiques)'),
  ('الفيزياء والكيمياء (Physique-Chimie)'),
  ('علوم الحياة والأرض (SVT)'),
  ('اللغة العربية (Arabe)'),
  ('اللغة الفرنسية (Français)'),
  ('اللغة الإنجليزية (Anglais)'),
  ('الإعلامية (Informatique)'),
  ('الفلسفة (Philosophie)'),
  ('التاريخ والجغرافيا (Histoire-Géo)'),
  ('الإقتصاد والتصرف (Économie-Gestion)');

-- Users (admin accounts, SHA-256 hashed passwords)
-- teens_center@gmail.com / teens_center  (restricted_admin)
-- academy_system@gmail.com / academy_system    (super_admin)
INSERT INTO users (email, name, role, description, password_hash) VALUES
  ('teens_center@gmail.com', 'إدارة Academy System (محدودة)', 'restricted_admin', 'إخفاء الكورسات الخارجية والمطعم', '33a8ea8c23c99ee45b6c7177230b658b674e09eef78566ec5ce511dc2e36acc9'),
  ('academy_system@gmail.com', 'إدارة Academy System (شاملة)', 'super_admin', 'جميع الصلاحيات', 'ff85c1201b1985d278c28a3f82f569a1ab412abe2ffb5a94f4b489bd020ae126');

-- Students
INSERT INTO students (
  id, first_name, last_name, birth_date, birth_place, grade, academic_year,
  parental_situation, parental_comments, allergies,
  registration_date, registration_location, registration_signed_electronically, registration_signature_name,
  enrolled_suivi, enrolled_etude, enrolled_library, enrolled_meals,
  suivi_annual_fee, suivi_monthly_fee,
  etude_annual_fee, etude_monthly_fee,
  library_annual_fee, library_monthly_fee,
  meal_mode, meal_monthly_price, meal_unit_price, meal_prepaid, meal_consumed, meal_active
) VALUES
  ('student_1', 'ياسين', 'الطرابلسي', '2010-05-14', 'تونس العاصمة', 'Lycée 1ère Année', NULL,
   'mariés', '', 'حساسية من الفول السوداني (Peanut allergy)',
   '2026-08-01', 'تونس', 1, 'سامي الطرابلسي',
   1, 1, 1, 1,
   150, 250, 50, 80, 20, 30,
   'subscription', 150, 8, 18, 6, 1),
  ('student_2', 'سارة', 'الجزيري', '2009-11-23', 'أريانة', 'Lycée 2ème Année', NULL,
   'séparés_garde_mere', 'حضانة لدى الأم - الأب يتكفل بالجانب المالي', 'لا توجد حساسيات معروفة',
   '2026-08-05', 'أريانة', 1, 'سلمى العرفاوي',
   1, 1, 0, 1,
   150, 250, 50, 80, 20, 30,
   'subscription', 150, 8, 18, 10, 1),
  ('student_3', 'محمد علي', 'بن حمودة', '2011-03-08', 'تونس', 'Collège 8ème Année', NULL,
   'mariés', '', 'حساسية حليب اللاكتوز',
   '2026-08-10', 'تونس', 1, 'عبير الماجري',
   0, 1, 1, 0,
   150, 250, 50, 80, 20, 30,
   'unit', 150, 8, 0, 3, 0);

-- Student parents
INSERT INTO student_parents (
  student_id, role, name, birth_date, profession, address, phone_fixed, phone_mobile, email, extra_phones
) VALUES
  ('student_1', 'mother', 'مريم العبيدي', '1982-08-20', 'أستاذة جامعية', 'شارع الحبيب بورقيبة، تونس', '71 234 567', '98 123 456', 'mariem.jouini@gmail.com', NULL),
  ('student_1', 'father', 'سامي الطرابلسي', '1978-03-11', 'مهندس معماري', 'شارع الحبيب بورقيبة، تونس', '71 234 567', '22 987 654', 'sami.trabelsi@gmail.com', NULL),
  ('student_2', 'mother', 'سلمى العرفاوي', '1984-04-12', 'طبيبة أطفال', 'حي النصر 2، أريانة', '71 999 888', '96 444 333', 'salma.jouini@hotmail.fr', NULL),
  ('student_2', 'father', 'كريم الجزيري', '1980-09-15', 'إطار بشركة اتصالات', 'حي النصر 2، أريانة', '71 999 888', '55 111 222', 'karim.djaziri@gmail.com', NULL),
  ('student_3', 'mother', 'عبير الماجري', '1986-01-30', 'محامية', 'المنار 1، تونس', '71 444 555', '92 888 777', 'abir.mejri@avocat.tn', NULL),
  ('student_3', 'father', 'هشام بن حمودة', '1981-06-25', 'تاجر', 'المنار 1، تونس', '71 444 555', '24 666 555', 'hichem.benhamouda@gmail.com', NULL);

-- Siblings
INSERT INTO siblings (id, student_id, name, age, grade) VALUES
  ('sib_1', 'student_1', 'أمين الطرابلسي', 11, 'Collège 6ème'),
  ('sib_2', 'student_3', 'ريمة بن حمودة', 16, 'Lycée 3ème');

-- Authorized persons
INSERT INTO authorized_persons (id, student_id, name, phone, relation) VALUES
  ('auth_1', 'student_1', 'فاطمة العبيدي (الجدة)', '97 555 444', 'جدة'),
  ('auth_2', 'student_2', 'توفيق العرفاوي (الخال)', '20 333 444', 'خال');

-- Academic history
INSERT INTO academic_history (student_id, n_minus, school, grade) VALUES
  ('student_1', 1, 'إعدادية ضفاف البحيرة', 'Collège 9ème'),
  ('student_1', 2, 'إعدادية ضفاف البحيرة', 'Collège 8ème'),
  ('student_1', 3, 'مدرسة المنار الابتدائية', 'Collège 7ème'),
  ('student_2', 1, 'معهد حي النصر', 'Lycée 1ère'),
  ('student_2', 2, 'إعدادية ابن خلدون', 'Collège 9ème'),
  ('student_2', 3, 'إعدادية ابن خلدون', 'Collège 8ème'),
  ('student_3', 1, 'إعدادية المنار', 'Collège 7ème'),
  ('student_3', 2, 'مدرسة ابن شرف', 'Primaire 6ème'),
  ('student_3', 3, 'مدرسة ابن شرف', 'Primaire 5ème');

-- Payments
INSERT INTO payments (
  id, student_id, date, amount_paid, total_required, remaining_balance,
  service, month, payment_type, method, receipt_number, notes, discount, refund, refund_of
) VALUES
  ('pay_1', 'student_1', '2026-09-02', 150, 150, 0, 'Inscription Suivi', 'Septembre', 'full', 'Espèces', 'REC-2026-001', 'دفع رسوم التسجيل السنوي الكامل', NULL, 0, NULL),
  ('pay_2', 'student_1', '2026-09-02', 150, 250, 100, 'Suivi', 'Septembre', 'advance', 'Espèces', 'REC-2026-002', 'تسبقة (أكونت) لشهر سبتمبر - المتبقي 100 د.ت', NULL, 0, NULL),
  ('pay_3', 'student_1', '2026-09-15', 100, 100, 0, 'Suivi', 'Septembre', 'balance', 'Espèces', 'REC-2026-003', 'خلاص باقي شهر سبتمبر', NULL, 0, NULL),
  ('pay_4', 'student_1', '2026-10-01', 80, 80, 0, 'Étude', 'Octobre', 'full', 'Espèces', 'REC-2026-010', NULL, NULL, 0, NULL),
  ('pay_5', 'student_1', '2026-10-01', 150, 150, 0, 'Repas', 'Octobre', 'full', 'Espèces', 'REC-2026-011', NULL, NULL, 0, NULL),
  ('pay_6', 'student_2', '2026-09-01', 250, 250, 0, 'Suivi', 'Septembre', 'full', 'Virement', 'REC-2026-004', NULL, NULL, 0, NULL),
  ('pay_7', 'student_2', '2026-10-02', 250, 250, 0, 'Suivi', 'Octobre', 'full', 'Virement', 'REC-2026-015', NULL, NULL, 0, NULL),
  ('pay_8', 'student_3', '2026-09-05', 80, 80, 0, 'Étude', 'Septembre', 'full', 'Espèces', 'REC-2026-005', NULL, NULL, 0, NULL),
  ('pay_9', 'student_3', '2026-09-05', 30, 30, 0, 'Bibliothèque', 'Septembre', 'full', 'Espèces', 'REC-2026-006', NULL, NULL, 0, NULL);

-- Staff
INSERT INTO staff (
  id, first_name, last_name, cin, cnss_number, salary, type, phone, role,
  contract_start_date, contract_type, email, address, base_salary, cnss_amount, hourly_rate, hire_date
) VALUES
  ('staff_1', 'مراد', 'المنصوري', '08765432', '12345678-90', 1200, 'salarié', '98 700 800', 'enseignant', '2024-09-01', 'CDI', NULL, NULL, 1200, NULL, 30, '2024-09-01'),
  ('staff_2', 'نجلاء', 'بن صالح', '05432109', '98765432-10', 1100, 'salarié', '22 400 500', 'encadrant', '2025-01-15', 'CDI', NULL, NULL, 1100, NULL, 25, '2025-01-15'),
  ('staff_3', 'طارق', 'الرياحي', '01234567', '55443322-11', 950, 'salarié', '55 888 999', 'enseignant', '2025-09-01', 'CDD', NULL, NULL, 950, NULL, 22, '2025-09-01');

INSERT INTO staff_subjects (staff_id, subject) VALUES
  ('staff_1', 'Mathématiques'),
  ('staff_1', 'Physique'),
  ('staff_2', 'Français'),
  ('staff_2', 'Anglais'),
  ('staff_3', 'SVT');

INSERT INTO staff_schedule (staff_id, day, slots) VALUES
  ('staff_1', 'Lundi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_1', 'Mardi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_1', 'Mercredi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_1', 'Jeudi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_1', 'Vendredi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_1', 'Samedi', '["08:00 - 12:00"]'),
  ('staff_2', 'Lundi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_2', 'Mardi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_2', 'Mercredi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_2', 'Jeudi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_2', 'Vendredi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_2', 'Samedi', '["08:00 - 12:00"]'),
  ('staff_3', 'Lundi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_3', 'Mardi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_3', 'Mercredi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_3', 'Jeudi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_3', 'Vendredi', '["08:00 - 12:00","14:00 - 18:00"]'),
  ('staff_3', 'Samedi', '["08:00 - 12:00"]');

INSERT INTO staff_payments (
  id, staff_id, month, amount_paid, bonus, deduction, net_salary, date, receipt_number, notes
) VALUES
  ('sp_1', 'staff_1', 'سبتمبر 2026', 1200, 100, 0, 1300, '2026-09-30', 'SAL-2026-09-01', 'راتب شهر سبتمبر + مكافأة تفوق');

-- Étude slots
INSERT INTO etude_slots (id, day, start_time, end_time, grade_level, teacher_id, is_extra) VALUES
  ('slot_1', 'Lundi', '08:00', '10:00', 'Collège 7ème & 8ème', 'staff_1', 0),
  ('slot_2', 'Lundi', '16:00', '18:00', 'Lycée 1ère & 2ème', 'staff_1', 0),
  ('slot_3', 'Mardi', '14:00', '16:00', 'Collège 9ème', 'staff_2', 0),
  ('slot_4', 'Mercredi', '10:00', '12:00', 'Lycée 1ère & 2ème Année', 'staff_3', 0),
  ('slot_5', 'Jeudi', '18:00', '20:00', 'Lycée 1ère', 'staff_2', 0),
  ('slot_6', 'Lundi', '08:30', '10:30', 'Lycée 2ème & 3ème', 'staff_2', 0);

INSERT INTO slot_enrollments (slot_id, student_id) VALUES
  ('slot_1', 'student_3'),
  ('slot_2', 'student_1'),
  ('slot_2', 'student_2'),
  ('slot_3', 'student_3'),
  ('slot_4', 'student_2'),
  ('slot_5', 'student_1'),
  ('slot_6', 'student_1'),
  ('slot_6', 'student_2');

-- Meal plans
INSERT INTO meal_plan_days (id, day, date, dish_name, description) VALUES
  ('meal_1', 'Lundi', '2026-10-05', 'كسكسي تونسي بالخضار والدجاج الصافي', 'طبق تقليدي متكامل غني بالفيتامينات والمغذيات للأطفال'),
  ('meal_2', 'Mardi', '2026-10-06', 'باستا بيني بالصلصة الحمراء واللحم المفروم + سلطة خضراء', 'معكرونة طازجة تحضر يومياً مع سلطة الخيار والمايونيز الخفيف'),
  ('meal_3', 'Mercredi', '2026-10-07', 'أرز بالخضار وشريحة دجاج مشوي + غلال طازجة', 'أرز أبيض خفيف مع صدر دجاج صحي وتفاح طازج');

INSERT INTO meal_plan_attendees (meal_plan_id, student_id, is_one_time, paid_unit) VALUES
  ('meal_1', 'student_1', 0, 1),
  ('meal_1', 'student_2', 0, 1),
  ('meal_2', 'student_1', 0, 1),
  ('meal_2', 'student_2', 0, 1),
  ('meal_2', 'student_3', 1, 1),
  ('meal_3', 'student_1', 0, 1);

-- Expenses
INSERT INTO expenses (id, date, category, amount, description, receipt_ref) VALUES
  ('exp_1', '2026-10-01', 'Électricité (STEG)', 340, 'فاتورة الكهرباء والغاز لشهر سبتمبر', 'STEG-8874'),
  ('exp_2', '2026-10-02', 'Eau (SONEDE)', 120, 'استهلاك الماء للسنتر', 'SON-1029'),
  ('exp_3', '2026-10-02', 'Télécom', 95, 'اشتراك الأنترنيت الفايبر والهاتف الثابت', 'TT-4493'),
  ('exp_4', '2026-10-05', 'Produits d''hygiène', 85, 'شراء معقمات ومنظفات للسنتر', 'FAC-0091');

-- Timesheets
INSERT INTO timesheets (id, staff_id, date, slot_time, status, leave_reason, leave_status, notes, hours_worked, extra_hours) VALUES
  ('ts_1', 'staff_1', '2026-10-05', '08:00 - 10:00', 'present', NULL, NULL, NULL, NULL, NULL),
  ('ts_2', 'staff_2', '2026-10-05', '10:00 - 12:00', 'present', NULL, NULL, NULL, NULL, NULL);

-- Indexes on foreign key columns
CREATE INDEX IF NOT EXISTS idx_student_parents_student_id ON student_parents(student_id);
CREATE INDEX IF NOT EXISTS idx_siblings_student_id ON siblings(student_id);
CREATE INDEX IF NOT EXISTS idx_authorized_persons_student_id ON authorized_persons(student_id);
CREATE INDEX IF NOT EXISTS idx_academic_history_student_id ON academic_history(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_meal_attendances_student_id ON meal_attendances(student_id);
CREATE INDEX IF NOT EXISTS idx_suivi_notes_student_id ON suivi_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_slot_enrollments_student_id ON slot_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrolled_students_student_id ON course_enrolled_students(student_id);
CREATE INDEX IF NOT EXISTS idx_session_present_students_student_id ON session_present_students(student_id);
CREATE INDEX IF NOT EXISTS idx_session_month_paid_student_id ON session_month_paid(student_id);
CREATE INDEX IF NOT EXISTS idx_session_seance_status_student_id ON session_seance_status(student_id);
CREATE INDEX IF NOT EXISTS idx_session_seance_amount_student_id ON session_seance_amount(student_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_attendees_student_id ON meal_plan_attendees(student_id);
CREATE INDEX IF NOT EXISTS idx_revision_seance_students_student_id ON revision_seance_students(student_id);
CREATE INDEX IF NOT EXISTS idx_external_payments_student_id ON external_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_external_attendance_student_id ON external_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_staff_subjects_staff_id ON staff_subjects(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedule_staff_id ON staff_schedule(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_payments_staff_id ON staff_payments(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_payslips_staff_id ON staff_payslips(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_leave_requests_staff_id ON staff_leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_advances_staff_id ON staff_advances(staff_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_staff_id ON timesheets(staff_id);
CREATE INDEX IF NOT EXISTS idx_external_course_sessions_course_id ON external_course_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_etude_slots_teacher_id ON etude_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_slot_enrollments_slot_id ON slot_enrollments(slot_id);
CREATE INDEX IF NOT EXISTS idx_course_enrolled_students_course_id ON course_enrolled_students(course_id);
CREATE INDEX IF NOT EXISTS idx_session_one_time_students_session_id ON session_one_time_students(session_id);
CREATE INDEX IF NOT EXISTS idx_session_present_students_session_id ON session_present_students(session_id);
CREATE INDEX IF NOT EXISTS idx_session_month_paid_session_id ON session_month_paid(session_id);
CREATE INDEX IF NOT EXISTS idx_session_seance_status_session_id ON session_seance_status(session_id);
CREATE INDEX IF NOT EXISTS idx_session_seance_amount_session_id ON session_seance_amount(session_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_attendees_meal_plan_id ON meal_plan_attendees(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_revision_seance_students_seance_id ON revision_seance_students(seance_id);
