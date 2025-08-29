#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// Load the server.js parseCSVData function by requiring the server
// We'll extract just the parsing logic we need
const csvParser = require('csv-parser');

async function parseCSVData(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    // First, read a small chunk to detect encoding
    const buffer = fs.readFileSync(filePath, { flag: 'r' });
    const firstBytes = buffer.slice(0, 4);
    
    let encoding = 'utf8';
    // Check for UTF-16 LE BOM (FF FE)
    if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
      encoding = 'utf16le';
    }
    // Check for UTF-16 BE BOM (FE FF)
    else if (firstBytes[0] === 0xFE && firstBytes[1] === 0xFF) {
      encoding = 'utf16be';
    }

    let csvContent;
    if (encoding === 'utf8') {
      // Standard UTF-8 processing
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    } else {
      // Handle UTF-16 encoding with proper CSV parsing
      try {
        const fullBuffer = fs.readFileSync(filePath);
        // Use iconv-lite to decode UTF-16
        csvContent = iconv.decode(fullBuffer, encoding);
        
        // Split content into lines
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) {
          return resolve([]);
        }
        
        // Check if this is the special Drip IV format
        const firstLine = lines[0];
        const isDripIVFormat = firstLine.startsWith('"') && firstLine.includes(',""');
        
        let headers = [];
        
        if (isDripIVFormat) {
          // Special Drip IV CSV format: "field1,""field2"",""field3"",..."
          console.log('Detected special Drip IV CSV format');
          
          // Parse headers from special format
          let content = firstLine;
          if (content.startsWith('"') && content.endsWith('"')) {
            content = content.slice(1, -1); // Remove outer quotes
          }
          
          // Split by ,"" pattern but preserve structure
          const parts = [];
          let currentPart = '';
          let i = 0;
          
          while (i < content.length) {
            if (i < content.length - 2 && content.substring(i, i + 3) === ',""') {
              // Found delimiter
              parts.push(currentPart);
              currentPart = '';
              i += 3; // Skip ,""
            } else if (i < content.length - 1 && content.substring(i, i + 2) === ',,') {
              // Found empty field
              parts.push(currentPart);
              parts.push(''); // Empty field
              currentPart = '';
              i += 2; // Skip ,,
            } else {
              currentPart += content[i];
              i++;
            }
          }
          // Add the last part
          if (currentPart || parts.length === 0) {
            parts.push(currentPart);
          }
          
          // Clean up each header
          parts.forEach((part) => {
            let header = part;
            // Remove any quotes
            header = header.replace(/^\"*/, '').replace(/\"*$/, '');
            headers.push(header.trim());
          });
          
          console.log('Parsed headers:', headers.slice(0, 5), '...');
          
          // Parse data rows
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            
            // Parse data using same logic as headers
            let dataContent = line;
            if (dataContent.startsWith('"') && dataContent.endsWith('"')) {
              dataContent = dataContent.slice(1, -1); // Remove outer quotes
            }
            
            // Split by ,"" pattern but preserve structure
            const dataParts = [];
            let currentPart = '';
            let j = 0;
            
            while (j < dataContent.length) {
              if (j < dataContent.length - 2 && dataContent.substring(j, j + 3) === ',""') {
                // Found delimiter
                dataParts.push(currentPart);
                currentPart = '';
                j += 3; // Skip ,""
              } else if (j < dataContent.length - 1 && dataContent.substring(j, j + 2) === ',,') {
                // Found empty field
                dataParts.push(currentPart);
                dataParts.push(''); // Empty field
                currentPart = '';
                j += 2; // Skip ,,
              } else {
                currentPart += dataContent[j];
                j++;
              }
            }
            // Add the last part
            if (currentPart || dataParts.length === 0) {
              dataParts.push(currentPart);
            }
            
            // Clean each value and create row object
            if (dataParts.length >= headers.length) {
              const row = {};
              headers.forEach((header, index) => {
                let value = dataParts[index] || '';
                // Remove any quotes
                value = value.replace(/^\"*/, '').replace(/\"*$/, '');
                row[header] = value.trim();
              });
              results.push(row);
            }
          }
        } else {
          // Standard CSV parsing would go here
          console.log('Standard CSV format not implemented in this test');
        }
        
        console.log(`Successfully parsed UTF-16 CSV: ${results.length} rows`);
        resolve(results);
      } catch (error) {
        console.error('Error parsing UTF-16 CSV:', error.message);
        reject(error);
      }
    }
  });
}

// Test the parsing
async function testParsing() {
  const csvFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).csv');
  
  try {
    console.log('Testing CSV parsing...');
    const data = await parseCSVData(csvFile);
    
    console.log('\nFirst 3 rows of parsed data:');
    data.slice(0, 3).forEach((row, i) => {
      console.log(`\nRow ${i + 1}:`);
      console.log('  Date:', row['Date']);
      console.log('  Date Of Payment:', row['Date Of Payment']);
      console.log('  Patient:', row['Patient']);
      console.log('  Charge Desc:', row['Charge Desc']);
      console.log('  Payment:', row['Calculated Payment (Line)']);
    });
    
    console.log('\nTotal rows parsed:', data.length);
    
    // Calculate revenue
    let totalRevenue = 0;
    let weeklyRevenue = 0;
    const weekStart = new Date('2025-01-19');
    const weekEnd = new Date('2025-01-25');
    
    data.forEach(row => {
      const dateStr = row['Date'] || row['Date Of Payment'] || '';
      const paymentStr = row['Calculated Payment (Line)'] || '0';
      const payment = parseFloat(paymentStr.replace(/[\$,()]/g, '')) || 0;
      
      if (dateStr && payment > 0) {
        totalRevenue += payment;
        
        // Parse date
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const month = parseInt(parts[0]);
          const day = parseInt(parts[1]);
          let year = parseInt(parts[2]);
          if (year < 100) year = 2000 + year;
          
          const date = new Date(year, month - 1, day);
          if (date >= weekStart && date <= weekEnd) {
            weeklyRevenue += payment;
          }
        }
      }
    });
    
    console.log('\nRevenue Analysis:');
    console.log('  Total revenue in file: $' + totalRevenue.toFixed(2));
    console.log('  Weekly revenue (Jan 19-25): $' + weeklyRevenue.toFixed(2));
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testParsing();