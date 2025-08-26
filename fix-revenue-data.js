#!/usr/bin/env node

/**
 * Fix Revenue Data Script
 * 
 * This script re-imports the revenue data using the corrected calculation logic
 * to fix the database entries that have incorrect weekly/monthly revenue values.
 * 
 * The bug was that ALL transactions were being added to monthly revenue regardless
 * of date, causing massive over-reporting.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Import the fixed import function
const { importWeeklyData } = require('./import-weekly-data');

// Database connection
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable not found');
  console.error('Please set DATABASE_URL in your .env file or environment');
  console.error('For Railway deployment, this is automatically set');
  console.error('For local testing, create a .env file with:');
  console.error('DATABASE_URL=postgresql://user:password@localhost:5432/dbname');
  process.exit(1);
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : false
});

async function fixRevenueData() {
  console.log('🔧 REVENUE DATA FIX SCRIPT');
  console.log('=' .repeat(60));
  console.log('This script will re-import revenue data with corrected calculations');
  console.log('');
  
  try {
    // Test database connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection established');
    
    // Check for CSV file
    const csvPath = path.join(__dirname, 'revenue-july-august.csv');
    if (!fs.existsSync(csvPath)) {
      console.error('❌ Revenue CSV file not found:', csvPath);
      console.error('Please ensure revenue-july-august.csv exists in the project directory');
      process.exit(1);
    }
    
    console.log('📊 Found revenue CSV file:', csvPath);
    
    // Get current data from database for comparison
    console.log('\n📈 Current Database Values (BEFORE fix):');
    const beforeResult = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        actual_monthly_revenue,
        unique_customers_weekly,
        unique_customers_monthly
      FROM analytics_data 
      ORDER BY week_end_date DESC 
      LIMIT 5
    `);
    
    if (beforeResult.rows.length > 0) {
      beforeResult.rows.forEach(row => {
        console.log(`  Week ${row.week_start_date} to ${row.week_end_date}:`);
        console.log(`    Weekly Revenue: $${row.actual_weekly_revenue}`);
        console.log(`    Monthly Revenue: $${row.actual_monthly_revenue}`);
        console.log(`    Weekly Customers: ${row.unique_customers_weekly}`);
        console.log(`    Monthly Customers: ${row.unique_customers_monthly}`);
      });
    } else {
      console.log('  No data found in database');
    }
    
    // Re-import with fixed logic
    console.log('\n🔄 Re-importing data with corrected revenue calculations...');
    
    const importedData = await importWeeklyData(csvPath, null);
    
    console.log('\n✨ Import completed with fixed calculations!');
    console.log('\n📊 New Calculated Values:');
    console.log(`  Week: ${importedData.week_start_date} to ${importedData.week_end_date}`);
    console.log(`  Weekly Revenue: $${importedData.actual_weekly_revenue.toFixed(2)}`);
    console.log(`  Monthly Revenue: $${importedData.actual_monthly_revenue.toFixed(2)}`);
    console.log(`  Weekly Customers: ${importedData.unique_customers_weekly}`);
    console.log(`  Monthly Customers: ${importedData.unique_customers_monthly}`);
    
    // Verify the fix worked
    console.log('\n📈 Current Database Values (AFTER fix):');
    const afterResult = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        actual_monthly_revenue,
        unique_customers_weekly,
        unique_customers_monthly
      FROM analytics_data 
      ORDER BY week_end_date DESC 
      LIMIT 5
    `);
    
    if (afterResult.rows.length > 0) {
      afterResult.rows.forEach(row => {
        console.log(`  Week ${row.week_start_date} to ${row.week_end_date}:`);
        console.log(`    Weekly Revenue: $${row.actual_weekly_revenue}`);
        console.log(`    Monthly Revenue: $${row.actual_monthly_revenue}`);
        console.log(`    Weekly Customers: ${row.unique_customers_weekly}`);
        console.log(`    Monthly Customers: ${row.unique_customers_monthly}`);
      });
    }
    
    console.log('\n✅ Revenue data fix completed successfully!');
    console.log('The dashboard should now show accurate revenue values.');
    
  } catch (error) {
    console.error('\n❌ Error fixing revenue data:', error.message);
    console.error('Details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the fix if executed directly
if (require.main === module) {
  fixRevenueData();
}

module.exports = { fixRevenueData };