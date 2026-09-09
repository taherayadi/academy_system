-- Migration 0026: daily student attendance for jardin centers (Pointage Élèves)
CREATE TABLE IF NOT EXISTS student_attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  center_id TEXT NOT NULL DEFAULT 'e1000000-0000-4000-8000-000000000001',
  UNIQUE (student_id, date, center_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_attendance_center_date
  ON student_attendance(center_id, date);
CREATE INDEX IF NOT EXISTS idx_student_attendance_student
  ON student_attendance(student_id);
