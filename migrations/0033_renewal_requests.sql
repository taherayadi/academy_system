-- Migration 0033 : demandes de renouvellement / changement d'offre.
--
-- Un centre peut demander :
--   • renewal — renouveler son offre actuelle, appliqué à la fin de la
--               période en cours (effective_at = échéance actuelle) ;
--   • upgrade — passer à une offre supérieure (Basic → Growth → Pro),
--               appliqué dès l'acceptation par la plateforme.
--
-- La demande est créée avec le statut « pending » ; seul un administrateur
-- plateforme peut l'accepter ou la refuser. L'acceptation met à jour
-- centers.plan / enabled_modules / subscription_ends_at et journalise
-- l'opération dans center_plan_history (migration 0029).
CREATE TABLE IF NOT EXISTS renewal_requests (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'renewal',          -- 'renewal' | 'upgrade'
  current_plan TEXT NOT NULL DEFAULT '',
  current_modules TEXT NOT NULL DEFAULT '[]',    -- JSON : modules au moment de la demande
  requested_plan TEXT NOT NULL,                  -- 'starter' | 'growth' | 'pro' | 'custom'
  requested_modules TEXT NOT NULL DEFAULT '[]',  -- JSON : modules simulés
  billing_cycle TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'annual'
  amount REAL,
  status TEXT NOT NULL DEFAULT 'pending',        -- 'pending' | 'approved' | 'rejected'
  effective_at INTEGER,                          -- prise d'effet souhaitée
  note TEXT NOT NULL DEFAULT '',
  decision_note TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT '',
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_renewal_requests_center
  ON renewal_requests (center_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_renewal_requests_status
  ON renewal_requests (status, created_at DESC);
