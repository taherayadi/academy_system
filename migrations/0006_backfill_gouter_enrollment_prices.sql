-- ─── Backfill des prix Goûter sur les inscriptions existantes ───────────────
-- Contexte : les lignes `student_service_enrollments` créées pour les Goûters
-- l'étaient avec monthly_price / unit_price = NULL (le code ne transmettait
-- aucun prix). Les tarifs vivent dans `center_service_prices`
-- (service_key = gouter_matin / gouter_apres_midi / gouter_both,
--  billing_period = month / unit).
--
-- On complète UNIQUEMENT les valeurs NULL : une inscription qui porte déjà un
-- prix (saisi ou négocié) n'est jamais écrasée. La résolution privilégie :
--   1. l'année scolaire de l'inscription,
--   2. la ligne DEFAULT,
--   3. la ligne la plus récente.
--
-- Idempotent : relancer la migration ne modifie plus rien.

UPDATE student_service_enrollments
SET monthly_price = (
  SELECT p.price
  FROM center_service_prices p
  WHERE p.center_id = student_service_enrollments.center_id
    AND p.service_key = student_service_enrollments.service_key
    AND p.billing_period = 'month'
  ORDER BY
    CASE
      WHEN p.school_year = student_service_enrollments.school_year THEN 0
      WHEN p.school_year = 'DEFAULT' THEN 1
      ELSE 2
    END,
    p.valid_from DESC
  LIMIT 1
)
WHERE service_key IN ('gouter_matin', 'gouter_apres_midi', 'gouter_both')
  AND monthly_price IS NULL;

UPDATE student_service_enrollments
SET unit_price = (
  SELECT p.price
  FROM center_service_prices p
  WHERE p.center_id = student_service_enrollments.center_id
    AND p.service_key = student_service_enrollments.service_key
    AND p.billing_period = 'unit'
  ORDER BY
    CASE
      WHEN p.school_year = student_service_enrollments.school_year THEN 0
      WHEN p.school_year = 'DEFAULT' THEN 1
      ELSE 2
    END,
    p.valid_from DESC
  LIMIT 1
)
WHERE service_key IN ('gouter_matin', 'gouter_apres_midi', 'gouter_both')
  AND unit_price IS NULL;
