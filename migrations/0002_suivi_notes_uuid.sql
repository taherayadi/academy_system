-- Migration 0002 : matières (subjects) avec UUID serveur + références subject_id
--
-- 1) subjects gagne un id (UUID v4) : chaque centre référence ses matières
--    par id (jamais de collision entre centres). Le couple (center_id, name)
--    reste unique pour l'upsert par nom.
-- 2) Les tables qui stockaient le nom de la matière référencent désormais
--    subject_id : suivi_notes, external_courses, revision_seances,
--    staff_subjects, formation_matieres.
-- 3) Les lignes existantes sont rétro-liées par (center_id, name).
-- 4) Chaque centre existant reçoit le catalogue de départ (10 matières) s'il
--    n'a aucune matière — le serveur re-seed de toute façon au login si la
--    table du centre est vide (ensureCenterSubjects).
-- NB : SQLite ne peut pas changer le type d'une colonne → reconstruction des
-- tables. Le flux normal d'ajout de matière passe par POST /api/subjects.

-- ── 1. subjects : id UUID ────────────────────────────────────────────────
CREATE TABLE subjects_new (
  id        TEXT PRIMARY KEY,
  center_id TEXT NOT NULL DEFAULT '',
  name      TEXT NOT NULL,
  UNIQUE (center_id, name)
) STRICT;

INSERT INTO subjects_new (id, center_id, name)
SELECT lower(
         hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
         substr(hex(randomblob(2)), 2) || '-' ||
         substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
         hex(randomblob(6))
       ),
       center_id, name
FROM subjects;

DROP TABLE subjects;
ALTER TABLE subjects_new RENAME TO subjects;

-- ── 2. suivi_notes : subject → subject_id ────────────────────────────────
-- Sécurité : crée d'abord toute matière référencée mais absente du catalogue
-- (sinon le backfill échouerait sur subject_id NOT NULL).
INSERT INTO subjects (id, center_id, name)
SELECT DISTINCT lower(
         hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
         substr(hex(randomblob(2)), 2) || '-' ||
         substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
         hex(randomblob(6))
       ),
       st.center_id, n.subject
FROM suivi_notes n JOIN students st ON st.id = n.student_id
WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = n.subject AND s.center_id = st.center_id)
  AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = n.subject AND s.center_id = '');

CREATE TABLE suivi_notes_new (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  trimester   INTEGER NOT NULL CHECK (trimester IN (1,2,3)),
  subject_id  TEXT NOT NULL REFERENCES subjects(id),
  devoir1     REAL,
  devoir2     REAL,
  synthese    REAL,
  UNIQUE (student_id, school_year, trimester, subject_id)
) STRICT;

INSERT INTO suivi_notes_new (id, student_id, school_year, trimester, subject_id, devoir1, devoir2, synthese)
SELECT
  lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
  ),
  n.student_id, n.school_year, n.trimester,
  (SELECT s.id FROM subjects s WHERE s.name = n.subject AND (s.center_id = '' OR s.center_id = (SELECT center_id FROM students WHERE id = n.student_id)) LIMIT 1),
  n.devoir1, n.devoir2, n.synthese
FROM suivi_notes n;

DROP TABLE suivi_notes;
ALTER TABLE suivi_notes_new RENAME TO suivi_notes;

-- ── 3. external_courses : subject → subject_id ───────────────────────────
INSERT INTO subjects (id, center_id, name)
SELECT DISTINCT lower(
         hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
         substr(hex(randomblob(2)), 2) || '-' ||
         substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
         hex(randomblob(6))
       ),
       c.center_id, c.subject
FROM external_courses c
WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = c.subject AND s.center_id = c.center_id)
  AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = c.subject AND s.center_id = '');

CREATE TABLE external_courses_new (
  id               TEXT PRIMARY KEY,
  center_id        TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  school_year      TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  trimester        TEXT NOT NULL,
  grade_level      TEXT NOT NULL,
  subject_id       TEXT NOT NULL REFERENCES subjects(id),
  teacher_name     TEXT NOT NULL,
  teacher_phone    TEXT NOT NULL,
  monthly_fee  REAL NOT NULL CHECK (monthly_fee >= 0),
  teacher_share REAL NOT NULL CHECK (teacher_share >= 0),
  center_share REAL NOT NULL CHECK (center_share >= 0),
  assurance_amount REAL NOT NULL DEFAULT 0,
  CHECK (teacher_share + center_share = monthly_fee)
) STRICT;

INSERT INTO external_courses_new (id, center_id, school_year, trimester, grade_level, subject_id, teacher_name, teacher_phone, monthly_fee, teacher_share, center_share, assurance_amount)
SELECT c.id, c.center_id, c.school_year, c.trimester, c.grade_level,
       (SELECT s.id FROM subjects s WHERE s.name = c.subject AND (s.center_id = '' OR s.center_id = c.center_id) LIMIT 1),
       c.teacher_name, c.teacher_phone, c.monthly_fee, c.teacher_share, c.center_share, c.assurance_amount
FROM external_courses c;

DROP TABLE external_courses;
ALTER TABLE external_courses_new RENAME TO external_courses;

-- ── 4. revision_seances : subject → subject_id ───────────────────────────
INSERT INTO subjects (id, center_id, name)
SELECT DISTINCT lower(
         hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
         substr(hex(randomblob(2)), 2) || '-' ||
         substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
         hex(randomblob(6))
       ),
       r.center_id, r.subject
FROM revision_seances r
WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = r.subject AND s.center_id = r.center_id)
  AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = r.subject AND s.center_id = '');

CREATE TABLE revision_seances_new (
  id                TEXT PRIMARY KEY,
  center_id         TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  school_year       TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  trimester         TEXT NOT NULL,
  grade_level       TEXT NOT NULL,
  subject_id        TEXT NOT NULL REFERENCES subjects(id),
  teacher_name      TEXT NOT NULL,
  teacher_phone     TEXT NOT NULL,
  date              TEXT NOT NULL,
  teacher_share REAL NOT NULL CHECK (teacher_share >= 0),
  center_share  REAL NOT NULL CHECK (center_share >= 0)
) STRICT;

INSERT INTO revision_seances_new (id, center_id, school_year, trimester, grade_level, subject_id, teacher_name, teacher_phone, date, teacher_share, center_share)
SELECT r.id, r.center_id, r.school_year, r.trimester, r.grade_level,
       (SELECT s.id FROM subjects s WHERE s.name = r.subject AND (s.center_id = '' OR s.center_id = r.center_id) LIMIT 1),
       r.teacher_name, r.teacher_phone, r.date, r.teacher_share, r.center_share
FROM revision_seances r;

DROP TABLE revision_seances;
ALTER TABLE revision_seances_new RENAME TO revision_seances;

-- ── 5. staff_subjects : subject → subject_id ─────────────────────────────
INSERT INTO subjects (id, center_id, name)
SELECT DISTINCT lower(
         hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
         substr(hex(randomblob(2)), 2) || '-' ||
         substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
         hex(randomblob(6))
       ),
       st.center_id, ss.subject
FROM staff_subjects ss JOIN staff st ON st.id = ss.staff_id
WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = ss.subject AND s.center_id = st.center_id)
  AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = ss.subject AND s.center_id = '');

CREATE TABLE staff_subjects_new (
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  PRIMARY KEY (staff_id, subject_id)
) STRICT;

INSERT INTO staff_subjects_new (staff_id, subject_id)
SELECT ss.staff_id,
       (SELECT s.id FROM subjects s WHERE s.name = ss.subject AND (s.center_id = '' OR s.center_id = (SELECT center_id FROM staff WHERE id = ss.staff_id)) LIMIT 1)
FROM staff_subjects ss;

DROP TABLE staff_subjects;
ALTER TABLE staff_subjects_new RENAME TO staff_subjects;

-- ── 6. formation_matieres : subject → subject_id ─────────────────────────
INSERT INTO subjects (id, center_id, name)
SELECT DISTINCT lower(
         hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
         substr(hex(randomblob(2)), 2) || '-' ||
         substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
         hex(randomblob(6))
       ),
       f.center_id, m.subject
FROM formation_matieres m JOIN formations f ON f.id = m.formation_id
WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = m.subject AND s.center_id = f.center_id)
  AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.name = m.subject AND s.center_id = '');

CREATE TABLE formation_matieres_new (
  id           TEXT PRIMARY KEY,
  formation_id TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  subject_id   TEXT NOT NULL REFERENCES subjects(id)
) STRICT;

INSERT INTO formation_matieres_new (id, formation_id, subject_id)
SELECT m.id, m.formation_id,
       (SELECT s.id FROM subjects s WHERE s.name = m.subject AND (s.center_id = '' OR s.center_id = (SELECT center_id FROM formations WHERE id = m.formation_id)) LIMIT 1)
FROM formation_matieres m;

DROP TABLE formation_matieres;
ALTER TABLE formation_matieres_new RENAME TO formation_matieres;

-- ── 7. Seed du catalogue de départ pour les centres sans matière ─────────
INSERT OR IGNORE INTO subjects (id, center_id, name)
SELECT lower(
         hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
         substr(hex(randomblob(2)), 2) || '-' ||
         substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
         hex(randomblob(6))
       ),
       c.id, g.name
FROM centers c
CROSS JOIN (VALUES
  ('الرياضيات (Mathématiques)'), ('الفيزياء والكيمياء (Physique-Chimie)'),
  ('علوم الحياة والأرض (SVT)'), ('اللغة العربية (Arabe)'),
  ('اللغة الفرنسية (Français)'), ('اللغة الإنجليزية (Anglais)'),
  ('الإعلامية (Informatique)'), ('الفلسفة (Philosophie)'),
  ('التاريخ والجغرافيا (Histoire-Géo)'), ('الإقتصاد والتصرف (Économie-Gestion)')
) AS g(name)
WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.center_id = c.id);
