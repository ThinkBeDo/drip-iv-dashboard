// Simple test for the NEW membership detection fix
console.log('🧪 Testing NEW Membership Detection Logic\n');

// Replicate the membership service detection logic
function isMembershipService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // Don't match services that just have "(member)" as a pricing suffix
  if (lowerDesc.match(/\(member\)$/)) {
    return false;
  }
  
  return lowerDesc.includes('membership') ||
         lowerDesc.includes('member fee') ||
         lowerDesc.includes('annual fee') ||
         lowerDesc.includes('monthly fee') ||
         lowerDesc.includes('membership fee');
}

// Test the new detection logic
function testNewMembershipDetection(chargeDesc) {
  const isMembership = isMembershipService(chargeDesc);
  
  if (isMembership) {
    const lowerDesc = chargeDesc.toLowerCase();
    const isNewMembership = lowerDesc.includes('(new)') || lowerDesc.includes(' new');
    
    if (isNewMembership) {
      let membershipType = 'unknown';
      if (lowerDesc.includes('individual')) membershipType = 'individual';
      else if (lowerDesc.includes('family')) membershipType = 'family';
      else if (lowerDesc.includes('concierge')) membershipType = 'concierge';
      else if (lowerDesc.includes('corporate')) membershipType = 'corporate';
      
      return { isNew: true, type: membershipType };
    } else {
      return { isNew: false, type: 'existing' };
    }
  }
  
  return { isNew: false, type: 'not_membership' };
}

// Test cases based on user's data
const testCases = [
  'OFFICE VISIT Membership - Family (NEW)',
  'OFFICE VISIT Membership - Family (NEW)', // Second one from screenshot
  'Membership - Individual (NEW)',
  'Membership - Family',
  'Membership - Individual',
  'IV Therapy - Energy',
  'Concierge Membership NEW',
  'Corporate Membership (NEW)',
  'B12 Injection (Member)'  // This should NOT count as a new membership
];

let newMembershipCounts = {
  individual: 0,
  family: 0,
  concierge: 0,
  corporate: 0
};

console.log('Processing test transactions:\n');

testCases.forEach((chargeDesc, index) => {
  const result = testNewMembershipDetection(chargeDesc);
  
  console.log(`${index + 1}. "${chargeDesc}"`);
  console.log(`   → ${result.isNew ? '🆕 NEW' : '⚪'} ${result.type} membership`);
  
  if (result.isNew && result.type !== 'unknown') {
    newMembershipCounts[result.type]++;
    console.log(`   ✅ Counted as new ${result.type} membership`);
  }
  
  console.log('');
});

console.log('📊 FINAL NEW MEMBERSHIP COUNTS:');
console.log(`   NEW Individual: ${newMembershipCounts.individual}`);
console.log(`   NEW Family: ${newMembershipCounts.family}`);
console.log(`   NEW Concierge: ${newMembershipCounts.concierge}`);
console.log(`   NEW Corporate: ${newMembershipCounts.corporate}`);

const total = newMembershipCounts.individual + 
             newMembershipCounts.family + 
             newMembershipCounts.concierge + 
             newMembershipCounts.corporate;

console.log(`   TOTAL NEW: ${total}`);

console.log('\n✅ Expected Result: 2 new family memberships (from the screenshot data)');
console.log(`📈 Actual Result: ${newMembershipCounts.family} new family memberships`);

if (newMembershipCounts.family >= 2) {
  console.log('🎉 SUCCESS! The fix should correctly detect the new memberships.');
} else {
  console.log('⚠️  The count is lower than expected. Check the logic.');
}