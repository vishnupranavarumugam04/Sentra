-- Migration: 003_add_reporter_scores
-- Adds tables for community incentives and rate limiting

CREATE TABLE IF NOT EXISTS reporters (
  device_fingerprint TEXT PRIMARY KEY,
  display_name TEXT,
  total_reports INT DEFAULT 0,
  verified_reports INT DEFAULT 0,
  spam_reports INT DEFAULT 0,
  score INT DEFAULT 0,
  rank_label TEXT DEFAULT 'Newcomer',
  last_report_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_rate_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_reporter FOREIGN KEY (device_fingerprint) REFERENCES reporters(device_fingerprint) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS rate_log_fingerprint_idx ON report_rate_log(device_fingerprint, submitted_at);
