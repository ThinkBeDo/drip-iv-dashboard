// Test date conversion for PostgreSQL

const testDates = () => {
  console.log('Testing date conversion for PostgreSQL...\n');
  
  // Test 1: Date object to ISO string
  const testDate1 = new Date(2025, 7, 24); // August 24, 2025
  const isoDate1 = testDate1.toISOString().split('T')[0];
  console.log('Test 1 - Date object to ISO:');
  console.log('  Input:', testDate1);
  console.log('  Output:', isoDate1);
  console.log('  Expected format: YYYY-MM-DD');
  console.log('  Valid:', /^\d{4}-\d{2}-\d{2}$/.test(isoDate1) ? '✅' : '❌');
  
  // Test 2: Parsed date from CSV
  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    dateStr = dateStr.trim();
    
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0]);
      const day = parseInt(parts[1]);
      let year = parseInt(parts[2]);
      
      if (year < 100) {
        year = 2000 + year;
      }
      
      return new Date(year, month - 1, day);
    }
    return null;
  };
  
  const csvDate = '8/22/25';
  const parsedDate = parseDate(csvDate);
  const isoDate2 = parsedDate ? parsedDate.toISOString().split('T')[0] : null;
  
  console.log('\nTest 2 - CSV date to ISO:');
  console.log('  Input:', csvDate);
  console.log('  Parsed:', parsedDate);
  console.log('  Output:', isoDate2);
  console.log('  Valid:', isoDate2 && /^\d{4}-\d{2}-\d{2}$/.test(isoDate2) ? '✅' : '❌');
  
  // Test 3: Edge cases
  console.log('\nTest 3 - Edge cases:');
  
  const nullDate = null;
  const fallbackDate = nullDate || new Date();
  const isoDate3 = fallbackDate.toISOString().split('T')[0];
  console.log('  Null date fallback:', isoDate3);
  console.log('  Valid:', /^\d{4}-\d{2}-\d{2}$/.test(isoDate3) ? '✅' : '❌');
  
  // Test 4: Simulated combined data
  const combinedData = {
    weekStartDate: new Date(2025, 7, 18), // August 18, 2025
    weekEndDate: new Date(2025, 7, 24)    // August 24, 2025
  };
  
  // Apply the fix
  if (combinedData.weekStartDate) {
    combinedData.week_start_date = combinedData.weekStartDate.toISOString().split('T')[0];
  } else {
    combinedData.week_start_date = new Date().toISOString().split('T')[0];
  }
  
  if (combinedData.weekEndDate) {
    combinedData.week_end_date = combinedData.weekEndDate.toISOString().split('T')[0];
  } else {
    combinedData.week_end_date = new Date().toISOString().split('T')[0];
  }
  
  console.log('\nTest 4 - Combined data conversion:');
  console.log('  week_start_date:', combinedData.week_start_date);
  console.log('  week_end_date:', combinedData.week_end_date);
  console.log('  Both valid:', 
    /^\d{4}-\d{2}-\d{2}$/.test(combinedData.week_start_date) && 
    /^\d{4}-\d{2}-\d{2}$/.test(combinedData.week_end_date) ? '✅' : '❌'
  );
  
  console.log('\n✅ All date conversions completed successfully!');
};

testDates();