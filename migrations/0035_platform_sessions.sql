-- Migration 0035 — dedicated platform sessions for the SaaS admin app
-- (repository: academy_system_admin).
--
-- Ownership note: this migrations/ folder is the SOLE owner of the schema of
-- the shared D1 database `academy-system-v2`. The center application
-- (academy_system) must never add or edit migrations; it declares this repo
-- as the schema owner and only reads the tables through its bound DB.
--
-- Why a new table:
--   The combined app authenticated BOTH center users and the platform admin
--   through one `sessions` table and one `tc_session` cookie. Splitting the
--   two applications requires that the platform console only ever honours
--   its OWN session store — a `tc_session` value minted by the center app must
--   not authenticate against the platform API, and platform sessions must not
--   be consumed by the center app. The center application keeps reading the
--   legacy `sessions` table (its own migration stream is retired).
--
-- platform_sessions rows hold ONLY platform_super_admin identities: the login
-- handler rejects every other role before a token is created, and session
-- validation re-checks the role against the users table on every request.
-- No data is moved or deleted here: existing `sessions` rows stay owned by
-- the center application during the migration window.

CREATE TABLE IF NOT EXISTS platform_sessions (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_sessions_expires_at
  ON platform_sessions (expires_at);
