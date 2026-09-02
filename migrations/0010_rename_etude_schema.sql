-- Migration 0010: legacy 'teen_center' -> neutral 'etude' schema rename.
-- 0001_init.sql now creates the schema directly with neutral identifiers
-- (frais_annuel_etude, enrolled_etude, etude_annual_fee, etude_monthly_fee,
-- etude_slots, ...). For a fresh database there is nothing to rename, so this
-- is a no-op. Kept for migration numbering/ordering compatibility.
SELECT 1;
