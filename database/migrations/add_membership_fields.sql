-- Migration to add missing membership fields to analytics_data table
-- Run this migration if the columns don't already exist

-- Add individual_memberships column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='analytics_data' AND column_name='individual_memberships') THEN
        ALTER TABLE analytics_data ADD COLUMN individual_memberships INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add family_memberships column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='analytics_data' AND column_name='family_memberships') THEN
        ALTER TABLE analytics_data ADD COLUMN family_memberships INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add unique_customers_count column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='analytics_data' AND column_name='unique_customers_count') THEN
        ALTER TABLE analytics_data ADD COLUMN unique_customers_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Update existing records to calculate individual and family memberships where possible
-- This assumes total_drip_iv_members = individual + family + concierge + corporate
UPDATE analytics_data
SET individual_memberships = GREATEST(0, total_drip_iv_members - concierge_memberships - corporate_memberships - COALESCE(family_memberships, 0))
WHERE individual_memberships = 0 
  AND total_drip_iv_members > 0
  AND family_memberships IS NULL;

-- Add comment to document the membership breakdown
COMMENT ON COLUMN analytics_data.total_drip_iv_members IS 'Total membership count: individual + family + concierge + corporate';
COMMENT ON COLUMN analytics_data.individual_memberships IS 'Number of individual memberships';
COMMENT ON COLUMN analytics_data.family_memberships IS 'Number of family memberships';
COMMENT ON COLUMN analytics_data.concierge_memberships IS 'Number of concierge memberships';
COMMENT ON COLUMN analytics_data.corporate_memberships IS 'Number of corporate memberships';
COMMENT ON COLUMN analytics_data.unique_customers_count IS 'Total unique customers served during the period';