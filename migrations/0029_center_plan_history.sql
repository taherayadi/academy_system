-- 0029: per-center plan/subscription audit trail.
-- Every plan mutation (set, scheduled, replaced, settled, removal, trial
-- days, renewals, creation) appends one row so the "Plans & factures" modal
-- can show the full history of a center.
CREATE TABLE IF NOT EXISTS center_plan_history (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  amount REAL,
  invoice_number TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_center_plan_history_center
  ON center_plan_history (center_id, created_at DESC);
