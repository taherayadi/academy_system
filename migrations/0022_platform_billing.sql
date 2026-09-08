-- Platform billing: module pricing, center subscriptions tracking, and invoicing

-- 1. Module Prices (per school year, editable by platform admin)
CREATE TABLE IF NOT EXISTS module_prices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  school_year TEXT NOT NULL,
  module_key TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (school_year, module_key)
);
CREATE INDEX IF NOT EXISTS idx_module_prices_year ON module_prices(school_year);

-- 2. Add billing columns to centers
ALTER TABLE centers ADD COLUMN billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual'));
ALTER TABLE centers ADD COLUMN monthly_price REAL DEFAULT 0;

-- 3. Center Invoices (platform-level billing ledger)
CREATE TABLE IF NOT EXISTS center_invoices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  center_id TEXT NOT NULL,
  invoice_number TEXT UNIQUE,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  payment_method TEXT,
  payment_date INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_invoices_center ON center_invoices(center_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON center_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON center_invoices(period_start, period_end);

-- Seed default module prices for 2026/2027 (18 TND/module/month average, adjusted by module)
-- Core modules (scolaire, finance): 20 TND
-- Standard modules: 15 TND
-- Light modules (bibliotheque, staff): 12 TND
INSERT INTO module_prices (school_year, module_key, price, created_at) VALUES
  ('2026/2027', 'scolaire', 20.0, 1725753600000),
  ('2026/2027', 'finance', 20.0, 1725753600000),
  ('2026/2027', 'etude', 15.0, 1725753600000),
  ('2026/2027', 'coursParticuliers', 15.0, 1725753600000),
  ('2026/2027', 'revision', 15.0, 1725753600000),
  ('2026/2027', 'formations', 15.0, 1725753600000),
  ('2026/2027', 'cantine', 18.0, 1725753600000),
  ('2026/2027', 'transport', 15.0, 1725753600000),
  ('2026/2027', 'events', 15.0, 1725753600000),
  ('2026/2027', 'bibliotheque', 12.0, 1725753600000),
  ('2026/2027', 'studentTimeSheets', 12.0, 1725753600000),
  ('2026/2027', 'staff', 12.0, 1725753600000);

-- Seed 2027/2028
INSERT INTO module_prices (school_year, module_key, price, created_at) VALUES
  ('2027/2028', 'scolaire', 20.0, 1757289600000),
  ('2027/2028', 'finance', 20.0, 1757289600000),
  ('2027/2028', 'etude', 15.0, 1757289600000),
  ('2027/2028', 'coursParticuliers', 15.0, 1757289600000),
  ('2027/2028', 'revision', 15.0, 1757289600000),
  ('2027/2028', 'formations', 15.0, 1757289600000),
  ('2027/2028', 'cantine', 18.0, 1757289600000),
  ('2027/2028', 'transport', 15.0, 1757289600000),
  ('2027/2028', 'events', 15.0, 1757289600000),
  ('2027/2028', 'bibliotheque', 12.0, 1757289600000),
  ('2027/2028', 'studentTimeSheets', 12.0, 1757289600000),
  ('2027/2028', 'staff', 12.0, 1757289600000);
