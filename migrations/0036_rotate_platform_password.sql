-- Migration 0036: rotate the seeded platform-admin password from the legacy
-- unsalted SHA-256 format to a proper salted bcrypt hash.
--
-- Context: migration 0020 seeded platform@systemacademy.tn with password_hash
-- '7bbf0487d35eea207efbc20ae0cbaa8166201777c4a38d7607ddf868490dcca1' — a raw
-- SHA-256 of a password that is now public in this repo's history. The auth
-- code has since switched to bcrypt ("fix password salt"), so that stored
-- value can never validate and NOBODY can sign in with it anymore.
--
-- This migration rewrites the row to a bcrypt (salted, cost 10) hash of a
-- ONE-TIME temporary password:
--
--     Adm1n-R0tate-M3-N0w!
--
-- It is deliberately public: the very first action after logging in must be
-- an in-app password change (sidebar -> "تغيير كلمة السر"), which re-hashes
-- with a fresh salt and revokes every platform_sessions row.
--
-- Guards:
-- * The UPDATE matches ONLY the exact legacy value, so an out-of-band reset
--   performed before this migration runs is never overwritten.
-- * The INSERT re-creates the account only if the row is missing entirely
--   (fresh or cleaned databases).
-- * Effect is idempotent under wrangler's single-application rule.
-- * Affects the platform account only; center admin rows are untouched and
--   the center application cannot authenticate a platform_super_admin.

INSERT OR IGNORE INTO users (email, name, role, description, password_hash) VALUES
  ('platform@systemacademy.tn', 'مدير المنصة الرئيسي', 'platform_super_admin',
   'إدارة المنصة SaaS فقط - بدون صلاحية الدخول للسناتر',
   '$2b$10$SkJ4BoFb/AyKqpXBhkPM/u1J1gBFu/L30/zdZ96kxct03/5l/oprC');

UPDATE users
SET password_hash = '$2b$10$SkJ4BoFb/AyKqpXBhkPM/u1J1gBFu/L30/zdZ96kxct03/5l/oprC'
WHERE email = 'platform@systemacademy.tn'
  AND password_hash = '7bbf0487d35eea207efbc20ae0cbaa8166201777c4a38d7607ddf868490dcca1';
