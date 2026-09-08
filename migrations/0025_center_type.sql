-- Migration 0025: add center_type to centers (jardin d'enfant / centre de formation)
ALTER TABLE centers ADD COLUMN center_type TEXT NOT NULL DEFAULT '';
