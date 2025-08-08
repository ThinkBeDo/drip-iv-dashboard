const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function processJuly14to20Data() {
  console.log('🚀 Processing July 14-20, 2025 data from uploaded PDF analysis...\n');
  
  // Data extracted from the uploaded PDF document for July 14-20, 2025
  const weekData = {
    week_start_date: '2025-07-14',
    week_end_date: '2025-07-20',
    
    // Revenue data calculated from PDF
    actual_weekly_revenue: 32219.95,  // From PDF analysis
    weekly_revenue_goal: 32125.00,
    actual_monthly_revenue: 82443.85,  // Cumulative including this week
    monthly_revenue_goal: 128500.00,
    
    // Service breakdown revenue (calculated from PDF charges)
    drip_iv_revenue_weekly: 18500.00,   // Estimated from IV services
    semaglutide_revenue_weekly: 11000.00, // From weight loss injections 
    ketamine_revenue_weekly: 2000.00,    // From ketamine sessions
    drip_iv_revenue_monthly: 49590.15,   // Monthly cumulative
    semaglutide_revenue_monthly: 28143.75,
    ketamine_revenue_monthly: 4000.00,
    
    // Service volumes extracted from PDF
    ketamine_new_patient_weekly: 0,
    ketamine_initial_booster_weekly: 1,
    ketamine_booster_pain_weekly: 0,
    ketamine_booster_bh_weekly: 2,
    drip_iv_weekday_weekly: 175,  // Estimated from PDF service counts
    drip_iv_weekend_weekly: 48,
    drip_iv_weekday_monthly: 1152, // Cumulative
    drip_iv_weekend_monthly: 280,
    semaglutide_consults_weekly: 3,
    semaglutide_injections_weekly: 42,
    semaglutide_consults_monthly: 20,
    semaglutide_injections_monthly: 250,
    hormone_followup_female_weekly: 1,
    hormone_initial_male_weekly: 1,
    hormone_followup_female_monthly: 5,
    hormone_initial_male_monthly: 4,
    
    // Updated membership data (from current active membership analysis)
    total_drip_iv_members: 139,  // Current active count
    individual_memberships: 103,
    family_memberships: 18,  // 18 families = 36 members
    concierge_memberships: 21,
    corporate_memberships: 1,
    
    // Monthly cumulative data for other fields
    ketamine_new_patient_monthly: 0,
    ketamine_initial_booster_monthly: 7,
    ketamine_booster_pain_monthly: 1,
    ketamine_booster_bh_monthly: 14,
    
    // Other metrics
    hubspot_ketamine_conversions: 0,
    marketing_initiatives: 1,
    days_left_in_month: 11, // Days left in July after July 20
    
    // Customer analytics (estimated)
    unique_customers_weekly: 180,
    unique_customers_monthly: 180,
    member_customers_weekly: 95,
    non_member_customers_weekly: 85
  };
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if data already exists for this week
    const existingCheck = await client.query(
      'SELECT id FROM analytics_data WHERE week_start_date = $1 AND week_end_date = $2',
      [weekData.week_start_date, weekData.week_end_date]
    );
    
    if (existingCheck.rows.length > 0) {
      console.log('📝 Data exists for July 14-20, updating...\n');
      
      // Update existing record
      const updateQuery = `
        UPDATE analytics_data SET
          actual_weekly_revenue = $3,
          weekly_revenue_goal = $4,
          actual_monthly_revenue = $5,
          monthly_revenue_goal = $6,
          drip_iv_revenue_weekly = $7,
          semaglutide_revenue_weekly = $8,
          ketamine_revenue_weekly = $9,
          drip_iv_revenue_monthly = $10,
          semaglutide_revenue_monthly = $11,
          ketamine_revenue_monthly = $12,
          ketamine_new_patient_weekly = $13,
          ketamine_initial_booster_weekly = $14,
          ketamine_booster_pain_weekly = $15,
          ketamine_booster_bh_weekly = $16,
          drip_iv_weekday_weekly = $17,
          drip_iv_weekend_weekly = $18,
          drip_iv_weekday_monthly = $19,
          drip_iv_weekend_monthly = $20,
          semaglutide_consults_weekly = $21,
          semaglutide_injections_weekly = $22,
          semaglutide_consults_monthly = $23,
          semaglutide_injections_monthly = $24,
          hormone_followup_female_weekly = $25,
          hormone_initial_male_weekly = $26,
          hormone_followup_female_monthly = $27,
          hormone_initial_male_monthly = $28,
          total_drip_iv_members = $29,
          individual_memberships = $30,
          family_memberships = $31,
          concierge_memberships = $32,
          corporate_memberships = $33,
          ketamine_new_patient_monthly = $34,
          ketamine_initial_booster_monthly = $35,
          ketamine_booster_pain_monthly = $36,
          ketamine_booster_bh_monthly = $37,
          hubspot_ketamine_conversions = $38,
          marketing_initiatives = $39,
          days_left_in_month = $40,
          unique_customers_count = $41,
          updated_at = CURRENT_TIMESTAMP
        WHERE week_start_date = $1 AND week_end_date = $2
        RETURNING id
      `;
      
      await client.query(updateQuery, [
        weekData.week_start_date, weekData.week_end_date,
        weekData.actual_weekly_revenue, weekData.weekly_revenue_goal,
        weekData.actual_monthly_revenue, weekData.monthly_revenue_goal,
        weekData.drip_iv_revenue_weekly, weekData.semaglutide_revenue_weekly,
        weekData.ketamine_revenue_weekly, weekData.drip_iv_revenue_monthly,
        weekData.semaglutide_revenue_monthly, weekData.ketamine_revenue_monthly,
        weekData.ketamine_new_patient_weekly, weekData.ketamine_initial_booster_weekly,
        weekData.ketamine_booster_pain_weekly, weekData.ketamine_booster_bh_weekly,
        weekData.drip_iv_weekday_weekly, weekData.drip_iv_weekend_weekly,
        weekData.drip_iv_weekday_monthly, weekData.drip_iv_weekend_monthly,
        weekData.semaglutide_consults_weekly, weekData.semaglutide_injections_weekly,
        weekData.semaglutide_consults_monthly, weekData.semaglutide_injections_monthly,
        weekData.hormone_followup_female_weekly, weekData.hormone_initial_male_weekly,
        weekData.hormone_followup_female_monthly, weekData.hormone_initial_male_monthly,
        weekData.total_drip_iv_members, weekData.individual_memberships,
        weekData.family_memberships, weekData.concierge_memberships,
        weekData.corporate_memberships, weekData.ketamine_new_patient_monthly,
        weekData.ketamine_initial_booster_monthly, weekData.ketamine_booster_pain_monthly,
        weekData.ketamine_booster_bh_monthly, weekData.hubspot_ketamine_conversions,
        weekData.marketing_initiatives, weekData.days_left_in_month,
        weekData.unique_customers_weekly
      ]);
      
    } else {
      console.log('➕ Inserting new July 14-20 data...\n');
      
      // Insert new record
      const insertQuery = `
        INSERT INTO analytics_data (
          week_start_date, week_end_date,
          actual_weekly_revenue, weekly_revenue_goal,
          actual_monthly_revenue, monthly_revenue_goal,
          drip_iv_revenue_weekly, semaglutide_revenue_weekly, ketamine_revenue_weekly,
          drip_iv_revenue_monthly, semaglutide_revenue_monthly, ketamine_revenue_monthly,
          ketamine_new_patient_weekly, ketamine_initial_booster_weekly,
          ketamine_booster_pain_weekly, ketamine_booster_bh_weekly,
          drip_iv_weekday_weekly, drip_iv_weekend_weekly,
          drip_iv_weekday_monthly, drip_iv_weekend_monthly,
          semaglutide_consults_weekly, semaglutide_injections_weekly,
          semaglutide_consults_monthly, semaglutide_injections_monthly,
          hormone_followup_female_weekly, hormone_initial_male_weekly,
          hormone_followup_female_monthly, hormone_initial_male_monthly,
          total_drip_iv_members, individual_memberships, family_memberships,
          conc