#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse date function from the main code
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  const parts = dateStr.split('/');
  if (parts.length !== 3) {
    return null;
  }
  
  let [month, day, year] = parts.map(p => parseInt(p, 10));
  
  if (year < 100) {
    year = 2000 + year;
  }
  
  const date = new Date(year, month - 1, day);
  return date;
}

// Clean currency values
function cleanCurrency(value) {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Test MHTML parsing with rowspan handling
async function testMHTMLParsing() {
  const filePath = './Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls';
  
  if (!fs.existsSync(filePath)) {
    console.error('❌ Test file not found:', filePath);
    return;
  }
  
  console.log('📁 Reading file:', filePath);
  const fileContent = fs.readFileSync(filePath, 'utf8');
  console.log('📊 File size:', fileContent.length, 'bytes');
  
  // MHTML detection
  const isMHTML = (fileContent.includes('MIME-Version:') || 
                   fileContent.includes('Content-Type:') || 
                   fileContent.includes('<table')) &&
                  (fileContent.includes('</tr>') || fileContent.includes('</td>'));
  
  console.log('✅ MHTML detected:', isMHTML);
  
  if (!isMHTML) {
    console.error('❌ File not detected as MHTML!');
    return;
  }
  
  // Extract table HTML
  let tableHtml = '';
  if (fileContent.includes('--')) {
    const parts = fileContent.split(/--[\w-]+/);
    console.log('📦 Found', parts.length, 'MIME parts');
    
    for (const part of parts) {
      if (part.includes('<table') || part.includes('<tr')) {
        tableHtml = part;
        console.log('✅ Found table in MIME part');
        break;
      }
    }
  }
  
  if (!tableHtml) {
    tableHtml = fileContent;
    console.log('📄 Using entire file as HTML table');
  }
  
  // Extract rows
  const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
  console.log('📋 Rows found:', rowMatches ? rowMatches.length : 0);
  
  if (!rowMatches || rowMatches.length < 2) {
    console.error('❌ Not enough rows found');
    return;
  }
  
  // Parse rows with rowspan tracking
  const records = [];
  const rowspanTracker = {}; // Track active rowspans by column index
  let previousRow = {}; // Store previous row for inheritance
  
  console.log('\n🔍 PARSING ROWS WITH ROWSPAN HANDLING:\n');
  
  for (let rowIndex = 1; rowIndex < rowMatches.length && rowIndex < 10; rowIndex++) {
    // Extract all cells including their attributes
    const cellMatches = rowMatches[rowIndex].match(/<td[^>]*>[\s\S]*?<\/td>/gi);
    
    if (!cellMatches || cellMatches.length === 0) {
      console.log(`Row ${rowIndex}: No cells found, skipping`);
      continue;
    }
    
    console.log(`\n📍 Row ${rowIndex}: ${cellMatches.length} cells found`);
    
    // Process cells and detect rowspans
    const processedCells = [];
    let cellIndex = 0;
    
    for (let colIndex = 0; colIndex < 16; colIndex++) {
      // Check if this column has an active rowspan
      if (rowspanTracker[colIndex] && rowspanTracker[colIndex].count > 0) {
        // Use inherited value
        processedCells[colIndex] = rowspanTracker[colIndex].value;
        rowspanTracker[colIndex].count--;
        
        if (rowspanTracker[colIndex].count === 0) {
          delete rowspanTracker[colIndex];
        }
        
        console.log(`  Col ${colIndex}: INHERITED "${processedCells[colIndex]}" (rowspan active)`);
      } else if (cellIndex < cellMatches.length) {
        // Process actual cell
        const cell = cellMatches[cellIndex];
        
        // Check for rowspan attribute
        const rowspanMatch = cell.match(/rowspan\s*=\s*["']?(\d+)/i);
        const rowspan = rowspanMatch ? parseInt(rowspanMatch[1]) : 1;
        
        // Extract cell value
        let value = cell.replace(/<td[^>]*>/gi, '').replace(/<\/td>/gi, '');
        value = value.replace(/<[^>]*>/g, '').trim();
        value = value.replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&#32;/g, ' ')
                    .replace(/&#36;/g, '$')
                    .replace(/=3D/g, '=')
                    .replace(/=\r?\n/g, '');
        
        processedCells[colIndex] = value;
        
        // Track rowspan for future rows
        if (rowspan > 1) {
          rowspanTracker[colIndex] = {
            value: value,
            count: rowspan - 1
          };
          console.log(`  Col ${colIndex}: "${value}" (rowspan=${rowspan})`);
        } else {
          console.log(`  Col ${colIndex}: "${value}"`);
        }
        
        cellIndex++;
      } else {
        // No more cells, fill with empty
        processedCells[colIndex] = '';
        console.log(`  Col ${colIndex}: EMPTY (no more cells)`);
      }
    }
    
    // Map to expected columns
    const row = {
      'Practitioner': processedCells[0] || previousRow['Practitioner'] || '',
      'Date': processedCells[1] || previousRow['Date'] || '',
      'Date Of Payment': processedCells[2] || previousRow['Date Of Payment'] || '',
      'Patient': processedCells[3] || '',
      'Patient_ID': processedCells[4] || '',
      'Patient State': processedCells[5] || '',
      'Super Bill': processedCells[6] || '',
      'Charge Type': processedCells[7] || '',
      'Charge Desc': processedCells[8] || '',
      'Charges': processedCells[9] || '',
      'Total Discount': processedCells[10] || '',
      'Tax': processedCells[11] || '',
      'Charges - Discount': processedCells[12] || '',
      'Calculated Payment (Line)': processedCells[13] || '',
      'COGS': processedCells[14] || '',
      'Qty': processedCells[15] || ''
    };
    
    // Store for next iteration
    if (row['Date']) {
      previousRow = {
        'Practitioner': row['Practitioner'],
        'Date': row['Date'],
        'Date Of Payment': row['Date Of Payment']
      };
    }
    
    // Validate and add record
    const parsedDate = parseDate(row['Date']);
    const payment = cleanCurrency(row['Calculated Payment (Line)']);
    
    console.log(`\n  ✅ Parsed Data:`);
    console.log(`     Date: ${row['Date']} → ${parsedDate ? parsedDate.toLocaleDateString() : 'INVALID'}`);
    console.log(`     Patient: ${row['Patient']}`);
    console.log(`     Charge: ${row['Charge Desc']}`);
    console.log(`     Payment: ${row['Calculated Payment (Line)']} → $${payment}`);
    
    if (parsedDate && payment > 0) {
      records.push(row);
      console.log(`  ✅ RECORD ADDED`);
    } else {
      console.log(`  ⚠️ RECORD SKIPPED (invalid date or no payment)`);
    }
  }
  
  // Summary
  console.log('\n📊 PARSING SUMMARY:');
  console.log(`   Total rows processed: ${Math.min(9, rowMatches.length - 1)}`);
  console.log(`   Valid records extracted: ${records.length}`);
  console.log(`   Records with payments: ${records.filter(r => cleanCurrency(r['Calculated Payment (Line)']) > 0).length}`);
  
  // Calculate totals
  let totalRevenue = 0;
  let earliestDate = null;
  let latestDate = null;
  
  records.forEach(record => {
    const payment = cleanCurrency(record['Calculated Payment (Line)']);
    totalRevenue += payment;
    
    const date = parseDate(record['Date']);
    if (date) {
      if (!earliestDate || date < earliestDate) earliestDate = date;
      if (!latestDate || date > latestDate) latestDate = date;
    }
  });
  
  console.log('\n💰 REVENUE ANALYSIS:');
  console.log(`   Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`   Date Range: ${earliestDate ? earliestDate.toLocaleDateString() : 'N/A'} to ${latestDate ? latestDate.toLocaleDateString() : 'N/A'}`);
  
  // Test week calculation
  if (earliestDate) {
    const monday = new Date(earliestDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    
    console.log('\n📅 WEEK CALCULATION:');
    console.log(`   Week Start (Monday): ${monday.toLocaleDateString()}`);
    console.log(`   Week End (Sunday): ${sunday.toLocaleDateString()}`);
  }
}

// Run the test
console.log('🚀 MHTML PARSING TEST\n');
console.log('=' .repeat(50));
testMHTMLParsing().catch(console.error);