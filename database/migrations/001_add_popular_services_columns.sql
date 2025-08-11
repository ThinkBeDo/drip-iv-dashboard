-- Migration: Add popular services tracking columns
-- Date: 2025-01-11
-- Purpose: Add columns for tracking popular infusions and injections

-- Add popular_infusions column (array of service names)
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS popular_infusions TEXT[] DEFAULT ARRAY['Energy', 'NAD+', 'Performance & Recovery'];

-- Add popular_infusions_status column
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS popular_infusions_status VARCHAR(50) DEFAULT 'Active';

-- Add popular_injections column (array of service names)
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS popular_injections TEXT[] DEFAULT ARRAY['Tirzepatide', 'Semaglutide', 'B12'];

-- Add popular_injections_status column
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS popular_injections_status VARCHAR(50) DEFAULT 'Active';

-- Verify columns were added
-- Run this to check: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'analytics_data' AND column_name LIKE 'popular%';