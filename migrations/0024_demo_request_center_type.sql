-- Migration 0024: add center_type to demo_requests (jardin d'enfant / centre de formation)
ALTER TABLE demo_requests ADD COLUMN center_type TEXT NOT NULL DEFAULT '';
