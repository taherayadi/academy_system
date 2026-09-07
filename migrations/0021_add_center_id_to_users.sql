-- Migration 0021: Add center_id column to users table
-- Enables center scoping for center admins while platform_super_admin remains NULL (global access)

ALTER TABLE users ADD COLUMN center_id TEXT;

-- Update platform super admin to have NULL center_id (platform-wide access)
UPDATE users SET center_id = NULL WHERE role = 'platform_super_admin';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_center_id ON users(center_id);
