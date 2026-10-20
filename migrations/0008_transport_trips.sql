-- ─── Manual transport trips ────────────────────────────────────────────────
-- Les sorties de bus ne sont PLUS générées automatiquement à partir des
-- emplois du temps des élèves. Chaque centre crée ses propres trajets
-- manuellement, avec un chauffeur (`staff_id`) et une liste d'élèves.
--
-- `weekday` suit la convention ISO : 1 = lundi … 7 = dimanche.
-- `trip_type` :
--   • to_school : départ du centre vers les établissements
--   • to_center : retour des établissements vers le centre

-- `staff_id` et `student_id` sont volontairement SANS clé étrangère vers
-- staff/students : une restauration complète (/api/state) supprime puis
-- recrée ces lignes. Sans FK, les trajets manuels survivent à la restauration.
-- L'API valide toujours l'appartenance au centre avant d'écrire.
CREATE TABLE IF NOT EXISTS transport_trips (
  id             TEXT PRIMARY KEY,
  center_id      TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  staff_id       TEXT,
  weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  departure_time TEXT NOT NULL CHECK (departure_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  trip_type      TEXT NOT NULL CHECK (trip_type IN ('to_school','to_center')),
  notes          TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS transport_trip_students (
  trip_id    TEXT NOT NULL REFERENCES transport_trips(id) ON DELETE CASCADE,
  center_id  TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, student_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_transport_trips_center_day
  ON transport_trips(center_id, weekday, departure_time);

CREATE INDEX IF NOT EXISTS idx_transport_trip_students_trip
  ON transport_trip_students(trip_id, position);

CREATE INDEX IF NOT EXISTS idx_transport_trip_students_center
  ON transport_trip_students(center_id, student_id);
