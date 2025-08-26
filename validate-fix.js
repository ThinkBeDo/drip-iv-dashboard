// Simple validation script to test revenue calculation fix
const fs = require('fs');
const csv = require('csv-parse/sync');

// Load and parse CSV
const csvContent = fs.readFileSync('./revenue-july-august.csv', 'utf8');
const records = csv.parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  skip_records_with_empty_values: false
});

console.log('📊 CSV Revenue Validation\n');
console.log(`Total records in CSV: ${records.length}`);

// Filter for Aug 22-29, 2025 transactions
const startDate = new Date('2025-08-22');
const endDate = new Date('2025-08-29');
endDate.setHours(23, 59, 59, 999);

let weeklyRevenue = 0;
let weeklyTransactions = 0;
const dailyRevenue = {};

records.forEach(row => {
  const dateStr = row['Date'];
  if (!dateStr) return;
  
  const date = new Date(dateStr);
  if (date >= startDate && date <= endDate) {
    const amount = parseFloat((row['Calculated Payment (Line)'] || '0').replace(/[\$,]/g, '')) || 0;
    weeklyRevenue += amount;
    weeklyTransactions++;
    
    const dayKey = date.toISOString().split('T')[0];
    if (!dailyRevenue[dayKey]) dailyRevenue[dayKey] = 0;
    dailyRevenue[dayKey] += amount;
  }
});

console.log('\n📅 Date Range: Aug 22-29, 2025');
console.log('=' .repeat(50));
console.log(`Transactions in range: ${weeklyTransactions}`);
console.log(`Total Weekly Revenue: $${weeklyRevenue.toFixed(2)}`);
console.log('\nDaily Breakdown:');
Object.keys(dailyRevenue).sort().forEach(date => {
  console.log(`  ${date}: $${dailyRevenue[date].toFixed(2)}`);
});

console.log('\n✅ Expected Result:');
console.log('   Dashboard should show weekly revenue of ~$' + weeklyRevenue.toFixed(2));
console.log('   (Previously was showing only $728.00)');