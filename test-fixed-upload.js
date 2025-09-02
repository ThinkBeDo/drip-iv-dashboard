#!/usr/bin/env node

/**
 * Test the complete upload flow with the fixed date parsing
 */

const { importWeeklyData, setDatabasePool } = require('./import-weekly-data');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

async function testFixedUpload() {
  console.log('='.repeat(60));
  console.log(`${colors.blue}TESTING FIXED UPLOAD FLOW${colors.reset}`);
  console.log('='.repeat(60));
  
  // Create database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log(`${colors.green}✓ Connected to database${colors.reset}`);
    
    // Set the pool for import-weekly-data module
    setDatabasePool(pool);
    
    // Path to test files
    const revenueFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls');
    const membershipFile = path.join(__dirname, 'Drip IV Active Memberships.xlsx');
    
    console.log(`\n${colors.cyan}Testing revenue file upload...${colors.reset}`);
    console.log(`Revenue file: ${path.basename(revenueFile)}`);
    console.log(`Membership file: ${path.basename(membershipFile)}`);
    
    // Import the data
    console.log(`\n${colors.cyan}Importing weekly data...${colors.reset}`);
    const importedData = await importWeeklyData(revenueFile, membershipFile);
    
    if (importedData) {
      console.log(`\n${colors.green}✓ Import successful!${colors.reset}`);
      console.log(`Week dates: ${importedData.week_start_date} to ${importedData.week_end_date}`);
      console.log(`Weekly revenue: $${importedData.actual_weekly_revenue || 0}`);
      console.log(`Monthly revenue: $${importedData.actual_monthly_revenue || 0}`);
      console.log(`Total members: ${importedData.total_drip_iv_members || 0}`);
      console.log(`Unique customers (weekly): ${importedData.unique_customers_weekly || 0}`);
      console.log(`Unique customers (monthly): ${importedData.unique_customers_monthly || 0}`);
      
      // Verify the data was saved correctly
      console.log(`\n${colors.cyan}Verifying database entry...${colors.reset}`);
      
      const verifyQuery = `
        SELECT * FROM analytics_data
        WHERE week_start_date = $1 AND week_end_date = $2
      `;
      
      const result = await pool.query(verifyQuery, [
        importedData.week_start_date,
        importedData.week_end_date
      ]);
      
      if (result.rows.length > 0) {
        const saved = result.rows[0];
        console.log(`${colors.green}✓ Data found in database${colors.reset}`);
        console.log(`  ID: ${saved.id}`);
        console.log(`  Week: ${saved.week_start_date.toISOString().split('T')[0]} to ${saved.week_end_date.toISOString().split('T')[0]}`);
        console.log(`  Revenue: $${saved.actual_weekly_revenue}`);
        console.log(`  Members: ${saved.total_drip_iv_members}`);
        
        // Check if year is correct (2024)
        const year = saved.week_start_date.getFullYear();
        if (year === 2024) {
          console.log(`${colors.green}✓ Year is correct: ${year}${colors.reset}`);
        } else {
          console.log(`${colors.red}✗ Year is incorrect: ${year} (should be 2024)${colors.reset}`);
        }
      } else {
        console.log(`${colors.red}✗ No data found in database for this week${colors.reset}`);
      }
      
      // Check recent entries
      console.log(`\n${colors.cyan}Recent database entries:${colors.reset}`);
      
      const recentQuery = `
        SELECT week_start_date, week_end_date, actual_weekly_revenue
        FROM analytics_data
        WHERE week_start_date >= '2024-07-01'
        ORDER BY week_start_date DESC
        LIMIT 5
      `;
      
      const recentResult = await pool.query(recentQuery);
      
      if (recentResult.rows.length > 0) {
        recentResult.rows.forEach(row => {
          const startDate = row.week_start_date.toISOString().split('T')[0];
          const endDate = row.week_end_date.toISOString().split('T')[0];
          console.log(`  ${startDate} to ${endDate}: $${row.actual_weekly_revenue || 0}`);
        });
      }
      
      console.log(`\n${colors.green}✅ UPLOAD TEST COMPLETED SUCCESSFULLY!${colors.reset}`);
      console.log(`${colors.green}The revenue data has been correctly uploaded with 2024 dates.${colors.reset}`);
      
    } else {
      console.log(`${colors.red}✗ Import returned no data${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}✗ Test failed:${colors.reset}`);
    console.error(`  ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  } finally {
    await pool.end();
  }
  
  console.log('\n' + '='.repeat(60));
}

// Run the test
testFixedUpload().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});