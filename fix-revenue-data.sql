-- FIX REVENUE DATA SWAP
-- This SQL script fixes the swapped weekly/monthly revenue values in the production database

-- First, check current values
SELECT 
    id,
    week_start_date,
    week_end_date,
    actual_weekly_revenue,
    actual_monthly_revenue,
    drip_iv_revenue_weekly,
    drip_iv_revenue_monthly,
    semaglutide_revenue_weekly,
    semaglutide_revenue_monthly,
    CASE 
        WHEN actual_weekly_revenue > actual_monthly_revenue 
        THEN 'NEEDS FIX' 
        ELSE 'OK' 
    END as status
FROM analytics_data 
ORDER BY week_start_date DESC 
LIMIT 5;

-- Fix the swapped values where weekly > monthly (which is impossible)
UPDATE analytics_data 
SET 
    -- Swap the total revenue values
    actual_weekly_revenue = actual_monthly_revenue,
    actual_monthly_revenue = actual_weekly_revenue,
    -- Swap the IV revenue values  
    drip_iv_revenue_weekly = drip_iv_revenue_monthly,
    drip_iv_revenue_monthly = drip_iv_revenue_weekly,
    -- Swap the semaglutide revenue values
    semaglutide_revenue_weekly = semaglutide_revenue_monthly,
    semaglutide_revenue_monthly = semaglutide_revenue_weekly
WHERE actual_weekly_revenue > actual_monthly_revenue;

-- Verify the fix
SELECT 
    id,
    week_start_date,
    week_end_date,
    actual_weekly_revenue,
    actual_monthly_revenue,
    drip_iv_revenue_weekly,
    drip_iv_revenue_monthly,
    semaglutide_revenue_weekly,
    semaglutide_revenue_monthly,
    CASE 
        WHEN actual_weekly_revenue > actual_monthly_revenue 
        THEN 'STILL NEEDS FIX' 
        ELSE 'FIXED' 
    END as status
FROM analytics_data 
ORDER BY week_start_date DESC 
LIMIT 5;