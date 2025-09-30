const XLSX = require('xlsx');

// Revenue categorization patterns from server.js
const revenueCategoryMapping = {
  drip_iv_revenue: [
    'All Inclusive (Non-Member)', 'Alleviate (Member)', 'Alleviate (Non-Member)',
    'Energy (Non-Member)', 'Hydration (Non-Member)', 'Hydration (member)',
    'Immunity (Member)', 'Immunity (Non-Member)', 'Lux Beauty (Non-Member)',
    'Performance & Recovery (Member)', 'Performance & Recovery (Non-member)',
    'NAD 100mg (Member)', 'NAD 100mg (Non-Member)', 'NAD 150mg (Member)',
    'NAD 200mg (Member)', 'NAD 250mg (Member)', 'NAD 50mg (Non Member)',
    'Saline 1L (Member)', 'Saline 1L (Non-Member)', 'Met. Boost IV',
    'Vitamin D3 IM', 'Toradol IM', 'Glutathione IM', 'Zofran IM',
    'B12 IM', 'Vitamin B Complex IM', 'Biotin IM', 'MIC IM',
    'Amino Acid IM', 'Magnesium IM', 'Zinc IM', 'Vitamin C IM'
  ],
  semaglutide_revenue: [
    'Semaglutide Monthly', 'Semaglutide Weekly', 'Tirzepatide Monthly', 
    'Tirzepatide Weekly', 'Partner Tirzepatide', 'Weight Loss Program Lab Bundle',
    'Contrave Office Visit', 'Weight Management', 'GLP-1', 'Ozempic', 'Wegovy'
  ],
  ketamine_revenue: [
    'Ketamine', 'Ketamine Therapy', 'Spravato'
  ],
  membership_revenue: [
    'Membership - Individual', 'Membership - Family', 'Membership - Family (NEW)', 
    'Family Membership', 'Individual Membership', 'Concierge Membership'
  ],
  hormone_revenue: [
    'Hormones - Follow Up MALES', 'Hormone Therapy', 'HRT', 'Testosterone',
    'Estrogen', 'Progesterone', 'DHEA', 'Thyroid'
  ],
  other_revenue: ['Lab Draw Fee', 'TOTAL_TIPS']
};

const revenueCategoryPatterns = {
  drip_iv_revenue: [
    'iv', 'infusion', 'drip', 'saline', 'nad', 'vitamin', 'immunity', 'energy', 
    'hydration', 'alleviate', 'performance', 'recovery', 'lux beauty', 'toradol', 
    'glutathione', 'zofran', 'b12', 'biotin', 'mic', 'amino acid', 'magnesium', 'zinc'
  ],
  semaglutide_revenue: [
    'semaglutide', 'tirzepatide', 'weight loss', 'ozempic', 'wegovy', 'glp-1', 'contrave'
  ],
  ketamine_revenue: [
    'ketamine', 'spravato'
  ],
  membership_revenue: [
    'membership'
  ],
  hormone_revenue: [
    'hormone', 'testosterone', 'estrogen', 'progesterone', 'dhea', 'thyroid', 'hrt'
  ]
};

function categorizeRevenue(chargeDesc) {
  const cleanDesc = chargeDesc.toLowerCase().trim();
  
  // First try exact matching
  for (const [category, descriptions] of Object.entries(revenueCategoryMapping)) {
    if (descriptions.some(desc => chargeDesc === desc)) {
      return category;
    }
  }
  
  // Then try substring pattern matching
  for (const [category, patterns] of Object.entries(revenueCategoryPatterns)) {
    if (patterns.some(pattern => cleanDesc.includes(pattern))) {
      return category;
    }
  }
  
  return 'other_revenue';
}

// Main diagnostic function
function diagnoseWeightLossRevenue(filePath) {
  console.log('🔍 Diagnosing Weight Loss Revenue Calculation\n');
  console.log('=' .repeat(80));
  
  // Read Excel file
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log(`📊 Excel file loaded: ${data.length} rows\n`);
  
  // Track weight loss items
  const weightLossItems = [];
  let totalWeightLossRevenue = 0;
  
  // Process each row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const chargeDesc = row[8]; // Column 9 (index 8) - "Charge Desc"
    const paymentAmount = row[14]; // Column 15 (index 14) - "Calculated Payment (Line)"
    
    if (!chargeDesc || !paymentAmount) continue;
    
    // Parse amount
    let amount = 0;
    if (typeof paymentAmount === 'number') {
      amount = paymentAmount;
    } else if (typeof paymentAmount === 'string') {
      const cleanAmount = paymentAmount.replace(/[$,]/g, '');
      amount = parseFloat(cleanAmount);
    }
    
    if (isNaN(amount) || amount <= 0) continue;
    
    // Check if this is weight loss related
    const category = categorizeRevenue(chargeDesc);
    const lowerDesc = chargeDesc.toLowerCase();
    
    // Check if it's Semaglutide or Tirzepatide
    if (lowerDesc.includes('semaglutide') || lowerDesc.includes('tirzepatide')) {
      weightLossItems.push({
        row: i + 1,
        chargeDesc,
        amount,
        category
      });
      totalWeightLossRevenue += amount;
    }
  }
  
  // Display results
  console.log('\n📋 WEIGHT LOSS ITEMS FOUND:\n');
  console.log('-'.repeat(80));
  
  weightLossItems.forEach(item => {
    console.log(`Row ${item.row}: ${item.chargeDesc}`);
    console.log(`  Amount: $${item.amount.toFixed(2)}`);
    console.log(`  Category: ${item.category}`);
    console.log();
  });
  
  console.log('=' .repeat(80));
  console.log(`\n💰 TOTAL WEIGHT LOSS REVENUE: $${totalWeightLossRevenue.toFixed(2)}`);
  console.log(`📊 Number of items: ${weightLossItems.length}`);
  
  // Break down by service type
  console.log('\n📊 BREAKDOWN BY SERVICE TYPE:\n');
  const breakdown = {};
  weightLossItems.forEach(item => {
    if (!breakdown[item.chargeDesc]) {
      breakdown[item.chargeDesc] = { count: 0, total: 0 };
    }
    breakdown[item.chargeDesc].count++;
    breakdown[item.chargeDesc].total += item.amount;
  });
  
  Object.entries(breakdown).forEach(([desc, data]) => {
    console.log(`${desc}:`);
    console.log(`  Count: ${data.count}`);
    console.log(`  Total: $${data.total.toFixed(2)}`);
    console.log();
  });
  
  // Check for any items that might be miscategorized
  console.log('\n🔍 CHECKING FOR POTENTIAL MISCATEGORIZATIONS:\n');
  console.log('-'.repeat(80));
  
  let allRevenueItems = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const chargeDesc = row[8];
    const paymentAmount = row[14];
    
    if (!chargeDesc || !paymentAmount) continue;
    
    let amount = 0;
    if (typeof paymentAmount === 'number') {
      amount = paymentAmount;
    } else if (typeof paymentAmount === 'string') {
      const cleanAmount = paymentAmount.replace(/[$,]/g, '');
      amount = parseFloat(cleanAmount);
    }
    
    if (isNaN(amount) || amount <= 0) continue;
    
    const category = categorizeRevenue(chargeDesc);
    allRevenueItems.push({ chargeDesc, amount, category });
  }
  
  // Show items categorized as semaglutide_revenue
  const semaglutideRevenueItems = allRevenueItems.filter(item => item.category === 'semaglutide_revenue');
  console.log(`\nItems categorized as 'semaglutide_revenue': ${semaglutideRevenueItems.length}`);
  
  let semaglutideTotal = 0;
  const semaglutideBreakdown = {};
  
  semaglutideRevenueItems.forEach(item => {
    semaglutideTotal += item.amount;
    if (!semaglutideBreakdown[item.chargeDesc]) {
      semaglutideBreakdown[item.chargeDesc] = { count: 0, total: 0 };
    }
    semaglutideBreakdown[item.chargeDesc].count++;
    semaglutideBreakdown[item.chargeDesc].total += item.amount;
  });
  
  console.log(`\nTotal semaglutide_revenue: $${semaglutideTotal.toFixed(2)}`);
  console.log('\nBreakdown:');
  Object.entries(semaglutideBreakdown).forEach(([desc, data]) => {
    console.log(`  ${desc}: ${data.count} × $${(data.total / data.count).toFixed(2)} = $${data.total.toFixed(2)}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ DIAGNOSIS COMPLETE\n');
  console.log(`Expected (from manual Excel filter): $9,940.00`);
  console.log(`Calculated by script: $${totalWeightLossRevenue.toFixed(2)}`);
  console.log(`Dashboard showing: $10,060.00`);
  console.log(`\nDiscrepancy: $${(10060 - totalWeightLossRevenue).toFixed(2)}`);
}

// Run the diagnostic
const filePath = process.argv[2] || './Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';
diagnoseWeightLossRevenue(filePath);
