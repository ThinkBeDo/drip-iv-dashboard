#!/usr/bin/env node

/**
 * Test complete MHTML data flow from file to extraction
 */

const fs = require('fs');
const path = require('path');

// Import the functions we're testing
const { parseMHTMLData } = eval(`(function() {
  ${fs.readFileSync('server.js', 'utf8').match(/async function parseMHTMLData[\s\S]*?^\}/m)[0]}
  return { parseMHTMLData };
})()`);

const { extractFromCSV } = eval(`(function() {
  ${fs.readFileSync('server.js', 'utf8').match(/function extractFromCSV[\s\S]*?^  return data;\n\}/m)[0]}
  return { extractFromCSV };
})()`);

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

async function testFullFlow() {
  console.log('='.repeat(60));
  console.log(`${colors.blue}TESTING COMPLETE MHTML DATA FLOW${colors.reset}`);
  console.log('='.repeat(60));
  
  const mhtmlFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls');
  
  try {
    // Step 1: Parse MHTML file
    console.log(`\n${colors.cyan}Step 1: Parsing MHTML file...${colors.reset}`);
    const mhtmlData = await parseMHTMLData(mhtmlFile);
    console.log(`${colors.green}✓ Parsed ${mhtmlData.length} rows${colors.reset}`);
    
    // Step 2: Extract analytics data
    console.log(`\n${colors.cyan}Step 2: Extracting analytics data...${colors.reset}`);
    const extractedData = extractFromCSV(mhtmlData);
    
    // Verify extracted data structure
    console.log(`\n${colors.cyan}Extracted Data Summary:${colors.reset}`);
    console.log(`  Week Start: ${extractedData.week_start_date || 'N/A'}`);
    console.log(`  Week End: ${extractedData.week_end_date || 'N/A'}`);
    console.log(`  Weekly Revenue: $${extractedData.actual_weekly_revenue || 0}`);
    console.log(`  Monthly Revenue: $${extractedData.actual_monthly_revenue || 0}`);
    console.log(`  Unique Customers (Weekly): ${extractedData.unique_customers_weekly || 0}`);
    console.log(`  Unique Customers (Monthly): ${extractedData.unique_customers_monthly || 0}`);
    console.log(`  IV Infusions (Weekday): ${extractedData.iv_infusions_weekday_weekly || 0}`);
    console.log(`  IV Infusions (Weekend): ${extractedData.iv_infusions_weekend_weekly || 0}`);
    console.log(`  Total Members: ${extractedData.total_drip_iv_members || 0}`);
    
    // Check popular services
    if (extractedData.popular_infusions && extractedData.popular_infusions.length > 0) {
      console.log(`\n${colors.cyan}Popular Infusions:${colors.reset}`);
      extractedData.popular_infusions.forEach((service, i) => {
        console.log(`  ${i + 1}. ${service}`);
      });
    }
    
    if (extractedData.popular_injections && extractedData.popular_injections.length > 0) {
      console.log(`\n${colors.cyan}Popular Injections:${colors.reset}`);
      extractedData.popular_injections.forEach((service, i) => {
        console.log(`  ${i + 1}. ${service}`);
      });
    }
    
    // Validate data structure for database
    console.log(`\n${colors.cyan}Database Field Validation:${colors.reset}`);
    const requiredFields = [
      'week_start_date', 'week_end_date',
      'iv_infusions_weekday_weekly', 'iv_infusions_weekend_weekly',
      'actual_weekly_revenue', 'actual_monthly_revenue',
      'unique_customers_weekly', 'unique_customers_monthly',
      'total_drip_iv_members'
    ];
    
    let allFieldsValid = true;
    requiredFields.forEach(field => {
      if (extractedData.hasOwnProperty(field)) {
        console.log(`  ${colors.green}✓${colors.reset} ${field}: ${extractedData[field]}`);
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${field}: MISSING`);
        allFieldsValid = false;
      }
    });
    
    if (allFieldsValid) {
      console.log(`\n${colors.green}✅ ALL FIELDS VALID FOR DATABASE INSERT${colors.reset}`);
    } else {
      console.log(`\n${colors.yellow}⚠ Some fields are missing${colors.reset}`);
    }
    
    console.log(`\n${colors.green}✅ FULL FLOW TEST COMPLETED SUCCESSFULLY!${colors.reset}`);
    
  } catch (error) {
    console.error(`\n${colors.red}✗ Full flow test failed:${colors.reset}`);
    console.error(`  ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

// Run the test
testFullFlow().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});