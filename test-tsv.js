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

async function testTSV() {
  console.log('🚀 Testing TSV file parsing\n');
  console.log('=' .repeat(50));
  
  const testFile = path.join(__dirname, 'test.tsv');
  
  try {
    console.log('\n📁 Processing TSV file:', testFile);
    const result = await processRevenueData(testFile);
    
    console.log('\n✅ PROCESSING SUCCESSFUL!');
    console.log('\n📊 Results:');
    console.log('   Weekly Revenue: $' + (result.actual_weekly_revenue || 0).toFixed(2));
    console.log('   Week Start:', result.weekStartDate || 'N/A');
    console.log('   Week End:', result.weekEndDate || 'N/A');
    
    if (result.weekStartDate && result.weekEndDate) {
      console.log('\n✅ SUCCESS: Dates were extracted from TSV!');
    } else {
      console.log('\n❌ ERROR: No dates found - TSV parsing failed!');
    }
    
    if (result.actual_weekly_revenue > 0) {
      console.log('✅ SUCCESS: Revenue was calculated from TSV!');
    } else {
      console.log('❌ ERROR: No revenue found - TSV payment extraction failed!');
    }
    
  } catch (error) {
    console.error('\n❌ Error processing TSV file:', error.message);
    console.error('Stack:', error.stack);
  }
}

testTSV();