-- Migration 0010: legacy branded schema identifiers renamed to neutral 'etude'
-- identifiers. 0001_init.sql now creates the schema directly with the neutral
-- names (frais_annuel_etude, enrolled_etude, etude_annual_fee, etude_monthly_fee,
-- etude_slots, ...), so for a fresh database there is nothing left to rename and
-- this migration is a no-op. Kept for migration numbering/ordering compatibility.
SELECT 1;
