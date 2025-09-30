const XLSX = require('xlsx');

// Simulate the extractFromCSV function's NEW membership logic
function testNewMembershipDetection(filePath) {
  console.log('🧪 Testing NEW Membership Detection Logic\n');
  console.log('Reading Excel file...');
  
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const csvData = XLSX.utils.sheet_to_json(ws);
  
  console.log(`Total rows in file: ${csvData.length}\n`);
  
  // Track new membership signups - based on "(NEW)" in Charge Desc
  const newMembershipCounts = {
    individual: new Set(),
    family: new Set(),
    concierge: new Set(),
    corporate: new Set()
  };
  
  // Track all memberships (for comparison)
  const allMembershipCounts = {
    individual: new Set(),
    family: new Set(),
    concierge: new Set(),
    corporate: new Set()
  };
  
  let newMembershipRowsFound = 0;
  
  csvData.forEach(row => {
    const chargeDesc = (row['Charge Desc'] || '');
    const chargeDescLower = chargeDesc.toLowerCase();
    const patient = row['Patient'] || '';
    const dateStr = row['Date'] || row['Date Of Payment'] || '';
    
    if (!patient) return;
    
    // Check if this is a NEW membership signup (has "(NEW)" in Charge Desc)
    const isNewMembership = chargeDesc.toUpperCase().includes('(NEW)');
    
    if (isNewMembership) {
      newMembershipRowsFound++;
      console.log(`Found NEW membership: "${chargeDesc}" - Patient: "${patient}" - Date: ${dateStr}`);
    }
    
    // Individual membership variations
    if ((chargeDescLower.includes('individual') && chargeDescLower.includes('membership')) ||
        chargeDescLower === 'membership individual' ||
        chargeDescLower === 'individual membership' ||
        chargeDescLower.includes('membership - individual')) {
      allMembershipCounts.individual.add(patient);
      if (isNewMembership) {
        newMembershipCounts.individual.add(patient);
      }
    }
    // Family membership variations (excluding concierge combos)
    else if ((chargeDescLower.includes('family') && chargeDescLower.includes('membership') && 
             !chargeDescLower.includes('concierge')) ||
             chargeDescLower === 'membership family' ||
             chargeDescLower === 'family membership') {
      allMembershipCounts.family.add(patient);
      if (isNewMembership) {
        newMembershipCounts.family.add(patient);
      }
    }
    // Standalone Concierge membership
    else if ((chargeDescLower.includes('concierge') && chargeDescLower.includes('membership') &&
             !chargeDescLower.includes('family') && !chargeDescLower.includes('drip')) ||
             chargeDescLower === 'concierge membership' ||
             chargeDescLower === 'membership concierge') {
      allMembershipCounts.concierge.add(patient);
      if (isNewMembership) {
        newMembershipCounts.concierge.add(patient);
      }
    }
    // Corporate membership variations
    else if ((chargeDescLower.includes('corporate') && chargeDescLower.includes('membership')) ||
             chargeDescLower === 'membership corporate' ||
             chargeDescLower === 'corporate membership' ||
             chargeDescLower.includes('membership - corporate')) {
      allMembershipCounts.corporate.add(patient);
      if (isNewMembership) {
        newMembershipCounts.corporate.add(patient);
      }
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS');
  console.log('='.repeat(60));
  
  console.log('\n🆕 NEW Membership Signups (with "(NEW)" in Charge Desc):');
  console.log(`   Individual: ${newMembershipCounts.individual.size}`);
  console.log(`   Family: ${newMembershipCounts.family.size}`);
  console.log(`   Concierge: ${newMembershipCounts.concierge.size}`);
  console.log(`   Corporate: ${newMembershipCounts.corporate.size}`);
  const totalNew = newMembershipCounts.individual.size + 
                   newMembershipCounts.family.size + 
                   newMembershipCounts.concierge.size + 
                   newMembershipCounts.corporate.size;
  console.log(`   ─────────────────────────────`);
  console.log(`   TOTAL NEW: ${totalNew}`);
  
  console.log('\n📋 All Memberships (for comparison):');
  console.log(`   Individual: ${allMembershipCounts.individual.size}`);
  console.log(`   Family: ${allMembershipCounts.family.size}`);
  console.log(`   Concierge: ${allMembershipCounts.concierge.size}`);
  console.log(`   Corporate: ${allMembershipCounts.corporate.size}`);
  
  console.log('\n✅ Expected Dashboard Display:');
  console.log(`   NEW INDIVIDUAL: ${newMembershipCounts.individual.size}`);
  console.log(`   NEW FAMILY: ${newMembershipCounts.family.size}`);
  console.log(`   NEW CONCIERGE: ${newMembershipCounts.concierge.size}`);
  console.log(`   NEW CORPORATE: ${newMembershipCounts.corporate.size}`);
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total rows with "(NEW)" found: ${newMembershipRowsFound}`);
  console.log('='.repeat(60) + '\n');
  
  // Verify the logic is working correctly
  if (totalNew === 0) {
    console.log('⚠️  WARNING: No NEW memberships detected!');
    console.log('   This could mean:');
    console.log('   1. The file has no entries with "(NEW)" in Charge Desc');
    console.log('   2. The logic needs adjustment');
  } else {
    console.log('✅ SUCCESS: NEW membership detection is working!');
  }
}

// Run the test
const filePath = '/Users/tylerlafleur/Library/Mobile Documents/com~apple~CloudDocs/CLAUDE Projects/drip-iv-dashboard/Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';
testNewMembershipDetection(filePath);
