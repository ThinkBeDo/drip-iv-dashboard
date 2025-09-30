const XLSX = require('xlsx');

// Updated revenue categorization (with fixes applied)
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
    'Weight Management', 'GLP-1', 'Ozempic', 'Wegovy'
    // NOTE: Removed 'Contrave Office Visit'
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
  other_revenue: ['Lab Draw Fee', 'TOTAL_TIPS', 'Contrave Office Visit']
  // NOTE: Added 'Contrave Office Visit' here
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

function testWeightLossFix(filePath) {
  console.log('🧪 Testing Weight Loss Revenue Fix\n');
  console.log('=' .repeat(80));
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log(`📊 Excel file loaded: ${data.length} rows\n`);
  
  // Initialize revenue tracking
  const extractedData = {
    actual_weekly_revenue: 0,
    drip_iv_revenue_weekly: 0,
    semaglutide_revenue_weekly: 0,
    ketamine_revenue_weekly: 0,
    membership_revenue_weekly: 0,
    other_revenue_weekly: 0
  };
  
  let rowsProcessed = 0;
  
  // Process each row using FIXED column indices
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const chargeDesc = row[8]; // FIXED: Column 9 (index 8) - "Charge Desc"
    const paymentAmount = row[14]; // FIXED: Column 15 (index 14) - "Calculated Payment"
    
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
    
    switch (category) {
      case 'drip_iv_revenue':
        extractedData.drip_iv_revenue_weekly += amount;
        break;
      case 'semaglutide_revenue':
        extractedData.semaglutide_revenue_weekly += amount;
        break;
      case 'ketamine_revenue':
        extractedData.ketamine_revenue_weekly += amount;
        break;
      case 'membership_revenue':
        extractedData.membership_revenue_weekly += amount;
        break;
      case 'other_revenue':
        extractedData.other_revenue_weekly += amount;
        break;
    }
    
    extractedData.actual_weekly_revenue += amount;
    rowsProcessed++;
  }
  
  // Round values
  extractedData.actual_weekly_revenue = Math.round(extractedData.actual_weekly_revenue * 100) / 100;
  extractedData.drip_iv_revenue_weekly = Math.round(extractedData.drip_iv_revenue_weekly * 100) / 100;
  extractedData.semaglutide_revenue_weekly = Math.round(extractedData.semaglutide_revenue_weekly * 100) / 100;
  extractedData.ketamine_revenue_weekly = Math.round(extractedData.ketamine_revenue_weekly * 100) / 100;
  extractedData.membership_revenue_weekly = Math.round(extractedData.membership_revenue_weekly * 100) / 100;
  extractedData.other_revenue_weekly = Math.round(extractedData.other_revenue_weekly * 100) / 100;
  
  console.log('✅ FIXED CALCULATION RESULTS:\n');
  console.log('-'.repeat(80));
  console.log(`Total Weekly Revenue:    $${extractedData.actual_weekly_revenue.toLocaleString()}`);
  console.log(`Drip IV Revenue:         $${extractedData.drip_iv_revenue_weekly.toLocaleString()}`);
  console.log(`Weight Loss Revenue:     $${extractedData.semaglutide_revenue_weekly.toLocaleString()}`);
  console.log(`Ketamine Revenue:        $${extractedData.ketamine_revenue_weekly.toLocaleString()}`);
  console.log(`Membership Revenue:      $${extractedData.membership_revenue_weekly.toLocaleString()}`);
  console.log(`Other Revenue:           $${extractedData.other_revenue_weekly.toLocaleString()}`);
  console.log(`Rows Processed:          ${rowsProcessed}`);
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 COMPARISON:\n');
  console.log(`Expected Weight Loss (manual filter):  $9,940.00`);
  console.log(`Fixed Calculation Result:              $${extractedData.semaglutide_revenue_weekly.toLocaleString()}`);
  console.log(`Previous Dashboard Value (incorrect):  $10,060.00`);
  
  const isFixed = Math.abs(extractedData.semaglutide_revenue_weekly - 9940) < 0.01;
  
  if (isFixed) {
    console.log('\n✅ SUCCESS! Weight Loss revenue now matches expected value!');
    console.log('   - Fixed column indices (8 and 14 instead of 7 and 13)');
    console.log('   - Moved Contrave Office Visit from Weight Loss to Other Revenue');
  } else {
    console.log('\n❌ ISSUE: Weight Loss revenue still does not match');
    console.log(`   Difference: $${Math.abs(extractedData.semaglutide_revenue_weekly - 9940).toFixed(2)}`);
  }
  
  console.log('\n' + '='.repeat(80));
}

const filePath = process.argv[2] || './Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';
testWeightLossFix(filePath);
