-- Migration 003: Add membership_registry table for idempotent membership tracking
-- This table tracks the first time each membership appears in our uploads
-- to prevent double counting across weeks

CREATE TABLE IF NOT EXISTS membership_registry (
  member_key TEXT PRIMARY KEY,                  -- normalized Patient + membership_type
  patient TEXT NOT NULL,
  membership_type TEXT NOT NULL,               -- one of: individual|family|concierge|corporate
  title_raw TEXT NOT NULL,                     -- original Title string from upload
  start_date DATE NOT NULL,
  first_seen_week DATE NOT NULL,               -- Monday of the week we first saw this in an upload
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_membership_registry_type ON membership_registry (membership_type);
CREATE INDEX IF NOT EXISTS idx_membership_registry_first_seen ON membership_registry (first_seen_week);
CREATE INDEX IF NOT EXISTS idx_membership_registry_patient ON membership_registry (patient);

-- Add comments for documentation
COMMENT ON TABLE membership_registry IS 'Tracks first appearance of memberships to prevent double counting across weekly uploads';
COMMENT ON COLUMN membership_registry.member_key IS 'Unique key: lowercase(patient) + "|" + membership_type';
COMMENT ON COLUMN membership_registry.first_seen_week IS 'Monday of the week this membership first appeared in our system';
COMMENT ON COLUMN membership_registry.membership_type IS 'Normalized membership type: individual, family, concierge, or corporate';