#!/usr/bin/env node

/**
 * Check what weeks of data exist in the database
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

async function checkDatabaseWeeks() {
  console.log('='.repeat(60));
  console.log(`${colors.blue}DATABASE WEEK ANALYSIS${colors.reset}`);
  console.log('='.repeat(60));
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  try {
    await pool.query('SELECT 1');
    console.log(`${colors.green}✓ Connected to database${colors.reset}`);
    
    // Get today's date
    const today = new Date();
    console.log(`\n${colors.cyan}Today's date: ${today.toISOString().split('T')[0]}${colors.reset}`);
    
    // Calculate date ranges for filters
    const ranges = {
      'This Week': getWeekRange(0),
      'Last Week': getWeekRange(-1),
      '2 Weeks Ago': getWeekRange(-2),
      '3 Weeks Ago': getWeekRange(-3),
      'This Month': getMonthRange(0),
      'Last Month': getMonthRange(-1)
    };
    
    console.log(`\n${colors.cyan}Filter Date Ranges:${colors.reset}`);
    for (const [name, range] of Object.entries(ranges)) {
      console.log(`${name}: ${range.start.toISOString().split('T')[0]} to ${range.end.toISOString().split('T')[0]}`);
    }
    
    // Query all data from 2025
    const query = `
      SELECT 
        week_start_date, 
        week_end_date, 
        actual_weekly_revenue,
        total_drip_iv_members,
        unique_customers_weekly
      FROM analytics_data
      WHERE EXTRACT(YEAR FROM week_start_date) = 2025
      ORDER BY week_start_date DESC
    `;
    
    const result = await pool.query(query);
    
    console.log(`\n${colors.cyan}Data in Database (${result.rows.length} weeks):${colors.reset}`);
    
    for (const row of result.rows) {
      const startDate = row.week_start_date.toISOString().split('T')[0];
      const endDate = row.week_end_date.toISOString().split('T')[0];
      const revenue = row.actual_weekly_revenue || 0;
      const members = row.total_drip_iv_members || 0;
      const customers = row.unique_customers_weekly || 0;
      
      // Check which filter this week falls under
      let filterMatch = 'No current filter match';
      for (const [name, range] of Object.entries(ranges)) {
        if (isDateInRange(row.week_start_date, range.start, range.end) ||
            isDateInRange(row.week_end_date, range.start, range.end)) {
          filterMatch = name;
          break;
        }
      }
      
      console.log(`\n${colors.yellow}Week: ${startDate} to ${endDate}${colors.reset}`);
      console.log(`  Revenue: $${revenue.toFixed(2)}`);
      console.log(`  Members: ${members}`);
      console.log(`  Customers: ${customers}`);
      console.log(`  Filter: ${colors.green}${filterMatch}${colors.reset}`);
    }
    
    // Check for missing weeks
    console.log(`\n${colors.cyan}Gap Analysis:${colors.reset}`);
    
    const lastWeekRange = getWeekRange(-1);
    const hasLastWeek = result.rows.some(row => 
      isDateInRange(row.week_start_date, lastWeekRange.start, lastWeekRange.end)
    );
    
    if (!hasLastWeek) {
      console.log(`${colors.red}⚠ Missing data for Last Week (${lastWeekRange.start.toISOString().split('T')[0]} to ${lastWeekRange.end.toISOString().split('T')[0]})${colors.reset}`);
      console.log(`  This is why "Last Week" filter shows no data`);
    }
    
    const thisWeekRange = getWeekRange(0);
    const hasThisWeek = result.rows.some(row => 
      isDateInRange(row.week_start_date, thisWeekRange.start, thisWeekRange.end)
    );
    
    if (!hasThisWeek) {
      console.log(`${colors.yellow}⚠ Missing data for This Week (${thisWeekRange.start.toISOString().split('T')[0]} to ${thisWeekRange.end.toISOString().split('T')[0]})${colors.reset}`);
    }
    
    console.log(`\n${colors.green}✅ ANALYSIS COMPLETE${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error.message);
  } finally {
    await pool.end();
  }
  
  console.log('\n' + '='.repeat(60));
}

function getWeekRange(weeksAgo) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
  
  const monday = new Date(today);
  monday.setDate(today.getDate() - diff + (weeksAgo * 7));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { start: monday, end: sunday };
}

function getMonthRange(monthsAgo) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() + monthsAgo, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + monthsAgo + 1, 0);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

function isDateInRange(date, start, end) {
  return date >= start && date <= end;
}

// Run the check
checkDatabaseWeeks().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});