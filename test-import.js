#!/usr/bin/env node

// Test the actual import-weekly-data.js processRevenueData function
const path = require('path');

// Mock pg module to avoid database connection
const mockClient = {
  query: async (sql, params) => {
    console.log('Mock DB Query:', sql.substring(0, 50) + '...');
    return { rows: [] };
  },
  end: async () => {}
};

require.cache[require.resolve('pg')] = {
  exports: {
    Client: class MockClient {
      constructor() { return mockClient; }
      async connect() { console.log('Mock DB connected'); }
      async query(sql, params) { return mockClient.query(sql, params); }
      async end() { return mockClient.end(); }
    }
  }
};

// Now load the actual module
const { processRevenueData } = require('./import-weekly-data.js');

async function testImport() {
  console.log('🚀 Testing import-weekly-data.js with actual MHTML file\n');
  console.log('=' .repeat(50));
  
  const testFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls');
  
  try {
    console.log('\n📁 Processing file:', testFile);
    const result = await processRevenueData(testFile);
    
    console.log('\n✅ PROCESSING SUCCESSFUL!');
    console.log('\n📊 Results:');
    console.log('   Weekly Revenue: $' + (result.actual_weekly_revenue || 0).toFixed(2));
    console.log('   Monthly Revenue: $' + (result.actual_monthly_revenue || 0).toFixed(2));
    console.log('   Week Start:', result.weekStartDate || 'N/A');
    console.log('   Week End:', result.weekEndDate || 'N/A');
    console.log('   Unique Customers (Weekly):', result.unique_customers_weekly ? result.unique_customers_weekly.size : 0);
    console.log('   IV Infusions (Weekday):', result.iv_infusions_weekday_weekly || 0);
    console.log('   Injections (Weekday):', result.injections_weekday_weekly || 0);
    
    if (result.weekStartDate && result.weekEndDate) {
      console.log('\n✅ SUCCESS: Dates were extracted properly!');
    } else {
      console.log('\n❌ ERROR: No dates found - parsing failed!');
    }
    
    if (result.actual_weekly_revenue > 0) {
      console.log('✅ SUCCESS: Revenue was calculated!');
    } else {
      console.log('❌ ERROR: No revenue found - payment extraction failed!');
    }
    
  } catch (error) {
    console.error('\n❌ Error processing file:', error.message);
    console.error('Stack:', error.stack);
  }
}

testImport();