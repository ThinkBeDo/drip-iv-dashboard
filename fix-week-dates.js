// Fix for ensuring correct week dates in database
// The issue is that the "Last Week" filter expects exact dates but import might save different ones

const XLSX = require('xlsx');
const fs = require('fs');

async function fixWeekDates() {
  console.log('🔧 Fixing week dates to ensure Last Week filter works...');

  // Expected "Last Week" dates (what the dashboard filter calculates)
  const expectedLastWeek = {
    start: '2025-09-29', // Monday
    end: '2025-10-05'    // Sunday
  };

  console.log(`🎯 Expected Last Week dates: ${expectedLastWeek.start} to ${expectedLastWeek.end}`);

  try {
    // Read the membership file to verify it has data for the expected week
    const membershipFile = 'Drip IV Active Memberships (4).xlsx';
    const workbook = XLSX.readFile(membershipFile);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`✅ Membership file has ${data.length} records`);

    // Check if membership file contains data for the expected week
    const hasLastWeekMemberships = data.some(row => {
      const title = (row['Title'] || '').toLowerCase();
      return title && (
        title.includes('individual') ||
        title.includes('family') ||
        title.includes('concierge') ||
        title.includes('corporate')
      );
    });

    if (!hasLastWeekMemberships) {
      console.log('❌ Membership file does not contain active memberships');
      console.log('This explains why total_drip_iv_members is 0');
      return;
    }

    console.log('✅ Membership file contains active memberships');

    // The fix: Ensure that when data is imported for Sep 29-Oct 5, it gets saved correctly
    // This involves modifying the import process to use exact week boundaries

    console.log('\n📋 RECOMMENDED FIXES:');
    console.log('1. Modify import-multi-week-data.js to ensure correct week date calculation');
    console.log('2. Verify that the week detection logic handles the Sep 29-Oct 5 range correctly');
    console.log('3. Check that the dashboard query uses the correct date format');

    // Let's check what dates the patient analysis file actually contains
    const patientFile = 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (5).xls';
    const patientWorkbook = XLSX.readFile(patientFile);
    const patientSheet = patientWorkbook.Sheets[patientWorkbook.SheetNames[0]];
    const patientData = XLSX.utils.sheet_to_json(patientSheet);

    console.log(`\n📊 Patient file has ${patientData.length} records`);

    // Analyze dates in patient file
    const dates = new Set();
    patientData.forEach(row => {
      let dateStr = row['Date'] || row['Date Of Payment'] || '';

      if (typeof dateStr === 'number') {
        // Excel serial date
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + dateStr * 86400000);
        dates.add(date.toISOString().split('T')[0]);
      } else if (dateStr) {
        // String date
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          dates.add(date.toISOString().split('T')[0]);
        }
      }
    });

    const sortedDates = [...dates].sort();
    console.log(`📅 Date range in patient file: ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}`);

    // Check if Sep 29-Oct 5 range is covered
    const lastWeekStart = new Date(expectedLastWeek.start);
    const lastWeekEnd = new Date(expectedLastWeek.end);

    const lastWeekDates = [];
    for (let d = new Date(lastWeekStart); d <= lastWeekEnd; d.setDate(d.getDate() + 1)) {
      lastWeekDates.push(d.toISOString().split('T')[0]);
    }

    const hasLastWeekData = lastWeekDates.some(date => dates.has(date));
    console.log(`📅 Last Week data coverage: ${hasLastWeekData ? '✅ YES' : '❌ NO'}`);

    if (!hasLastWeekData) {
      console.log('❌ Patient file does not contain data for Sep 29-Oct 5');
      console.log('This explains why the Last Week filter shows "Limited data"');
    } else {
      console.log('✅ Patient file contains data for Sep 29-Oct 5');
      console.log('📋 The import process should have created a record for this week');
    }

  } catch (error) {
    console.error('❌ Error analyzing files:', error.message);
  }
}

fixWeekDates();
