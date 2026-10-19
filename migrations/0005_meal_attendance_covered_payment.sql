-- 0005 : contrainte covered_by_payment_id + périodicité des paiements repas
--
-- La table meal_attendances existe déjà en production : on la reconstruit
-- pour ajouter la contrainte CHECK sans perdre les pointages.
--
-- La contrainte interdit le statut 'covered_by_subscription' sans paiement
-- lié. Avant la copie, on relie donc les anciens pointages au paiement
-- mensuel correspondant. Ceux qui n'ont aucun paiement identifiable
-- repassent en 'paid' (même règle que l'API) : le client traite déjà
-- 'paid' et 'covered_by_subscription' de la même manière.
--
-- On corrige aussi l'historique payments : les abonnements Repas/Goûter
-- étaient enregistrés à tort en billing_period='unit' alors qu'ils ont un
-- period_month (donc un abonnement mensuel).

-- 1) Réaligner les clés de mois sur l'année scolaire.
--    « Janvier (2026/2027) » doit produire '2027-01', pas '2026-01'.
UPDATE payments
SET period_month =
  (CASE
     WHEN CAST(substr(period_month, 6, 2) AS INTEGER) >= 9
       THEN substr(school_year, 1, 4)
     ELSE substr(school_year, 6, 4)
   END) || '-' || substr(period_month, 6, 2)
WHERE service_key IN ('lunch', 'gouter_matin', 'gouter_apres_midi', 'gouter_both')
  AND period_month IS NOT NULL
  AND school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]';

-- 2) Les paiements repas/goûter avec period_month sont des abonnements
--    mensuels, même si l'ancien code les a écrits en 'unit'.
UPDATE payments
SET billing_period = 'month'
WHERE service_key IN ('lunch', 'gouter_matin', 'gouter_apres_midi', 'gouter_both')
  AND billing_period = 'unit'
  AND period_month IS NOT NULL;

-- 3) Relier chaque pointage « couvert par abonnement » à son paiement
--    mensuel réel (même règle que findCoveringMealPaymentId côté API).
UPDATE meal_attendances
SET covered_by_payment_id = (
  SELECT p.id
  FROM payments p
  WHERE p.center_id = meal_attendances.center_id
    AND p.student_id = meal_attendances.student_id
    AND p.period_month = substr(meal_attendances.date, 1, 7)
    AND p.is_refund = 0
    AND p.amount > 0
    AND (
      (meal_attendances.service_key = 'lunch' AND p.service_key = 'lunch')
      OR (
        meal_attendances.service_key IN ('gouter_matin', 'gouter_apres_midi')
        AND p.service_key IN ('gouter_matin', 'gouter_apres_midi', 'gouter_both')
      )
    )
  ORDER BY p.date DESC, p.created_at DESC
  LIMIT 1
)
WHERE status = 'covered_by_subscription'
  AND covered_by_payment_id IS NULL;

-- 4) Sans paiement identifiable, conserver l'information « payé » mais
--    passer en 'paid' pour satisfaire la contrainte.
UPDATE meal_attendances
SET status = 'paid'
WHERE status = 'covered_by_subscription'
  AND covered_by_payment_id IS NULL;

-- 5) Reconstruction de la table avec la contrainte (aucune autre table ne
--    référence meal_attendances, donc le remplacement est sûr).
CREATE TABLE meal_attendances_new (
  center_id             TEXT NOT NULL,
  student_id            TEXT NOT NULL,
  date                  TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  service_key           TEXT NOT NULL CHECK (service_key IN ('lunch','gouter_matin','gouter_apres_midi')),
  billing_mode          TEXT NOT NULL CHECK (billing_mode IN ('subscription','unit')),
  status                TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','covered_by_subscription','void')),
  paid_payment_id       TEXT,
  covered_by_payment_id TEXT,
  mode_snapshot         TEXT CHECK (mode_snapshot IS NULL OR mode_snapshot IN ('external_traiteur','in_house_kitchen')),
  unit_price            REAL CHECK (unit_price IS NULL OR unit_price >= 0),
  traiteur_share        REAL CHECK (traiteur_share IS NULL OR traiteur_share >= 0),
  center_share          REAL CHECK (center_share IS NULL OR center_share >= 0),
  created_at            INTEGER NOT NULL,
  PRIMARY KEY (student_id, date, service_key),
  CHECK (status <> 'covered_by_subscription' OR covered_by_payment_id IS NOT NULL),
  FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE CASCADE,
  FOREIGN KEY (center_id, paid_payment_id) REFERENCES payments(center_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (center_id, covered_by_payment_id) REFERENCES payments(center_id, id) ON DELETE RESTRICT
) STRICT;

INSERT INTO meal_attendances_new (
  center_id, student_id, date, service_key, billing_mode, status,
  paid_payment_id, covered_by_payment_id, mode_snapshot,
  unit_price, traiteur_share, center_share, created_at
)
SELECT
  center_id, student_id, date, service_key, billing_mode, status,
  paid_payment_id, covered_by_payment_id, mode_snapshot,
  unit_price, traiteur_share, center_share, created_at
FROM meal_attendances;

DROP TABLE meal_attendances;
ALTER TABLE meal_attendances_new RENAME TO meal_attendances;
