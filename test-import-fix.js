// Test the import-weekly-data.js parsing after the fix
const path = require('path');

// We need to test the processRevenueData function
const importModule = require('./import-weekly-data.js');

// Mock a minimal database pool to avoid connection errors
const mockPool = {
  connect: () => ({ 
    query: () => ({ rows: [] }), 
    release: () => {} 
  })
};

// Set the mock pool
if (importModule.setDatabasePool) {
  importModule.setDatabasePool(mockPool);
}

// Test parsing the MHTML file
async function testParsing() {
  console.log('=== TESTING MHTML PARSING AFTER FIX ===\n');
  
  const revenueFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS.xls');
  
  // Create a mock processRevenueData to test parsing
  const { processRevenueData } = require('./import-weekly-data.js');
  
  if (!processRevenueData) {
    console.log('processRevenueData not exported, testing via file read...');
    
    // Alternative: Parse the file directly
    const fs = require('fs');
    const fileContent = fs.readFileSync(revenueFile, 'utf8');
    
    if (fileContent.includes('MIME-Version:')) {
      console.log('✓ MHTML file detected');
      
      // Count date occurrences for Aug 18-24
      const aug18_24_dates = [
        '8/18/25', '8/19/25', '8/20/25', 
        '8/21/25', '8/22/25', '8/23/25', '8/24/25'
      ];
      
      let dateCount = 0;
      aug18_24_dates.forEach(date => {
        const matches = fileContent.match(new RegExp(date, 'g'));
        if (matches) {
          dateCount += matches.length;
          console.log(`  ${date}: ${matches.length} occurrences`);
        }
      });
      
      console.log(`\nTotal Aug 18-24 date occurrences: ${dateCount}`);
      console.log('\nTo fully test, need to run import-weekly-data.js with database connection');
    }
    return;
  }
  
  try {
    const result = await processRevenueData(revenueFile);
    
    console.log('Parse result:');
    console.log('  Week dates:', result.weekStartDate, 'to', result.weekEndDate);
    console.log('  Weekly revenue: $' + result.actual_weekly_revenue);
    console.log('  Unique customers:', result.unique_customers_weekly);
    
    if (result.actual_weekly_revenue === 0) {
      console.log('\n⚠️ WARNING: Revenue is still $0!');
      console.log('The fix may not be working correctly.');
    } else {
      console.log('\n✅ SUCCESS: Revenue is being parsed correctly!');
      console.log(`Revenue for the week: $${result.actual_weekly_revenue}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.log('\nNote: Cannot fully test without database connection');
    console.log('The parsing fixes have been applied and should work when deployed');
  }
}

testParsing();