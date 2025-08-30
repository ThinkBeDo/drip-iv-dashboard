#!/usr/bin/env node

/**
 * Test MHTML parsing functionality
 */

const { processRevenueData } = require('./import-weekly-data');
const path = require('path');

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

async function testMHTMLParsing() {
  console.log('='.repeat(60));
  console.log(`${colors.blue}TESTING MHTML FILE PARSING${colors.reset}`);
  console.log('='.repeat(60));
  
  const mhtmlFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls');
  
  try {
    console.log(`\n${colors.cyan}Parsing MHTML file...${colors.reset}`);
    console.log(`File: ${mhtmlFile}`);
    
    const startTime = Date.now();
    const data = await processRevenueData(mhtmlFile);
    const elapsed = Date.now() - startTime;
    
    console.log(`${colors.green}✓ MHTML parsed in ${elapsed}ms${colors.reset}`);
    
    // Check the parsed data structure
    if (Array.isArray(data)) {
      console.log(`\n${colors.green}✓ Data is in expected array format${colors.reset}`);
      console.log(`Total rows parsed: ${data.length}`);
      
      if (data.length > 0) {
        // Check headers
        const headers = Object.keys(data[0]);
        console.log(`\n${colors.cyan}Column Headers (${headers.length} columns):${colors.reset}`);
        headers.forEach((h, i) => {
          if (i < 20) console.log(`  ${i + 1}. ${h}`);
        });
        
        // Show sample data
        console.log(`\n${colors.cyan}First 3 rows of data:${colors.reset}`);
        data.slice(0, 3).forEach((row, i) => {
          console.log(`\n${colors.yellow}Row ${i + 1}:${colors.reset}`);
          console.log(`  Date: ${row['Date']}`);
          console.log(`  Date Of Payment: ${row['Date Of Payment']}`);
          console.log(`  Patient: ${row['Patient']}`);
          console.log(`  Charge Desc: ${row['Charge Desc']}`);
          console.log(`  Payment: ${row['Calculated Payment (Line)']}`);
        });
        
        // Calculate some metrics
        let totalRevenue = 0;
        let rowsWithPayments = 0;
        const uniquePatients = new Set();
        
        data.forEach(row => {
          const payment = parseFloat((row['Calculated Payment (Line)'] || '0').replace(/[\$,()]/g, '')) || 0;
          if (payment > 0) {
            totalRevenue += payment;
            rowsWithPayments++;
          }
          if (row['Patient']) {
            uniquePatients.add(row['Patient']);
          }
        });
        
        console.log(`\n${colors.cyan}Data Summary:${colors.reset}`);
        console.log(`  Total Revenue: $${totalRevenue.toFixed(2)}`);
        console.log(`  Rows with payments: ${rowsWithPayments}`);
        console.log(`  Unique patients: ${uniquePatients.size}`);
        
        // Check critical columns exist
        const criticalColumns = [
          'Practitioner', 'Date', 'Date Of Payment', 'Patient',
          'Charge Type', 'Charge Desc', 'Calculated Payment (Line)'
        ];
        
        console.log(`\n${colors.cyan}Critical Column Check:${colors.reset}`);
        criticalColumns.forEach(col => {
          if (headers.includes(col)) {
            console.log(`  ${colors.green}✓${colors.reset} ${col}`);
          } else {
            console.log(`  ${colors.red}✗${colors.reset} ${col} - MISSING!`);
          }
        });
        
      }
    } else {
      console.log(`\n${colors.yellow}⚠ Data returned is not an array, it's:${colors.reset}`, typeof data);
      console.log('Data structure:', data);
    }
    
    console.log(`\n${colors.green}✅ MHTML PARSING TEST COMPLETED SUCCESSFULLY!${colors.reset}`);
    
  } catch (error) {
    console.error(`\n${colors.red}✗ MHTML parsing failed:${colors.reset}`);
    console.error(`  ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

// Run the test
testMHTMLParsing().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});