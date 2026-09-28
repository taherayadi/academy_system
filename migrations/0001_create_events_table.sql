-- Événements & Sorties (Events & Outings) — D1 table `events`
--
--   This repo does not host the shared migration sequence (it lives in the
--   admin repo). This file is the DDL to apply manually on the shared D1
--   database through Cloudflare:
--
--     npx wrangler d1 execute academy-system-v2 --remote --file migrations/0001_create_events_table.sql
--
--   The DDL is idempotent (IF NOT EXISTS): it can safely cross with the
--   official admin-repo migration.

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  date TEXT NOT NULL,
  time TEXT,
  location TEXT NOT NULL,
  price_student REAL NOT NULL DEFAULT 0,
  price_parent REAL NOT NULL DEFAULT 0,
  price_sibling REAL NOT NULL DEFAULT 0,
  price_external REAL NOT NULL DEFAULT 0,
  max_capacity INTEGER,
  bus_included INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned',
  school_year TEXT NOT NULL DEFAULT '',
  participants TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_center_date ON events(center_id, date DESC);