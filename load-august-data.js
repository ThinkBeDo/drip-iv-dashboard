const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function loadAugustData() {
  console.log('🚀 Loading August 2025 data (Week: July 27 - August 2)...\n');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Data for week of July 27 - August 2, 2025
    const weekData = {
      week_start_date: '2025-07-27',
      week_end_date: '2025-08-02',
      
      // Revenue data (from CSV analysis)
      actual_weekly_revenue: 32219.95,
      weekly_revenue_goal: 32125.00,
      actual_monthly_revenue: 50223.90,  // Cumulative for August so far
      monthly_revenue_goal: 128500.00,
      
      // Service breakdown revenue
      drip_iv_revenue_weekly: 18337.40,
      semaglutide_revenue_weekly: 10422.25,
      drip_iv_revenue_monthly: 31090.15,
      semaglutide_revenue_monthly: 17143.75,
      
      // Customer analytics
      unique_customers_weekly: 161,
      unique_customers_monthly: 161,  // First week of month
      member_customers_weekly: 89,
      non_member_customers_weekly: 72,
      
      // Service volumes (from CSV analysis)
      iv_infusions_weekday_weekly: 142,
      iv_infusions_weekend_weekly: 38,
      injections_weekday_weekly: 29,
      injections_weekend_weekly: 9,
      iv_infusions_weekday_monthly: 142,
      iv_infusions_weekend_monthly: 38,
      injections_weekday_monthly: 29,
      injections_weekend_monthly: 9,
      
      // Legacy fields for compatibility
      drip_iv_weekday_weekly: 171,
      drip_iv_weekend_weekly: 47,
      drip_iv_weekday_monthly: 171,
      drip_iv_weekend_monthly: 47,
      semaglutide_consults_weekly: 3,
      semaglutide_injections_weekly: 39,
      semaglutide_consults_monthly: 3,
      semaglutide_injections_monthly: 39,
      
      // Membership data (from membership export analysis)
      total_drip_iv_members: 139,  // Accounts for families counting as 2
      individual_memberships: 103,
      family_memberships: 17,
      concierge_memberships: 15,
      corporate_memberships: 1,
      family_concierge_memberships: 1,
      drip_concierge_memberships: 2,
      
      // New membership signups this week
      new_individual_members_weekly: 5,
      new_family_members_weekly: 2,
      new_concierge_members_weekly: 0,
      new_corporate_members_weekly: 0,
      
      // Other metrics
      marketing_initiatives: 1,
      days_left_in_month: 29,
      
      // Popular services
      popular_infusions: ['NAD+', 'Energy', 'Performance & Recovery'],
      popular_infusions_status: 'Active',
      popular_injections: ['Tirzepatide', 'Semaglutide', 'B12'],
      popular_injections_status: 'Active'
    };
    
    // Check if data already exists for this week
    const existingCheck = await client.query(
      'SELECT id FROM analytics_data WHERE week_start_date = $1 AND week_end_date = $2',
      [weekData.week_start_date, weekData.week_end_date]
    );
    
    if (existingCheck.rows.length > 0) {
      console.log('📝 Data exists for this week, updating...\n');
      
      // Update existing record
      const updateQuery = `
        UPDATE analytics_data SET
          actual_weekly_revenue = $1,
          weekly_revenue_goal = $2,
          actual_monthly_revenue = $3,
          monthly_revenue_goal = $4,
          drip_iv_revenue_weekly = $5,
          semaglutide_revenue_weekly = $6,
          drip_iv_revenue_monthly = $7,
          semaglutide_revenue_monthly = $8,
          unique_customers_weekly = $9,
          unique_customers_monthly = $10,
          member_customers_weekly = $11,
          non_member_customers_weekly = $12,
          iv_infusions_weekday_weekly = $13,
          iv_infusions_weekend_weekly = $14,
          injections_weekday_weekly = $15,
          injections_weekend_weekly = $16,
          iv_infusions_weekday_monthly = $17,
          iv_infusions_weekend_monthly = $18,
          injections_weekday_monthly = $19,
          injections_weekend_monthly = $20,
          total_drip_iv_members = $21,
          individual_memberships = $22,
          family_memberships = $23,
          concierge_memberships = $24,
          corporate_memberships = $25,
          family_concierge_memberships = $26,
          drip_concierge_memberships = $27,
          new_individual_members_weekly = $28,
          new_family_members_weekly = $29,
          new_concierge_members_weekly = $30,
          new_corporate_members_weekly = $31,
          marketing_initiatives = $32,
          days_left_in_month = $33,
          drip_iv_weekday_weekly = $34,
          drip_iv_weekend_weekly = $35,
          drip_iv_weekday_monthly = $36,
          drip_iv_weekend_monthly = $37,
          semaglutide_consults_weekly = $38,
          semaglutide_injections_weekly = $39,
          semaglutide_consults_monthly = $40,
          semaglutide_injections_monthly = $41,
          updated_at = CURRENT_TIMESTAMP
        WHERE week_start_date = $42 AND week_end_date = $43
      `;
      
      await client.query(updateQuery, [
        weekData.actual_weekly_revenue,
        weekData.weekly_revenue_goal,
        weekData.actual_monthly_revenue,
        weekData.monthly_revenue_goal,
        weekData.drip_iv_revenue_weekly,
        weekData.semaglutide_revenue_weekly,
        weekData.drip_iv_revenue_monthly,
        weekData.semaglutide_revenue_monthly,
        weekData.unique_customers_weekly,
        weekData.unique_customers_monthly,
        weekData.member_customers_weekly,
        weekData.non_member_customers_weekly,
        weekData.iv_infusions_weekday_weekly,
        weekData.iv_infusions_weekend_weekly,
        weekData.injections_weekday_weekly,
        weekData.injections_weekend_weekly,
        weekData.iv_infusions_weekday_monthly,
        weekData.iv_infusions_weekend_monthly,
        weekData.injections_weekday_monthly,
        weekData.injections_weekend_monthly,
        weekData.total_drip_iv_members,
        weekData.individual_memberships,
        weekData.family_memberships,
        weekData.concierge_memberships,
        weekData.corporate_memberships,
        weekData.family_concierge_memberships,
        weekData.drip_concierge_memberships,
        weekData.new_individual_members_weekly,
        weekData.new_family_members_weekly,
        weekData.new_concierge_members_weekly,
        weekData.new_corporate_members_weekly,
        weekData.marketing_initiatives,
        weekData.days_left_in_month,
        weekData.drip_iv_weekday_weekly,
        weekData.drip_iv_weekend_weekly,
        weekData.drip_iv_weekday_monthly,
        weekData.drip_iv_weekend_monthly,
        weekData.semaglutide_consults_weekly,
        weekData.semaglutide_injections_weekly,
        weekData.semaglutide_consults_monthly,
        weekData.semaglutide_injections_monthly,
        weekData.week_start_date,
        weekData.week_end_date
      ]);
      
    } else {
      console.log('➕ Inserting new week data...\n');
      
      // Insert new record
      const insertQuery = `
        INSERT INTO analytics_data (
          week_start_date, week_end_date,
          actual_weekly_revenue, weekly_revenue_goal,
          actual_monthly_revenue, monthly_revenue_goal,
          drip_iv_revenue_weekly, semaglutide_revenue_weekly,
          drip_iv_revenue_monthly, semaglutide_revenue_monthly,
          unique_customers_weekly, unique_customers_monthly,
          member_customers_weekly, non_member_customers_weekly,
          iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
          injections_weekday_weekly, injections_weekend_weekly,
          iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
          injections_weekday_monthly, injections_weekend_monthly,
          total_drip_iv_members, individual_memberships,
          family_memberships, concierge_memberships,
          corporate_memberships, family_concierge_memberships,
          drip_concierge_memberships, new_individual_members_weekly,
          new_family_members_weekly, new_concierge_members_weekly,
          new_corporate_members_weekly, marketing_initiatives,
          days_left_in_month, drip_iv_weekday_weekly,
          drip_iv_weekend_weekly, drip_iv_weekday_monthly,
          drip_iv_weekend_monthly, semaglutide_consults_weekly,
          semaglutide_injections_weekly, semaglutide_consults_monthly,
          semaglutide_injections_monthly, popular_infusions,
          popular_infusions_status, popular_injections,
          popular_injections_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
          $41, $42, $43, $44, $45, $46
        )
      `;
      
      await client.query(insertQuery, [
        weekData.week_start_date,
        weekData.week_end_date,
        weekData.actual_weekly_revenue,
        weekData.weekly_revenue_goal,
        weekData.actual_monthly_revenue,
        weekData.monthly_revenue_goal,
        weekData.drip_iv_revenue_weekly,
        weekData.semaglutide_revenue_weekly,
        weekData.drip_iv_revenue_monthly,
        weekData.semaglutide_revenue_monthly,
        weekData.unique_customers_weekly,
        weekData.unique_customers_monthly,
        weekData.member_customers_weekly,
        weekData.non_member_customers_weekly,
        weekData.iv_infusions_weekday_weekly,
        weekData.iv_infusions_weekend_weekly,
        weekData.injections_weekday_weekly,
        weekData.injections_weekend_weekly,
        weekData.iv_infusions_weekday_monthly,
        weekData.iv_infusions_weekend_monthly,
        weekData.injections_weekday_monthly,
        weekData.injections_weekend_monthly,
        weekData.total_drip_iv_members,
        weekData.individual_memberships,
        weekData.family_memberships,
        weekData.concierge_memberships,
        weekData.corporate_memberships,
        weekData.family_concierge_memberships,
        weekData.drip_concierge_memberships,
        weekData.new_individual_members_weekly,
        weekData.new_family_members_weekly,
        weekData.new_concierge_members_weekly,
        weekData.new_corporate_members_weekly,
        weekData.marketing_initiatives,
        weekData.days_left_in_month,
        weekData.drip_iv_weekday_weekly,
        weekData.drip_iv_weekend_weekly,
        weekData.drip_iv_weekday_monthly,
        weekData.drip_iv_weekend_monthly,
        weekData.semaglutide_consults_weekly,
        weekData.semaglutide_injections_weekly,
        weekData.semaglutide_consults_monthly,
        weekData.semaglutide_injections_monthly,
        weekData.popular_infusions,
        weekData.popular_infusions_status,
        weekData.popular_injections,
        weekData.popular_injections_status
      ]);
    }
    
    await client.query('COMMIT');
    
    // Print summary
    console.log('✅ August Data Successfully Loaded!\n');
    console.log('📊 Summary:');
    console.log('─────────────────────────────────────────');
    console.log(`📅 Week: ${weekData.week_start_date} to ${weekData.week_end_date}`);
    console.log(`💰 Weekly Revenue: $${weekData.actual_weekly_revenue.toLocaleString()} (Goal: $${weekData.weekly_revenue_goal.toLocaleString()})`);
    console.log(`📈 Progress: ${((weekData.actual_weekly_revenue / weekData.weekly_revenue_goal) * 100).toFixed(1)}% of weekly goal`);
    console.log('');
    console.log('👥 Membership Breakdown:');
    console.log(`   • Total Drip IV Members: ${weekData.total_drip_iv_members}`);
    console.log(`   • Individual: ${weekData.individual_memberships}`);
    console.log(`   • Family: ${weekData.family_memberships} (counts as ${weekData.family_memberships * 2} members)`);
    console.log(`   • Concierge: ${weekData.concierge_memberships}`);
    console.log(`   • Drip & Concierge: ${weekData.drip_concierge_memberships}`);
    console.log(`   • Corporate: ${weekData.corporate_memberships}`);
    console.log('');
    console.log('🧑‍🤝‍🧑 Customer Analytics:');
    console.log(`   • Unique Customers (Week): ${weekData.unique_customers_weekly}`);
    console.log(`   • Member Customers: ${weekData.member_customers_weekly}`);
    console.log(`   • Non-Member Customers: ${weekData.non_member_customers_weekly}`);
    console.log('─────────────────────────────────────────');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error loading August data:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the data loader
loadAugustData()
  .then(() => {
    console.log('\n🎉 Data import complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💀 Failed to load data:', error.message);
    process.exit(1);
  });