const XLSX = require('xlsx');

const filePath = 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';

console.log('='.repeat(80));
console.log('EXCEL FILE STRUCTURE ANALYSIS');
console.log('='.repeat(80));

try {
  const wb = XLSX.readFile(filePath);
  
  console.log('📂 Workbook Info:');
  console.log(`   Sheets: ${wb.SheetNames.length}`);
  console.log(`   Sheet Names: ${wb.SheetNames.join(', ')}`);
  
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  
  console.log(`\n📄 Sheet: ${wb.SheetNames[0]}`);
  console.log(`   Total Rows: ${data.length}`);
  
  if (data.length > 0) {
    console.log('\n📊 Column Headers:');
    const headers = Object.keys(data[0]);
    headers.forEach((header, i) => {
      console.log(`   ${i + 1}. "${header}"`);
    });
    
    console.log('\n📋 Sample Data (First 3 rows):');
    data.slice(0, 3).forEach((row, i) => {
      console.log(`\nRow ${i + 1}:`);
      Object.entries(row).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          console.log(`   ${key}: ${JSON.stringify(value)}`);
        }
      });
    });
    
    // Look for revenue-related columns
    console.log('\n💰 Revenue-Related Columns:');
    const revenueColumns = headers.filter(h => 
      h.toLowerCase().includes('total') || 
      h.toLowerCase().includes('amount') || 
      h.toLowerCase().includes('revenue') ||
      h.toLowerCase().includes('charge') ||
      h.toLowerCase().includes('payment') ||
      h.toLowerCase().includes('price') ||
      h.toLowerCase().includes('cost')
    );
    
    if (revenueColumns.length > 0) {
      revenueColumns.forEach(col => {
        console.log(`   ✅ ${col}`);
        
        // Show sample values
        const samples = data.slice(0, 5).map(row => row[col]).filter(val => val !== undefined && val !== '');
        if (samples.length > 0) {
          console.log(`      Sample values: ${samples.slice(0, 3).map(v => JSON.stringify(v)).join(', ')}`);
        }
      });
    } else {
      console.log('   ❌ No obvious revenue columns found');
    }
    
    // Look for date columns
    console.log('\n📅 Date-Related Columns:');
    const dateColumns = headers.filter(h => 
      h.toLowerCase().includes('date') || 
      h.toLowerCase().includes('time')
    );
    
    if (dateColumns.length > 0) {
      dateColumns.forEach(col => {
        console.log(`   ✅ ${col}`);
        
        // Show sample values
        const samples = data.slice(0, 5).map(row => row[col]).filter(val => val !== undefined && val !== '');
        if (samples.length > 0) {
          console.log(`      Sample values: ${samples.slice(0, 3).map(v => JSON.stringify(v)).join(', ')}`);
        }
      });
    } else {
      console.log('   ❌ No obvious date columns found');
    }
    
    // Check for September 2025 data specifically
    console.log('\n🔍 September 2025 Data Check:');
    
    let septemberCount = 0;
    let hasRevenue = false;
    let totalRevenue = 0;
    
    data.forEach(row => {
      // Check all possible date columns
      const possibleDates = headers.filter(h => 
        h.toLowerCase().includes('date') || 
        h.toLowerCase().includes('time')
      );
      
      let rowDate = null;
      for (const dateCol of possibleDates) {
        let dateStr = row[dateCol];
        if (!dateStr) continue;
        
        // Convert Excel date if needed
        if (typeof dateStr === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const date = new Date(excelEpoch.getTime() + dateStr * 86400000);
          dateStr = date.toLocaleDateString('en-US');
        } else {
          dateStr = String(dateStr);
        }
        
        let date = new Date(dateStr);
        if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            const month = parseInt(parts[0]);
            const day = parseInt(parts[1]);
            let year = parseInt(parts[2]);
            if (year < 100) year += 2000;
            date = new Date(year, month - 1, day);
          }
        }
        
        if (date && !isNaN(date.getTime()) && date.getFullYear() === 2025 && date.getMonth() === 8) {
          rowDate = date;
          septemberCount++;
          
          // Check for revenue in this row
          revenueColumns.forEach(revCol => {
            const amount = parseFloat(row[revCol] || 0);
            if (amount > 0) {
              hasRevenue = true;
              totalRevenue += amount;
            }
          });
          
          // Show first few September rows
          if (septemberCount <= 3) {
            console.log(`   Row ${septemberCount}: ${dateCol}=${dateStr}, Date=${date.toDateString()}`);
            revenueColumns.forEach(revCol => {
              console.log(`      ${revCol}: ${row[revCol]}`);
            });
          }
          
          break; // Found a valid September date for this row
        }
      }
    });
    
    console.log(`\n📈 September 2025 Summary:`);
    console.log(`   Records found: ${septemberCount}`);
    console.log(`   Has revenue data: ${hasRevenue ? 'Yes' : 'No'}`);
    console.log(`   Total revenue: $${totalRevenue.toFixed(2)}`);
    
    if (septemberCount === 0) {
      console.log('\n❌ No September 2025 data found in this file');
      console.log('This may explain why the database only has one week of data');
    } else if (!hasRevenue) {
      console.log('\n⚠️  September data found but no revenue amounts');
      console.log('Check if revenue data is in different columns or format');
    }
  }
  
} catch (error) {
  console.error('❌ Error analyzing file:', error.message);
}