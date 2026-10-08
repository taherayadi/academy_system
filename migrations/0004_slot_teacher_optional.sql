-- 0004 : séances d'étude sans encadrant autorisées
-- etude_slots.teacher_id devient NULLABLE : une حصة دراسية peut être créée
-- sans sélectionner d'enseignant (affiché « غير محدد » côté client).
-- Recette officielle SQLite (12 étapes simplifiée) : reconstruction de la
-- table + de son enfant slot_enrollments (FK ON DELETE CASCADE) pour ne rien
-- perdre. Le dépôt admin possède la séquence de migrations partagée — 0004
-- doit y être miroité avant tout déploiement (voir DEPLOYMENT_SPLIT.md).

CREATE TABLE etude_slots_new (
  id          TEXT PRIMARY KEY,
  center_id   TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  teacher_id  TEXT REFERENCES staff(id) ON DELETE SET NULL,
  is_extra    INTEGER NOT NULL DEFAULT 0 CHECK (is_extra IN (0,1)),
  CHECK (end_time > start_time)
) STRICT;

INSERT INTO etude_slots_new (id, center_id, weekday, start_time, end_time, grade_level, teacher_id, is_extra)
  SELECT id, center_id, weekday, start_time, end_time, grade_level, teacher_id, is_extra FROM etude_slots;

CREATE TABLE slot_enrollments_new (
  slot_id    TEXT NOT NULL REFERENCES etude_slots_new(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (slot_id, student_id)
) STRICT;

INSERT INTO slot_enrollments_new (slot_id, student_id)
  SELECT slot_id, student_id FROM slot_enrollments;

DROP TABLE slot_enrollments;
DROP TABLE etude_slots;
ALTER TABLE etude_slots_new RENAME TO etude_slots;
ALTER TABLE slot_enrollments_new RENAME TO slot_enrollments;
