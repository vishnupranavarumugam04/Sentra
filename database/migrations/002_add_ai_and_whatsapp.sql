-- Migration: 002_add_ai_and_whatsapp
-- Adds AI classifier fields and WhatsApp source tracking

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS ai_suggested_level TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence INT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';

COMMENT ON COLUMN reports.ai_suggested_level IS 'The damage level suggested by the client-side TensorFlow.js MobileNet model.';
COMMENT ON COLUMN reports.source IS 'The platform the report originated from (e.g. web, whatsapp).';
