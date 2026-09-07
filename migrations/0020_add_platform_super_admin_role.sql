-- Migration 0020: Add platform_super_admin role to users table
-- SQLite doesn't support modifying CHECK constraints, so we recreate the table.

-- Step 1: Create new users table with updated constraint
CREATE TABLE users_new (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'restricted_admin', 'platform_super_admin', 'admin')),
  description TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

-- Step 2: Copy existing data
INSERT INTO users_new (email, name, role, description, password_hash) SELECT email, name, role, description, password_hash FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 5: Add platform super admin account
-- Email: platform@systemacademy.tn
-- Password: PlatformAdmin2026!
INSERT INTO users (email, name, role, description, password_hash) VALUES
  ('platform@systemacademy.tn', 'مدير المنصة الرئيسي', 'platform_super_admin', 'إدارة المنصة SaaS فقط - بدون صلاحية الدخول للسناتر', '7bbf0487d35eea207efbc20ae0cbaa8166201777c4a38d7607ddf868490dcca1');

