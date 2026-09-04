-- Migration 0014: Multi-service meal attendance (Lunch, Gouter Matin, Gouter Apres-midi)
CREATE TABLE IF NOT EXISTS meal_attendances_new (
  student_id TEXT NOT NULL,
  date TEXT NOT NULL,
  service TEXT NOT NULL DEFAULT 'lunch',
  type TEXT NOT NULL CHECK (type IN ('subscription', 'unit')),
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  PRIMARY KEY (student_id, date, service),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO meal_attendances_new (student_id, date, service, type, paid, paid_at)
SELECT student_id, date, 'lunch', type, paid, paid_at FROM meal_attendances;

DROP TABLE meal_attendances;
ALTER TABLE meal_attendances_new RENAME TO meal_attendances;

CREATE INDEX IF NOT EXISTS idx_meal_attendances_student_id ON meal_attendances(student_id);
