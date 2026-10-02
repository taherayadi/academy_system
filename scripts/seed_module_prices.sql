-- Seed module_prices for school years 2025/2026, 2026/2027, 2027/2028.
-- Keys match the modules table in edusphere-cloud-dump.sql.
-- Pricing tiers (TND/month):
--   Core       : scolaire, finance             → 20 TND
--   Standard   : cantine                       → 18 TND
--   Regular    : etude, coursParticuliers,
--                revision, formations,
--                transport, events,
--                activites, competences        → 15 TND
--   Light      : staff                         → 12 TND
--   Unbilled   : studentTimeSheets, bibliotheque → 0 TND
--                (isUnbilled = 1 — bundled/removed, never billed)
--
-- Uses INSERT OR IGNORE — safe to re-run without duplicating rows.
-- Apply locally:  npx wrangler d1 execute academy-system-v2 --local --file=scripts/seed_module_prices.sql
-- Apply remotely: npx wrangler d1 execute academy-system-v2 --remote --file=scripts/seed_module_prices.sql

-- ── 2025/2026 ───────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO module_prices (school_year, module_key, price, created_at) VALUES
  ('2025/2026', 'scolaire',          20.0, 1725753600000),
  ('2025/2026', 'finance',           20.0, 1725753600000),
  ('2025/2026', 'cantine',           18.0, 1725753600000),
  ('2025/2026', 'etude',             15.0, 1725753600000),
  ('2025/2026', 'coursParticuliers', 15.0, 1725753600000),
  ('2025/2026', 'revision',          15.0, 1725753600000),
  ('2025/2026', 'formations',        15.0, 1725753600000),
  ('2025/2026', 'transport',         15.0, 1725753600000),
  ('2025/2026', 'events',            15.0, 1725753600000),
  ('2025/2026', 'activites',         15.0, 1725753600000),
  ('2025/2026', 'competences',       15.0, 1725753600000),
  ('2025/2026', 'staff',             12.0, 1725753600000),
  ('2025/2026', 'studentTimeSheets',  0.0, 1725753600000),
  ('2025/2026', 'bibliotheque',       0.0, 1725753600000);

-- ── 2026/2027 ───────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO module_prices (school_year, module_key, price, created_at) VALUES
  ('2026/2027', 'scolaire',          20.0, 1725753600000),
  ('2026/2027', 'finance',           20.0, 1725753600000),
  ('2026/2027', 'cantine',           18.0, 1725753600000),
  ('2026/2027', 'etude',             15.0, 1725753600000),
  ('2026/2027', 'coursParticuliers', 15.0, 1725753600000),
  ('2026/2027', 'revision',          15.0, 1725753600000),
  ('2026/2027', 'formations',        15.0, 1725753600000),
  ('2026/2027', 'transport',         15.0, 1725753600000),
  ('2026/2027', 'events',            15.0, 1725753600000),
  ('2026/2027', 'activites',         15.0, 1725753600000),
  ('2026/2027', 'competences',       15.0, 1725753600000),
  ('2026/2027', 'staff',             12.0, 1725753600000),
  ('2026/2027', 'studentTimeSheets',  0.0, 1725753600000),
  ('2026/2027', 'bibliotheque',       0.0, 1725753600000);

-- ── 2027/2028 ───────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO module_prices (school_year, module_key, price, created_at) VALUES
  ('2027/2028', 'scolaire',          20.0, 1757289600000),
  ('2027/2028', 'finance',           20.0, 1757289600000),
  ('2027/2028', 'cantine',           18.0, 1757289600000),
  ('2027/2028', 'etude',             15.0, 1757289600000),
  ('2027/2028', 'coursParticuliers', 15.0, 1757289600000),
  ('2027/2028', 'revision',          15.0, 1757289600000),
  ('2027/2028', 'formations',        15.0, 1757289600000),
  ('2027/2028', 'transport',         15.0, 1757289600000),
  ('2027/2028', 'events',            15.0, 1757289600000),
  ('2027/2028', 'activites',         15.0, 1757289600000),
  ('2027/2028', 'competences',       15.0, 1757289600000),
  ('2027/2028', 'staff',             12.0, 1757289600000),
  ('2027/2028', 'studentTimeSheets',  0.0, 1757289600000),
  ('2027/2028', 'bibliotheque',       0.0, 1757289600000);
