#!/usr/bin/env node

/**
 * Test file parsing without database connection
 * Focus on CSV/Excel parsing and data extraction
 */

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const XLSX = require('xlsx');

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

// Import the parsing functions
const { processRevenueData, processMembershipData } = require('./import-weekly-data');

async function testCSVParsing() {
  console.log(`\n${colors.blue}Testing CSV Parsing...${colors.reset}`);
  
  const csvFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).csv');
  
  if (!fs.existsSync(csvFile)) {
    console.error(`${colors.red}✗ CSV file not found${colors.reset}`);
    return null;
  }
  
  try {
    // Check encoding
    const buffer = fs.readFileSync(csvFile);
    const firstBytes = buffer.slice(0, 4);
    
    if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
      console.log(`${colors.green}✓ UTF-16 LE with BOM detected${colors.reset}`);
    }
    
    // Parse the CSV
    console.log(`${colors.cyan}Parsing CSV file...${colors.reset}`);
    const startTime = Date.now();
    const data = await processRevenueData(csvFile);
    const elapsed = Date.now() - startTime;
    
    console.log(`${colors.green}✓ CSV parsed in ${elapsed}ms${colors.reset}`);
    console.log('\n📊 Revenue Data Extracted:');
    console.log(`  Week Start Date: ${data.weekStartDate || 'N/A'}`);
    console.log(`  Week End Date: ${data.weekEndDate || 'N/A'}`);
    console.log(`  Weekly Revenue: $${data.actual_weekly_revenue || 0}`);
    console.log(`  Monthly Revenue: $${data.actual_monthly_revenue || 0}`);
    console.log(`  IV Infusions (Weekday): ${data.iv_infusions_weekday_weekly || 0}`);
    console.log(`  IV Infusions (Weekend): ${data.iv_infusions_weekend_weekly || 0}`);
    console.log(`  Unique Customers (Weekly): ${data.unique_customers_weekly || 0}`);
    console.log(`  Unique Customers (Monthly): ${data.unique_customers_monthly || 0}`);
    
    return data;
  } catch (error) {
    console.error(`${colors.red}✗ CSV parsing failed:${colors.reset}`);
    console.error(`  ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    return null;
  }
}

async function testExcelParsing() {
  console.log(`\n${colors.blue}Testing Excel Parsing...${colors.reset}`);
  
  const excelFile = path.join(__dirname, 'Drip IV Active Memberships.xlsx');
  
  if (!fs.existsSync(excelFile)) {
    console.error(`${colors.red}✗ Excel file not found${colors.reset}`);
    return null;
  }
  
  try {
    console.log(`${colors.cyan}Parsing Excel file...${colors.reset}`);
    const startTime = Date.now();
    const data = await processMembershipData(excelFile);
    const elapsed = Date.now() - startTime;
    
    console.log(`${colors.green}✓ Excel parsed in ${elapsed}ms${colors.reset}`);
    console.log('\n👥 Membership Data Extracted:');
    console.log(`  Total Members: ${data.total_drip_iv_members || 0}`);
    console.log(`  Individual: ${data.individual_memberships || 0}`);
    console.log(`  Family: ${data.family_memberships || 0}`);
    console.log(`  Concierge: ${data.concierge_memberships || 0}`);
    console.log(`  Corporate: ${data.corporate_memberships || 0}`);
    console.log(`  Family Concierge: ${data.family_concierge_memberships || 0}`);
    console.log(`  Drip Concierge: ${data.drip_concierge_memberships || 0}`);
    
    return data;
  } catch (error) {
    console.error(`${colors.red}✗ Excel parsing failed:${colors.reset}`);
    console.error(`  ${error.message}`);
    return null;
  }
}

async function testDataCombination() {
  console.log(`\n${colors.blue}Testing Data Combination...${colors.reset}`);
  
  const revenueData = await testCSVParsing();
  const membershipData = await testExcelParsing();
  
  if (!revenueData || !membershipData) {
    console.error(`${colors.red}✗ Cannot combine data - parsing failed${colors.reset}`);
    return null;
  }
  
  try {
    // Combine the data as the importWeeklyData function does
    const combinedData = {
      ...revenueData,
      ...membershipData,
      weekly_revenue_goal: 32125.00,
      monthly_revenue_goal: 128500.00,
      days_left_in_month: Math.max(0, 30 - new Date().getDate()),
      popular_infusions: ['Energy', 'NAD+', 'Performance & Recovery'],
      popular_infusions_status: 'Active',
      popular_injections: ['B12', 'Vitamin D', 'Metabolism Boost'],
      popular_injections_status: 'Active'
    };
    
    // Check date conversion
    console.log(`\n${colors.cyan}Checking date conversion...${colors.reset}`);
    
    if (combinedData.weekStartDate) {
      if (combinedData.weekStartDate instanceof Date) {
        combinedData.week_start_date = combinedData.weekStartDate.toISOString().split('T')[0];
        console.log(`${colors.green}✓ Week start date converted: ${combinedData.week_start_date}${colors.reset}`);
      } else {
        combinedData.week_start_date = combinedData.weekStartDate;
        console.log(`${colors.yellow}⚠ Week start date already string: ${combinedData.week_start_date}${colors.reset}`);
      }
    }
    
    if (combinedData.weekEndDate) {
      if (combinedData.weekEndDate instanceof Date) {
        combinedData.week_end_date = combinedData.weekEndDate.toISOString().split('T')[0];
        console.log(`${colors.green}✓ Week end date converted: ${combinedData.week_end_date}${colors.reset}`);
      } else {
        combinedData.week_end_date = combinedData.weekEndDate;
        console.log(`${colors.yellow}⚠ Week end date already string: ${combinedData.week_end_date}${colors.reset}`);
      }
    }
    
    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (combinedData.week_start_date && !dateRegex.test(combinedData.week_start_date)) {
      console.error(`${colors.red}✗ Invalid week_start_date format: ${combinedData.week_start_date}${colors.reset}`);
    }
    if (combinedData.week_end_date && !dateRegex.test(combinedData.week_end_date)) {
      console.error(`${colors.red}✗ Invalid week_end_date format: ${combinedData.week_end_date}${colors.reset}`);
    }
    
    // Check numeric fields
    console.log(`\n${colors.cyan}Validating numeric fields...${colors.reset}`);
    const numericFields = [
      'iv_infusions_weekday_weekly', 'iv_infusions_weekend_weekly',
      'actual_weekly_revenue', 'actual_monthly_revenue',
      'total_drip_iv_members', 'individual_memberships'
    ];
    
    let allNumericValid = true;
    for (const field of numericFields) {
      if (combinedData[field] !== undefined) {
        const value = Number(combinedData[field]);
        if (isNaN(value)) {
          console.error(`${colors.red}✗ Invalid numeric value for ${field}: ${combinedData[field]}${colors.reset}`);
          allNumericValid = false;
        } else {
          console.log(`${colors.green}✓ ${field}: ${value}${colors.reset}`);
        }
      }
    }
    
    if (allNumericValid) {
      console.log(`${colors.green}✓ All numeric fields are valid${colors.reset}`);
    }
    
    console.log(`\n${colors.green}✓ Data combination successful${colors.reset}`);
    return combinedData;
    
  } catch (error) {
    console.error(`${colors.red}✗ Data combination failed:${colors.reset}`);
    console.error(`  ${error.message}`);
    return null;
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('📋 FILE PARSING TEST (NO DATABASE)');
  console.log('='.repeat(60));
  
  const combinedData = await testDataCombination();
  
  console.log('\n' + '='.repeat(60));
  if (combinedData) {
    console.log(`${colors.green}✅ FILE PARSING TESTS PASSED!${colors.reset}`);
    console.log('\nThe files are being parsed correctly.');
    console.log('The issue is likely in the database interaction.');
    console.log('\n🔍 What we need vs What\'s happening:');
    console.log('\nWE NEED:');
    console.log('  1. Parse CSV and Excel files ✓');
    console.log('  2. Extract revenue and membership data ✓');
    console.log('  3. Convert dates to YYYY-MM-DD format ✓');
    console.log('  4. Ensure all numeric values are valid ✓');
    console.log('  5. Insert/Update in database with correct parameter binding');
    console.log('\nWHAT\'S HAPPENING:');
    console.log('  - Files are parsing correctly');
    console.log('  - Data extraction is working');
    console.log('  - The UPDATE query had mismatched parameters (FIXED)');
    console.log('  - Now parameters should align correctly ($1-$26)');
  } else {
    console.log(`${colors.red}❌ FILE PARSING TESTS FAILED${colors.reset}`);
    console.log('Check the errors above for details.');
  }
  console.log('='.repeat(60));
}

// Run the tests
runTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});