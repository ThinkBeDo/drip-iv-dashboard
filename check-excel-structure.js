const XLSX = require('xlsx');

function checkExcelStructure(filePath) {
  console.log('🔍 Checking Excel File Structure\n');
  console.log('=' .repeat(80));
  
  // Read Excel file
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log(`📊 Excel file loaded: ${data.length} rows\n`);
  
  // Display header row
  console.log('📋 HEADER ROW (Row 1):\n');
  const headers = data[0];
  headers.forEach((header, index) => {
    console.log(`Column ${index + 1} (Index ${index}): "${header}"`);
  });
  
  // Display first few data rows
  console.log('\n📋 SAMPLE DATA ROWS:\n');
  for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
    console.log(`\nRow ${i + 1}:`);
    const row = data[i];
    row.forEach((cell, index) => {
      if (cell !== undefined && cell !== null && cell !== '') {
        console.log(`  Column ${index + 1} (${headers[index]}): ${cell}`);
      }
    });
  }
  
  // Find "Charge Desc" column
  console.log('\n🔍 SEARCHING FOR KEY COLUMNS:\n');
  let chargeDescIndex = -1;
  let paymentIndex = -1;
  
  headers.forEach((header, index) => {
    const lowerHeader = (header || '').toString().toLowerCase();
    if (lowerHeader.includes('charge') && lowerHeader.includes('desc')) {
      chargeDescIndex = index;
      console.log(`✓ Found "Charge Desc" at Column ${index + 1} (Index ${index})`);
    }
    if (lowerHeader.includes('calculated') && lowerHeader.includes('payment')) {
      paymentIndex = index;
      console.log(`✓ Found "Calculated Payment" at Column ${index + 1} (Index ${index})`);
    }
  });
  
  if (chargeDescIndex === -1) {
    console.log('❌ Could not find "Charge Desc" column');
  }
  if (paymentIndex === -1) {
    console.log('❌ Could not find "Calculated Payment" column');
  }
  
  // Look for weight loss items
  if (chargeDescIndex !== -1 && paymentIndex !== -1) {
    console.log('\n🔍 SEARCHING FOR WEIGHT LOSS ITEMS:\n');
    let found = 0;
    for (let i = 1; i < Math.min(data.length, 50); i++) {
      const row = data[i];
      const chargeDesc = row[chargeDescIndex];
      const payment = row[paymentIndex];
      
      if (chargeDesc) {
        const lowerDesc = chargeDesc.toString().toLowerCase();
        if (lowerDesc.includes('semaglutide') || lowerDesc.includes('tirzepatide')) {
          console.log(`Row ${i + 1}: ${chargeDesc} - $${payment}`);
          found++;
        }
      }
    }
    console.log(`\nFound ${found} weight loss items in first 50 rows`);
  }
  
  console.log('\n' + '='.repeat(80));
}

// Run the check
const filePath = process.argv[2] || './Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';
checkExcelStructure(filePath);
