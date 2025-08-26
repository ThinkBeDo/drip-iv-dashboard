#!/usr/bin/env node

/**
 * Test Revenue Fix Script
 * Tests the corrected revenue calculation logic without database
 */

const fs = require('fs');
const path = require('path');

// Import the revenue processing function
const { processRevenueData, analyzeRevenueData } = require('./import-weekly-data');

async function testRevenueFix() {
  console.log('🧪 TESTING REVENUE FIX');
  console.log('=' .repeat(60));
  
  try {
    const csvPath = path.join(__dirname, 'revenue-july-august.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('❌ CSV file not found:', csvPath);
      process.exit(1);
    }
    
    console.log('📊 Processing revenue data from CSV...\n');
    
    // Process the CSV data
    const csvData = await processRevenueData(csvPath);
    console.log(`✅ Loaded ${csvData.length} rows from CSV\n`);
    
    // Analyze with fixed logic
    const metrics = analyzeRevenueData(csvData);
    
    console.log('📈 ANALYSIS RESULTS:');
    console.log('=' .repeat(60));
    
    // Display date ranges
    console.log('\n📅 Date Ranges:');
    console.log(`  Week: ${metrics.weekStartDate ? metrics.weekStartDate.toISOString().split('T')[0] : 'N/A'} to ${metrics.weekEndDate ? metrics.weekEndDate.toISOString().split('T')[0] : 'N/A'}`);
    console.log(`  Month: ${metrics.monthStartDate ? metrics.monthStartDate.toISOString().split('T')[0] : 'N/A'} to ${metrics.monthEndDate ? metrics.monthEndDate.toISOString().split('T')[0] : 'N/A'}`);
    
    // Display revenue
    console.log('\n💰 Revenue Totals:');
    console.log(`  Weekly Revenue: $${metrics.actual_weekly_revenue.toFixed(2)}`);
    console.log(`  Monthly Revenue: $${metrics.actual_monthly_revenue.toFixed(2)}`);
    
    // Display service breakdown
    console.log('\n🏥 Weekly Service Revenue:');
    console.log(`  Infusion Revenue: $${metrics.infusion_revenue_weekly.toFixed(2)}`);
    console.log(`  Injection Revenue: $${metrics.injection_revenue_weekly.toFixed(2)}`);
    console.log(`  Membership Revenue: $${metrics.membership_revenue_weekly.toFixed(2)}`);
    console.log(`  TOTAL: $${(metrics.infusion_revenue_weekly + metrics.injection_revenue_weekly + metrics.membership_revenue_weekly).toFixed(2)}`);
    
    console.log('\n🏥 Monthly Service Revenue:');
    console.log(`  Infusion Revenue: $${metrics.infusion_revenue_monthly.toFixed(2)}`);
    console.log(`  Injection Revenue: $${metrics.injection_revenue_monthly.toFixed(2)}`);
    console.log(`  Membership Revenue: $${metrics.membership_revenue_monthly.toFixed(2)}`);
    console.log(`  TOTAL: $${(metrics.infusion_revenue_monthly + metrics.injection_revenue_monthly + metrics.membership_revenue_monthly).toFixed(2)}`);
    
    // Display customer counts
    console.log('\n👥 Customer Counts:');
    console.log(`  Weekly Unique Customers: ${metrics.unique_customers_weekly}`);
    console.log(`  Monthly Unique Customers: ${metrics.unique_customers_monthly}`);
    console.log(`  Member Customers (weekly): ${metrics.member_customers_weekly}`);
    console.log(`  Non-Member Customers (weekly): ${metrics.non_member_customers_weekly}`);
    
    // Display service counts
    console.log('\n📊 Weekly Service Counts:');
    console.log(`  IV Infusions (Weekday): ${metrics.iv_infusions_weekday_weekly}`);
    console.log(`  IV Infusions (Weekend): ${metrics.iv_infusions_weekend_weekly}`);
    console.log(`  Injections (Weekday): ${metrics.injections_weekday_weekly}`);
    console.log(`  Injections (Weekend): ${metrics.injections_weekend_weekly}`);
    
    console.log('\n📊 Monthly Service Counts:');
    console.log(`  IV Infusions (Weekday): ${metrics.iv_infusions_weekday_monthly}`);
    console.log(`  IV Infusions (Weekend): ${metrics.iv_infusions_weekend_monthly}`);
    console.log(`  Injections (Weekday): ${metrics.injections_weekday_monthly}`);
    console.log(`  Injections (Weekend): ${metrics.injections_weekend_monthly}`);
    
    // Validation check
    console.log('\n✅ VALIDATION:');
    if (metrics.actual_weekly_revenue > 0 && metrics.actual_weekly_revenue < metrics.actual_monthly_revenue) {
      console.log('  ✓ Weekly revenue is less than monthly revenue (as expected)');
    } else {
      console.log('  ⚠️ WARNING: Revenue values may be incorrect');
    }
    
    if (metrics.unique_customers_weekly <= metrics.unique_customers_monthly) {
      console.log('  ✓ Weekly customers ≤ monthly customers (as expected)');
    } else {
      console.log('  ⚠️ WARNING: Customer counts may be incorrect');
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testRevenueFix();