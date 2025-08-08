const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function loadAugustData() {
  try {
    console.log('Loading baseline data for week of July 27 - August 2, 2025...');
    
    const client = await pool.connect();
    
    try {
      // Week dates: July 27 - August 2, 2025 (Sunday to Saturday)
      const weekStartDate = '2025-07-27';
      const weekEndDate = '2025-08-02';
      
      // Check if data already exists for this week
      const existingCheck = await client.query(
        'SELECT id FROM analytics_data WHERE week_start_date = $1 AND week_end_date = $2',
        [weekStartDate, weekEndDate]
      );
      
      if (existingCheck.rows.length > 0) {
        console.log('✅ Data already exists for this week, updating...');
        
        // Update existing record with August baseline data
        const updateQuery = `
          UPDATE analytics_data SET
            -- Service counts (estimated based on revenue patterns)
            iv_infusions_weekday_weekly = $3,
            iv_infusions_weekend_weekly = $4,
            iv_infusions_weekday_monthly = $5,
            iv_infusions_weekend_monthly = $6,
            injections_weekday_weekly = $7,
            injections_weekend_weekly = $8,
            injections_weekday_monthly = $9,
            injections_weekend_monthly = $10,
            
            -- Customer analytics
            unique_customers_weekly = $11,
            unique_customers_monthly = $12,
            member_customers_weekly = $13,
            non_member_customers_weekly = $14,
            
            -- Revenue data
            actual_weekly_revenue = $15,
            weekly_revenue_goal = $16,
            actual_monthly_revenue = $17,
            monthly_revenue_goal = $18,
            drip_iv_revenue_weekly = $19,
            semaglutide_revenue_weekly = $20,
            drip_iv_revenue_monthly = $21,
            semaglutide_revenue_monthly = $22,
            
            -- Membership data (current active totals from Excel export)
            total_drip_iv_members = $23,
            individual_memberships = $24,
            family_memberships = $25,
            family_concierge_memberships = $26,
            drip_concierge_memberships = $27,
            concierge_memberships = $28,
            corporate_memberships = $29,
            marketing_initiatives = $30,
            
            -- New weekly signups (estimated/placeholder)
            new_individual_members_weekly = $31,
            new_family_members_weekly = $32,
            new_concierge_members_weekly = $33,
            new_corporate_members_weekly = $34,
            
            -- Legacy compatibility fields
            drip_iv_weekday_weekly = $35,
            drip_iv_weekend_weekly = $36,
            drip_iv_weekday_monthly = $37,
            drip_iv_weekend_monthly = $38,
            semaglutide_consults_weekly = $39,
            semaglutide_injections_weekly = $40,
            semaglutide_consults_monthly = $41,
            semaglutide_injections_monthly = $42,
            hormone_followup_female_weekly = $43,
            hormone_initial_male_weekly = $44,
            hormone_followup_female_monthly = $45,
            hormone_initial_male_monthly = $46,
            
            days_left_in_month = $47,
            popular_infusions = $48,
            popular_infusions_status = $49,
            popular_injections = $50,
            popular_injections_status = $51,
            updated_at = CURRENT_TIMESTAMP
          WHERE week_start_date = $1 AND week_end_date = $2
        `;
        
        const updateValues = [
          weekStartDate, weekEndDate,
          // Service counts (IV infusions)
          75,  // iv_infusions_weekday_weekly
          20,  // iv_infusions_weekend_weekly  
          285, // iv_infusions_weekday_monthly
          80,  // iv_infusions_weekend_monthly
          // Service counts (injections)
          55,  // injections_weekday_weekly
          6,   // injections_weekend_weekly
          210, // injections_weekday_monthly
          25,  // injections_weekend_monthly
          // Customer analytics
          161, // unique_customers_weekly (from actual data)
          423, // unique_customers_monthly (estimated)
          110, // member_customers_weekly
          51,  // non_member_customers_weekly
          // Revenue data
          32219.95, // actual_weekly_revenue
          32125.00, // weekly_revenue_goal
          50223.90, // actual_monthly_revenue (cumulative)
          128500.00, // monthly_revenue_goal
          18500.00, // drip_iv_revenue_weekly (estimated from service mix)
          11200.00, // semaglutide_revenue_weekly
          31000.00, // drip_iv_revenue_monthly
          17000.00, // semaglutide_revenue_monthly
          // Membership data (from Excel export)
          139, // total_drip_iv_members
          103, // individual_memberships
          18,  // family_memberships
          1,   // family_concierge_memberships
          2,   // drip_concierge_memberships
          21,  // concierge_memberships
          1,   // corporate_memberships
          0,   // marketing_initiatives
          // New weekly signups
          3,   // new_individual_members_weekly
          1,   // new_family_members_weekly
          0,   // new_concierge_members_weekly
          0,   // new_corporate_members_weekly
          // Legacy compatibility (totals)
          130, // drip_iv_weekday_weekly (75 + 55)
          26,  // drip_iv_weekend_weekly (20 + 6)
          495, // drip_iv_weekday_monthly (285 + 210)
          105, // drip_iv_weekend_monthly (80 + 25)
          2,   // semaglutide_consults_weekly
          40,  // semaglutide_injections_weekly
          12,  // semaglutide_consults_monthly
          160, // semaglutide_injections_monthly
          1,   // hormone_followup_female_weekly
          0,   // hormone_initial_male_weekly
          8,   // hormone_followup_female_monthly
          2,   // hormone_initial_male_monthly
          // Other fields
          29,  // days_left_in_month (approximate for August)
          ['Energy', 'NAD+', 'Performance & Recovery'], // popular_infusions
          'Active', // popular_infusions_status
          ['Tirzepatide', 'Semaglutide', 'B12'], // popular_injections
          'Active'  // popular_injections_status
        ];
        
        await client.query(updateQuery, updateValues);
        console.log('✅ Updated existing August baseline data successfully!');
      } else {
        console.log('📝 Inserting new August baseline data...');
        
        // Insert new record with August baseline data
        const insertQuery = `
          INSERT INTO analytics_data (
            week_start_date, week_end_date,
            iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
            iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
            injections_weekday_weekly, injections_weekend_weekly,
            injections_weekday_monthly, injections_weekend_monthly,
            unique_customers_weekly, unique_customers_monthly,
            member_customers_weekly, non_member_customers_weekly,
            actual_weekly_revenue, weekly_revenue_goal,
            actual_monthly_revenue, monthly_revenue_goal,
            drip_iv_revenue_weekly, semaglutide_revenue_weekly,
            drip_iv_revenue_monthly, semaglutide_revenue_monthly,
            total_drip_iv_members, individual_memberships,
            family_memberships, family_concierge_memberships,
            drip_concierge_memberships, concierge_memberships,
            corporate_memberships, marketing_initiatives,
            new_individual_members_weekly, new_family_members_weekly,
            new_concierge_members_weekly, new_corporate_members_weekly,
            drip_iv_weekday_weekly, drip_iv_weekend_weekly,
            drip_iv_weekday_monthly, drip_iv_weekend_monthly,
            semaglutide_consults_weekly, semaglutide_injections_weekly,
            semaglutide_consults_monthly, semaglutide_injections_monthly,
            hormone_followup_female_weekly, hormone_initial_male_weekly,
            hormone_followup_female_monthly, hormone_initial_male_monthly,
            days_left_in_month, popular_infusions, popular_infusions_status,
            popular_injections, popular_injections_status
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
            $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51
          )
        `;
        
        const insertValues = [
          weekStartDate, weekEndDate,
          // Service counts (IV infusions)
          75,  // iv_infusions_weekday_weekly
          20,  // iv_infusions_weekend_weekly  
          285, // iv_infusions_weekday_monthly
          80,  // iv_infusions_weekend_monthly
          // Service counts (injections)
          55,  // injections_weekday_weekly
          6,   // injections_weekend_weekly
          210, // injections_weekday_monthly
          25,  // injections_weekend_monthly
          // Customer analytics
          161, // unique_customers_weekly (from actual data)
          423, // unique_customers_monthly (estimated)
          110, // member_customers_weekly
          51,  // non_member_customers_weekly
          // Revenue data
          32219.95, // actual_weekly_revenue
          32125.00, // weekly_revenue_goal
          50223.90, // actual_monthly_revenue (cumulative)
          128500.00, // monthly_revenue_goal
          18500.00, // drip_iv_revenue_weekly (estimated from service mix)
          11200.00, // semaglutide_revenue_weekly
          31000.00, // drip_iv_revenue_monthly
          17000.00, // semaglutide_revenue_monthly
          // Membership data (from Excel export)
          139, // total_drip_iv_members
          103, // individual_memberships
          18,  // family_memberships
          1,   // family_concierge_memberships
          2,   // drip_concierge_memberships
          21,  // concierge_memberships
          1,   // corporate_memberships
          0,   // marketing_initiatives
          // New weekly signups
          3,   // new_individual_members_weekly
          1,   // new_family_members_weekly
          0,   // new_concierge_members_weekly
          0,   // new_corporate_members_weekly
          // Legacy compatibility (totals)
          130, // drip_iv_weekday_weekly (75 + 55)
          26,  // drip_iv_weekend_weekly (20 + 6)
          495, // drip_iv_weekday_monthly (285 + 210)
          105, // drip_iv_weekend_monthly (80 + 25)
          2,   // semaglutide_consults_weekly
          40,  // semaglutide_injections_weekly
          12,  // semaglutide_consults_monthly
          160, // semaglutide_injections_monthly
          1,   // hormone_followup_female_weekly
          0,   // hormone_initial_male_weekly
          8,   // hormone_followup_female_monthly
          2,   // hormone_initial_male_monthly
          // Other fields
          29,  // days_left_in_month (approximate for August)
          ['Energy', 'NAD+', 'Performance & Recovery'], // popular_infusions
          'Active', // popular_infusions_status
          ['Tirzepatide', 'Semaglutide', 'B12'], // popular_injections
          'Active'  // popular_injections_status
        ];
        
        await client.query(insertQuery, insertValues);
        console.log('✅ Inserted new August baseline data successfully!');
      }
      
      console.log('\n📊 August Baseline Data Summary:');
      console.log('Week: July 27 - August 2, 2025');
      console.log(`Weekly Revenue: $32,219.95`);
      console.log(`Monthly Revenue: $50,223.90`);
      console.log(`Total Active Members: 139`);
      console.log(`  • Individual: 103`);
      console.log(`  • Family: 18`);
      console.log(`  • Concierge: 21`);
      console.log(`  • Corporate: 1`);
      console.log(`Unique Customers Weekly: 161`);
      console.log(`IV Infusions Weekly: 95 (75 weekday + 20 weekend)`);
      console.log(`Injections Weekly: 61 (55 weekday + 6 weekend)`);
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Error loading August data:', error);
    throw error;
  }
}

// Export function for use in other modules
module.exports = {
  loadAugustData
};

// CLI usage
if (require.main === module) {
  loadAugustData()
    .then(() => {
      console.log('\n🎉 August baseline data loaded successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Failed to load August data:', error);
      process.exit(1);
    })
    .finally(() => {
      pool.end();
    });
}