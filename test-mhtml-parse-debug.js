const fs = require('fs');
const path = require('path');

// Parse MHTML file function from import-weekly-data.js
function parseMHTMLFile(filePath) {
  console.log('\n=== PARSING MHTML FILE ===');
  console.log('File:', filePath);
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    console.log('File size:', fileContent.length, 'bytes');
    
    // Check for MHTML markers
    if (fileContent.includes('MIME-Version:') && 
        fileContent.includes('Content-Type:') && 
        fileContent.includes('Content-Location:')) {
      
      console.log('✓ Detected MHTML format');
      
      // Parse MHTML file
      const parts = fileContent.split(/--[\w-]+/);
      console.log('MHTML parts found:', parts.length);
      
      let tableHtml = '';
      // Look for the part containing the actual HTML table
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes('<table') && (parts[i].includes('sheet1.htm') || parts[i].includes('<tr'))) {
          tableHtml = parts[i];
          console.log('Found table in part', i + 1);
          break;
        }
      }
      
      if (!tableHtml) {
        console.log('❌ No table data found in MHTML file');
        return null;
      }
      
      // Clean up quoted-printable encoding
      tableHtml = tableHtml.replace(/=3D/g, '=');
      tableHtml = tableHtml.replace(/=\r?\n/g, '');
      
      // Extract table rows using regex
      const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
      
      if (!rowMatches || rowMatches.length === 0) {
        console.log('❌ No rows found in MHTML table');
        return null;
      }
      
      console.log('✓ Found', rowMatches.length, 'rows in table');
      
      // Parse rows into CSV-like data structure
      const csvData = [];
      let headers = [];
      
      rowMatches.forEach((row, rowIndex) => {
        // Extract cells from the row
        const cellMatches = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g);
        
        if (cellMatches) {
          const rowData = {};
          
          cellMatches.forEach((cell, cellIndex) => {
            // Clean up the cell content
            let cellText = cell
              .replace(/<[^>]+>/g, '') // Remove HTML tags
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&#\d+;/g, '') // Remove numeric entities
              .replace(/\s+/g, ' ')
              .trim();
            
            if (rowIndex === 0) {
              // This is the header row
              headers.push(cellText);
              if (cellIndex === 0) {
                console.log('Headers found:', headers.length);
              }
            } else {
              // This is a data row
              const header = headers[cellIndex] || `Column${cellIndex}`;
              rowData[header] = cellText;
            }
          });
          
          if (rowIndex > 0 && Object.keys(rowData).length > 0) {
            csvData.push(rowData);
          }
        }
      });
      
      console.log('✓ Parsed', csvData.length, 'data rows');
      
      // Show first few rows for debugging
      console.log('\nFirst 3 rows of data:');
      csvData.slice(0, 3).forEach((row, i) => {
        console.log(`Row ${i + 1}:`, JSON.stringify(row, null, 2).substring(0, 200) + '...');
      });
      
      // Check for key columns
      if (csvData.length > 0) {
        const firstRow = csvData[0];
        console.log('\nColumns found:', Object.keys(firstRow));
        
        // Check for date columns
        const dateColumns = Object.keys(firstRow).filter(col => 
          col.toLowerCase().includes('date') || 
          col.toLowerCase().includes('time')
        );
        console.log('Date columns:', dateColumns);
        
        // Check for revenue columns
        const revenueColumns = Object.keys(firstRow).filter(col => 
          col.toLowerCase().includes('charge') || 
          col.toLowerCase().includes('payment') ||
          col.toLowerCase().includes('amount')
        );
        console.log('Revenue columns:', revenueColumns);
      }
      
      return csvData;
      
    } else {
      console.log('❌ File is not in MHTML format');
      return null;
    }
  } catch (error) {
    console.error('Error parsing file:', error.message);
    return null;
  }
}

// Test with a file if provided
const testFile = process.argv[2];
if (testFile) {
  const fullPath = path.resolve(testFile);
  if (fs.existsSync(fullPath)) {
    const data = parseMHTMLFile(fullPath);
    if (data) {
      console.log('\n✅ Successfully parsed MHTML file');
      console.log('Total rows:', data.length);
    } else {
      console.log('\n❌ Failed to parse MHTML file');
    }
  } else {
    console.log('File not found:', fullPath);
  }
} else {
  console.log('Usage: node test-mhtml-parse-debug.js <path-to-mhtml-file>');
  console.log('Example: node test-mhtml-parse-debug.js "Patient Analysis.xls"');
}