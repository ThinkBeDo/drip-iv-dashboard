/**
 * Simple unit test for getWeekWindow function (no database required)
 */

const { getWeekWindow } = require('./import-weekly-data');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function testWeekWindow() {
  console.log(`${colors.bold}${colors.blue}Testing getWeekWindow function...${colors.reset}\n`);

  const tests = [
    {
      name: 'Monday test case',
      inputDate: new Date('2025-01-13T10:00:00Z'), // Monday
      expectedStart: '2025-01-06',
      expectedEnd: '2025-01-12'
    },
    {
      name: 'Friday test case', 
      inputDate: new Date('2025-01-17T15:30:00Z'), // Friday
      expectedStart: '2025-01-06',
      expectedEnd: '2025-01-12'
    },
    {
      name: 'Sunday test case',
      inputDate: new Date('2025-01-19T20:00:00Z'), // Sunday
      expectedStart: '2025-01-06', 
      expectedEnd: '2025-01-12'
    },
    {
      name: 'Next Monday test case',
      inputDate: new Date('2025-01-20T08:00:00Z'), // Next Monday
      expectedStart: '2025-01-13',
      expectedEnd: '2025-01-19'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const { startPrev, endPrev } = getWeekWindow(test.inputDate);
      const actualStart = startPrev.toISOString().split('T')[0];
      const actualEnd = endPrev.toISOString().split('T')[0];

      console.log(`${colors.bold}${test.name}:${colors.reset}`);
      console.log(`  Input: ${test.inputDate.toISOString().split('T')[0]} (${test.inputDate.toLocaleDateString('en-US', {weekday: 'long'})})`);
      console.log(`  Expected: ${test.expectedStart} to ${test.expectedEnd}`);
      console.log(`  Actual:   ${actualStart} to ${actualEnd}`);

      if (actualStart === test.expectedStart && actualEnd === test.expectedEnd) {
        console.log(`  ${colors.green}✓ PASSED${colors.reset}\n`);
        passed++;
      } else {
        console.log(`  ${colors.red}✗ FAILED${colors.reset}\n`);
        failed++;
      }
    } catch (error) {
      console.log(`  ${colors.red}✗ ERROR: ${error.message}${colors.reset}\n`);
      failed++;
    }
  }

  console.log(`${colors.bold}Results:${colors.reset}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  
  if (failed === 0) {
    console.log(`\n${colors.green}${colors.bold}🎉 All week window tests passed!${colors.reset}`);
    return true;
  } else {
    console.log(`\n${colors.red}${colors.bold}❌ Some tests failed${colors.reset}`);
    return false;
  }
}

// Run test if called directly
if (require.main === module) {
  const success = testWeekWindow();
  process.exit(success ? 0 : 1);
}

module.exports = { testWeekWindow };