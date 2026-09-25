-- Activités & Planning (Activities & Weekly Planning) — D1 table `activities`
--
--   This repo does not host the shared migration sequence (it lives in the
--   admin repo, the sole owner of shared D1 migrations). This file is the DDL
--   to apply manually on the shared D1 database through Cloudflare:
--
--     npx wrangler d1 execute academy-system-v2 --remote --file migrations/0038_create_activities_table.sql
--
--   The DDL is idempotent (IF NOT EXISTS): it can safely cross with the
--   official admin-repo migration. Until it is applied, /api/activities reads
--   return an empty list and writes are skipped (the handlers tolerate the
--   missing table) — no production traffic breaks, but the module stays empty.
--
--   Column contract = functions/api/_lib.ts readActivities/writeActivities and
--   the 001-center-types-new-modules data-model.md coordination contract:
--   `id, center_id, title, category, weekday, date, time_start, time_end,
--   location, level_class, staff_id, created_at`.
--   Tenant-scoped by center_id (constitution II); booleans/enum columns stored
--   as TEXT per the existing app convention. No destructive statements.

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  weekday INTEGER,
  date TEXT,
  time_start TEXT NOT NULL,
  time_end TEXT NOT NULL,
  location TEXT,
  level_class TEXT,
  staff_id TEXT,
  created_at TEXT
);

-- Reads filter by the session center and order by created_at, time_start.
CREATE INDEX IF NOT EXISTS idx_activities_center_created ON activities(center_id, created_at, time_start);
