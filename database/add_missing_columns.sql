-- Add missing membership tracking columns if they don't exist
-- This migration adds the new membership fields to support the dashboard display

-- Add individual membership columns
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS individual_memberships INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS family_memberships INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS family_concierge_memberships INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS drip_concierge_memberships INTEGER DEFAULT 0;

-- Add new weekly membership signup tracking
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_individual_members_weekly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_family_members_weekly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_concierge_members_weekly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_corporate_members_weekly INTEGER DEFAULT 0;

-- Add customer analytics
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS unique_customers_count INTEGER DEFAULT 0;

-- Update the existing July test data with proper membership values
UPDATE analytics_data 
SET 
    individual_memberships = 105,
    family_memberships = 0,
    family_concierge_memberships = 0,
    drip_concierge_memberships = 0,
    new_individual_members_weekly = 2,
    new_family_members_weekly = 1,
    new_concierge_members_weekly = 0,
    new_corporate_members_weekly = 0,
    unique_customers_count = 173
WHERE week_start_date = '2025-07-07' AND week_end_date = '2025-07-13';