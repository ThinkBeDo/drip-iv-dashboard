// Test if isStandaloneInjection() correctly excludes weight loss meds
function isStandaloneInjection(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // Standalone Injections (excluding weight management medications)
  const standaloneInjections = [
    'b12 injection', 'metabolism boost injection', 'vitamin d injection', 
    'glutathione injection', 'biotin injection'
  ];
  
  // Weight management medications (tracked separately)
  const weightManagementMeds = ['semaglutide', 'tirzepatide'];
  
  // Return false for weight management medications
  if (weightManagementMeds.some(med => lowerDesc.includes(med))) {
    return false;
  }
  
  return standaloneInjections.some(service => lowerDesc.includes(service)) ||
         (lowerDesc.includes('b12') && lowerDesc.includes('injection') && !lowerDesc.includes('vitamin'));
}

const testServices = [
  'Semaglutide Monthly',
  'Tirzepatide Weekly',
  'Partner Tirzepatide',
  'B12 Injection',
  'Vitamin D Injection',
  'B12'
];

console.log('Testing isStandaloneInjection():\n');
testServices.forEach(service => {
  const result = isStandaloneInjection(service);
  console.log(`  ${service}: ${result ? 'YES (regular injection)' : 'NO (excluded)'}`);
});
