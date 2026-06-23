-- Migration: 001_add_landmark_description
-- Adds landmark_description column to the reports table for GPS fallback.
-- Safe to run on existing databases; column is already present in schema.sql for fresh installs.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS landmark_description TEXT;

-- Backfill existing rows with empty string so we have a consistent NOT-NULL feel
-- (column is nullable by design — NULL means "not provided")
COMMENT ON COLUMN reports.landmark_description IS
  'Free-text location description provided by the reporter when GPS / map pin are unavailable.';
