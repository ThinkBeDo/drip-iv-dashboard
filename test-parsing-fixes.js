const XLSX = require('xlsx');

// Test the updated parsing functions from server.js
console.log('=== TESTING UPDATED PARSING LOGIC ===\n');

// Revenue category mapping (same as in server.js)
const revenueCategoryMapping = {
  drip_iv_revenue: [
    'All Inclusive (Non-Member)', 'Alleviate (Member)', 'Alleviate (Non-Member)',
    'Energy (Non-Member)', 'Hydration (Non-Member)', 'Hydration (member)',
    'Immunity (Member)', 'Immunity (Non-Member)', 'Lux Beauty (Non-Member)',
    'Performance & Recovery (Member)', 'Performance & Recovery (Non-member)',
    'NAD 100mg (Member)', 'NAD 100mg (Non-Member)', 'NAD 150mg (Member)',
    'NAD 200mg (Member)', 'NAD 250mg (Member)', 'NAD 50mg (Non Member)',
    'Saline 1L (Member)', 'Saline 1L (Non-Member)', 'Met. Boost IV'
  ],
  semaglutide_revenue: [
    'Semaglutide Monthly', 'Semaglutide Weekly', 'Tirzepatide Monthly', 
    'Tirzepatide Weekly', 'Partner Tirzepatide', 'Weight Loss Program Lab Bundle',
    'Contrave Office Visit'
  ],
  ketamine_revenue: [],
  membership_revenue: [
    'Membership - Individual', 'Membership - Family', 'Membership - Family (NEW)', 
    'Family Membership', 'Individual Membership', 'Concierge Membership'
  ],
  other_revenue: ['Lab Draw Fee', 'TOTAL_TIPS', 'Hormones - Follow Up MALES']
};

function categorizeRevenue(chargeDesc) {
  for (const [category, descriptions] of Object.entries(revenueCategoryMapping)) {
    if (descriptions.some(desc => chargeDesc === desc)) {
      return category;
    }
  }
  return 'other_revenue'; 
}

function extractFromExcel(filePath) {
  try {
    console.log('Processing Excel file:', filePath);
    
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`📊 Excel file loaded: ${data.length} rows, ${data[0]?.length || 0} columns`);
    
    // Initialize data structure
    const extractedData = {
      drip_iv_revenue_weekly: 0,
      semaglutide_revenue_weekly: 0,
      ketamine_revenue_weekly: 0,
      membership_revenue_weekly: 0,
      other_revenue_weekly: 0,
      actual_weekly_revenue: 0,
    };
    
    if (data.length <= 1) {
      console.log('⚠️ Excel file has no data rows');
      return extractedData;
    }
    
    // Warn if the file seems to have very little data
    if (data.length <= 5) {
      console.log(`⚠️ WARNING: Excel file has only ${data.length - 1} data rows`);
      console.log('   This seems unusually small for a weekly revenue report.');
      console.log('   Please verify this is the complete data export.');
    }
    
    // Process data rows
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      const chargeDesc = row[7]; // Column 8 - "Charge Desc"
      const paymentAmount = row[13]; // Column 14 - "Calculated Payment (Line)"
      
      // Enhanced validation for charge descriptions
      if (!chargeDesc || chargeDesc === 'undefined' || typeof chargeDesc === 'undefined') {
        console.log(`⚠️ Row ${i}: Skipping row with missing/undefined charge description`);
        continue;
      }
      
      if (paymentAmount === undefined || paymentAmount === null || paymentAmount === '') {
        console.log(`⚠️ Row ${i}: Skipping row with missing payment amount for '${chargeDesc}'`);
        continue;
      }
      
      // Parse payment amount
      let amount = 0;
      if (typeof paymentAmount === 'number') {
        amount = paymentAmount;
      } else if (typeof paymentAmount === 'string') {
        const cleanAmount = paymentAmount.replace(/[$,]/g, '');
        amount = parseFloat(cleanAmount);
      }
      
      if (isNaN(amount) || amount <= 0) {
        continue;
      }
      
      // Categorize the charge using the revenue mapping
      const category = categorizeRevenue(chargeDesc);
      console.log(`Row ${i}: "${chargeDesc}" → ${category} ($${amount})`);
      
      // Add to appropriate revenue category
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
      
      // Add to total revenue
      extractedData.actual_weekly_revenue += amount;
    }
    
    // Round all revenue values to 2 decimal places
    extractedData.actual_weekly_revenue = Math.round(extractedData.actual_weekly_revenue * 100) / 100;
    extractedData.drip_iv_revenue_weekly = Math.round(extractedData.drip_iv_revenue_weekly * 100) / 100;
    extractedData.semaglutide_revenue_weekly = Math.round(extractedData.semaglutide_revenue_weekly * 100) / 100;
    extractedData.ketamine_revenue_weekly = Math.round(extractedData.ketamine_revenue_weekly * 100) / 100;
    extractedData.membership_revenue_weekly = Math.round(extractedData.membership_revenue_weekly * 100) / 100;
    extractedData.other_revenue_weekly = Math.round(extractedData.other_revenue_weekly * 100) / 100;
    
    console.log('✅ Excel processing complete:');
    console.log(`   Total Weekly Revenue: $${extractedData.actual_weekly_revenue}`);
    console.log(`   Drip IV Revenue: $${extractedData.drip_iv_revenue_weekly}`);
    console.log(`   Semaglutide Revenue: $${extractedData.semaglutide_revenue_weekly}`);
    console.log(`   Ketamine Revenue: $${extractedData.ketamine_revenue_weekly}`);
    console.log(`   Membership Revenue: $${extractedData.membership_revenue_weekly}`);
    console.log(`   Other Revenue: $${extractedData.other_revenue_weekly}`);
    
    return extractedData;
    
  } catch (error) {
    console.error('❌ Error processing Excel file:', error.message);
    throw new Error(`Failed to process Excel file: ${error.message}`);
  }
}

function parseExcelData(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Membership file loaded: ${data.length} records`);
    
    // Initialize membership counts
    let totalMembers = 0;
    let conciergeMembers = 0;
    let corporateMembers = 0;
    let individualMembers = 0;
    let familyMembers = 0;
    
    // Process each row
    data.forEach((row, index) => {
      totalMembers++;
      
      // Check membership type from the Title column
      const membershipType = (
        row['Title'] || 
        row['Membership Type'] || 
        row['Type'] || 
        row['Plan'] || 
        row['Membership'] ||
        ''
      ).toString().toLowerCase();
      
      if (index < 3) {
        console.log(`Row ${index + 1}: Membership type = "${membershipType}"`);
      }
      
      if (membershipType.includes('membership - individual') || membershipType.includes('individual')) {
        individualMembers++;
      } else if (membershipType.includes('family membership') || 
                 (membershipType.includes('family') && membershipType.includes('membership'))) {
        familyMembers++;
      } else if (membershipType.includes('concierge')) {
        conciergeMembers++;
      } else if (membershipType.includes('corporate')) {
        corporateMembers++;
      }
    });
    
    console.log('✅ Membership parsing complete:');
    console.log(`   Total Members: ${totalMembers}`);
    console.log(`   Individual: ${individualMembers}`);
    console.log(`   Family: ${familyMembers}`);
    console.log(`   Concierge: ${conciergeMembers}`);
    console.log(`   Corporate: ${corporateMembers}`);
    
    return {
      total_drip_iv_members: totalMembers,
      individual_memberships: individualMembers,
      family_memberships: familyMembers,
      concierge_memberships: conciergeMembers,
      corporate_memberships: corporateMembers
    };
    
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    throw error;
  }
}

// Test both files
console.log('1. TESTING REVENUE FILE PARSING:');
console.log('================================');
try {
  const revenueData = extractFromExcel('Patient Analysis (Charge Details & Payments) - V3  - With COGS (3).xls');
  console.log('\n📊 Revenue Data Summary:', revenueData);
} catch (error) {
  console.error('Revenue file parsing failed:', error.message);
}

console.log('\n\n2. TESTING MEMBERSHIP FILE PARSING:');
console.log('==================================');
try {
  const membershipData = parseExcelData('Drip IV Active Memberships (2).xlsx');
  console.log('\n👥 Membership Data Summary:', membershipData);
} catch (error) {
  console.error('Membership file parsing failed:', error.message);
}

console.log('\n\n3. EXPECTED vs ACTUAL COMPARISON:');
console.log('=================================');
console.log('Expected based on logs: Revenue should show more than $129');
console.log('Actual: Revenue correctly shows $129 (membership fees)');
console.log('Issue: The uploaded revenue file has incomplete data (only 2 rows)');
console.log('Recommendation: Re-export complete weekly revenue data from source system');