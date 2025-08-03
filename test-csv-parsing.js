// Test script to validate CSV parsing logic
const fs = require('fs');
const csv = require('csv-parser');

// Service categorization functions (copied from server.js)
function isInfusionService(chargeDesc) {
  const infusionServices = [
    'saline', 'nad', 'energy', 'performance', 'recovery', 'alleviate', 'immunity',
    'all inclusive', 'lux beauty', 'glutathione infusion', 'methylene blue infusion',
    'vitamin c', 'hydration', 'myers', 'tri-immune', 'iv', 'drip'
  ];
  
  const lowerDesc = chargeDesc.toLowerCase();
  return infusionServices.some(service => 
    lowerDesc.includes(service) && 
    !lowerDesc.includes('injection') && 
    !lowerDesc.includes('weekly') &&
    !lowerDesc.includes('monthly')
  );
}

function isInjectionService(chargeDesc) {
  const injectionServices = [
    'injection', 'weekly', 'monthly', 'tirzepatide', 'semaglutide', 
    'b12', 'vitamin b12', 'vitamin d3', 'metabolism boost', 'toradol',
    'glutathione injection'
  ];
  
  const lowerDesc = chargeDesc.toLowerCase();
  return injectionServices.some(service => lowerDesc.includes(service)) ||
         (lowerDesc.includes('weekly') || lowerDesc.includes('monthly'));
}

function getServiceCategory(chargeDesc) {
  if (isInjectionService(chargeDesc)) return 'injection';
  if (isInfusionService(chargeDesc)) return 'infusion';
  return 'other';
}

// Test with sample data
const csvFilePath = '/Users/tylerlafleur/Downloads/Patient Analysis (Charge Details & Payments) - V3  - With COGS (1).csv';

if (fs.existsSync(csvFilePath)) {
  console.log('Testing CSV parsing with actual data...\n');
  
  const results = [];
  const infusionServices = {};
  const injectionServices = {};
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
      const otherCount = results.filter(r => r.category === 'other').length;
      
      console.log(`\nService Breakdown:`);
      console.log(`- Infusions: ${infusionCount}`);
      console.log(`- Injections: ${injectionCount}`);
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
      
      console.log(`\nSample categorizations:`);
      results.slice(0, 20).forEach(r => {
        console.log(`  ${r.category.toUpperCase()}: ${r.service}`);
      });
    });
} else {
  console.log('CSV file not found at:', csvFilePath);
}