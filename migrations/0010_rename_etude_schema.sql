-- Replace legacy branded schema identifiers with neutral Étude identifiers.
ALTER TABLE fee_sets RENAME COLUMN frais_annuel_etude_teen_center TO frais_annuel_etude;
ALTER TABLE fee_sets RENAME COLUMN frais_mensuel_etude_teen_center TO frais_mensuel_etude;
ALTER TABLE fee_sets RENAME COLUMN frais_assurance_cours_hors_teen_center TO frais_assurance_cours_externes;

ALTER TABLE students RENAME COLUMN enrolled_teen_center TO enrolled_etude;
ALTER TABLE students RENAME COLUMN teen_center_annual_fee TO etude_annual_fee;
ALTER TABLE students RENAME COLUMN teen_center_monthly_fee TO etude_monthly_fee;

ALTER TABLE teen_center_slots RENAME TO etude_slots;

UPDATE payments
SET service = CASE
  WHEN service IN ('Étude Teen Center', 'Étude Academy System') THEN 'Étude'
  WHEN service = 'Inscription' THEN 'Inscription Suivi'
  WHEN service = 'Bibliothèque' AND month LIKE 'Annuel%' THEN 'Inscription Bibliothèque'
  ELSE service
END;
