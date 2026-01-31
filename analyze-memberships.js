#!/usr/bin/env node

const XLSX = require('xlsx');

const filePath = '/Users/tylerlafleur/Documents/CLAUDE_Code_Projects/drip-iv-dashboard-1/Drip IV Active Memberships (4).xlsx';
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('=== MEMBERSHIP FILE ANALYSIS ===');
console.log('Total rows:', data.length);
console.log('Columns:', Object.keys(data[0] || {}));
console.log('');

// Count by membership type (Title column)
const byType = {};
data.forEach(row => {
  const title = (row['Title'] || row['Membership Type'] || 'Unknown').toString().toLowerCase();
  if (!byType[title]) byType[title] = 0;
  byType[title]++;
});

console.log('=== MEMBERSHIP COUNTS BY TYPE ===');
Object.keys(byType).sort().forEach(type => {
  console.log(`  ${type}: ${byType[type]}`);
});

// Categorize into dashboard buckets
let individual = 0, family = 0, concierge = 0, corporate = 0, other = 0;
const otherRows = [];

data.forEach(row => {
  const title = (row['Title'] || '').toString().toLowerCase();
  if (title.includes('individual')) individual++;
  else if (title.includes('family')) family++;
  else if (title.includes('concierge')) concierge++;
  else if (title.includes('corporate')) corporate++;
  else {
    other++;
    otherRows.push(row);
  }
});

console.log('');
console.log('=== EXPECTED DASHBOARD VALUES ===');
console.log(`  Individual: ${individual}`);
console.log(`  Family: ${family}`);
console.log(`  Concierge: ${concierge}`);
console.log(`  Corporate: ${corporate}`);
console.log(`  Other/Unclassified: ${other}`);
console.log(`  TOTAL: ${individual + family + concierge + corporate}`);

// Show unclassified if any
if (otherRows.length > 0) {
  console.log('');
  console.log('=== UNCLASSIFIED MEMBERSHIPS ===');
  otherRows.forEach(row => {
    console.log(`  - ${row['Patient'] || 'Unknown'}: "${row['Title']}"`);
  });
}

// Check for concierge overlap (both concierge and drip)
console.log('');
console.log('=== CONCIERGE & DRIP OVERLAP CHECK ===');
let conciergeAndDrip = 0;
data.forEach(row => {
  const title = (row['Title'] || '').toString().toLowerCase();
  if (title.includes('concierge') && title.includes('drip')) {
    conciergeAndDrip++;
    console.log(`  - ${row['Patient']}: "${row['Title']}"`);
  }
});
console.log(`  Total with both Concierge & Drip: ${conciergeAndDrip}`);
