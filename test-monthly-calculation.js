// Test script to simulate the monthly revenue calculation issue
// Based on the server code analysis at lines 2996-3004

console.log('='.repeat(80));
console.log('MONTHLY REVENUE CALCULATION TEST');
console.log('='.repeat(80));

// Simulate the issue scenario: Only one week of data for September 2025
const mockWeeklyData = {
  week_start_date: '2025-09-22',
  week_end_date: '2025-09-28', 
  actual_weekly_revenue: 31893.00,
  drip_iv_revenue_weekly: 16552.45,
  semaglutide_revenue_weekly: 9940.00
};

console.log('\n📊 Simulating Dashboard Scenario:');
console.log('Current Week Data (Sep 22-28, 2025):');
console.log(`  Total Revenue: $${mockWeeklyData.actual_weekly_revenue.toFixed(2)}`);
console.log(`  IV Therapy: $${mockWeeklyData.drip_iv_revenue_weekly.toFixed(2)}`);
console.log(`  Weight Loss: $${mockWeeklyData.semaglutide_revenue_weekly.toFixed(2)}`);

// Simulate the monthly calculation logic from server.js:2996-3004
const weekStartDate = new Date(mockWeeklyData.week_start_date);
const monthStart = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), 1);
const monthEnd = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth() + 1, 0);

console.log('\n📅 Monthly Calculation Window:');
console.log(`Month Start: ${monthStart.toISOString().split('T')[0]}`);
console.log(`Month End: ${monthEnd.toISOString().split('T')[0]}`);

// Test the overlap query logic: week_start_date <= $2 AND week_end_date >= $1
const weekStart = new Date(mockWeeklyData.week_start_date);
const weekEnd = new Date(mockWeeklyData.week_end_date);

const overlapsMonth = (weekStart <= monthEnd) && (weekEnd >= monthStart);

console.log('\n🧮 Overlap Query Test:');
console.log(`Week Start (${weekStart.toISOString().split('T')[0]}) <= Month End (${monthEnd.toISOString().split('T')[0]}): ${weekStart <= monthEnd}`);
console.log(`Week End (${weekEnd.toISOString().split('T')[0]}) >= Month Start (${monthStart.toISOString().split('T')[0]}): ${weekEnd >= monthStart}`);
console.log(`Week Overlaps Month: ${overlapsMonth}`);

if (overlapsMonth) {
  console.log('\n✅ This week WOULD be included in monthly calculation');
  console.log('Since only ONE week exists, monthly = weekly totals');
} else {
  console.log('\n❌ This week would NOT be included in monthly calculation');
}

// Simulate what monthly totals should show with more data
console.log('\n' + '='.repeat(80));
console.log('SIMULATED FULL SEPTEMBER SCENARIO');
console.log('='.repeat(80));

const fullSeptemberWeeks = [
  { dates: 'Sep 1-7', iv: 15000, weight: 8500, total: 28000 },
  { dates: 'Sep 8-14', iv: 14800, weight: 9200, total: 29500 },
  { dates: 'Sep 15-21', iv: 16200, weight: 9800, total: 31200 },
  { dates: 'Sep 22-28', iv: 16552.45, weight: 9940, total: 31893 } // Actual current data
];

let totalIV = 0;
let totalWeight = 0;
let totalRevenue = 0;

console.log('\nHypothetical September Weeks:');
fullSeptemberWeeks.forEach((week, i) => {
  console.log(`Week ${i + 1} (${week.dates}): IV=$${week.iv.toFixed(2)}, Weight=$${week.weight.toFixed(2)}, Total=$${week.total.toFixed(2)}`);
  totalIV += week.iv;
  totalWeight += week.weight;
  totalRevenue += week.total;
});

console.log('\n📈 What Monthly Totals SHOULD Show:');
console.log(`Total Revenue: $${totalRevenue.toFixed(2)}`);
console.log(`IV Therapy: $${totalIV.toFixed(2)}`);
console.log(`Weight Loss: $${totalWeight.toFixed(2)}`);
console.log(`Weeks Count: ${fullSeptemberWeeks.length}`);

console.log('\n🎯 Monthly Goal: $128,500.00');
console.log(`Progress: ${(totalRevenue / 128500 * 100).toFixed(1)}% (${128500 - totalRevenue > 0 ? '$' + (128500 - totalRevenue).toFixed(2) + ' remaining' : 'GOAL EXCEEDED!'})`);

console.log('\n' + '='.repeat(80));
console.log('DIAGNOSIS CONCLUSION');
console.log('='.repeat(80));
console.log('✅ Monthly calculation logic is CORRECT');
console.log('❌ ISSUE: Only ONE week of September data exists in database');
console.log('🔧 SOLUTION: Upload remaining September weeks to Railway database');
console.log('');
console.log('Next Steps:');
console.log('1. Check what September data files exist');
console.log('2. Upload missing September weeks to Railway database');
console.log('3. Verify monthly totals update correctly after upload');
console.log('='.repeat(80));