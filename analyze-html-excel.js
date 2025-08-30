const fs = require('fs');
const XLSX = require('xlsx');

// Try to read as a regular Excel file first
try {
  const workbook = XLSX.readFile('Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls', {type: 'binary', raw: true});
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});
  
  console.log('Successfully parsed as Excel!');
  console.log('Sheet name:', sheetName);
  console.log('Total rows:', data.length);
  
  if (data.length > 0) {
    console.log('\nHeaders:', data[0]);
    console.log('\nFirst data row:', data[1]);
  }
} catch (error) {
  console.log('Cannot parse as regular Excel, trying HTML method...');
  
  // Read as HTML
  const content = fs.readFileSync('Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls', 'utf8');
  
  // Extract table data using regex
  const tableMatch = content.match(/<table[\s\S]*?<\/table>/);
  if (tableMatch) {
    let tableHtml = tableMatch[0];
    // Clean encoded characters
    tableHtml = tableHtml.replace(/=3D/g, '=');
    tableHtml = tableHtml.replace(/=\r?\n/g, '');
    
    // Extract rows
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/g);
    console.log('Found', rowMatches ? rowMatches.length : 0, 'rows');
    
    if (rowMatches && rowMatches.length > 0) {
      // Extract headers from first row
      const headerRow = rowMatches[0];
      const headers = [];
      const headerCells = headerRow.match(/<td[^>]*>([^<]*)<\/td>/g);
      if (headerCells) {
        headerCells.forEach(cell => {
          const text = cell.replace(/<[^>]*>/g, '').trim();
          headers.push(text);
        });
      }
      console.log('\nHeaders:', headers);
      
      // Extract first data row
      if (rowMatches.length > 1) {
        const dataRow = rowMatches[1];
        const dataCells = dataRow.match(/<td[^>]*>([^<]*)<\/td>/g);
        const data = [];
        if (dataCells) {
          dataCells.forEach(cell => {
            const text = cell.replace(/<[^>]*>/g, '').trim();
            data.push(text);
          });
        }
        console.log('\nFirst data row:', data);
      }
    }
  }
}
