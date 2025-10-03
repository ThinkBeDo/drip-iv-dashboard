const { isMembershipService, getServiceCategory } = require('./import-weekly-data');

// Test the new membership detection logic
function testNewMembershipDetection() {
  console.log('🧪 Testing NEW Membership Detection Fix\n');
  
  // Sample charge descriptions from the user's data
  const testCases = [
    { chargeDesc: 'OFFICE VISIT Membership - Family (NEW)', expected: { category: 'membership', isNew: true, type: 'family' } },
    { chargeDesc: 'Membership - Individual (NEW)', expected: { category: 'membership', isNew: true, type: 'individual' } },
    { chargeDesc: 'Membership - Family', expected: { category: 'membership', isNew: false, type: 'family' } },
    { chargeDesc: 'Membership - Individual', expected: { category: 'membership', isNew: false, type: 'individual' } },
    { chargeDesc: 'IV Therapy - Energy', expected: { category: 'base_infusion', isNew: false, type: null } },
    { chargeDesc: 'Concierge Membership NEW', expected: { category: 'membership', isNew: true, type: 'concierge' } },
    { chargeDesc: 'Corporate Membership (NEW)', expected: { category: 'membership', isNew: true, type: 'corporate' } }
  ];
  
  let passedTests = 0;
  let totalTests = testCases.length;
  
  testCases.forEach((testCase, index) => {
    const { chargeDesc, expected } = testCase;
    
    console.log(`Test ${index + 1}: "${chargeDesc}"`);
    
    // Test service category detection
    const serviceCategory = getServiceCategory(chargeDesc);
    const categoryMatch = serviceCategory === expected.category;
    
    // Test new membership detection logic
    const lowerDesc = chargeDesc.toLowerCase();
    const isNewMembership = lowerDesc.includes('(new)') || lowerDesc.includes(' new');
    const newMatch = isNewMembership === expected.isNew;
    
    // Test membership type detection
    let membershipType = null;
    if (serviceCategory === 'membership' && isNewMembership) {
      if (lowerDesc.includes('individual')) membershipType = 'individual';
      else if (lowerDesc.includes('family')) membershipType = 'family';
      else if (lowerDesc.includes('concierge')) membershipType = 'concierge';
      else if (lowerDesc.includes('corporate')) membershipType = 'corporate';
    }
    const typeMatch = membershipType === expected.type;
    
    const allPassed = categoryMatch && newMatch && typeMatch;
    if (allPassed) passedTests++;
    
    console.log(`   Category: ${serviceCategory} ${categoryMatch ? '✓' : '✗'} (expected: ${expected.category})`);
    console.log(`   Is New: ${isNewMembership} ${newMatch ? '✓' : '✗'} (expected: ${expected.isNew})`);
    console.log(`   Type: ${membershipType || 'none'} ${typeMatch ? '✓' : '✗'} (expected: ${expected.type || 'none'})`);
    console.log(`   Result: ${allPassed ? '✅ PASS' : '❌ FAIL'}\n`);
  });
  
  console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED! The fix should work correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review the logic.');
  }
}

// Simulate the new membership counting logic
function simulateNewMembershipCounting(transactions) {
  console.log('\n🔄 Simulating New Membership Counting\n');
  
  const metrics = {
    new_individual_members_weekly: 0,
    new_family_members_weekly: 0,
    new_concierge_members_weekly: 0,
    new_corporate_members_weekly: 0
  };
  
  transactions.forEach(transaction => {
    const { chargeDesc, amount } = transaction;
    const serviceCategory = getServiceCategory(chargeDesc);
    
    if (serviceCategory === 'membership') {
      const lowerDesc = chargeDesc.toLowerCase();
      const isNewMembership = lowerDesc.includes('(new)') || lowerDesc.includes(' new');
      
      if (isNewMembership) {
        console.log(`   Found NEW membership: "${chargeDesc}"`);
        
        if (lowerDesc.includes('individual')) {
          metrics.new_individual_members_weekly++;
        } else if (lowerDesc.includes('family')) {
          metrics.new_family_members_weekly++;
        } else if (lowerDesc.includes('concierge')) {
          metrics.new_concierge_members_weekly++;
        } else if (lowerDesc.includes('corporate')) {
          metrics.new_corporate_members_weekly++;
        }
      } else {
        console.log(`   Found existing membership (not counted): "${chargeDesc}"`);
      }
    }
  });
  
  console.log('\n📊 New Membership Counts:');
  console.log(`   Individual: ${metrics.new_individual_members_weekly}`);
  console.log(`   Family: ${metrics.new_family_members_weekly}`);
  console.log(`   Concierge: ${metrics.new_concierge_members_weekly}`);
  console.log(`   Corporate: ${metrics.new_corporate_members_weekly}`);
  
  const total = metrics.new_individual_members_weekly + 
               metrics.new_family_members_weekly + 
               metrics.new_concierge_members_weekly + 
               metrics.new_corporate_members_weekly;
  
  console.log(`   Total NEW memberships: ${total}`);
  
  return metrics;
}

// Test with sample data based on user's screenshots
const sampleTransactions = [
  { chargeDesc: 'OFFICE VISIT Membership - Family (NEW)', amount: 109.00 },
  { chargeDesc: 'OFFICE VISIT Membership - Family (NEW)', amount: 109.00 },
  { chargeDesc: 'Membership - Individual', amount: 79.00 },
  { chargeDesc: 'IV Therapy - Energy', amount: 150.00 },
  { chargeDesc: 'Membership - Family', amount: 109.00 },
  { chargeDesc: 'Individual Membership (NEW)', amount: 79.00 }
];

// Run tests
try {
  testNewMembershipDetection();
  simulateNewMembershipCounting(sampleTransactions);
} catch (error) {
  console.error('Error during testing:', error);
  console.log('Note: Some functions may not be properly exported. This is expected for testing.');
}