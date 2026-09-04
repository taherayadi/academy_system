-- Migration 0016: Monthly fee for taking both morning and afternoon snacks
ALTER TABLE center_fee_sets ADD COLUMN frais_deux_gouters_mensuel REAL DEFAULT 0;
