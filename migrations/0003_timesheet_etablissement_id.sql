-- 0003 : liens établissement normalisés pour les emplois du temps élèves
-- student_time_sheets.etablissement_id : la fiche emploi du temps référence
-- l'uuid de la table centralisée etablissements au lieu du seul nom texte
-- (establishment_name reste pour l'affichage / compat descendante).
-- Backfill : les noms déjà connus sont résolus via la table etablissements
-- (UNIQUE (center_id, name)) ; les noms inconnus restent NULL (aucune perte).
-- NB : le dépôt admin possède la séquence de migrations partagée — 0003 doit y
-- être miroité avant tout déploiement (voir DEPLOYMENT_SPLIT.md).

ALTER TABLE student_time_sheets ADD COLUMN etablissement_id TEXT REFERENCES etablissements(id) ON DELETE SET NULL;

UPDATE student_time_sheets
SET etablissement_id = (
  SELECT e.id FROM etablissements e
  WHERE e.center_id = student_time_sheets.center_id
    AND e.name = student_time_sheets.establishment_name
)
WHERE establishment_name IS NOT NULL
  AND establishment_name <> ''
  AND EXISTS (
    SELECT 1 FROM etablissements e
    WHERE e.center_id = student_time_sheets.center_id
      AND e.name = student_time_sheets.establishment_name
  );
