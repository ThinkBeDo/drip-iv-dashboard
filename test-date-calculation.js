#!/usr/bin/env node

/**
 * Test date calculation logic to understand the week range issue
 */

// Test the week calculation logic
function calculateWeekFromEndDate(endDateStr) {
  const endDate = new Date(endDateStr);
  console.log(`\nEnd date: ${endDate.toDateString()} (${endDateStr})`);
  console.log(`Day of week: ${endDate.getDay()} (0=Sun, 1=Mon, 6=Sat)`);
  
  let weekStart = new Date(endDate);
  const endDayOfWeek = endDate.getDay();
  
  if (endDayOfWeek === 0) {
    // If end is Sunday, it's the last day of the week
    weekStart.setDate(endDate.getDate() - 6); // Go back to Monday
  } else if (endDayOfWeek === 6) {
    // If end is Saturday, go back 5 days to Monday
    weekStart.setDate(endDate.getDate() - 5);
  } else if (endDayOfWeek >= 1) {
    // For Monday through Friday, go back to Monday of that week
    weekStart.setDate(endDate.getDate() - (endDayOfWeek - 1));
  }
  
  // Calculate Sunday (end of week)
  let weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  console.log(`Calculated week: ${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`);
  console.log(`  Monday: ${weekStart.toDateString()}`);
  console.log(`  Sunday: ${weekEnd.toDateString()}`);
  
  return { weekStart, weekEnd };
}

console.log('='.repeat(60));
console.log('TESTING WEEK CALCULATION LOGIC');
console.log('='.repeat(60));

console.log('\n--- Scenario 1: Data ends on Friday Aug 30, 2025 ---');
calculateWeekFromEndDate('2025-08-30');

console.log('\n--- Scenario 2: Data ends on Saturday Aug 31, 2025 ---');
calculateWeekFromEndDate('2025-08-31');

console.log('\n--- Scenario 3: Data ends on Sunday Aug 31, 2025 ---');
calculateWeekFromEndDate('2025-08-31');

console.log('\n--- Scenario 4: Data ends on Thursday Aug 29, 2025 ---');
calculateWeekFromEndDate('2025-08-29');

console.log('\n--- What YOU expect for "Last Week" (Aug 25-31) ---');
console.log('Expected: 2025-08-25 (Monday) to 2025-08-31 (Sunday)');

console.log('\n--- But if your data ends Aug 30 (Friday), system calculates ---');
const result = calculateWeekFromEndDate('2025-08-30');

console.log('\n🔴 PROBLEM IDENTIFIED:');
console.log('Your upload: Aug 25-31 data');
console.log('Last date in file: Probably Aug 30 (Friday)');
console.log('System calculates: Aug 26 - Sep 1');
console.log('Dashboard looks for: Aug 25-31');
console.log('Result: NO MATCH - Data not found!');

console.log('\n' + '='.repeat(60));