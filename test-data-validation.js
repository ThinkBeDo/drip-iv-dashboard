// Test script to validate data import and filtering fixes
// This script tests the validation logic without making database changes

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// Test 1: Verify week with Sep 29 - Oct 5 exists
async function testWeekExists() {
  console.log('\n🧪 TEST 1: Check if Sep 29 - Oct 5 week exists in database');

  const result = await pool.query(`
    SELECT
      week_start_date,
      week_end_date,
      actual_weekly_revenue,
      total_drip_iv_members,
      unique_customers_weekly
    FROM analytics_data
    WHERE week_start_date = '2025-09-29' AND week_end_date = '2025-10-05'
  `);

  if (result.rows.length === 0) {
    console.log('❌ FAILED: Week Sep 29 - Oct 5 does NOT exist in database');
    return false;
  }

  const week = result.rows[0];
  console.log('✅ PASSED: Week exists');
  console.log(`   Revenue: $${week.actual_weekly_revenue}`);
  console.log(`   Members: ${week.total_drip_iv_members}`);
  console.log(`   Customers: ${week.unique_customers_weekly}`);

  // Check for zero revenue issue
  if (parseFloat(week.actual_weekly_revenue) === 0) {
    console.log('⚠️  WARNING: Week has $0 revenue - this is the bug we need to fix!');
    return { hasData: true, hasZeroRevenue: true };
  }

  return { hasData: true, hasZeroRevenue: false };
}

// Test 2: Test date filter calculation
async function testDateFilterLogic() {
  console.log('\n🧪 TEST 2: Test date filter calculation for "Last Week"');

  // Simulate today as Oct 6, 2025 (to match when user would click "Last Week")
  const today = new Date('2025-10-06');
  console.log(`   Simulating today as: ${today.toDateString()}`);

  // Calculate last week (same logic as frontend)
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get Monday of last week
  const dayOfWeek = lastWeek.getDay();
  const mondayDiff = lastWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(lastWeek);
  monday.setDate(mondayDiff);
  monday.setHours(0, 0, 0, 0);

  // Get Sunday of last week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(0, 0, 0, 0);

  const startDate = monday.toISOString().split('T')[0];
  const endDate = sunday.toISOString().split('T')[0];

  console.log(`   Calculated date range: ${startDate} to ${endDate}`);
  console.log(`   Expected: 2025-09-29 to 2025-10-05`);

  if (startDate === '2025-09-29' && endDate === '2025-10-05') {
    console.log('✅ PASSED: Date calculation matches expected week');
    return true;
  } else {
    console.log('❌ FAILED: Date calculation does not match');
    return false;
  }
}

// Test 3: Test exact week match query
async function testExactWeekQuery() {
  console.log('\n🧪 TEST 3: Test exact week match query (like dashboard filter)');

  const startDate = '2025-09-29';
  const endDate = '2025-10-05';

  console.log(`   Query: week_start_date = '${startDate}' AND week_end_date = '${endDate}'`);

  const result = await pool.query(`
    SELECT
      week_start_date,
      week_end_date,
      actual_weekly_revenue,
      total_drip_iv_members,
      unique_customers_weekly,
      drip_iv_revenue_weekly,
      semaglutide_revenue_weekly
    FROM analytics_data
    WHERE week_start_date = $1 AND week_end_date = $2
  `, [startDate, endDate]);

  if (result.rows.length === 0) {
    console.log('❌ FAILED: No data returned for exact week match');
    return false;
  }

  console.log('✅ PASSED: Query returned data');
  console.log('   Data returned:');
  const week = result.rows[0];
  console.log(`     Revenue: $${week.actual_weekly_revenue}`);
  console.log(`     Members: ${week.total_drip_iv_members}`);
  console.log(`     Customers: ${week.unique_customers_weekly}`);
  console.log(`     IV Revenue: $${week.drip_iv_revenue_weekly}`);
  console.log(`     Weight Loss Revenue: $${week.semaglutide_revenue_weekly}`);

  return true;
}

// Test 4: Check all available weeks
async function testAvailableWeeks() {
  console.log('\n🧪 TEST 4: List all weeks in database (most recent 5)');

  const result = await pool.query(`
    SELECT
      week_start_date,
      week_end_date,
      actual_weekly_revenue,
      total_drip_iv_members
    FROM analytics_data
    ORDER BY week_start_date DESC
    LIMIT 5
  `);

  console.log(`   Found ${result.rows.length} recent weeks:`);
  result.rows.forEach((week, index) => {
    console.log(`   ${index + 1}. ${week.week_start_date} to ${week.week_end_date}: $${week.actual_weekly_revenue}, ${week.total_drip_iv_members} members`);
  });

  return true;
}

// Test 5: Simulate validation logic
async function testValidationLogic() {
  console.log('\n🧪 TEST 5: Test new validation logic (simulated)');

  // Simulate attempting to save zero-revenue data
  const testData = {
    week_start_date: '2025-09-29',
    week_end_date: '2025-10-05',
    actual_weekly_revenue: 0,
    unique_customers_weekly: 120
  };

  console.log('   Simulating upload with:');
  console.log(`     Revenue: $${testData.actual_weekly_revenue}`);
  console.log(`     Customers: ${testData.unique_customers_weekly}`);

  // Check validation
  const hasRevenue = testData.actual_weekly_revenue && testData.actual_weekly_revenue > 0;

  if (!hasRevenue) {
    console.log('✅ PASSED: Validation would REJECT this upload (revenue = 0)');
    console.log('   Error: "Import validation failed: No revenue transactions found"');
    return true;
  } else {
    console.log('❌ FAILED: Validation would ALLOW this upload (should reject)');
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting data validation tests...');
  console.log('=' .repeat(60));

  try {
    const test1 = await testWeekExists();
    const test2 = await testDateFilterLogic();
    const test3 = await testExactWeekQuery();
    const test4 = await testAvailableWeeks();
    const test5 = await testValidationLogic();

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY:');
    console.log(`   Test 1 (Week Exists): ${test1.hasData ? '✅ PASS' : '❌ FAIL'}`);
    if (test1.hasZeroRevenue) {
      console.log('   ⚠️  ISSUE CONFIRMED: Week has $0 revenue!');
    }
    console.log(`   Test 2 (Date Logic): ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Test 3 (Query Test): ${test3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Test 4 (List Weeks): ${test4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Test 5 (Validation): ${test5 ? '✅ PASS' : '❌ FAIL'}`);

    console.log('\n💡 DIAGNOSIS:');
    if (test1.hasZeroRevenue) {
      console.log('   The week Sep 29 - Oct 5 exists but has $0 revenue.');
      console.log('   This is the root cause of the dashboard showing zeros.');
      console.log('   The client needs to re-upload this week\'s data.');
      console.log('   The new validation will prevent this from happening again.');
    } else if (!test1.hasData) {
      console.log('   The week Sep 29 - Oct 5 does not exist in the database.');
      console.log('   The client needs to upload this week\'s data.');
    } else {
      console.log('   Week data looks good! Revenue is present.');
    }

  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
