-- Migration 0008: seed/refresh the academy_system super_admin account.
-- 0001_init.sql already seeds this account in its SEED DATA, so this is a
-- no-op for fresh deployments. Kept for migration numbering compatibility.
SELECT 1;
