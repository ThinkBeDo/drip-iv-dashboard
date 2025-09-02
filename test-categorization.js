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

async function testCategorization() {
  console.log('🚀 Testing Revenue Categorization\n');
  console.log('=' .repeat(50));
  
  const testFile = path.join(__dirname, 'test.tsv');
  
  try {
    console.log('\n📁 Processing TSV file:', testFile);
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
    
    console.log('\n✅ Test Analysis:');
    if (result.drip_iv_revenue_weekly === 45) {
      console.log('   ✅ SUCCESS: Saline 1L (Member) correctly categorized as IV Therapy ($45)');
    } else {
      console.log('   ❌ ERROR: Saline 1L (Member) NOT categorized as IV Therapy');
      console.log('      Expected: $45, Got: $' + (result.drip_iv_revenue_weekly || 0));
    }
    
    if (result.membership_revenue_weekly === 258) {
      console.log('   ✅ SUCCESS: Memberships correctly categorized ($258)');
    } else {
      console.log('   ❌ ERROR: Membership categorization issue');
      console.log('      Expected: $258, Got: $' + (result.membership_revenue_weekly || 0));
    }
    
  } catch (error) {
    console.error('\n❌ Error processing TSV file:', error.message);
    console.error('Stack:', error.stack);
  }
}

testCategorization();