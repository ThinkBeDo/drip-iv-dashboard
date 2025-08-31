const fs = require('fs');
const path = require('path');

function analyzeMHTMLStructure(filePath) {
  console.log('\n=== ANALYZING MHTML STRUCTURE ===');
  console.log('File:', filePath);
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    if (fileContent.includes('MIME-Version:') && 
        fileContent.includes('Content-Type:') && 
        fileContent.includes('Content-Location:')) {
      
      console.log('✓ Detected MHTML format\n');
      
      // Parse MHTML file
      const parts = fileContent.split(/--[\w-]+/);
      
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes('<table') && parts[i].includes('<tr')) {
          console.log('Found table in part', i + 1);
          
          // Clean up quoted-printable encoding
          let tableHtml = parts[i];
          tableHtml = tableHtml.replace(/=3D/g, '=');
          tableHtml = tableHtml.replace(/=\r?\n/g, '');
          
          // Extract first few rows to understand structure
          const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
          
          if (rowMatches) {
            console.log('Total rows found:', rowMatches.length);
            console.log('\n=== ANALYZING FIRST 5 ROWS ===\n');
            
            for (let j = 0; j < Math.min(5, rowMatches.length); j++) {
              const row = rowMatches[j];
              console.log(`\nROW ${j + 1}:`);
              console.log('--------');
              
              // Extract all cells (th and td)
              const cellMatches = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g);
              
              if (cellMatches) {
                console.log(`  ${cellMatches.length} cells found`);
                
                // Check for rowspan/colspan
                const hasRowspan = cellMatches.some(cell => cell.includes('rowspan'));
                const hasColspan = cellMatches.some(cell => cell.includes('colspan'));
                
                if (hasRowspan || hasColspan) {
                  console.log('  ⚠️ SPANS DETECTED:', { rowspan: hasRowspan, colspan: hasColspan });
                }
                
                // Show cell contents
                cellMatches.forEach((cell, cellIndex) => {
                  // Extract rowspan/colspan values
                  const rowspanMatch = cell.match(/rowspan=["']?(\d+)/i);
                  const colspanMatch = cell.match(/colspan=["']?(\d+)/i);
                  
                  // Clean cell content
                  let cellText = cell
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&#\d+;/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  
                  // Truncate long text
                  if (cellText.length > 50) {
                    cellText = cellText.substring(0, 50) + '...';
                  }
                  
                  let cellInfo = `  Cell ${cellIndex + 1}: "${cellText}"`;
                  if (rowspanMatch) cellInfo += ` [rowspan=${rowspanMatch[1]}]`;
                  if (colspanMatch) cellInfo += ` [colspan=${colspanMatch[1]}]`;
                  
                  console.log(cellInfo);
                });
              }
            }
            
            // Now parse the actual data rows (skip header)
            console.log('\n=== PARSING DATA ROWS ===\n');
            
            const dataRows = [];
            let previousRowData = {}; // Track data from previous row for rowspan handling
            
            for (let rowIndex = 1; rowIndex < Math.min(10, rowMatches.length); rowIndex++) {
              const row = rowMatches[rowIndex];
              const cellMatches = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g);
              
              if (cellMatches) {
                const rowData = {};
                const cellCount = cellMatches.length;
                
                console.log(`Row ${rowIndex}: ${cellCount} cells`);
                
                // Extract cell values
                const values = cellMatches.map(cell => {
                  return cell
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&#\d+;/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                });
                
                // Show first few values
                console.log('  Values:', values.slice(0, Math.min(8, values.length)));
                
                // Look for payment amount (usually contains $ or is numeric)
                const paymentCandidates = values
                  .map((v, i) => ({ value: v, index: i }))
                  .filter(item => item.value && (item.value.includes('$') || item.value.match(/^\d+\.?\d*$/)));
                
                if (paymentCandidates.length > 0) {
                  console.log('  💰 Payment candidates:', paymentCandidates);
                }
              }
            }
          }
          
          break; // Only analyze first table
        }
      }
    } else {
      console.log('❌ File is not in MHTML format');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Test with file
const testFile = process.argv[2];
if (testFile) {
  const fullPath = path.resolve(testFile);
  if (fs.existsSync(fullPath)) {
    analyzeMHTMLStructure(fullPath);
  } else {
    console.log('File not found:', fullPath);
  }
} else {
  console.log('Usage: node test-mhtml-structure.js <path-to-mhtml-file>');
}