-- Test data for missing weeks in Drip IV Dashboard
-- This SQL can be executed in your Railway PostgreSQL database

-- Week 1: July 1-7, 2025
INSERT INTO analytics_data (
  week_start_date, week_end_date,
  actual_weekly_revenue, weekly_revenue_goal,
  actual_monthly_revenue, monthly_revenue_goal,
  drip_iv_revenue_weekly, semaglutide_revenue_weekly,
  drip_iv_revenue_monthly, semaglutide_revenue_monthly,
  iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
  iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
  injections_weekday_weekly, injections_weekend_weekly,
  injections_weekday_monthly, injections_weekend_monthly,
  total_drip_iv_members, individual_memberships, family_memberships,
  concierge_memberships, corporate_memberships,
  unique_customers_weekly, unique_customers_monthly,
  member_customers_weekly, non_member_customers_weekly,
  upload_date
) VALUES (
  '2025-07-01', '2025-07-07',
  28500, 32000, 114000, 128000,
  17100, 11400, 68400, 45600,
  42, 18, 168, 72,
  35, 12, 140, 48,
  115, 80, 17, 12, 6,
  92, 368, 69, 23,
  NOW()
);

-- Week 2: July 8-14, 2025
INSERT INTO analytics_data (
  week_start_date, week_end_date,
  actual_weekly_revenue, weekly_revenue_goal,
  actual_monthly_revenue, monthly_revenue_goal,
  drip_iv_revenue_weekly, semaglutide_revenue_weekly,
  drip_iv_revenue_monthly, semaglutide_revenue_monthly,
  iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
  iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
  injections_weekday_weekly, injections_weekend_weekly,
  injections_weekday_monthly, injections_weekend_monthly,
  total_drip_iv_members, individual_memberships, family_memberships,
  concierge_memberships, corporate_memberships,
  unique_customers_weekly, unique_customers_monthly,
  member_customers_weekly, non_member_customers_weekly,
  upload_date
) VALUES (
  '2025-07-08', '2025-07-14',
  31200, 32000, 124800, 128000,
  18720, 12480, 74880, 49920,
  45, 20, 180, 80,
  38, 15, 152, 60,
  118, 82, 18, 12, 6,
  94, 376, 71, 23,
  NOW()
);

-- Week 3: July 15-21, 2025
INSERT INTO analytics_data (
  week_start_date, week_end_date,
  actual_weekly_revenue, weekly_revenue_goal,
  actual_monthly_revenue, monthly_revenue_goal,
  drip_iv_revenue_weekly, semaglutide_revenue_weekly,
  drip_iv_revenue_monthly, semaglutide_revenue_monthly,
  iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
  iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
  injections_weekday_weekly, injections_weekend_weekly,
  injections_weekday_monthly, injections_weekend_monthly,
  total_drip_iv_members, individual_memberships, family_memberships,
  concierge_memberships, corporate_memberships,
  unique_customers_weekly, unique_customers_monthly,
  member_customers_weekly, non_member_customers_weekly,
  upload_date
) VALUES (
  '2025-07-15', '2025-07-21',
  29800, 32000, 119200, 128000,
  17880, 11920, 71520, 47680,
  48, 22, 192, 88,
  40, 14, 160, 56,
  120, 84, 18, 12, 6,
  96, 384, 72, 24,
  NOW()
);

-- Week 4: July 22-28, 2025
INSERT INTO analytics_data (
  week_start_date, week_end_date,
  actual_weekly_revenue, weekly_revenue_goal,
  actual_monthly_revenue, monthly_revenue_goal,
  drip_iv_revenue_weekly, semaglutide_revenue_weekly,
  drip_iv_revenue_monthly, semaglutide_revenue_monthly,
  iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
  iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
  injections_weekday_weekly, injections_weekend_weekly,
  injections_weekday_monthly, injections_weekend_monthly,
  total_drip_iv_members, individual_memberships, family_memberships,
  concierge_memberships, corporate_memberships,
  unique_customers_weekly, unique_customers_monthly,
  member_customers_weekly, non_member_customers_weekly,
  upload_date
) VALUES (
  '2025-07-22', '2025-07-28',
  32500, 32000, 130000, 128000,
  19500, 13000, 78000, 52000,
  50, 25, 200, 100,
  42, 16, 168, 64,
  123, 86, 18, 13, 6,
  98, 392, 74, 24,
  NOW()
);

-- Week 5: July 29 - Aug 4, 2025
INSERT INTO analytics_data (
  week_start_date, week_end_date,
  actual_weekly_revenue, weekly_revenue_goal,
  actual_monthly_revenue, monthly_revenue_goal,
  drip_iv_revenue_weekly, semaglutide_revenue_weekly,
  drip_iv_revenue_monthly, semaglutide_revenue_monthly,
  iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
  iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
  injections_weekday_weekly, injections_weekend_weekly,
  injections_weekday_monthly, injections_weekend_monthly,
  total_drip_iv_members, individual_memberships, family_memberships,
  concierge_memberships, corporate_memberships,
  unique_customers_weekly, unique_customers_monthly,
  member_customers_weekly, non_member_customers_weekly,
  upload_date
) VALUES (
  '2025-07-29', '2025-08-04',
  30100, 32000, 120400, 128000,
  18060, 12040, 72240, 48160,
  47, 21, 188, 84,
  39, 13, 156, 52,
  125, 87, 19, 13, 6,
  100, 400, 75, 25,
  NOW()
);

-- Week 6: Aug 5-11, 2025
INSERT INTO analytics_data (
  week_start_date, week_end_date,
  actual_weekly_revenue, weekly_revenue_goal,
  actual_monthly_revenue, monthly_revenue_goal,
  drip_iv_revenue_weekly, semaglutide_revenue_weekly,
  drip_iv_revenue_monthly, semaglutide_revenue_monthly,
  iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
  iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
  injections_weekday_weekly, injections_weekend_weekly,
  injections_weekday_monthly, injections_weekend_monthly,
  total_drip_iv_members, individual_memberships, family_memberships,
  concierge_memberships, corporate_memberships,
  unique_customers_weekly, unique_customers_monthly,
  member_customers_weekly, non_member_customers_weekly,
  upload_date
) VALUES (
  '2025-08-05', '2025-08-11',
  33000, 32000, 132000, 128000,
  19800, 13200, 79200, 52800,
  52, 26, 208, 104,
  44, 18, 176, 72,
  128, 89, 19, 14, 6,
  102, 408, 77, 25,
  NOW()
);

-- Week 7: Aug 12-18, 2025
INSERT INTO analytics_data (
  week_start_date, week_end_date,
  actual_weekly_revenue, weekly_revenue_goal,
  actual_monthly_revenue, monthly_revenue_goal,
  drip_iv_revenue_weekly, semaglutide_revenue_weekly,
  drip_iv_revenue_monthly, semaglutide_revenue_monthly,
  iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
  iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
  injections_weekday_weekly, injections_weekend_weekly,
  injections_weekday_monthly, injections_weekend_monthly,
  total_drip_iv_members, individual_memberships, family_memberships,
  concierge_memberships, corporate_memberships,
  unique_customers_weekly, unique_customers_monthly,
  member_customers_weekly, non_member_customers_weekly,
  upload_date
) VALUES (
  '2025-08-12', '2025-08-18',
  31500, 32000, 126000, 128000,
  18900, 12600, 75600, 50400,
  49, 24, 196, 96,
  41, 15, 164, 60,
  130, 91, 19, 14, 6,
  104, 416, 78, 26,
  NOW()
);

-- Update the existing Aug 4-10 week with membership data
UPDATE analytics_data 
SET total_drip_iv_members = 126,
    individual_memberships = 88,
    family_memberships = 19,
    concierge_memberships = 13,
    corporate_memberships = 6,
    unique_customers_weekly = 101,
    unique_customers_monthly = 404,
    member_customers_weekly = 76,
    non_member_customers_weekly = 25
WHERE week_start_date = '2025-08-04';

-- Verify the data was inserted
SELECT 
  week_start_date,
  week_end_date,
  actual_weekly_revenue,
  total_drip_iv_members
FROM analytics_data
WHERE week_start_date >= '2025-07-01'
ORDER BY week_start_date;