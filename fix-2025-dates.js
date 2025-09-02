#!/usr/bin/env node

/**
 * Migration script to fix incorrectly parsed 2025 dates
 * Changes 2025 dates to 2024 in the analytics_data table
 */

const { Pool } = require('pg');
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

async function fixDates() {
  console.log('='.repeat(60));
  console.log(`${colors.blue}FIXING 2025 DATE ENTRIES IN DATABASE${colors.reset}`);
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
    
    // First, check what 2025 records exist
    console.log(`\n${colors.cyan}Checking for 2025 date entries...${colors.reset}`);
    
    const check2025Query = `
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue, total_drip_iv_members
      FROM analytics_data
      WHERE EXTRACT(YEAR FROM week_start_date) = 2025 
         OR EXTRACT(YEAR FROM week_end_date) = 2025
      ORDER BY week_start_date
    `;
    
    const result2025 = await pool.query(check2025Query);
    
    if (result2025.rows.length === 0) {
      console.log(`${colors.yellow}No 2025 entries found. Database is clean.${colors.reset}`);
    } else {
      console.log(`${colors.yellow}Found ${result2025.rows.length} entries with 2025 dates:${colors.reset}`);
      
      result2025.rows.forEach(row => {
        console.log(`  ID: ${row.id}`);
        console.log(`    Week: ${row.week_start_date} to ${row.week_end_date}`);
        console.log(`    Revenue: $${row.actual_weekly_revenue || 0}`);
        console.log(`    Members: ${row.total_drip_iv_members || 0}`);
      });
      
      // Update the dates from 2025 to 2024
      console.log(`\n${colors.cyan}Updating dates from 2025 to 2024...${colors.reset}`);
      
      const updateQuery = `
        UPDATE analytics_data
        SET 
          week_start_date = week_start_date - INTERVAL '1 year',
          week_end_date = week_end_date - INTERVAL '1 year'
        WHERE EXTRACT(YEAR FROM week_start_date) = 2025 
           OR EXTRACT(YEAR FROM week_end_date) = 2025
        RETURNING id, week_start_date, week_end_date
      `;
      
      const updateResult = await pool.query(updateQuery);
      
      console.log(`${colors.green}✓ Updated ${updateResult.rows.length} records${colors.reset}`);
      
      // Show updated records
      if (updateResult.rows.length > 0) {
        console.log(`\n${colors.cyan}Updated records:${colors.reset}`);
        updateResult.rows.forEach(row => {
          console.log(`  ID ${row.id}: ${row.week_start_date} to ${row.week_end_date}`);
        });
      }
    }
    
    // Check for any duplicate weeks after the fix
    console.log(`\n${colors.cyan}Checking for duplicate week entries...${colors.reset}`);
    
    const duplicateQuery = `
      SELECT week_start_date, week_end_date, COUNT(*) as count
      FROM analytics_data
      GROUP BY week_start_date, week_end_date
      HAVING COUNT(*) > 1
    `;
    
    const duplicates = await pool.query(duplicateQuery);
    
    if (duplicates.rows.length > 0) {
      console.log(`${colors.yellow}⚠ Found duplicate week entries:${colors.reset}`);
      duplicates.rows.forEach(row => {
        console.log(`  Week ${row.week_start_date} to ${row.week_end_date}: ${row.count} entries`);
      });
      
      // Keep only the most recent entry for each duplicate week
      console.log(`\n${colors.cyan}Removing duplicate entries (keeping most recent)...${colors.reset}`);
      
      for (const dup of duplicates.rows) {
        const deleteQuery = `
          DELETE FROM analytics_data
          WHERE week_start_date = $1 AND week_end_date = $2
            AND id NOT IN (
              SELECT id FROM analytics_data
              WHERE week_start_date = $1 AND week_end_date = $2
              ORDER BY id DESC
              LIMIT 1
            )
        `;
        
        await pool.query(deleteQuery, [dup.week_start_date, dup.week_end_date]);
        console.log(`  Cleaned up duplicates for week ${dup.week_start_date}`);
      }
    } else {
      console.log(`${colors.green}✓ No duplicate weeks found${colors.reset}`);
    }
    
    // Show final state
    console.log(`\n${colors.cyan}Final database state:${colors.reset}`);
    
    const finalQuery = `
      SELECT week_start_date, week_end_date, actual_weekly_revenue, total_drip_iv_members
      FROM analytics_data
      WHERE week_start_date >= '2024-08-01'
      ORDER BY week_start_date DESC
      LIMIT 5
    `;
    
    const finalResult = await pool.query(finalQuery);
    
    if (finalResult.rows.length > 0) {
      console.log('Recent entries:');
      finalResult.rows.forEach(row => {
        console.log(`  Week: ${row.week_start_date.toISOString().split('T')[0]} to ${row.week_end_date.toISOString().split('T')[0]}`);
        console.log(`    Revenue: $${row.actual_weekly_revenue || 0}`);
        console.log(`    Members: ${row.total_drip_iv_members || 0}`);
      });
    }
    
    console.log(`\n${colors.green}✅ DATE FIX MIGRATION COMPLETED SUCCESSFULLY!${colors.reset}`);
    
  } catch (error) {
    console.error(`\n${colors.red}✗ Migration failed:${colors.reset}`);
    console.error(`  ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
  
  console.log('\n' + '='.repeat(60));
}

// Run the migration
fixDates().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});