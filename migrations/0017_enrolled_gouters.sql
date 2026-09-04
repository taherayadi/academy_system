-- Migration 0017: Add Gouter subscription columns to students table
ALTER TABLE students ADD COLUMN enrolled_gouter_matin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN enrolled_gouter_soir INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN enrolled_gouter_both INTEGER NOT NULL DEFAULT 0;
