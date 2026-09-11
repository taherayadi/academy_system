-- Migration 0031: advertisement display positions (IAB-style formats).
-- An ad may carry several positions; stored as a JSON array of format ids:
--   leaderboard_728x90 | medium_rectangle_300x250 | mobile_leaderboard_320x50 | skyscraper_160x600
ALTER TABLE platform_advertisements ADD COLUMN positions TEXT NOT NULL DEFAULT '[]';
