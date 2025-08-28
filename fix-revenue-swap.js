#!/usr/bin/env node
/**
 * FIX REVENUE DATA SWAP
 * This script checks and fixes the swapped weekly/monthly revenue values
 */

const { Pool } = require('pg');
require('dotenv').config();

async function fixRevenueData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Checking current revenue data...');
    
    // Get the current data
    const checkQuery = `
      SELECT 
        id,
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        actual_monthly_revenue,
        drip_iv_revenue_weekly,
        drip_iv_revenue_monthly,
        semaglutide_revenue_weekly,
        semaglutide_revenue_monthly
      FROM analytics_data 
      ORDER BY week_start_date DESC 
      LIMIT 5
    `;
    
    const result = await pool.query(checkQuery);
    
    console.log('\n📊 Current Revenue Data:');
    for (const row of result.rows) {
      console.log(`\nWeek: ${row.week_start_date} to ${row.week_end_date}`);
      console.log(`  Weekly Revenue: $${row.actual_weekly_revenue}`);
      console.log(`  Monthly Revenue: $${row.actual_monthly_revenue}`);
      
      // Check if values appear swapped
      if (parseFloat(row.actual_weekly_revenue) > parseFloat(row.actual_monthly_revenue)) {
        console.log('  ⚠️  ISSUE DETECTED: Weekly revenue is greater than monthly!');
        console.log('  🔄 This needs to be fixed!');
        
        // Fix the swap
        const fixQuery = `
          UPDATE analytics_data 
          SET 
            actual_weekly_revenue = $1,
            actual_monthly_revenue = $2,
            drip_iv_revenue_weekly = $3,
            drip_iv_revenue_monthly = $4,
            semaglutide_revenue_weekly = $5,
            semaglutide_revenue_monthly = $6
          WHERE id = $7
        `;
        
        await pool.query(fixQuery, [
          row.actual_monthly_revenue,  // Swap: monthly -> weekly
          row.actual_weekly_revenue,   // Swap: weekly -> monthly
          row.drip_iv_revenue_monthly, // Swap: monthly -> weekly
          row.drip_iv_revenue_weekly,  // Swap: weekly -> monthly
          row.semaglutide_revenue_monthly, // Swap: monthly -> weekly
          row.semaglutide_revenue_weekly,  // Swap: weekly -> monthly
          row.id
        ]);
        
        console.log('  ✅ Fixed revenue swap for this record');
      }
    }
    
    // Verify the fix
    console.log('\n📊 Verifying Fixed Data:');
    const verifyResult = await pool.query(checkQuery);
    
    for (const row of verifyResult.rows) {
      console.log(`\nWeek: ${row.week_start_date} to ${row.week_end_date}`);
      console.log(`  Weekly Revenue: $${row.actual_weekly_revenue}`);
      console.log(`  Monthly Revenue: $${row.actual_monthly_revenue}`);
      
      if (parseFloat(row.actual_weekly_revenue) > parseFloat(row.actual_monthly_revenue)) {
        console.log('  ❌ Still has issues!');
      } else {
        console.log('  ✅ Looks correct now!');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run if this is the main module
if (require.main === module) {
  console.log('🚀 Starting Revenue Data Fix...\n');
  fixRevenueData().then(() => {
    console.log('\n✅ Revenue fix process completed!');
  });
}

module.exports = { fixRevenueData };