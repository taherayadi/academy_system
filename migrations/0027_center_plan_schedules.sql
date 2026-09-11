-- Scheduled plan changes (applied at the end of the current paid period)
--
-- Mid-period plan changes that LOWER the price (downgrades) are applied at
-- the next renewal instead of immediately, and the platform admin may also
-- explicitly schedule an upgrade to take effect at the end of the current
-- period instead of settling a prorated adjustment right away.
--
-- to_plan uses the storage value ('starter' = Basic, 'growth', 'pro',
-- 'custom'), matching centers.plan. apply_at is the subscription_ends_at of
-- the current window; a schedule becomes eligible once the window is over.

CREATE TABLE IF NOT EXISTS center_plan_schedules (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  to_plan TEXT NOT NULL CHECK (to_plan IN ('starter', 'growth', 'pro', 'custom')),
  to_billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (to_billing_cycle IN ('monthly', 'annual')),
  to_enabled_modules TEXT NOT NULL DEFAULT '[]',
  to_monthly_price REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'cancelled')),
  apply_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  applied_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_plan_schedules_center ON center_plan_schedules(center_id, status);
