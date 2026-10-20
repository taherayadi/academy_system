-- ─── Salles (gestion des salles — التكوينات والدورات) ──────────────────────
-- Chaque centre gère ses propres salles. La grille horaire des formations
-- (formations.schedule, JSON côté client) référence la salle par son ID via
-- FormationSeance.salle ; la disponibilité est déduite des plages horaires.
--
-- `equipment` est stocké en CSV dans la colonne TEXT : l'API (`_lib.ts`,
-- `parseEquipmentCsv`) l'expose comme string[] — un item par entrée du
-- catalog statique `SALLE_EQUIPMENT_OPTIONS` côté client. La colonne reste
-- TEXT volontairement (STRICT) : la conversion se fait à la frontière API.

CREATE TABLE IF NOT EXISTS salles (
  id         TEXT PRIMARY KEY,
  center_id  TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  equipment  TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (center_id, name)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_salles_center ON salles(center_id);
