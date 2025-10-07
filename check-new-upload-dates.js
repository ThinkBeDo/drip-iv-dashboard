const XLSX = require('xlsx');

const patientFile = 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (5).xls';
const membershipFile = 'Drip IV Active Memberships (4).xlsx';

console.log('='.repeat(80));
console.log('CHECKING NEW UPLOADED FILES - DATE ANALYSIS');
console.log('='.repeat(80));
console.log(`Current date: ${new Date().toISOString().split('T')[0]}`);
console.log(`Today is: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);

// Calculate "Last Week" range (what the dashboard filter uses)
const today = new Date();
const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

// Get Monday of last week
const lastWeekMonday = new Date(lastWeek);
const dayOfWeek = lastWeek.getDay();
const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
lastWeekMonday.setDate(lastWeek.getDate() - daysToMonday);
lastWeekMonday.setHours(0, 0, 0, 0);

// Get Sunday of last week
const lastWeekSunday = new Date(lastWeekMonday);
lastWeekSunday.setDate(lastWeekMonday.getDate() + 6);
lastWeekSunday.setHours(23, 59, 59, 999);

console.log('\n📅 "Last Week" Filter Range (what dashboard expects):');
console.log(`   Monday: ${lastWeekMonday.toISOString().split('T')[0]} (${lastWeekMonday.toLocaleDateString('en-US', { weekday: 'long' })})`);
console.log(`   Sunday: ${lastWeekSunday.toISOString().split('T')[0]} (${lastWeekSunday.toLocaleDateString('en-US', { weekday: 'long' })})`);

console.log('\n' + '='.repeat(80));
console.log('PATIENT ANALYSIS FILE');
console.log('='.repeat(80));

try {
  const wb = XLSX.readFile(patientFile);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  
  console.log(`✅ Total rows: ${data.length}`);
  
  // Track all dates
  const dates = new Map();
  const weeks = new Map();
  let lastWeekCount = 0;
  
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
    
    if (date && !isNaN(date.getTime())) {
      const dateKey = date.toISOString().split('T')[0];
      dates.set(dateKey, (dates.get(dateKey) || 0) + 1);
      
      // Find Monday of the week
      const dayOfWeek = date.getDay();
      const monday = new Date(date);
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      monday.setDate(date.getDate() - daysToMonday);
      monday.setHours(0, 0, 0, 0);
      
      const weekKey = monday.toISOString().split('T')[0];
      weeks.set(weekKey, (weeks.get(weekKey) || 0) + 1);
      
      // Check if in "Last Week" range
      if (date >= lastWeekMonday && date <= lastWeekSunday) {
        lastWeekCount++;
      }
    }
  });
  
  console.log('\n📊 Date Range in File:');
  const sortedDates = [...dates.keys()].sort();
  if (sortedDates.length > 0) {
    console.log(`   First date: ${sortedDates[0]}`);
    console.log(`   Last date: ${sortedDates[sortedDates.length - 1]}`);
  }
  
  console.log('\n📅 Weeks Found (Monday start dates):');
  const sortedWeeks = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  sortedWeeks.slice(-10).forEach(([week, count]) => {
    const weekDate = new Date(week);
    const sunday = new Date(weekDate);
    sunday.setDate(weekDate.getDate() + 6);
    const isLastWeek = week === lastWeekMonday.toISOString().split('T')[0];
    const marker = isLastWeek ? ' ← LAST WEEK FILTER' : '';
    console.log(`   ${week} to ${sunday.toISOString().split('T')[0]} (${count} records)${marker}`);
  });
  
  console.log('\n🎯 Records in "Last Week" Filter Range:');
  console.log(`   ${lastWeekCount} records found`);
  
  if (lastWeekCount === 0) {
    console.log('\n❌ PROBLEM FOUND: No data in the "Last Week" range!');
    console.log('   The uploaded file does not contain data for the week the dashboard is filtering for.');
  } else {
    console.log('\n✅ Data exists for "Last Week" range');
  }
  
} catch (error) {
  console.error('❌ Error reading patient file:', error.message);
}

console.log('\n' + '='.repeat(80));
console.log('MEMBERSHIP FILE');
console.log('='.repeat(80));

try {
  const wb = XLSX.readFile(membershipFile);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  
  console.log(`✅ Total rows: ${data.length}`);
  
  // Check for date columns
  if (data.length > 0) {
    console.log('\n📋 Columns:', Object.keys(data[0]).join(', '));
  }
  
} catch (error) {
  console.error('❌ Error reading membership file:', error.message);
}

console.log('\n' + '='.repeat(80));
console.log('DIAGNOSIS');
console.log('='.repeat(80));
console.log('The "Last Week" filter calculates the previous Monday-Sunday week.');
console.log('If you uploaded data on Monday Oct 6, 2025, "Last Week" means:');
console.log(`  Sep 29 - Oct 5, 2025`);
console.log('\nIf your data file contains dates from a different week (e.g., Sep 22-28),');
console.log('the dashboard will show "Limited data" because no records match the filter.');
