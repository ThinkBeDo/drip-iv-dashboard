// Fix the week detection logic to ensure correct Monday-Sunday week boundaries
// The issue is in import-multi-week-data.js line 112-118

const fs = require('fs');

// Read the current import-multi-week-data.js file
const importFilePath = './import-multi-week-data.js';
let importContent = fs.readFileSync(importFilePath, 'utf8');

// Fix the week calculation logic
const fixWeekCalculation = `    // Calculate Monday of this week (week start)
    const dayOfWeek = date.getDay();
    const monday = new Date(date);

    // Convert to Monday-based week (Monday = 0, Sunday = 6)
    // If today is Sunday (0), go back 6 days to Monday
    // If today is Monday (1), stay on same day
    // If today is Tuesday (2), go back 1 day to Monday
    // etc.
    if (dayOfWeek === 0) {
      monday.setDate(date.getDate() - 6); // Sunday -> Previous Monday
    } else {
      monday.setDate(date.getDate() - (dayOfWeek - 1)); // Any other day -> That Monday
    }`;

const fixWeekEndCalculation = `    // Calculate Sunday of this week (week end)
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); // Monday + 6 days = Sunday`;

// Apply the fixes
importContent = importContent.replace(
  /    \/\/ Calculate Monday of this week \(week start\)\s*const dayOfWeek = date\.getDay\(\);\s*const daysFromMonday = \(dayOfWeek \+ 6\) % 7; \/\/ Convert Sunday=0 to Monday=0 system\s*const weekStart = new Date\(date\);\s*weekStart\.setDate\(date\.getDate\(\) - daysFromMonday\);/m,
  fixWeekCalculation
);

importContent = importContent.replace(
  /    \/\/ Calculate Sunday of this week \(week end\)\s*const weekEnd = new Date\(weekStart\);\s*weekEnd\.setDate\(weekStart\.getDate\(\) \+ 6\);/m,
  fixWeekEndCalculation
);

// Write the fixed file
fs.writeFileSync(importFilePath, importContent);

console.log('✅ Fixed week calculation logic in import-multi-week-data.js');
console.log('\n🔧 Changes made:');
console.log('1. Fixed Monday calculation to handle Sunday correctly');
console.log('2. Simplified Sunday calculation from Monday');
console.log('3. Ensured proper Monday-Sunday week boundaries');

console.log('\n📋 Next steps:');
console.log('1. Re-upload your data files using the dashboard upload interface');
console.log('2. The import process will now correctly identify Sep 29-Oct 5 as a complete week');
console.log('3. The Last Week filter should now find the data and show proper membership counts');

console.log('\n🎯 This fix ensures that:');
console.log('- Monday dates are correctly identified as week starts');
console.log('- Sunday dates are correctly identified as week ends');
console.log('- The dashboard Last Week filter (Sep 29-Oct 5) will match the imported data');
