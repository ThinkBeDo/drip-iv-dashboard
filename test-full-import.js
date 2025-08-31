const fs = require('fs');
const path = require('path');

// Parse MHTML with better column handling
function parseMHTMLFile(filePath) {
  console.log('\n=== PARSING MHTML FILE ===');
  
  const fileContent = fs.readFileSync(filePath, 'utf8');
  
  if (!fileContent.includes('MIME-Version:')) {
    console.log('Not an MHTML file');
    return null;
  }
  
  const parts = fileContent.split(/--[\w-]+/);
  
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('<table') && parts[i].includes('<tr')) {
      let tableHtml = parts[i];
      tableHtml = tableHtml.replace(/=3D/g, '=');
      tableHtml = tableHtml.replace(/=\r?\n/g, '');
      
      const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
      if (!rowMatches) return null;
      
      console.log('Found', rowMatches.length, 'rows');
      
      const data = [];
      let previousRowData = {};
      
      // Process each row
      for (let rowIndex = 1; rowIndex < rowMatches.length; rowIndex++) {
        const row = rowMatches[rowIndex];
        const cellMatches = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g);
        
        if (!cellMatches) continue;
        
        // Extract values
        const values = cellMatches.map(cell => {
          let text = cell
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&#\d+;/g, '')
            .trim();
          return text;
        });
        
        const rowData = {};
        
        // Map based on cell count - CRITICAL FIX
        if (values.length === 16) {
          // Full row
          rowData['Date'] = values[1];
          rowData['Patient'] = values[3];
          rowData['Charge Desc'] = values[8];
          rowData['Calculated Payment (Line)'] = values[13];
        } else if (values.length === 13) {
          // Missing first 3 columns due to rowspan
          rowData['Date'] = previousRowData['Date']; // Inherit from previous
          rowData['Patient'] = values[0];
          rowData['Charge Desc'] = values[5];
          rowData['Calculated Payment (Line)'] = values[10];
        } else if (values.length === 15) {
          // Missing first column
          rowData['Date'] = values[0];
          rowData['Patient'] = values[2];
          rowData['Charge Desc'] = values[7];
          rowData['Calculated Payment (Line)'] = values[12];
        }
        
        // Store for next row's reference
        if (rowData['Date']) {
          previousRowData = { ...rowData };
        }
        
        if (rowData['Calculated Payment (Line)']) {
          data.push(rowData);
        }
      }
      
      return data;
    }
  }
  
  return null;
}

// Clean currency values
function cleanCurrency(value) {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Process the revenue file
const revenueFile = 'Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls';
console.log('Processing:', revenueFile);

const data = parseMHTMLFile(revenueFile);

if (data) {
  console.log('\n=== PARSED DATA SUMMARY ===');
  console.log('Total rows parsed:', data.length);
  
  // Calculate week range
  const dates = data
    .map(row => {
      if (!row['Date']) return null;
      const parts = row['Date'].match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (!parts) return null;
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);
      let year = parseInt(parts[3]);
      if (year < 100) year += 2000;
      return new Date(year, month - 1, day);
    })
    .filter(d => d && !isNaN(d.getTime()));
  
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    console.log('Date range:', minDate.toLocaleDateString(), 'to', maxDate.toLocaleDateString());
  }
  
  // Calculate total revenue
  let totalRevenue = 0;
  let rowsWithPayment = 0;
  
  console.log('\n=== FIRST 10 ROWS WITH PAYMENT ===');
  data.slice(0, 10).forEach((row, i) => {
    const payment = cleanCurrency(row['Calculated Payment (Line)']);
    if (payment > 0) {
      rowsWithPayment++;
      totalRevenue += payment;
      console.log(`Row ${i + 1}:`, {
        Date: row['Date'],
        Patient: row['Patient'].substring(0, 30),
        Payment: '$' + payment.toFixed(2)
      });
    }
  });
  
  // Calculate full total
  data.forEach(row => {
    const payment = cleanCurrency(row['Calculated Payment (Line)']);
    if (payment > 0) {
      totalRevenue += payment;
    }
  });
  
  console.log('\n=== REVENUE SUMMARY ===');
  console.log('Total revenue from all rows: $' + totalRevenue.toFixed(2));
  console.log('Rows with payment > 0:', rowsWithPayment, 'out of first 10');
  
  // Check for week of Aug 18-24
  const aug18_24_data = data.filter(row => {
    if (!row['Date']) return false;
    const dateStr = row['Date'];
    return dateStr.includes('8/18/') || dateStr.includes('8/19/') || 
           dateStr.includes('8/20/') || dateStr.includes('8/21/') || 
           dateStr.includes('8/22/') || dateStr.includes('8/23/') || 
           dateStr.includes('8/24/');
  });
  
  console.log('\n=== AUG 18-24 DATA ===');
  console.log('Rows for Aug 18-24:', aug18_24_data.length);
  
  let weekRevenue = 0;
  aug18_24_data.forEach(row => {
    const payment = cleanCurrency(row['Calculated Payment (Line)']);
    weekRevenue += payment;
  });
  
  console.log('Revenue for Aug 18-24: $' + weekRevenue.toFixed(2));
  
  if (weekRevenue === 0) {
    console.log('\n⚠️ CRITICAL ISSUE: No revenue found for Aug 18-24!');
    console.log('This explains why the dashboard shows $0.00');
  }
} else {
  console.log('Failed to parse file');
}