-- Migration 0019: Meal forfait closure tracking (Case C - "forfait ferme")
-- When a month is closed, unconsumed prepaid subscription balance becomes center profit.
-- Snapshot at closure time to freeze amounts even if payments change later.

CREATE TABLE IF NOT EXISTS meal_forfait_closures (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001',
  month TEXT NOT NULL,
  school_year TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_forfait_closure_items (
  id TEXT PRIMARY KEY,
  closure_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  net_paid REAL NOT NULL,
  consumed_subscription_meals INTEGER NOT NULL,
  frais_par_repas REAL NOT NULL,
  amount REAL NOT NULL,
  FOREIGN KEY (closure_id) REFERENCES meal_forfait_closures(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_forfait_closures_center ON meal_forfait_closures(center_id);
CREATE INDEX IF NOT EXISTS idx_meal_forfait_closures_year_month ON meal_forfait_closures(center_id, school_year, month);
CREATE INDEX IF NOT EXISTS idx_meal_forfait_closure_items_closure ON meal_forfait_closure_items(closure_id);
