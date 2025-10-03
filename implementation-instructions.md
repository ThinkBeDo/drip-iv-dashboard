
IMPLEMENTATION INSTRUCTIONS:
==========================

1. BACKUP CURRENT CODE:
   cp import-weekly-data.js import-weekly-data.js.backup

2. UPDATE import-weekly-data.js:
   - Replace analyzeRevenueData() function with analyzeRevenueDataByWeeks()
   - Replace importWeeklyData() function with importWeeklyDataMultiWeek()
   - Add helper functions: initializeWeekMetrics(), parseRowDate(), saveWeekToDatabase()

3. UPDATE server.js:
   - Change import call from importWeeklyData to importWeeklyDataMultiWeek
   - Update /api/import-weekly-data endpoint to use new function

4. TEST WITH SAMPLE DATA:
   - Upload a small subset first to verify multiple weeks are created
   - Check database: SELECT week_start_date, week_end_date, actual_weekly_revenue FROM analytics_data ORDER BY week_start_date;

5. DEPLOY TO RAILWAY:
   - Commit changes and push to main branch
   - Railway will auto-deploy new version

EXPECTED RESULTS:
================
- September upload should create 3-4 separate week records
- Each week should have ~$30K revenue (not aggregated)
- Monthly calculation should sum all weeks correctly
- Dashboard monthly ≠ weekly totals

VERIFICATION QUERIES:
====================
-- Check all September weeks
SELECT week_start_date, week_end_date, actual_weekly_revenue 
FROM analytics_data 
WHERE week_start_date >= '2025-09-01' AND week_start_date < '2025-10-01'
ORDER BY week_start_date;

-- Verify monthly calculation
SELECT 
  SUM(actual_weekly_revenue) as total_monthly,
  COUNT(*) as weeks_count
FROM analytics_data 
WHERE week_start_date >= '2025-09-01' AND week_start_date < '2025-10-01';
