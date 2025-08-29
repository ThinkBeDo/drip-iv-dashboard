const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const { parse } = require('csv-parse/sync');

async function checkColumns() {
  const csvPath = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).csv');
  
  // Read and decode
  const buffer = fs.readFileSync(csvPath);
  const csvContent = iconv.decode(buffer, 'utf-16le');
  
  // Parse CSV
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    quote: '"',
    delimiter: ',',
    bom: true,
    escape: '"',
    ltrim: true,
    rtrim: true
  });
  
  console.log('Total rows parsed:', records.length);
  
  if (records.length > 0) {
    console.log('\nColumn names found:');
    Object.keys(records[0]).forEach(col => {
      console.log(`  "${col}"`);
    });
    
    console.log('\nFirst data row values:');
    const firstRow = records[0];
    Object.entries(firstRow).forEach(([key, value]) => {
      if (value && value.trim()) {
        console.log(`  ${key}: "${value}"`);
      }
    });
  }
}

checkColumns().catch(console.error);