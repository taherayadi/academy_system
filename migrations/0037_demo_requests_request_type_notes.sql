-- Migration 0037: add the missing `request_type` and `notes` columns to
-- demo_requests (schema drift fix).
--
-- Context: functions/api/demo-requests.ts selects `request_type` and `notes`,
-- and the SPA types DemoRequest accordingly — but no migration ever created
-- those columns: 0018_demo_requests_extension.sql is a documented no-op stub
-- ("Already applied manually or via previous migration - skipping"), so any
-- database built purely from migrations/ lacks them and GET /api/demo-requests
-- fails with D1_ERROR: no such column: request_type (SQLITE_ERROR).
--
-- Additive only (per the shared-database protocol in README.md): CREATE TABLE
-- IF NOT EXISTS-like ALTER ADD COLUMN, no data is touched. Default
-- request_type 'trial' matches the historical pre-drift behavior where every
-- landing-page submission was treated as a trial request (the API already
-- falls back to 'trial' when the column is NULL).
--
-- No destructive statements; the center application is unaffected — it owns
-- the landing-page POST which does not set these columns.

ALTER TABLE demo_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE demo_requests ADD COLUMN notes TEXT NOT NULL DEFAULT '';
