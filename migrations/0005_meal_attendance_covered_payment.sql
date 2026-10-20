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

-- 4) Sans paiement identifiable, on ne peut conserver ni « couvert » ni
--    « payé » (les deux contraintes exigent un payment_id). On repasse en
--    'unpaid' : le client affichera le pointage comme non payé.
UPDATE meal_attendances
SET status = 'unpaid'
WHERE status = 'covered_by_subscription'
  AND covered_by_payment_id IS NULL;

-- 4bis) Même règle pour les anciens pointages unitaires marqués 'paid'
--      sans paid_payment_id. On tente d'abord de retrouver le paiement
--      unitaire du même jour (period_month NULL).
UPDATE meal_attendances
SET paid_payment_id = (
  SELECT p.id
  FROM payments p
  WHERE p.center_id = meal_attendances.center_id
    AND p.student_id = meal_attendances.student_id
    AND p.date = meal_attendances.date
    AND p.period_month IS NULL
    AND p.billing_period = 'unit'
    AND p.is_refund = 0
    AND p.amount > 0
    AND (
      (meal_attendances.service_key = 'lunch' AND p.service_key = 'lunch')
      OR (
        meal_attendances.service_key IN ('gouter_matin', 'gouter_apres_midi')
        AND p.service_key IN ('gouter_matin', 'gouter_apres_midi', 'gouter_both')
      )
    )
  ORDER BY p.created_at DESC
  LIMIT 1
)
WHERE status = 'paid'
  AND paid_payment_id IS NULL;

UPDATE meal_attendances
SET status = 'unpaid'
WHERE status = 'paid'
  AND paid_payment_id IS NULL;

-- 5) Le pointage est exposé par la vue v_meal_center_income. SQLite refuse
--    le RENAME tant que cette vue pointe vers l'ancienne table : on la
--    recrée après la reconstruction (même définition que la production).
DROP VIEW IF EXISTS v_meal_center_income;

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
  CHECK (status <> 'paid' OR paid_payment_id IS NOT NULL),
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

-- 6) Recréer les index de production perdus avec l'ancienne table.
CREATE INDEX IF NOT EXISTS idx_meal_att_center_date
  ON meal_attendances(center_id, date, service_key);

CREATE INDEX IF NOT EXISTS idx_meal_att_status
  ON meal_attendances(center_id, status)
  WHERE status = 'unpaid';

-- 7) Recréer la vue qui agrège les revenus cantine par mois/service/mode.
CREATE VIEW v_meal_center_income AS
SELECT center_id, substr(date, 1, 7) AS month, service_key, mode_snapshot,
       COUNT(*)                  AS meals,
       SUM(unit_price)           AS gross,
       SUM(traiteur_share)       AS traiteur,
       SUM(center_share)         AS center
FROM meal_attendances
WHERE status IN ('paid','covered_by_subscription')
GROUP BY center_id, substr(date, 1, 7), service_key, mode_snapshot;
