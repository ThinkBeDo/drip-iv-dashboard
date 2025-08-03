// Test script to validate CSV parsing logic
const fs = require('fs');
const csv = require('csv-parser');

// Service categorization functions (copied from server.js)
function isInfusionService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // Exclude non-medical services first
  const exclusions = ['membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation'];
  if (exclusions.some(excl => lowerDesc.includes(excl))) {
    return false;
  }
  
  const infusionServices = [
    'saline', 'nad', 'energy', 'performance', 'recovery', 'alleviate', 'immunity',
    'all inclusive', 'lux beauty', 'glutathione infusion', 'methylene blue infusion',
    'vitamin c', 'hydration', 'myers', 'tri-immune', 'drip'
  ];
  
  // More specific IV matching - require word boundaries or specific contexts  
  const hasIVService = lowerDesc.includes(' iv ') || lowerDesc.startsWith('iv ') || lowerDesc.endsWith(' iv') ||
                      lowerDesc.includes('iv drip') || lowerDesc.includes('iv infusion') || lowerDesc.includes('iv therapy');
  
  return infusionServices.some(service => 
    lowerDesc.includes(service) && 
    !lowerDesc.includes('injection') && 
    !lowerDesc.includes('weekly') &&
    !lowerDesc.includes('monthly')
  ) || hasIVService;
}

function isInjectionService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // Exclude non-medical services first
  const exclusions = ['membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation'];
  if (exclusions.some(excl => lowerDesc.includes(excl))) {
    return false;
  }
  
  const injectionServices = [
    'injection', 'weekly', 'monthly', 'tirzepatide', 'semaglutide', 
    'b12', 'vitamin b12', 'vitamin d3', 'metabolism boost', 'toradol',
    'glutathione injection'
  ];
  
  return injectionServices.some(service => lowerDesc.includes(service)) ||
         (lowerDesc.includes('weekly') || lowerDesc.includes('monthly'));
}

function isMembershipOrAdminService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  const adminServices = [
    'membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation',
    'blood work', 'panel', 'test', 'screening', 'concierge membership'
  ];
  
  return adminServices.some(service => lowerDesc.includes(service));
}

function getServiceCategory(chargeDesc) {
  if (isMembershipOrAdminService(chargeDesc)) return 'admin';
  if (isInjectionService(chargeDesc)) return 'injection';
  if (isInfusionService(chargeDesc)) return 'infusion';
  return 'other';
}

// Test specific categorization cases
console.log('=== TESTING SERVICE CATEGORIZATION FIXES ===');
console.log('Testing critical bug fixes...\n');

const testCases = [
  { service: 'Membership - Individual', expected: 'admin' },
  { service: 'Membership - Family', expected: 'admin' },
  { service: 'Concierge Membership', expected: 'admin' },
  { service: 'Tirzepatide Weekly', expected: 'injection' },
  { service: 'Semaglutide Monthly', expected: 'injection' },
  { service: 'NAD 200mg (Member)', expected: 'infusion' },
  { service: 'NAD 200mg (Non-Member)', expected: 'infusion' },
  { service: 'Energy IV', expected: 'infusion' },
  { service: 'IV Therapy', expected: 'infusion' },
  { service: 'B12 Injection', expected: 'injection' },
  { service: 'Lab Draw Fee', expected: 'admin' },
  { service: 'Office Visit', expected: 'admin' },
  { service: 'Some Random Service', expected: 'other' }
];

testCases.forEach(test => {
  const result = getServiceCategory(test.service);
  const status = result === test.expected ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} "${test.service}" → ${result} (expected: ${test.expected})`);
});

console.log('\n=== CSV FILE ANALYSIS ===');

// Test with sample data
const csvFilePath = '/Users/tylerlafleur/Downloads/Patient Analysis (Charge Details & Payments) - V3  - With COGS (1).csv';

if (fs.existsSync(csvFilePath)) {
  console.log('Testing CSV parsing with actual data...\n');
  
  const results = [];
  const infusionServices = {};
  const injectionServices = {};
  const adminServices = {};
  const customers = new Set();
  
  fs.createReadStream(csvFilePath, { encoding: 'utf8' })
    .pipe(csv({ skipEmptyLines: true }))
    .on('data', (row) => {
      // Debug: log first few rows to see structure
      if (results.length < 5) {
        console.log('Row keys:', Object.keys(row));
        console.log('Row data:', row);
      }
      const chargeType = row['Charge Type'] || '';
      const chargeDesc = row['Charge Desc'] || '';
      const patient = row['Patient'] || '';
      
      if (chargeType === 'PROCEDURE' || chargeType === 'OFFICE_VISIT') {
        if (patient && chargeDesc) {
          customers.add(patient);
          const category = getServiceCategory(chargeDesc);
          
          if (category === 'infusion') {
            const serviceName = chargeDesc.replace(/\s*\((Member|Non-Member)\)\s*/i, '').trim();
            infusionServices[serviceName] = (infusionServices[serviceName] || 0) + 1;
          } else if (category === 'injection') {
            const serviceName = chargeDesc.replace(/\s*\((Member|Non-Member)\)\s*/i, '').trim();
            injectionServices[serviceName] = (injectionServices[serviceName] || 0) + 1;
          } else if (category === 'admin') {
            const serviceName = chargeDesc.replace(/\s*\((Member|Non-Member)\)\s*/i, '').trim();
            adminServices[serviceName] = (adminServices[serviceName] || 0) + 1;
          }
          
          results.push({
            patient,
            service: chargeDesc,
            category,
            type: chargeType
          });
        }
      }
    })
    .on('end', () => {
      console.log('=== PARSING RESULTS ===');
      console.log(`Total unique customers: ${customers.size}`);
      console.log(`Total service records processed: ${results.length}`);
      
      const infusionCount = results.filter(r => r.category === 'infusion').length;
      const injectionCount = results.filter(r => r.category === 'injection').length;
      const adminCount = results.filter(r => r.category === 'admin').length;
      const otherCount = results.filter(r => r.category === 'other').length;
      
      console.log(`\nService Breakdown:`);
      console.log(`- Infusions: ${infusionCount}`);
      console.log(`- Injections: ${injectionCount}`);
      console.log(`- Admin/Membership: ${adminCount}`);
      console.log(`- Other: ${otherCount}`);
      
      console.log(`\nTop 5 Infusion Services:`);
      Object.entries(infusionServices)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([name, count]) => console.log(`  ${name}: ${count}`));
      
      console.log(`\nTop 5 Injection Services:`);
      Object.entries(injectionServices)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([name, count]) => console.log(`  ${name}: ${count}`));
      
      console.log(`\nTop 5 Admin/Membership Services:`);
      Object.entries(adminServices)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([name, count]) => console.log(`  ${name}: ${count}`));
      
      console.log(`\nSample categorizations:`);
      results.slice(0, 20).forEach(r => {
        console.log(`  ${r.category.toUpperCase()}: ${r.service}`);
      });
    });
} else {
  console.log('CSV file not found at:', csvFilePath);
}