/**
 * Comprehensive tests for the new membership registry tracking system
 * Tests the computeNewMembershipsFromUpload function with various scenarios
 */

const { Pool } = require('pg');
const { getWeekWindow, computeNewMembershipsFromUpload } = require('./import-weekly-data');
require('dotenv').config();

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Test database setup
let pool;
let testDb;

async function setupTestDatabase() {
  console.log(`${colors.blue}Setting up test database...${colors.reset}`);
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured for testing');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  testDb = await pool.connect();

  // Create test membership_registry table
  await testDb.query(`
    CREATE TABLE IF NOT EXISTS membership_registry (
      member_key TEXT PRIMARY KEY,
      patient TEXT NOT NULL,
      membership_type TEXT NOT NULL,
      title_raw TEXT NOT NULL,
      start_date DATE NOT NULL,
      first_seen_week DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Create indexes
  await testDb.query('CREATE INDEX IF NOT EXISTS idx_membership_registry_type ON membership_registry (membership_type)');
  await testDb.query('CREATE INDEX IF NOT EXISTS idx_membership_registry_first_seen ON membership_registry (first_seen_week)');

  console.log(`${colors.green}✓ Test database setup complete${colors.reset}`);
}

async function cleanupTestData() {
  console.log(`${colors.yellow}Cleaning up test data...${colors.reset}`);
  await testDb.query('DELETE FROM membership_registry WHERE patient LIKE $1', ['TestPatient%']);
  console.log(`${colors.green}✓ Test data cleaned up${colors.reset}`);
}

async function teardownTestDatabase() {
  if (testDb) {
    testDb.release();
  }
  if (pool) {
    await pool.end();
  }
  console.log(`${colors.green}✓ Database connections closed${colors.reset}`);
}

// Test: Week window calculation
function testWeekWindow() {
  console.log(`\n${colors.bold}Testing getWeekWindow function...${colors.reset}`);

  // Test with a known Monday (2025-01-13)
  const testDate = new Date('2025-01-13T10:00:00Z'); // Monday
  const { startPrev, endPrev } = getWeekWindow(testDate);

  console.log(`Test date: ${testDate.toISOString().split('T')[0]} (Monday)`);
  console.log(`Previous week start: ${startPrev.toISOString().split('T')[0]}`);
  console.log(`Previous week end: ${endPrev.toISOString().split('T')[0]}`);

  // Previous week should be Mon Jan 6 to Sun Jan 12
  const expectedStart = '2025-01-06';
  const expectedEnd = '2025-01-12';

  if (startPrev.toISOString().split('T')[0] === expectedStart && 
      endPrev.toISOString().split('T')[0] === expectedEnd) {
    console.log(`${colors.green}✓ Week window calculation correct${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}✗ Week window calculation incorrect${colors.reset}`);
    console.log(`  Expected: ${expectedStart} to ${expectedEnd}`);
    console.log(`  Got: ${startPrev.toISOString().split('T')[0]} to ${endPrev.toISOString().split('T')[0]}`);
    return false;
  }
}

// Test: First-time membership counting
async function testFirstTimeCount() {
  console.log(`\n${colors.bold}Testing first-time membership counting...${colors.reset}`);

  const testDate = new Date('2025-01-13'); // Monday
  const { startPrev } = getWeekWindow(testDate);
  const nextWeek = new Date(startPrev);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const testRows = [
    {
      Patient: 'TestPatient1',
      Title: 'Membership - Individual',
      'Start Date': nextWeek // Future date (next week)
    },
    {
      Patient: 'TestPatient2', 
      Title: 'Membership - Family',
      'Start Date': new Date(startPrev) // Previous week start
    },
    {
      Patient: 'TestPatient3',
      Title: 'Membership - Concierge',
      'Start Date': nextWeek
    }
  ];

  const result = await computeNewMembershipsFromUpload(testRows, testDb, testDate);

  const expected = {
    new_individual_members_weekly: 1,
    new_family_members_weekly: 1, 
    new_concierge_members_weekly: 1,
    new_corporate_members_weekly: 0
  };

  console.log('Expected counts:', expected);
  console.log('Actual counts:', result);

  let passed = true;
  for (const [key, value] of Object.entries(expected)) {
    if (result[key] !== value) {
      console.log(`${colors.red}✗ ${key}: expected ${value}, got ${result[key]}${colors.reset}`);
      passed = false;
    } else {
      console.log(`${colors.green}✓ ${key}: ${value}${colors.reset}`);
    }
  }

  return passed;
}

// Test: Prevent double counting
async function testPreventDoubleCount() {
  console.log(`\n${colors.bold}Testing double counting prevention...${colors.reset}`);

  const testDate = new Date('2025-01-13'); // Monday
  const { startPrev } = getWeekWindow(testDate);
  const nextWeek = new Date(startPrev);
  nextWeek.setDate(nextWeek.getDate() + 7);

  // Same membership rows as previous test (should already be in registry)
  const testRows = [
    {
      Patient: 'TestPatient1',
      Title: 'Membership - Individual',
      'Start Date': nextWeek
    },
    {
      Patient: 'TestPatient2',
      Title: 'Membership - Family',
      'Start Date': new Date(startPrev)
    }
  ];

  // Run again - should get zero counts since already in registry
  const result = await computeNewMembershipsFromUpload(testRows, testDb, testDate);

  const expected = {
    new_individual_members_weekly: 0,
    new_family_members_weekly: 0,
    new_concierge_members_weekly: 0,
    new_corporate_members_weekly: 0
  };

  console.log('Expected counts (should be zero):', expected);
  console.log('Actual counts:', result);

  let passed = true;
  for (const [key, value] of Object.entries(expected)) {
    if (result[key] !== value) {
      console.log(`${colors.red}✗ ${key}: expected ${value}, got ${result[key]}${colors.reset}`);
      passed = false;
    } else {
      console.log(`${colors.green}✓ ${key}: ${value}${colors.reset}`);
    }
  }

  return passed;
}

// Test: Date boundary conditions
async function testDateBoundaries() {
  console.log(`\n${colors.bold}Testing date boundary conditions...${colors.reset}`);

  const testDate = new Date('2025-01-13'); // Monday
  const { startPrev } = getWeekWindow(testDate);
  
  // Test with dates before the boundary (should not count)
  const tooEarly = new Date(startPrev);
  tooEarly.setDate(tooEarly.getDate() - 1); // Day before previous week

  const testRows = [
    {
      Patient: 'TestPatient4',
      Title: 'Membership - Corporate',
      'Start Date': tooEarly // Too early, should not count
    },
    {
      Patient: 'TestPatient5',
      Title: 'Membership - Individual', 
      'Start Date': new Date(startPrev) // Exactly on boundary, should count
    }
  ];

  const result = await computeNewMembershipsFromUpload(testRows, testDb, testDate);

  // Should only count the one on the boundary
  if (result.new_individual_members_weekly === 1 && 
      result.new_corporate_members_weekly === 0) {
    console.log(`${colors.green}✓ Date boundary logic correct${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}✗ Date boundary logic incorrect${colors.reset}`);
    console.log(`  Expected: individual=1, corporate=0`);
    console.log(`  Got: individual=${result.new_individual_members_weekly}, corporate=${result.new_corporate_members_weekly}`);
    return false;
  }
}

// Test: Membership type parsing
async function testMembershipTypeParsing() {
  console.log(`\n${colors.bold}Testing membership type parsing...${colors.reset}`);

  const testDate = new Date('2025-01-13');
  const { startPrev } = getWeekWindow(testDate);
  const validDate = new Date(startPrev);

  const testRows = [
    {
      Patient: 'TestPatient6',
      Title: 'Membership - Individual Monthly',
      'Start Date': validDate
    },
    {
      Patient: 'TestPatient7',
      Title: 'Family Membership Plan',
      'Start Date': validDate
    },
    {
      Patient: 'TestPatient8',
      Title: 'Premium Concierge Service',
      'Start Date': validDate
    },
    {
      Patient: 'TestPatient9',
      Title: 'Corporate Health Package',
      'Start Date': validDate
    },
    {
      Patient: 'TestPatient10',
      Title: 'Regular IV Service', // Not a membership
      'Start Date': validDate
    }
  ];

  const result = await computeNewMembershipsFromUpload(testRows, testDb, testDate);

  const expected = {
    new_individual_members_weekly: 1,
    new_family_members_weekly: 1,
    new_concierge_members_weekly: 1,
    new_corporate_members_weekly: 1
  };

  console.log('Test titles processed:');
  testRows.forEach(row => console.log(`  "${row.Title}"`));
  console.log('Expected counts:', expected);
  console.log('Actual counts:', result);

  let passed = true;
  for (const [key, value] of Object.entries(expected)) {
    if (result[key] !== value) {
      console.log(`${colors.red}✗ ${key}: expected ${value}, got ${result[key]}${colors.reset}`);
      passed = false;
    } else {
      console.log(`${colors.green}✓ ${key}: ${value}${colors.reset}`);
    }
  }

  return passed;
}

// Test: Invalid data handling
async function testInvalidDataHandling() {
  console.log(`\n${colors.bold}Testing invalid data handling...${colors.reset}`);

  const testDate = new Date('2025-01-13');

  const testRows = [
    {
      Patient: '', // Empty patient
      Title: 'Membership - Individual',
      'Start Date': new Date()
    },
    {
      Patient: 'TestPatient11',
      Title: '', // Empty title
      'Start Date': new Date()
    },
    {
      Patient: 'TestPatient12',
      Title: 'Membership - Family',
      'Start Date': null // Invalid date
    },
    {
      Patient: 'TestPatient13',
      Title: 'Membership - Individual',
      'Start Date': 'invalid-date' // Invalid date string
    }
  ];

  const result = await computeNewMembershipsFromUpload(testRows, testDb, testDate);

  // All should be rejected, so counts should be zero
  const allZero = Object.values(result).every(count => count === 0);

  if (allZero) {
    console.log(`${colors.green}✓ Invalid data correctly rejected${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}✗ Invalid data not properly rejected${colors.reset}`);
    console.log('Result:', result);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log(`${colors.bold}${colors.blue}🧪 Membership Registry Test Suite${colors.reset}\n`);

  try {
    await setupTestDatabase();

    const tests = [
      { name: 'Week Window Calculation', fn: testWeekWindow },
      { name: 'First-time Count', fn: testFirstTimeCount },
      { name: 'Prevent Double Count', fn: testPreventDoubleCount },
      { name: 'Date Boundaries', fn: testDateBoundaries },
      { name: 'Membership Type Parsing', fn: testMembershipTypeParsing },
      { name: 'Invalid Data Handling', fn: testInvalidDataHandling }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        const result = await test.fn();
        if (result) {
          passed++;
          console.log(`${colors.green}✓ ${test.name} PASSED${colors.reset}`);
        } else {
          failed++;
          console.log(`${colors.red}✗ ${test.name} FAILED${colors.reset}`);
        }
      } catch (error) {
        failed++;
        console.log(`${colors.red}✗ ${test.name} ERROR: ${error.message}${colors.reset}`);
      }
    }

    console.log(`\n${colors.bold}Test Summary:${colors.reset}`);
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`Total: ${passed + failed}`);

    if (failed === 0) {
      console.log(`\n${colors.green}${colors.bold}🎉 All tests passed!${colors.reset}`);
    } else {
      console.log(`\n${colors.red}${colors.bold}❌ Some tests failed${colors.reset}`);
    }

    await cleanupTestData();

  } catch (error) {
    console.error(`${colors.red}Test setup failed: ${error.message}${colors.reset}`);
  } finally {
    await teardownTestDatabase();
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runAllTests,
  testWeekWindow,
  testFirstTimeCount,
  testPreventDoubleCount,
  testDateBoundaries,
  testMembershipTypeParsing,
  testInvalidDataHandling
};