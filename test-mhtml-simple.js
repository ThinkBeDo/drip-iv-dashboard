#!/usr/bin/env node

/**
 * Simple test for MHTML data flow
 */

const { importWeeklyData } = require('./import-weekly-data');
const path = require('path');

async function testMHTMLFlow() {
  console.log('Testing MHTML file with import-weekly-data...\n');
  
  const mhtmlFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls');
  const membershipFile = path.join(__dirname, 'Drip IV Active Memberships.xlsx');
  
  try {
    console.log('Processing files:');
    console.log('  Revenue (MHTML):', mhtmlFile);
    console.log('  Membership:', membershipFile);
    
    const result = await importWeeklyData(mhtmlFile, membershipFile);
    
    console.log('\n✅ Import successful!');
    console.log('\nImported Data Summary:');
    console.log('  Week:', result.week_start_date, 'to', result.week_end_date);
    console.log('  Weekly Revenue: $' + (result.actual_weekly_revenue || 0));
    console.log('  Monthly Revenue: $' + (result.actual_monthly_revenue || 0));
    console.log('  Total Members:', result.total_drip_iv_members || 0);
    console.log('  Unique Customers (Weekly):', result.unique_customers_weekly || 0);
    console.log('  Unique Customers (Monthly):', result.unique_customers_monthly || 0);
    
    // Check if dates are properly formatted
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (result.week_start_date && dateRegex.test(result.week_start_date)) {
      console.log('\n✅ Date format is correct (YYYY-MM-DD)');
    } else {
      console.log('\n⚠️  Date format issue:', result.week_start_date);
    }
    
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    console.error(error.stack);
  }
}

testMHTMLFlow();