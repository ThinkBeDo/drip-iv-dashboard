// Test script to validate CSV revenue calculation fix
const fs = require('fs');
const path = require('path');

// Load the extractFromCSV function from server.js
const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Extract just the needed functions
const functionCode = serverCode.match(/function extractFromCSV[\s\S]*?^function\s+\w+/m)[0];
const helperFunctions = serverCode.match(/function is(BaseInfusionService|InfusionAddon|StandaloneInjection|InfusionService|MembershipOrAdminService|WeightLossMedication)[\s\S]*?^}/gm).join('\n');
const categoryFunction = serverCode.match(/function getServiceCategory[\s\S]*?^}/m)[0];

// Create test environment
eval(helperFunctions);
eval(categoryFunction);
eval(functionCode.slice(0, -17)); // Remove trailing function declaration

// Generate test CSV data for Aug 22-29, 2025
function generateTestData() {
  const testData = [];
  const startDate = new Date('2025-08-22');
  const endDate = new Date('2025-08-29');
  
  // Generate 94 transactions totaling $10,067.27
  const services = [
    { desc: 'Saline 1L (Member)', amount: 95, type: 'PROCEDURE' },
    { desc: 'Energy (Non-Member)', amount: 135, type: 'PROCEDURE' },
    { desc: 'Performance & Recovery (Member)', amount: 110, type: 'PROCEDURE' },
    { desc: 'Immunity (Non-Member)', amount: 125, type: 'PROCEDURE' },
    { desc: 'Tirzepatide Injection', amount: 150, type: 'PROCEDURE' },
    { desc: 'Semaglutide Injection', amount: 140, type: 'PROCEDURE' },
    { desc: 'B12 Injection', amount: 25, type: 'PROCEDURE' },
    { desc: 'Glutathione Add-on', amount: 35, type: 'PROCEDURE' },
    { desc: 'NAD Add-on', amount: 75, type: 'PROCEDURE' }
  ];
  
  let totalAmount = 0;
  let transactionCount = 0;
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dailyTransactions = 10 + Math.floor(Math.random() * 5);
    
    for (let i = 0; i < dailyTransactions && transactionCount < 94; i++) {
      const service = services[Math.floor(Math.random() * services.length)];
      const amount = service.amount + (Math.random() * 20 - 10);
      
      testData.push({
        'Charge Type': service.type,
        'Charge Desc': service.desc,
        'Patient': `Patient_${Math.floor(Math.random() * 50) + 1}`,
        'Date': d.toISOString().split('T')[0],
        'Calculated Payment (Line)': `$${amount.toFixed(2)}`
      });
      
      totalAmount += amount;
      transactionCount++;
    }
  }
  
  // Adjust last transaction to hit target
  const difference = 10067.27 - totalAmount;
  if (testData.length > 0) {
    const lastTransaction = testData[testData.length - 1];
    const currentAmount = parseFloat(lastTransaction['Calculated Payment (Line)'].replace('$', ''));
    lastTransaction['Calculated Payment (Line)'] = `$${(currentAmount + difference).toFixed(2)}`;
  }
  
  return testData;
}

// Test the fix
console.log('🧪 Testing CSV Revenue Calculation Fix\n');
console.log('Generating test data for Aug 22-29, 2025...');

const testCSVData = generateTestData();
console.log(`Generated ${testCSVData.length} test transactions\n`);

// Calculate expected total
const expectedTotal = testCSVData.reduce((sum, row) => {
  return sum + parseFloat(row['Calculated Payment (Line)'].replace('$', ''));
}, 0);

console.log(`Expected total revenue: $${expectedTotal.toFixed(2)}\n`);

// Run the extraction
console.log('Running extractFromCSV with fixed code...\n');
const result = extractFromCSV(testCSVData);

console.log('=' .repeat(60));
console.log('RESULTS:');
console.log('=' .repeat(60));
console.log(`Weekly Revenue: $${result.actual_weekly_revenue.toFixed(2)}`);
console.log(`Expected: $${expectedTotal.toFixed(2)}`);
console.log(`Match: ${Math.abs(result.actual_weekly_revenue - expectedTotal) < 1 ? '✅ PASS' : '❌ FAIL'}`);
console.log('\nBreakdown:');
console.log(`  Infusions: $${result.infusion_revenue_weekly.toFixed(2)}`);
console.log(`  Injections: $${result.injection_revenue_weekly.toFixed(2)}`);
console.log(`  Memberships: $${result.membership_revenue_weekly.toFixed(2)}`);
console.log(`  Total: $${(result.infusion_revenue_weekly + result.injection_revenue_weekly + result.membership_revenue_weekly).toFixed(2)}`);
console.log('=' .repeat(60));