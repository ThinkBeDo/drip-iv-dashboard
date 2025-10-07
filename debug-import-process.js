// Debug the import process step by step
const XLSX = require('xlsx');
const { processMembershipData } = require('./import-weekly-data');

async function debugImportProcess() {
  console.log('🔍 Debugging the import process...');

  try {
    // Step 1: Test membership processing directly
    console.log('\n1️⃣ Testing membership processing...');
    const membershipResult = await processMembershipData('Drip IV Active Memberships (4).xlsx');
    console.log('Membership result:', membershipResult.metrics);

    if (!membershipResult.metrics || membershipResult.metrics.total_drip_iv_members === 0) {
      console.log('❌ Membership processing returned empty results');
      return;
    }

    // Step 2: Check what the multi-week import would receive
    console.log('\n2️⃣ Checking multi-week import data structure...');

    // Simulate what importMultiWeekData receives
    const mockWeekMetrics = {
      actual_weekly_revenue: 10000,
      week_start_date: '2025-09-29',
      week_end_date: '2025-10-05',
      unique_customers_weekly: 50,
      // ... other fields
    };

    const membershipMetrics = membershipResult.metrics;

    console.log('Week metrics:', mockWeekMetrics);
    console.log('Membership metrics:', membershipMetrics);

    // Step 3: Test the data combination logic
    console.log('\n3️⃣ Testing data combination...');
    const combinedData = {
      ...mockWeekMetrics,
      ...membershipMetrics,
    };

    console.log('Combined data:');
    console.log(`   Total members: ${combinedData.total_drip_iv_members}`);
    console.log(`   Individual: ${combinedData.individual_memberships}`);
    console.log(`   Revenue: $${combinedData.actual_weekly_revenue}`);

    // Step 4: Check if this matches expected format
    console.log('\n4️⃣ Checking data format...');
    const expectedFields = [
      'total_drip_iv_members',
      'individual_memberships',
      'family_memberships',
      'concierge_memberships',
      'corporate_memberships'
    ];

    const missingFields = expectedFields.filter(field => combinedData[field] === undefined);
    if (missingFields.length > 0) {
      console.log('❌ Missing fields:', missingFields);
    } else {
      console.log('✅ All expected fields present');
    }

    return combinedData;

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugImportProcess();
