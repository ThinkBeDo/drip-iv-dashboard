const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const { parse } = require('csv-parse/sync');

// Test CSV parsing with the actual files
async function testCSVParsing() {
  console.log('Testing CSV parsing with actual data files...\n');
  
  const csvPath = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).csv');
  const excelPath = path.join(__dirname, 'Drip IV Active Memberships.xlsx');
  
  // Test 1: Check if files exist
  console.log('1. Checking file existence:');
  console.log('   CSV exists:', fs.existsSync(csvPath));
  console.log('   Excel exists:', fs.existsSync(excelPath));
  
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found!');
    return;
  }
  
  // Test 2: Detect encoding
  console.log('\n2. Detecting CSV encoding:');
  const buffer = fs.readFileSync(csvPath);
  const firstBytes = buffer.slice(0, 4);
  
  let encoding = 'utf8';
  if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
    encoding = 'utf-16le';
    console.log('   Detected: UTF-16 LE with BOM');
  } else if (firstBytes[0] === 0xFE && firstBytes[1] === 0xFF) {
    encoding = 'utf-16be';
    console.log('   Detected: UTF-16 BE with BOM');
  } else {
    console.log('   Detected: UTF-8 or ASCII');
  }
  
  // Test 3: Parse CSV
  console.log('\n3. Parsing CSV content:');
  let csvContent;
  
  try {
    if (encoding.startsWith('utf-16')) {
      // Use iconv-lite for UTF-16
      csvContent = iconv.decode(buffer, encoding);
      console.log('   Successfully decoded UTF-16');
    } else {
      csvContent = buffer.toString('utf8');
      console.log('   Successfully read as UTF-8');
    }
    
    // Parse CSV
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true
    });
    
    console.log(`   Parsed ${records.length} rows`);
    
    // Test 4: Check column names
    console.log('\n4. Column names found:');
    if (records.length > 0) {
      const columns = Object.keys(records[0]);
      columns.forEach(col => {
        console.log(`   - "${col}"`);
      });
    }
    
    // Test 5: Sample data
    console.log('\n5. Sample data (first 3 rows):');
    for (let i = 0; i < Math.min(3, records.length); i++) {
      const row = records[i];
      console.log(`\n   Row ${i + 1}:`);
      
      // Check for date columns
      const dateValue = row['Date'] || row['Date Of Payment'] || row['Date of Payment'] || 'No date found';
      console.log(`     Date: ${dateValue}`);
      
      // Check other important columns
      console.log(`     Patient: ${row['Patient'] || 'N/A'}`);
      console.log(`     Charge Desc: ${row['Charge Desc'] || 'N/A'}`);
      console.log(`     Payment: ${row['Calculated Payment (Line)'] || 'N/A'}`);
    }
    
    // Test 6: Date parsing
    console.log('\n6. Testing date parsing:');
    let validDates = 0;
    let invalidDates = 0;
    
    for (const row of records) {
      const dateStr = row['Date'] || row['Date Of Payment'] || row['Date of Payment'];
      if (dateStr && dateStr !== 'Total') {
        const date = parseDate(dateStr);
        if (date && !isNaN(date.getTime())) {
          validDates++;
        } else {
          invalidDates++;
          if (invalidDates <= 3) {
            console.log(`   Invalid date: "${dateStr}"`);
          }
        }
      }
    }
    
    console.log(`   Valid dates: ${validDates}`);
    console.log(`   Invalid dates: ${invalidDates}`);
    
    // Test 7: Revenue calculation
    console.log('\n7. Revenue calculation:');
    let totalRevenue = 0;
    let membershipRevenue = 0;
    let infusionRevenue = 0;
    
    for (const row of records) {
      const chargeDesc = (row['Charge Desc'] || '').toLowerCase();
      const payment = cleanCurrency(row['Calculated Payment (Line)']);
      
      totalRevenue += payment;
      
      if (chargeDesc.includes('membership')) {
        membershipRevenue += payment;
      } else if (chargeDesc.includes('saline') || chargeDesc.includes('hydration') || 
                 chargeDesc.includes('energy') || chargeDesc.includes('immunity')) {
        infusionRevenue += payment;
      }
    }
    
    console.log(`   Total Revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`   Membership Revenue: $${membershipRevenue.toFixed(2)}`);
    console.log(`   Infusion Revenue: $${infusionRevenue.toFixed(2)}`);
    
  } catch (error) {
    console.error('Error parsing CSV:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Helper function to parse dates
function parseDate(dateStr) {
  if (!dateStr || dateStr === 'Total') return null;
  
  dateStr = dateStr.trim();
  
  // Handle format like "8/22/25" or "8/22/2025"
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    let year = parseInt(parts[2]);
    
    // Handle 2-digit year
    if (year < 100) {
      year = 2000 + year;
    }
    
    const date = new Date(year, month - 1, day);
    
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2020) {
      return date;
    }
  }
  
  // Try parsing as ISO date
  const date = new Date(dateStr);
  if (!isNaN(date.getTime()) && date.getFullYear() >= 2020) {
    return date;
  }
  
  return null;
}

// Helper function to clean currency values
function cleanCurrency(value) {
  if (!value || value === null || value === undefined) return 0.0;
  
  const valueStr = value.toString();
  let cleaned = valueStr.replace(/[$,]/g, '');
  
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0.0 : parsed;
}

// Run the test
testCSVParsing().catch(console.error);