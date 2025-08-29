const fs = require('fs');
const iconv = require('iconv-lite');

// Custom CSV parser for the specific Drip IV CSV format
function parseDripCSV(csvContent) {
  const lines = csvContent.split(/\r?\n/);
  const results = [];
  
  if (lines.length === 0) return results;
  
  // Process header line
  const headerLine = lines[0];
  
  // The header is wrapped in quotes with fields like: "Field1","Field2"
  // Split by "," pattern
  const headers = [];
  const headerParts = headerLine.split('","');
  
  headerParts.forEach((part, index) => {
    // Clean up the header
    let header = part;
    // Remove leading quote from first field
    if (index === 0) header = header.replace(/^"/, '');
    // Remove trailing quote from last field
    if (index === headerParts.length - 1) header = header.replace(/"$/, '');
    // Handle double quotes
    header = header.replace(/""/g, '"').trim();
    headers.push(header);
  });
  
  console.log('Parsed headers:', headers);
  
  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    // Split by "," pattern
    const values = [];
    const parts = line.split('","');
    
    parts.forEach((part, index) => {
      // Clean up the value
      let value = part;
      // Remove leading quote from first field
      if (index === 0) value = value.replace(/^"/, '');
      // Remove trailing quote from last field
      if (index === parts.length - 1) value = value.replace(/"$/, '');
      // Handle double quotes
      value = value.replace(/""/g, '"').trim();
      values.push(value);
    });
    
    // Create row object
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    results.push(row);
  }
  
  return results;
}

// Process revenue data from CSV
async function processRevenueData(csvFilePath) {
  console.log('Processing revenue data from:', csvFilePath);
  
  // Check if file exists
  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`Revenue CSV file not found: ${csvFilePath}`);
  }
  
  // Read the file as a buffer
  const buffer = fs.readFileSync(csvFilePath);
  const firstBytes = buffer.slice(0, 4);
  
  let csvContent;
  
  // Check for UTF-16 LE BOM (FF FE)
  if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
    console.log('Detected UTF-16 LE encoding with BOM');
    csvContent = iconv.decode(buffer, 'utf-16le');
  } else {
    console.log('Processing as UTF-8 encoding');
    csvContent = buffer.toString('utf8');
  }
  
  // Parse CSV using custom parser
  const records = parseDripCSV(csvContent);
  
  console.log(`Successfully parsed ${records.length} rows from CSV`);
  
  return records;
}

// Export for use in import-weekly-data.js
module.exports = { parseDripCSV, processRevenueData };

// Test if run directly
if (require.main === module) {
  const path = require('path');
  const csvPath = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).csv');
  
  processRevenueData(csvPath)
    .then(records => {
      console.log('\nFirst 3 rows:');
      for (let i = 0; i < Math.min(3, records.length); i++) {
        console.log(`\nRow ${i + 1}:`);
        console.log('  Date:', records[i]['Date'] || 'N/A');
        console.log('  Date Of Payment:', records[i]['Date Of Payment'] || 'N/A');
        console.log('  Patient:', records[i]['Patient'] || 'N/A');
        console.log('  Charge Desc:', records[i]['Charge Desc'] || 'N/A');
        console.log('  Payment:', records[i]['Calculated Payment (Line)'] || 'N/A');
      }
      
      // Calculate totals
      let totalRevenue = 0;
      let rowsWithPayments = 0;
      
      for (const row of records) {
        const paymentStr = row['Calculated Payment (Line)'] || '0';
        const payment = parseFloat(paymentStr.replace(/[$,]/g, ''));
        if (!isNaN(payment) && payment > 0) {
          totalRevenue += payment;
          rowsWithPayments++;
        }
      }
      
      console.log(`\nSummary:`);
      console.log(`  Total rows: ${records.length}`);
      console.log(`  Rows with payments: ${rowsWithPayments}`);
      console.log(`  Total revenue: $${totalRevenue.toFixed(2)}`);
    })
    .catch(console.error);
}