-- Migration to add missing service count columns
-- Run this on Railway database to enable service counting

-- Add weight loss injection tracking
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS semaglutide_injections_weekly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS semaglutide_injections_monthly INTEGER DEFAULT 0;

-- Already have new membership columns from previous migration
-- but let's ensure they exist
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_individual_members_weekly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_family_members_weekly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_concierge_members_weekly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_corporate_members_weekly INTEGER DEFAULT 0;

-- Add monthly versions too
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_individual_members_monthly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_family_members_monthly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_concierge_members_monthly INTEGER DEFAULT 0;

ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS new_corporate_members_monthly INTEGER DEFAULT 0;

-- Verify all columns exist
SELECT 
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'analytics_data'
AND column_name IN (
    'semaglutide_injections_weekly',
    'semaglutide_injections_monthly',
    'new_individual_members_weekly',
    'new_family_members_weekly',
    'new_concierge_members_weekly',
    'new_corporate_members_weekly',
    'new_individual_members_monthly',
    'new_family_members_monthly',
    'new_concierge_members_monthly',
    'new_corporate_members_monthly',
    'iv_infusions_weekend_weekly',
    'iv_infusions_weekend_monthly',
    'injections_weekend_weekly',
    'injections_weekend_monthly'
)
ORDER BY column_name;