-- Migration 0013: Add logo_url and max_students to centers table
ALTER TABLE centers ADD COLUMN logo_url TEXT;
ALTER TABLE centers ADD COLUMN max_students INTEGER DEFAULT 500;

