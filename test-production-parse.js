#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Mock pg module
const mockClient = {
  query: async () => ({ rows: [] }),
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

// Load the actual module
const { processRevenueData } = require('./import-weekly-data.js');

async function testProductionFile() {
  console.log('🚀 Testing Production File Processing\n');
  console.log('=' .repeat(50));
  
  const testFile = path.join(__dirname, 'test-production-file.xls');
  
  try {
    console.log('\n📁 Processing production file:', testFile);
    const result = await processRevenueData(testFile);
    
    console.log('\n✅ PROCESSING SUCCESSFUL!');
    console.log('\n📊 Revenue Breakdown:');
    console.log('   Total Weekly Revenue: $' + (result.actual_weekly_revenue || 0).toFixed(2));
    console.log('   IV Therapy Revenue: $' + (result.drip_iv_revenue_weekly || 0).toFixed(2));
    console.log('   Weight Loss Revenue: $' + (result.semaglutide_revenue_weekly || 0).toFixed(2));
    console.log('   Membership Revenue: $' + (result.membership_revenue_weekly || 0).toFixed(2));
    console.log('   Injection Revenue: $' + (result.injection_revenue_weekly || 0).toFixed(2));
    console.log('   Infusion Revenue: $' + (result.infusion_revenue_weekly || 0).toFixed(2));
    
    console.log('\n📊 Service Counts:');
    console.log('   IV Infusions (Weekday): ' + (result.iv_infusions_weekday_weekly || 0));
    console.log('   IV Infusions (Weekend): ' + (result.iv_infusions_weekend_weekly || 0));
    console.log('   Injections (Weekday): ' + (result.injections_weekday_weekly || 0));
    console.log('   Weight Loss Injections: ' + (result.weight_loss_injections_weekly || 0));
    console.log('   Unique Customers:', result.unique_customers_weekly ? result.unique_customers_weekly.size : 0);
    
    console.log('\n📅 Date Information:');
    console.log('   Week Start:', result.weekStartDate);
    console.log('   Week End:', result.weekEndDate);
    
    console.log('\n💰 Membership Counts:');
    console.log('   Total Members:', result.total_drip_iv_members || 0);
    console.log('   Individual:', result.individual_memberships || 0);
    console.log('   Family:', result.family_memberships || 0);
    console.log('   Concierge:', result.concierge_memberships || 0);
    
  } catch (error) {
    console.error('\n❌ Error processing file:', error.message);
    console.error('Stack:', error.stack);
  }
}

testProductionFile();