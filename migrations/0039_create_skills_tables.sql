-- Compétences & Skills — D1 tables `skills` + `skill_evaluations`
--
--   This repo does not host the shared migration sequence (it lives in the
--   admin repo, the sole owner of shared D1 migrations). This file is the DDL
--   to apply manually on the shared D1 database through Cloudflare:
--
--     npx wrangler d1 execute academy-system-v2 --remote --file migrations/0039_create_skills_tables.sql
--
--   The DDL is idempotent (IF NOT EXISTS): it can safely cross with the
--   official admin-repo migration. Until it is applied, /api/skills reads
--   return an empty document and writes are skipped (the handlers tolerate
--   the missing tables) — no production traffic breaks, but the module stays
--   empty.
--
--   Column contract = functions/api/_lib.ts readSkills/writeSkills and the
--   001-center-types-new-modules data-model.md coordination contract:
--   skills            → `id, center_id, domain, label, age_from, age_to, created_at`
--   skill_evaluations → `id, center_id, student_id, skill_id, level,
--                        evaluated_by_staff_id, evaluated_by_name, evaluated_at`
--   `level` enum is enforced by the handler (non_evalue|emergent|en_cours|acquis),
--   not by a CHECK constraint, to keep the DDL aligned with the test mock.
--   No destructive statements.

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  label TEXT NOT NULL,
  age_from INTEGER,
  age_to INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS skill_evaluations (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  level TEXT NOT NULL,
  evaluated_by_staff_id TEXT,
  evaluated_by_name TEXT,
  evaluated_at TEXT NOT NULL
);

-- Reads filter by the session center; the skills read orders by domain, label.
CREATE INDEX IF NOT EXISTS idx_skills_center ON skills(center_id, domain, label);
CREATE INDEX IF NOT EXISTS idx_skill_evaluations_center ON skill_evaluations(center_id, student_id);
