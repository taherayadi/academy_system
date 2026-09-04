-- Migration 0012: Multi-Tenancy Architecture (Centers, Scoping & Isolation)
-- Preserves 100% of existing data by attributing all records to the default center UUID.

-- 1. Centers Table
CREATE TABLE IF NOT EXISTS centers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  phone_number TEXT,
  location_city TEXT,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'pro', 'custom')),
  enabled_modules TEXT NOT NULL DEFAULT '["scolaire","finance","etude","coursParticuliers","revision","formations","cantine","transport","events","bibliotheque","studentTimeSheets","staff"]',
  meal_operating_mode TEXT NOT NULL DEFAULT 'external_traiteur' CHECK (meal_operating_mode IN ('external_traiteur', 'in_house_kitchen')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'suspended', 'expired')),
  trial_ends_at INTEGER,
  subscription_ends_at INTEGER,
  created_at INTEGER NOT NULL
);

-- 2. Seed Initial Center (Small Genious)
INSERT OR IGNORE INTO centers (
  id, name, slug, phone_number, location_city, plan, enabled_modules, meal_operating_mode, status, created_at
) VALUES (
  'e1000000-0000-4000-8000-000000000001',
  'Small Genious',
  'small-genious',
  '55000000',
  'Tunis',
  'pro',
  '["scolaire","finance","etude","coursParticuliers","revision","formations","cantine","transport","events","bibliotheque","studentTimeSheets","staff"]',
  'external_traiteur',
  'active',
  1700000000000
);

-- 3. Center Settings (Per-center settings replacing single-row CHECK constraint)
CREATE TABLE IF NOT EXISTS center_settings (
  center_id TEXT PRIMARY KEY REFERENCES centers(id) ON DELETE CASCADE,
  center_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  location_city TEXT NOT NULL,
  gemini_api_key TEXT DEFAULT '',
  meal_operating_mode TEXT NOT NULL DEFAULT 'external_traiteur'
);

INSERT OR IGNORE INTO center_settings (center_id, center_name, phone_number, location_city, gemini_api_key)
SELECT 'e1000000-0000-4000-8000-000000000001', center_name, phone_number, location_city, gemini_api_key
FROM settings WHERE id = 1;

-- 4. Center Fee Sets (Per-center, per-year fee configurations)
CREATE TABLE IF NOT EXISTS center_fee_sets (
  center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
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
  frais_assurance_cours_externes REAL NOT NULL,
  frais_gouter_matin_mensuel REAL DEFAULT 0,
  frais_gouter_matin_unitaire REAL DEFAULT 0,
  frais_gouter_soir_mensuel REAL DEFAULT 0,
  frais_gouter_soir_unitaire REAL DEFAULT 0,
  PRIMARY KEY (center_id, year)
);

INSERT OR IGNORE INTO center_fee_sets (
  center_id, year, frais_annuel_suivi, frais_mensuel_suivi, frais_annuel_bibliotheque,
  frais_mensuel_bibliotheque, frais_abonnement_repas, frais_par_repas,
  frais_abonnement_repas_traiteur, frais_par_repas_traiteur, prix_plat_traiteur,
  frais_annuel_etude, frais_mensuel_etude, frais_assurance_cours_externes
)
SELECT
  'e1000000-0000-4000-8000-000000000001', year, frais_annuel_suivi, frais_mensuel_suivi,
  frais_annuel_bibliotheque, frais_mensuel_bibliotheque, frais_abonnement_repas,
  frais_par_repas, frais_abonnement_repas_traiteur, frais_par_repas_traiteur,
  prix_plat_traiteur, frais_annuel_etude, frais_mensuel_etude, frais_assurance_cours_externes
FROM fee_sets;

-- 5. Add center_id Column to All Domain Tables (defaults to initial center)
ALTER TABLE users ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE students ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE staff ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE expenses ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE etude_slots ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE external_courses ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE external_course_sessions ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE external_students ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE meal_plan_days ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE timesheets ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE student_time_sheets ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE revision_seances ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE formations ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE sessions ADD COLUMN center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001';

-- 6. Demo & Trial Requests Table (From Showcase Landing Page)
CREATE TABLE IF NOT EXISTS demo_requests (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  academy_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  estimated_students TEXT,
  requested_modules TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'archived')),
  created_at INTEGER NOT NULL
);

-- 7. Performance Indexes on center_id
CREATE INDEX IF NOT EXISTS idx_users_center ON users(center_id);
CREATE INDEX IF NOT EXISTS idx_students_center ON students(center_id);
CREATE INDEX IF NOT EXISTS idx_staff_center ON staff(center_id);
CREATE INDEX IF NOT EXISTS idx_expenses_center ON expenses(center_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_center ON timesheets(center_id);
CREATE INDEX IF NOT EXISTS idx_slots_center ON etude_slots(center_id);
CREATE INDEX IF NOT EXISTS idx_courses_center ON external_courses(center_id);
CREATE INDEX IF NOT EXISTS idx_sessions_center ON external_course_sessions(center_id);
CREATE INDEX IF NOT EXISTS idx_ext_students_center ON external_students(center_id);
CREATE INDEX IF NOT EXISTS idx_meal_days_center ON meal_plan_days(center_id);
CREATE INDEX IF NOT EXISTS idx_revisions_center ON revision_seances(center_id);
CREATE INDEX IF NOT EXISTS idx_formations_center ON formations(center_id);
CREATE INDEX IF NOT EXISTS idx_time_sheets_center ON student_time_sheets(center_id);
