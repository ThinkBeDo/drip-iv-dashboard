const XLSX = require('xlsx');

function findContraveItems(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log('🔍 Finding Contrave Office Visit items:\n');
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const chargeDesc = row[8]; // Column 9 (index 8)
    const paymentAmount = row[14]; // Column 15 (index 14)
    
    if (chargeDesc && chargeDesc.toString().toLowerCase().includes('contrave')) {
      console.log(`Row ${i + 1}: ${chargeDesc} - $${paymentAmount}`);
    }
  }
}

const filePath = process.argv[2] || './Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';
findContraveItems(filePath);
