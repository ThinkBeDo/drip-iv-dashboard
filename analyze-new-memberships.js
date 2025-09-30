const XLSX = require('xlsx');

const filePath = '/Users/tylerlafleur/Library/Mobile Documents/com~apple~CloudDocs/CLAUDE Projects/drip-iv-dashboard/Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';

console.log('Reading Excel file...');
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws);

console.log('Total rows:', data.length);
console.log('\n=== Searching for NEW memberships ===\n');

// Find all rows with "NEW" in Charge Desc
const newMemberships = data.filter(row => {
  const chargeDesc = row['Charge Desc'] || '';
  return chargeDesc.toUpperCase().includes('NEW');
});

console.log('Rows with "NEW" in Charge Desc:', newMemberships.length);

// Group by membership type
const byType = {
  individual: [],
  family: [],
  concierge: [],
  corporate: [],
  other: []
};

newMemberships.forEach(row => {
  const chargeDesc = (row['Charge Desc'] || '').toLowerCase();
  
  if (chargeDesc.includes('individual')) {
    byType.individual.push(row);
  } else if (chargeDesc.includes('family')) {
    byType.family.push(row);
  } else if (chargeDesc.includes('concierge')) {
    byType.concierge.push(row);
  } else if (chargeDesc.includes('corporate')) {
    byType.corporate.push(row);
  } else {
    byType.other.push(row);
  }
});

console.log('\n=== Breakdown by Type ===');
console.log('Individual:', byType.individual.length);
console.log('Family:', byType.family.length);
console.log('Concierge:', byType.concierge.length);
console.log('Corporate:', byType.corporate.length);
console.log('Other:', byType.other.length);

console.log('\n=== Sample NEW Memberships ===');
newMemberships.slice(0, 15).forEach((row, i) => {
  console.log(`${i + 1}. ${row['Charge Desc']} - ${row['Patient']} - ${row['Date']}`);
});

console.log('\n=== All Unique Charge Descriptions with NEW ===');
const uniqueDescriptions = [...new Set(newMemberships.map(row => row['Charge Desc']))];
uniqueDescriptions.forEach(desc => {
  const count = newMemberships.filter(row => row['Charge Desc'] === desc).length;
  console.log(`- "${desc}" (${count} occurrences)`);
});

// Also check for membership-related entries without NEW
console.log('\n\n=== All Membership-related Charge Descriptions ===');
const membershipRows = data.filter(row => {
  const chargeDesc = (row['Charge Desc'] || '').toLowerCase();
  return chargeDesc.includes('membership');
});

const allMembershipDescs = [...new Set(membershipRows.map(row => row['Charge Desc']))];
allMembershipDescs.sort();
allMembershipDescs.forEach(desc => {
  const count = membershipRows.filter(row => row['Charge Desc'] === desc).length;
  const hasNew = desc.toUpperCase().includes('NEW');
  console.log(`${hasNew ? '✓ NEW' : '       '} - "${desc}" (${count} occurrences)`);
});
