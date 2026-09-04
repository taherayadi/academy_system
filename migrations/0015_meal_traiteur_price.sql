-- Migration 0015: Snapshot traiteur price per meal attendance
-- Ensures price changes (e.g. inflation from 6 DT to 8 DT) do not retroactively alter past financial history.

ALTER TABLE meal_attendances ADD COLUMN traiteur_price REAL;
