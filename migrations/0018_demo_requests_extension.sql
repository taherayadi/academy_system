-- Migration 0018: Add request_type and notes columns to demo_requests table
ALTER TABLE demo_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE demo_requests ADD COLUMN notes TEXT DEFAULT '';
