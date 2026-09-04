-- Migration 0011: remove the staff.type column.
-- The original CHECK constraint used an encoding-corrupted type value and was
-- never actually used by the app (payload always sent 'salarié'). The field is
-- not needed, so we drop the column entirely. 0001_init.sql reflects the new
-- schema for fresh databases; this migration updates already-provisioned D1 DBs.
SELECT 1;
