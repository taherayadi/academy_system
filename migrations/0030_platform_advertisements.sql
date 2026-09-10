-- Migration 0030: Platform Advertisements Module
-- Adds advertisement management system with multi-tenant center assignment

-- 1. Platform Advertisements Table
CREATE TABLE IF NOT EXISTS platform_advertisements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date_start INTEGER NOT NULL,
  date_end INTEGER NOT NULL,
  location TEXT NOT NULL, -- 'landing_page' | 'center_admin' | custom text
  image_urls TEXT NOT NULL, -- JSON array of ImageKit CDN URLs
  link_url TEXT DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ads_location ON platform_advertisements(location);
CREATE INDEX IF NOT EXISTS idx_ads_active ON platform_advertisements(is_active, is_published);
CREATE INDEX IF NOT EXISTS idx_ads_dates ON platform_advertisements(date_start, date_end);

-- 2. Advertisement-Centers Junction Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS advertisement_centers (
  advertisement_id TEXT NOT NULL REFERENCES platform_advertisements(id) ON DELETE CASCADE,
  center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  PRIMARY KEY (advertisement_id, center_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_centers_ad ON advertisement_centers(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_centers_center ON advertisement_centers(center_id);
