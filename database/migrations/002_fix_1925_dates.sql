-- Migration: Fix dates incorrectly stored as 1925 instead of 2025
-- Date: 2025-08-11
-- Purpose: Correct date parsing bug that stored 2025 dates as 1925

-- Fix week_start_date and week_end_date by adding 100 years to 1925 dates
UPDATE analytics_data 
SET 
    week_start_date = week_start_date + INTERVAL '100 years',
    week_end_date = week_end_date + INTERVAL '100 years',
    upload_date = CURRENT_TIMESTAMP
WHERE EXTRACT(YEAR FROM week_start_date) = 1925;

-- Log how many rows were affected
DO $$
DECLARE
    rows_updated INTEGER;
BEGIN
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    IF rows_updated > 0 THEN
        RAISE NOTICE 'Fixed % rows with 1925 dates, updated to 2025', rows_updated;
    ELSE
        RAISE NOTICE 'No 1925 dates found to fix';
    END IF;
END $$;

-- Verify the fix by checking for any remaining 1925 dates
-- This should return 0 rows after the fix
SELECT COUNT(*) as remaining_1925_dates
FROM analytics_data
WHERE EXTRACT(YEAR FROM week_start_date) = 1925;