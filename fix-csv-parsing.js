const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// Function to properly parse the CSV with embedded quotes
function parseCSVWithQuotes(csvContent) {
  const lines = csvContent.split(/\r?\n/);
  const results = [];
  
  if (lines.length === 0) return results;
  
  // Parse header line - handle embedded quotes
  const headerLine = lines[0];
  
  // Remove wrapping quotes and split by ","
  const headers = [];
  let currentHeader = '';
  let inQuotes = false;
  
  for (let i = 0; i < headerLine.length; i++) {
    const char = headerLine[i];
    const nextChar = headerLine[i + 1];
    
    if (char === '"' && nextChar === '"') {
      // Escaped quote
      currentHeader += '"';
      i++; // Skip next quote
    } else if (char === '"') {
      // Toggle quote state
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      // End of field
      headers.push(currentHeader.trim());
      currentHeader = '';
    } else {
      currentHeader += char;
    }
  }
  // Add last header
  if (currentHeader) {
    headers.push(currentHeader.trim());
  }
  
  console.log('Parsed headers:', headers);
  
  // Parse data rows
  for (let lineNum = 1; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    if (!line.trim()) continue;
    
    const values = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        currentValue += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        // Toggle quote state
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        // End of field
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    // Add last value
    if (currentValue || values.length < headers.length) {
      values.push(currentValue.trim());
    }
    
    // Create row object
    if (values.length > 0) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      results.push(row);
    }
  }
  
  return results;
}

// Test the improved CSV parsing
async function testImprovedParsing() {
  console.log('Testing improved CSV parsing...\n');
  
  const csvPath = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found!');
    return;
  }
  
  // Read and decode UTF-16
  const buffer = fs.readFileSync(csvPath);
  const firstBytes = buffer.slice(0, 4);
  
  let csvContent;
  if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
    csvContent = iconv.decode(buffer, 'utf-16le');
    console.log('Decoded UTF-16 LE content');
  } else {
    csvContent = buffer.toString('utf8');
  }
  
  // Parse CSV
  const records = parseCSVWithQuotes(csvContent);
  
  console.log(`\nParsed ${records.length} rows`);
  
  // Check first few rows
  console.log('\nFirst 3 data rows:');
  for (let i = 0; i < Math.min(3, records.length); i++) {
    const row = records[i];
    console.log(`\nRow ${i + 1}:`);
    console.log('  Date:', row['Date'] || 'N/A');
    console.log('  Date Of Payment:', row['Date Of Payment'] || 'N/A');
    console.log('  Patient:', row['Patient'] || 'N/A');
    console.log('  Charge Desc:', row['Charge Desc'] || 'N/A');
    console.log('  Payment:', row['Calculated Payment (Line)'] || 'N/A');
  }
  
  // Calculate totals
  let totalRevenue = 0;
  let validDates = 0;
  
  for (const row of records) {
    // Parse date
    const dateStr = row['Date'] || row['Date Of Payment'];
    if (dateStr && dateStr !== 'Total') {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        validDates++;
      }
    }
    
    // Parse payment
    const paymentStr = row['Calculated Payment (Line)'] || '0';
    const payment = parseFloat(paymentStr.replace(/[$,]/g, ''));
    if (!isNaN(payment)) {
      totalRevenue += payment;
    }
  }
  
  console.log(`\nSummary:`);
  console.log(`  Valid dates: ${validDates}`);
  console.log(`  Total revenue: $${totalRevenue.toFixed(2)}`);
}

testImprovedParsing().catch(console.error);