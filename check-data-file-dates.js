const XLSX = require('xlsx');

const filePath = 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';

console.log('='.repeat(80));
console.log('CHECKING DATA FILE DATE RANGES');
console.log('='.repeat(80));
console.log(`File: ${filePath}`);

try {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  
  console.log(`\n✅ Total rows in file: ${data.length}`);
  
  // Parse dates and track unique weeks
  const weeks = new Set();
  const months = new Map();
  
  data.forEach(row => {
    let dateStr = row['Date'] || row['Date Of Payment'] || '';
    
    if (!dateStr) return;
    
    // Convert Excel date serial to Date if needed
    if (typeof dateStr === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + dateStr * 86400000);
      dateStr = date.toLocaleDateString('en-US');
    } else {
      dateStr = String(dateStr);
    }
    
    // Parse date
    let date = new Date(dateStr);
    if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0]);
        const day = parseInt(parts[1]);
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        date = new Date(year, month - 1, day);
      }
    }
    
    if (date && !isNaN(date.getTime()) && date.getFullYear() >= 2025) {
      // Find Monday of the week for this date
      const dayOfWeek = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - dayOfWeek + 1);
      
      const weekKey = monday.toISOString().split('T')[0];
      weeks.add(weekKey);
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.set(monthKey, (months.get(monthKey) || 0) + 1);
    }
  });
  
  console.log('\n📅 Months found in data:');
  [...months.entries()].sort().forEach(([month, count]) => {
    console.log(`  ${month}: ${count} records`);
  });
  
  console.log('\n📅 Week start dates found (2025 only):');
  const sortedWeeks = [...weeks].sort();
  
  // Group by month for better display
  const weeksByMonth = {};
  sortedWeeks.forEach(week => {
    const month = week.substring(0, 7); // YYYY-MM
    if (!weeksByMonth[month]) weeksByMonth[month] = [];
    weeksByMonth[month].push(week);
  });
  
  Object.keys(weeksByMonth).sort().forEach(month => {
    console.log(`\n  ${month}:`);
    weeksByMonth[month].forEach(week => {
      const weekDate = new Date(week);
      const endDate = new Date(weekDate);
      endDate.setDate(weekDate.getDate() + 6);
      console.log(`    ${week} to ${endDate.toISOString().split('T')[0]}`);
    });
  });
  
  // Check specifically for September 2025
  console.log('\n' + '='.repeat(80));
  console.log('SEPTEMBER 2025 ANALYSIS');
  console.log('='.repeat(80));
  
  const septemberWeeks = sortedWeeks.filter(week => week.startsWith('2025-09'));
  
  if (septemberWeeks.length === 0) {
    console.log('❌ NO SEPTEMBER 2025 WEEKS FOUND');
    console.log('This confirms why only one week appears in the database');
  } else {
    console.log(`✅ Found ${septemberWeeks.length} September week(s):`);
    septemberWeeks.forEach(week => {
      const weekDate = new Date(week);
      const endDate = new Date(weekDate);
      endDate.setDate(weekDate.getDate() + 6);
      console.log(`  ${week} to ${endDate.toISOString().split('T')[0]}`);
    });
    
    // Check if the current dashboard week (Sep 22-28) is in the file
    const dashboardWeek = '2025-09-22';
    if (septemberWeeks.includes(dashboardWeek)) {
      console.log(`\n✅ Dashboard week (${dashboardWeek}) is in this file`);
    } else {
      console.log(`\n❌ Dashboard week (${dashboardWeek}) is NOT in this file`);
      console.log('The database may contain data from a different source');
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATION');
  console.log('='.repeat(80));
  
  if (septemberWeeks.length > 1) {
    console.log('✅ Multiple September weeks exist in file');
    console.log('📤 Upload this file to Railway to get all September weeks');
  } else if (septemberWeeks.length === 1) {
    console.log('⚠️  Only one September week in file');
    console.log('🔍 Need additional September data files for other weeks');
  } else {
    console.log('❌ No September data in file');
    console.log('🔍 Need to find September data files');
  }
  
} catch (error) {
  console.error('❌ Error reading file:', error.message);
}