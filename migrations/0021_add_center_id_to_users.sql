-- Migration 0021: Add center_id column to users table
-- Enables center scoping for center admins while platform_super_admin remains NULL (global access)

-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check and only update
-- Assign default center to super_admin (academy_system@gmail.com)
UPDATE users SET center_id = 'e1000000-0000-4000-8000-000000000001' WHERE email = 'academy_system@gmail.com' AND center_id IS NULL;

-- Platform super admin has NULL center_id (platform-wide access)
UPDATE users SET center_id = NULL WHERE role = 'platform_super_admin';

-- Create index for faster lookups (idempotent)
CREATE INDEX IF NOT EXISTS idx_users_center_id ON users(center_id);
