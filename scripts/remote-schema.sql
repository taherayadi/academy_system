CREATE TABLE academic_history (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  n_minus    INTEGER NOT NULL CHECK (n_minus IN (1,2,3)),
  school     TEXT NOT NULL,
  grade      TEXT NOT NULL,
  PRIMARY KEY (student_id, n_minus)
) STRICT;

CREATE TABLE activities (
  id          TEXT PRIMARY KEY,
  center_id   TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  weekday     INTEGER CHECK (weekday IS NULL OR weekday BETWEEN 1 AND 7),
  date        TEXT,
  time_start  TEXT NOT NULL,
  time_end    TEXT NOT NULL,
  location    TEXT,
  level_class TEXT,
  staff_id    TEXT REFERENCES staff(id) ON DELETE SET NULL,
  created_at  INTEGER
) STRICT;

CREATE TABLE advertisement_centers (
  advertisement_id TEXT NOT NULL REFERENCES platform_advertisements(id) ON DELETE CASCADE,
  center_id        TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  PRIMARY KEY (advertisement_id, center_id)
) STRICT;

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center_id  TEXT REFERENCES centers(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE TABLE authorized_persons (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  relation   TEXT NOT NULL
) STRICT;

CREATE TABLE center_invoices (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  center_id      TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE,
  period_start   INTEGER NOT NULL,
  period_end     INTEGER NOT NULL,
  amount     REAL NOT NULL CHECK (amount >= 0),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash','cheque','transfer','card')),
  payment_date   INTEGER,
  cheque_number  TEXT,
  cheque_date    INTEGER,
  notes          TEXT,
  created_at     INTEGER NOT NULL,
  CHECK (period_end >= period_start)
) STRICT;

CREATE TABLE center_meal_mode_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  center_id      TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL CHECK (mode IN ('external_traiteur','in_house_kitchen')),
  effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL,
  UNIQUE (center_id, effective_from)
) STRICT;

CREATE TABLE center_modules (
  center_id  TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES modules(key),
  PRIMARY KEY (center_id, module_key)
) STRICT;

CREATE TABLE center_plan_history (
  id             TEXT PRIMARY KEY,
  center_id      TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,
  details        TEXT NOT NULL DEFAULT '',
  amount     REAL,
  invoice_number TEXT,
  created_at     INTEGER NOT NULL
) STRICT;

CREATE TABLE center_plan_schedules (
  id                TEXT PRIMARY KEY,
  center_id         TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  to_plan           TEXT NOT NULL CHECK (to_plan IN ('starter','growth','pro','custom')),
  to_billing_cycle  TEXT NOT NULL DEFAULT 'monthly' CHECK (to_billing_cycle IN ('monthly','annual')),
  to_enabled_modules TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(to_enabled_modules)),  -- snapshot of a request
  to_monthly_price REAL CHECK (to_monthly_price IS NULL OR to_monthly_price >= 0),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','cancelled')),
  apply_at          INTEGER,
  notes             TEXT,
  created_at        INTEGER NOT NULL,
  applied_at        INTEGER
) STRICT;

CREATE TABLE center_service_prices (
  center_id          TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  school_year        TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  service_key        TEXT NOT NULL REFERENCES services(key),
  billing_period     TEXT NOT NULL CHECK (billing_period IN ('month','unit','year')),
  valid_from         TEXT NOT NULL CHECK (valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  price          REAL NOT NULL CHECK (price >= 0),
  traiteur_share REAL,
  PRIMARY KEY (center_id, school_year, service_key, billing_period, valid_from),
  CHECK (traiteur_share IS NULL OR (service_key = 'lunch' AND traiteur_share BETWEEN 0 AND price))
) STRICT;

CREATE TABLE center_settings (
  center_id TEXT PRIMARY KEY REFERENCES centers(id) ON DELETE CASCADE,
  center_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  location_city TEXT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'TND',
  updated_at          INTEGER NOT NULL
);

CREATE TABLE center_type_modules (
  center_type TEXT NOT NULL REFERENCES center_types(key),
  module_key  TEXT NOT NULL REFERENCES modules(key),
  PRIMARY KEY (center_type, module_key)
) STRICT;

CREATE TABLE center_types (
  key   TEXT PRIMARY KEY,
  label TEXT NOT NULL
, hint TEXT NOT NULL DEFAULT '', label_ar TEXT NOT NULL DEFAULT '') STRICT;

CREATE TABLE centers (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  slug                 TEXT NOT NULL UNIQUE,
  phone_number         TEXT,
  location_city        TEXT,
  logo_url             TEXT,
  center_type          TEXT NOT NULL DEFAULT 'other' REFERENCES center_types(key),
  plan                 TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','growth','pro','custom')),
  billing_cycle        TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  monthly_price    REAL NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  max_students         INTEGER NOT NULL DEFAULT 500 CHECK (max_students > 0),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','suspended','expired')),
  trial_ends_at        INTEGER,
  subscription_ends_at INTEGER,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
) STRICT;

CREATE TABLE course_enrollments (
  course_id   TEXT NOT NULL REFERENCES external_courses(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrolled_at INTEGER NOT NULL,
  PRIMARY KEY (course_id, student_id)
) STRICT;

CREATE TABLE course_session_attendance (
  session_id      TEXT NOT NULL REFERENCES external_course_sessions(id) ON DELETE CASCADE,
  student_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  present         INTEGER NOT NULL DEFAULT 0 CHECK (present IN (0,1)),
  seance_status   TEXT,
  seance_amount REAL NOT NULL DEFAULT 0 CHECK (seance_amount >= 0),
  paid_payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, student_id)
) STRICT;

CREATE TABLE demo_requests (
  id                 TEXT PRIMARY KEY,
  full_name          TEXT NOT NULL,
  academy_name       TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT NOT NULL,
  estimated_students TEXT,
  requested_modules  TEXT CHECK (requested_modules IS NULL OR json_valid(requested_modules)),
  message            TEXT,
  request_type       TEXT NOT NULL DEFAULT 'trial',
  center_type        TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','converted','archived')),
  notes              TEXT NOT NULL DEFAULT '',
  created_at         INTEGER NOT NULL
) STRICT;

CREATE TABLE etablissements (
  id        TEXT PRIMARY KEY,
  center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  UNIQUE (center_id, name)
) STRICT;

CREATE TABLE etude_slots (
  id          TEXT PRIMARY KEY,
  center_id   TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),        -- ISO: 1 = Monday
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  teacher_id  TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  is_extra    INTEGER NOT NULL DEFAULT 0 CHECK (is_extra IN (0,1)),
  CHECK (end_time > start_time)
) STRICT;

CREATE TABLE events (
  id               TEXT PRIMARY KEY,
  center_id        TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL DEFAULT 'other',
  date             TEXT NOT NULL,
  time             TEXT,
  location         TEXT NOT NULL,
  price_student  REAL NOT NULL DEFAULT 0 CHECK (price_student >= 0),
  price_parent   REAL NOT NULL DEFAULT 0 CHECK (price_parent >= 0),
  price_sibling  REAL NOT NULL DEFAULT 0 CHECK (price_sibling >= 0),
  price_external REAL NOT NULL DEFAULT 0 CHECK (price_external >= 0),
  max_capacity     INTEGER CHECK (max_capacity IS NULL OR max_capacity > 0),
  bus_included     INTEGER NOT NULL DEFAULT 0 CHECK (bus_included IN (0,1)),
  status           TEXT NOT NULL DEFAULT 'planned',
  school_year      TEXT NOT NULL DEFAULT '',
  participants     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(participants)),  -- TODO: event_participants table once the JSON shape is confirmed
  created_at       INTEGER NOT NULL
) STRICT;

CREATE TABLE expenses (
  id          TEXT PRIMARY KEY,
  center_id   TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  category    TEXT NOT NULL,
  amount  REAL NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL DEFAULT '',
  receipt_ref TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
) STRICT;

CREATE TABLE external_attendance (
  id         TEXT PRIMARY KEY,
  center_id  TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id  TEXT REFERENCES external_courses(id) ON DELETE SET NULL,
  date       TEXT NOT NULL,
  status     TEXT NOT NULL
) STRICT;

CREATE TABLE external_course_sessions (
  id          TEXT PRIMARY KEY,
  center_id   TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES external_courses(id) ON DELETE CASCADE,
  date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  period_name TEXT
) STRICT;

CREATE TABLE external_courses (
  id               TEXT PRIMARY KEY,
  center_id        TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  school_year      TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  trimester        TEXT NOT NULL,
  grade_level      TEXT NOT NULL,
  subject          TEXT NOT NULL,
  teacher_name     TEXT NOT NULL,
  teacher_phone    TEXT NOT NULL,
  monthly_fee  REAL NOT NULL CHECK (monthly_fee >= 0),
  teacher_share REAL NOT NULL CHECK (teacher_share >= 0),
  center_share REAL NOT NULL CHECK (center_share >= 0),
  CHECK (teacher_share + center_share = monthly_fee)
) STRICT;

CREATE TABLE formation_enrollment_matieres (
  enrollment_id TEXT NOT NULL REFERENCES formation_enrollments(id) ON DELETE CASCADE,
  matiere_id    TEXT NOT NULL REFERENCES formation_matieres(id) ON DELETE CASCADE,
  PRIMARY KEY (enrollment_id, matiere_id)
) STRICT;

CREATE TABLE formation_enrollments (
  id           TEXT PRIMARY KEY,
  center_id    TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  formation_id TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  is_pack      INTEGER NOT NULL DEFAULT 0 CHECK (is_pack IN (0,1)),
  is_advance   INTEGER NOT NULL DEFAULT 0 CHECK (is_advance IN (0,1)),
  discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
  notes        TEXT,
  enrolled_at  INTEGER NOT NULL,
  UNIQUE (formation_id, student_id)
) STRICT;

CREATE TABLE formation_matieres (
  id           TEXT PRIMARY KEY,
  formation_id TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  subject      TEXT NOT NULL
) STRICT;

CREATE TABLE formations (
  id             TEXT PRIMARY KEY,
  center_id      TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  school_year    TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  pack_price REAL NOT NULL DEFAULT 0 CHECK (pack_price >= 0),
  schedule       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(schedule)),
  created_at     INTEGER NOT NULL,
  CHECK (end_date >= start_date)
) STRICT;

CREATE TABLE meal_attendances (
  center_id             TEXT NOT NULL,
  student_id            TEXT NOT NULL,
  date                  TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  service_key           TEXT NOT NULL CHECK (service_key IN ('lunch','gouter_matin','gouter_apres_midi')),
  billing_mode          TEXT NOT NULL CHECK (billing_mode IN ('subscription','unit')),
  status                TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','covered_by_subscription','void')),
  paid_payment_id       TEXT,
  covered_by_payment_id TEXT,
  mode_snapshot         TEXT CHECK (mode_snapshot IS NULL OR mode_snapshot IN ('external_traiteur','in_house_kitchen')),
  unit_price        REAL CHECK (unit_price IS NULL OR unit_price >= 0),
  traiteur_share    REAL CHECK (traiteur_share IS NULL OR traiteur_share >= 0),
  center_share      REAL CHECK (center_share IS NULL OR center_share >= 0),
  created_at            INTEGER NOT NULL,
  PRIMARY KEY (student_id, date, service_key),
  CHECK (status <> 'paid' OR paid_payment_id IS NOT NULL),
  CHECK (status <> 'covered_by_subscription' OR covered_by_payment_id IS NOT NULL),
  FOREIGN KEY (center_id, student_id)         REFERENCES students(center_id, id) ON DELETE CASCADE,
  FOREIGN KEY (center_id, paid_payment_id)    REFERENCES payments(center_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (center_id, covered_by_payment_id) REFERENCES payments(center_id, id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE meal_forfait_closure_items (
  id                          TEXT PRIMARY KEY,
  closure_id                  TEXT NOT NULL REFERENCES meal_forfait_closures(id) ON DELETE CASCADE,
  student_id                  TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  student_name                TEXT NOT NULL,
  net_paid                REAL NOT NULL CHECK (net_paid >= 0),
  consumed_subscription_meals INTEGER NOT NULL CHECK (consumed_subscription_meals >= 0),
  unit_price              REAL NOT NULL CHECK (unit_price >= 0),
  amount                  REAL NOT NULL CHECK (amount >= 0)
) STRICT;

CREATE TABLE meal_forfait_closures (
  id          TEXT PRIMARY KEY,
  center_id   TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  month       TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  created_at  INTEGER NOT NULL,
  UNIQUE (center_id, school_year, month)
) STRICT;

CREATE TABLE meal_plan_days (
  id          TEXT PRIMARY KEY,
  center_id   TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  dish_name   TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE (center_id, date)
) STRICT;

CREATE TABLE module_prices (
  school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  module_key  TEXT NOT NULL REFERENCES modules(key),
  price   REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (school_year, module_key)
) STRICT;

CREATE TABLE modules (
  key   TEXT PRIMARY KEY,
  label TEXT NOT NULL
, isBasic INTEGER NOT NULL DEFAULT 0 CHECK (isBasic IN (0, 1)), isUnbilled INTEGER NOT NULL DEFAULT 0 CHECK (isUnbilled IN (0,1)), isHidden INTEGER NOT NULL DEFAULT 0 CHECK (isHidden IN (0,1)), label_ar TEXT NOT NULL DEFAULT '') STRICT;

CREATE TABLE payments (
  id                 TEXT PRIMARY KEY,
  center_id          TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_id         TEXT NOT NULL,
  date               TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  service_key        TEXT NOT NULL REFERENCES services(key),
  billing_period     TEXT NOT NULL CHECK (billing_period IN ('month','unit','year')),
  period_month       TEXT CHECK (period_month IS NULL OR period_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  school_year        TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  payment_type       TEXT NOT NULL CHECK (payment_type IN ('full','partial','balance','advance')),
  method             TEXT NOT NULL CHECK (method IN ('cash','cheque','transfer','card')),
  amount         REAL NOT NULL CHECK (amount > 0),              -- always positive; refunds use is_refund
  total_required REAL NOT NULL CHECK (total_required >= 0),     -- amount due when this payment was taken
  discount       REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
  receipt_number     TEXT NOT NULL,
  notes              TEXT,
  cheque_number      TEXT,
  cheque_date        TEXT,
  cheque_paid        INTEGER NOT NULL DEFAULT 0 CHECK (cheque_paid IN (0,1)),
  is_refund          INTEGER NOT NULL DEFAULT 0 CHECK (is_refund IN (0,1)),
  refund_of          TEXT,
  -- what this receipt refers to when it is not a plain student service:
  ref_type           TEXT CHECK (ref_type IS NULL OR ref_type IN ('external_course','revision_seance','formation','event')),
  ref_id             TEXT,
  created_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         INTEGER NOT NULL,
  UNIQUE (center_id, id),
  UNIQUE (center_id, receipt_number),
  CHECK (billing_period <> 'month' OR period_month IS NOT NULL),
  CHECK (method = 'cheque' OR (cheque_number IS NULL AND cheque_date IS NULL AND cheque_paid = 0)),
  CHECK (is_refund = 0 OR refund_of IS NOT NULL),
  CHECK ((ref_type IS NULL) = (ref_id IS NULL)),
  FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (center_id, refund_of)  REFERENCES payments(center_id, id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE platform_advertisements (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  date_start   INTEGER NOT NULL,
  date_end     INTEGER NOT NULL,
  location     TEXT NOT NULL,                                        -- 'landing_page' | 'center_admin' | custom
  image_urls   TEXT NOT NULL CHECK (json_valid(image_urls)),         -- JSON array of CDN URLs
  positions    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(positions)),
  link_url     TEXT NOT NULL DEFAULT '',
  priority     INTEGER NOT NULL DEFAULT 100,
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  CHECK (date_end >= date_start)
) STRICT;

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
) STRICT;

CREATE TABLE renewal_requests (
  id                 TEXT PRIMARY KEY,
  center_id          TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL DEFAULT 'renewal' CHECK (kind IN ('renewal','upgrade')),
  current_plan       TEXT NOT NULL DEFAULT '',
  current_status     TEXT NOT NULL DEFAULT '',
  current_modules    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(current_modules)),
  requested_plan     TEXT NOT NULL CHECK (requested_plan IN ('starter','growth','pro','custom')),
  requested_modules  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(requested_modules)),
  billing_cycle      TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  amount         REAL CHECK (amount IS NULL OR amount >= 0),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  effective_at       INTEGER,
  note               TEXT NOT NULL DEFAULT '',
  decision_note      TEXT NOT NULL DEFAULT '',
  decided_by         TEXT NOT NULL DEFAULT '',
  decided_at         INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
) STRICT;

CREATE TABLE revision_seance_students (
  seance_id       TEXT NOT NULL REFERENCES revision_seances(id) ON DELETE CASCADE,
  student_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  present         INTEGER NOT NULL DEFAULT 0 CHECK (present IN (0,1)),
  paid_payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,   -- replaces paid_seance flag
  PRIMARY KEY (seance_id, student_id)
) STRICT;

CREATE TABLE revision_seances (
  id                TEXT PRIMARY KEY,
  center_id         TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  school_year       TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  trimester         TEXT NOT NULL,
  grade_level       TEXT NOT NULL,
  subject           TEXT NOT NULL,
  teacher_name      TEXT NOT NULL,
  teacher_phone     TEXT NOT NULL,
  date              TEXT NOT NULL,
  teacher_share REAL NOT NULL CHECK (teacher_share >= 0),
  center_share  REAL NOT NULL CHECK (center_share >= 0)
) STRICT;

CREATE TABLE services (
  key        TEXT PRIMARY KEY,
  category   TEXT NOT NULL CHECK (category IN ('scolaire','meal','course','other')),
  label_fr   TEXT NOT NULL,
  label_ar   TEXT NOT NULL,
  module_key TEXT REFERENCES modules(key)
) STRICT;

CREATE TABLE siblings (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  age        INTEGER NOT NULL CHECK (age >= 0),
  grade      TEXT NOT NULL
) STRICT;

CREATE TABLE skill_evaluations (
  id                    TEXT PRIMARY KEY,
  center_id             TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_id            TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  skill_id              TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level                 TEXT NOT NULL,
  evaluated_by_staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  evaluated_by_name     TEXT,
  evaluated_at          INTEGER NOT NULL
) STRICT;

CREATE TABLE skills (
  id         TEXT PRIMARY KEY,
  center_id  TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL,
  label      TEXT NOT NULL,
  age_from   INTEGER,
  age_to     INTEGER,
  created_at INTEGER,
  CHECK (age_from IS NULL OR age_to IS NULL OR age_to >= age_from)
) STRICT;

CREATE TABLE slot_enrollments (
  slot_id    TEXT NOT NULL REFERENCES etude_slots(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (slot_id, student_id)
) STRICT;

CREATE TABLE staff (
  id                  TEXT PRIMARY KEY,
  center_id           TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  cin                 TEXT NOT NULL,
  cnss_number         TEXT,
  phone               TEXT NOT NULL,
  email               TEXT,
  address             TEXT,
  role                TEXT NOT NULL,
  contract_type       TEXT,
  contract_start_date TEXT NOT NULL,
  base_salary     REAL NOT NULL CHECK (base_salary >= 0),   -- replaces salary + base_salary
  cnss_amount     REAL CHECK (cnss_amount IS NULL OR cnss_amount >= 0),
  hourly_rate     REAL CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','left')),
  UNIQUE (center_id, cin)                                             -- was globally unique
) STRICT;

CREATE TABLE staff_advances (
  id         TEXT PRIMARY KEY,
  center_id  TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  amount REAL NOT NULL CHECK (amount > 0),
  date       TEXT NOT NULL,
  reason     TEXT NOT NULL,
  status     TEXT NOT NULL
) STRICT;

CREATE TABLE staff_leave_requests (
  id         TEXT PRIMARY KEY,
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  reason     TEXT NOT NULL,
  type       TEXT NOT NULL,
  status     TEXT NOT NULL,
  CHECK (end_date >= start_date)
) STRICT;

CREATE TABLE staff_payments (
  id             TEXT PRIMARY KEY,
  center_id      TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  staff_id       TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  payslip_id     TEXT REFERENCES staff_payslips(id) ON DELETE SET NULL,
  month          TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  amount_paid REAL NOT NULL CHECK (amount_paid >= 0),
  bonus      REAL NOT NULL DEFAULT 0,
  deduction  REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL,
  date           TEXT NOT NULL,
  receipt_number TEXT NOT NULL,
  notes          TEXT,
  UNIQUE (center_id, receipt_number)
) STRICT;

CREATE TABLE staff_payslips (
  id                   TEXT PRIMARY KEY,
  center_id            TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  staff_id             TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  month                TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  base_salary      REAL NOT NULL CHECK (base_salary >= 0),
  bonus            REAL NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  bonus_reason         TEXT,
  cnss_deduction   REAL NOT NULL DEFAULT 0 CHECK (cnss_deduction >= 0),
  absence_deductions REAL NOT NULL DEFAULT 0 CHECK (absence_deductions >= 0),
  advance_deducted REAL NOT NULL DEFAULT 0 CHECK (advance_deducted >= 0),
  extra_hours          REAL,
  extra_hour_rate  REAL,
  extra_hours_amount REAL,
  days_present         INTEGER,
  days_absent          INTEGER,
  days_retard          INTEGER,
  net_salary       REAL NOT NULL,
  issue_date           TEXT NOT NULL,
  UNIQUE (staff_id, month)
) STRICT;

CREATE TABLE staff_schedule (
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  slots    TEXT NOT NULL CHECK (json_valid(slots)),
  PRIMARY KEY (staff_id, day)
) STRICT;

CREATE TABLE staff_subjects (
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  subject  TEXT NOT NULL,
  PRIMARY KEY (staff_id, subject)
) STRICT;

CREATE TABLE student_attendance (
  id         TEXT PRIMARY KEY,
  center_id  TEXT NOT NULL,
  student_id TEXT NOT NULL,
  date       TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status     TEXT NOT NULL CHECK (status IN ('present','absent')),
  notes      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (student_id, date),
  FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE student_parents (
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('mother','father')),
  name         TEXT NOT NULL,
  birth_date   TEXT,
  profession   TEXT,
  address      TEXT,
  phone_fixed  TEXT,
  phone_mobile TEXT,
  email        TEXT,
  extra_phones TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(extra_phones)),
  PRIMARY KEY (student_id, role)
) STRICT;

CREATE TABLE student_service_enrollments (
  id               TEXT PRIMARY KEY,
  center_id        TEXT NOT NULL,
  student_id       TEXT NOT NULL,
  service_key      TEXT NOT NULL REFERENCES services(key),
  school_year      TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  billing_mode     TEXT NOT NULL CHECK (billing_mode IN ('subscription','unit')),
  monthly_price REAL CHECK (monthly_price IS NULL OR monthly_price >= 0),  -- snapshot / negotiated
  annual_price  REAL CHECK (annual_price  IS NULL OR annual_price  >= 0),
  unit_price    REAL CHECK (unit_price    IS NULL OR unit_price    >= 0),
  valid_from       TEXT NOT NULL CHECK (valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  valid_to         TEXT CHECK (valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE (student_id, service_key, school_year, valid_from),
  FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE student_time_sheets (
  id                TEXT PRIMARY KEY,
  center_id         TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT '',
  school_year       TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  establishment_name TEXT NOT NULL,
  grade_level       TEXT NOT NULL,
  branch            TEXT,
  class_name        TEXT,
  weekly_schedule   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(weekly_schedule)),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
) STRICT;

CREATE TABLE student_years (
  student_id       TEXT NOT NULL,
  center_id        TEXT NOT NULL,
  school_year      TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  grade            TEXT NOT NULL,
  etablissement_id TEXT REFERENCES etablissements(id) ON DELETE SET NULL,
  time_sheet_id    TEXT REFERENCES student_time_sheets(id) ON DELETE SET NULL,
  PRIMARY KEY (student_id, school_year),
  FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE students (
  id                                 TEXT PRIMARY KEY,
  center_id                          TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_type                       TEXT NOT NULL DEFAULT 'regular' CHECK (student_type IN ('regular','external','one_time')),
  first_name                         TEXT NOT NULL,
  last_name                          TEXT NOT NULL DEFAULT '',
  birth_date                         TEXT CHECK (birth_date IS NULL OR birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  birth_place                        TEXT,
  contact_phone                      TEXT,                     -- used for external / one-time students
  allergies                          TEXT NOT NULL DEFAULT '',
  parental_situation                 TEXT,
  parental_comments                  TEXT,
  registration_date                  TEXT,
  registration_location              TEXT,
  registration_signed_electronically INTEGER NOT NULL DEFAULT 0 CHECK (registration_signed_electronically IN (0,1)),
  registration_signature_name        TEXT,
  status                             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at                         INTEGER NOT NULL,
  UNIQUE (center_id, id)                                       -- target of composite foreign keys
) STRICT;

CREATE TABLE subjects (
  name TEXT PRIMARY KEY
) STRICT;

CREATE TABLE suivi_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  trimester   INTEGER NOT NULL CHECK (trimester IN (1,2,3)),
  subject     TEXT NOT NULL,
  devoir1     REAL,
  devoir2     REAL,
  synthese    REAL,
  UNIQUE (student_id, school_year, trimester, subject)
) STRICT;

CREATE TABLE timesheets (
  id           TEXT PRIMARY KEY,
  center_id    TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  staff_id     TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date         TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  slot_time    TEXT,
  status       TEXT NOT NULL,
  leave_reason TEXT,
  leave_status TEXT,
  notes        TEXT,
  hours_worked REAL,
  extra_hours  REAL
) STRICT;

CREATE TABLE users (   id            TEXT PRIMARY KEY,   email         TEXT NOT NULL UNIQUE COLLATE NOCASE,   name          TEXT NOT NULL,   role          TEXT NOT NULL CHECK (role IN ('platform_super_admin','admin','restricted_admin')),   description   TEXT NOT NULL DEFAULT '',   password_hash TEXT NOT NULL,   center_id     TEXT REFERENCES centers(id) ON DELETE CASCADE,   created_at    INTEGER NOT NULL,   CHECK ((role = 'platform_super_admin') = (center_id IS NULL)) ) STRICT;