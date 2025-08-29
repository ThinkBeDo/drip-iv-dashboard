#!/usr/bin/env node

/**
 * Test file to simulate the exact upload process from the dashboard
 * This mimics what happens when users upload files through the web interface
 */

const { importWeeklyData } = require('./import-weekly-data');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Test database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ANSI color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function testDatabaseConnection() {
  console.log(`\n${colors.blue}Testing database connection...${colors.reset}`);
  try {
    const result = await pool.query('SELECT NOW()');
    console.log(`${colors.green}✓ Database connected successfully${colors.reset}`);
    console.log(`  Time from DB: ${result.rows[0].now}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}✗ Database connection failed:${colors.reset}`, error.message);
    return false;
  }
}

async function testTableStructure() {
  console.log(`\n${colors.blue}Checking analytics_data table structure...${colors.reset}`);
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'analytics_data'
      ORDER BY ordinal_position
    `);
    
    console.log(`${colors.green}✓ Table has ${result.rows.length} columns${colors.reset}`);
    
    // Check for critical columns
    const criticalColumns = [
      'week_start_date', 'week_end_date', 'iv_infusions_weekday_weekly',
      'actual_weekly_revenue', 'total_drip_iv_members'
    ];
    
    const columnNames = result.rows.map(r => r.column_name);
    const missingColumns = criticalColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      console.error(`${colors.red}✗ Missing critical columns:${colors.reset}`, missingColumns);
      return false;
    }
    
    console.log(`${colors.green}✓ All critical columns present${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}✗ Table structure check failed:${colors.reset}`, error.message);
    return false;
  }
}

async function testFileReading() {
  console.log(`\n${colors.blue}Testing file reading...${colors.reset}`);
  
  const revenueFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).csv');
  const membershipFile = path.join(__dirname, 'Drip IV Active Memberships.xlsx');
  
  // Check if files exist
  if (!fs.existsSync(revenueFile)) {
    console.error(`${colors.red}✗ Revenue CSV file not found${colors.reset}`);
    return false;
  }
  console.log(`${colors.green}✓ Revenue CSV file found${colors.reset}`);
  
  if (!fs.existsSync(membershipFile)) {
    console.error(`${colors.red}✗ Membership Excel file not found${colors.reset}`);
    return false;
  }
  console.log(`${colors.green}✓ Membership Excel file found${colors.reset}`);
  
  // Check file encoding
  const buffer = fs.readFileSync(revenueFile, { flag: 'r' });
  const firstBytes = buffer.slice(0, 4);
  
  if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
    console.log(`${colors.green}✓ UTF-16 LE encoding detected in CSV${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠ CSV appears to be UTF-8 encoded${colors.reset}`);
  }
  
  return true;
}

async function simulateUpload() {
  console.log(`\n${colors.blue}Simulating dashboard upload process...${colors.reset}`);
  
  const revenueFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).csv');
  const membershipFile = path.join(__dirname, 'Drip IV Active Memberships.xlsx');
  
  try {
    console.log('\n📤 Starting upload simulation...');
    console.log(`  Revenue file: ${path.basename(revenueFile)}`);
    console.log(`  Membership file: ${path.basename(membershipFile)}`);
    
    // This mimics the server.js call at line 2931
    const result = await importWeeklyData(revenueFile, membershipFile);
    
    console.log(`\n${colors.green}✓ Upload simulation completed successfully!${colors.reset}`);
    console.log('\n📊 Imported Data Summary:');
    console.log(`  Week: ${result.week_start_date} to ${result.week_end_date}`);
    console.log(`  Weekly Revenue: $${result.actual_weekly_revenue || 0}`);
    console.log(`  Monthly Revenue: $${result.actual_monthly_revenue || 0}`);
    console.log(`  Total Members: ${result.total_drip_iv_members || 0}`);
    console.log(`  Unique Customers (Weekly): ${result.unique_customers_weekly || 0}`);
    console.log(`  Unique Customers (Monthly): ${result.unique_customers_monthly || 0}`);
    
    return true;
  } catch (error) {
    console.error(`\n${colors.red}✗ Upload simulation failed:${colors.reset}`);
    console.error(`  Error: ${error.message}`);
    
    // Detailed error analysis
    if (error.code === '42P18') {
      console.error(`\n${colors.yellow}⚠ PostgreSQL Parameter Type Error Detected${colors.reset}`);
      console.error('  This means there\'s a mismatch between SQL parameters and provided values');
      console.error('  Check that all parameter placeholders ($1, $2, etc.) match the array values');
    } else if (error.code === '23505') {
      console.error(`\n${colors.yellow}⚠ Duplicate Key Error${colors.reset}`);
      console.error('  Data for this week already exists in the database');
    } else if (error.code === '22P02') {
      console.error(`\n${colors.yellow}⚠ Invalid Text Representation${colors.reset}`);
      console.error('  A value couldn\'t be converted to the expected database type');
    }
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    return false;
  }
}

async function checkExistingData() {
  console.log(`\n${colors.blue}Checking for existing data...${colors.reset}`);
  
  try {
    const result = await pool.query(`
      SELECT week_start_date, week_end_date, actual_weekly_revenue, total_drip_iv_members
      FROM analytics_data
      ORDER BY week_start_date DESC
      LIMIT 5
    `);
    
    if (result.rows.length > 0) {
      console.log(`${colors.green}✓ Found ${result.rows.length} recent entries:${colors.reset}`);
      result.rows.forEach(row => {
        console.log(`  ${row.week_start_date} to ${row.week_end_date}: $${row.actual_weekly_revenue} (${row.total_drip_iv_members} members)`);
      });
    } else {
      console.log(`${colors.yellow}⚠ No existing data found in analytics_data table${colors.reset}`);
    }
    
    return true;
  } catch (error) {
    console.error(`${colors.red}✗ Failed to check existing data:${colors.reset}`, error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('📋 DRIP IV DASHBOARD UPLOAD TEST SUITE');
  console.log('='.repeat(60));
  
  let allTestsPassed = true;
  
  // Run tests in sequence
  const tests = [
    { name: 'Database Connection', fn: testDatabaseConnection },
    { name: 'Table Structure', fn: testTableStructure },
    { name: 'File Reading', fn: testFileReading },
    { name: 'Existing Data Check', fn: checkExistingData },
    { name: 'Upload Simulation', fn: simulateUpload }
  ];
  
  for (const test of tests) {
    const passed = await test.fn();
    if (!passed) {
      allTestsPassed = false;
      console.log(`\n${colors.red}✗ Test "${test.name}" failed${colors.reset}`);
      
      // Don't continue if critical tests fail
      if (test.name === 'Database Connection' || test.name === 'File Reading') {
        console.log(`\n${colors.red}Stopping tests due to critical failure${colors.reset}`);
        break;
      }
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log(`${colors.green}✅ ALL TESTS PASSED!${colors.reset}`);
    console.log('The upload process is working correctly.');
  } else {
    console.log(`${colors.red}❌ SOME TESTS FAILED${colors.reset}`);
    console.log('Please review the errors above and fix the issues.');
  }
  console.log('='.repeat(60));
  
  // Close database connection
  await pool.end();
  process.exit(allTestsPassed ? 0 : 1);
}

// Run the tests
runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});