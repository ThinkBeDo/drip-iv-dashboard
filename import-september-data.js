// Import full September data week by week
const XLSX = require('xlsx');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function importSeptemberData() {
  console.log('📅 Starting September data import...\n');
  
  try {
    // Read the Excel file
    const workbook = XLSX.readFile('Patient Analysis (Charge Details & Payments) - V3  - With COGS (3).xls');
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Total rows in file: ${jsonData.length}`);
    
    // Convert Excel dates to ISO format
    const convertedData = jsonData.map(row => {
      const converted = { ...row };
      if (row['Date'] && typeof row['Date'] === 'number') {
        const jsDate = new Date((row['Date'] - 25569) * 86400 * 1000);
        converted['Date'] = jsDate.toISOString().split('T')[0];
      }
      return converted;
    });
    
    // Define September weeks (Sunday to Saturday)
    const weeks = [
      { start: '2025-09-01', end: '2025-09-07', name: 'Week 1 (Sept 1-7)' },
      { start: '2025-09-08', end: '2025-09-14', name: 'Week 2 (Sept 8-14)' },
      { start: '2025-09-15', end: '2025-09-21', name: 'Week 3 (Sept 15-21)' },
      { start: '2025-09-22', end: '2025-09-28', name: 'Week 4 (Sept 22-28)' },
      { start: '2025-09-29', end: '2025-09-30', name: 'Week 5 (Sept 29-30, partial)' }
    ];
    
    // Clear existing September data
    console.log('\n🗑️  Clearing existing September data...');
    await pool.query("DELETE FROM analytics_data WHERE week_start_date >= '2025-09-01' AND week_start_date < '2025-10-01'");
    console.log('✅ Cleared\n');
    
    // Process each week
    for (const week of weeks) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📅 Processing ${week.name}`);
      console.log(`${'='.repeat(60)}`);
      
      // Filter data for this week
      const weekStart = new Date(week.start);
      const weekEnd = new Date(week.end);
      weekStart.setHours(0, 0, 0, 0);
      weekEnd.setHours(23, 59, 59, 999);
      
      const weekData = convertedData.filter(row => {
        const dateStr = row['Date'];
        if (!dateStr) return false;
        
        const date = new Date(dateStr);
        date.setHours(0, 0, 0, 0);
        
        return date >= weekStart && date <= weekEnd;
      });
      
      console.log(`📊 Rows in this week: ${weekData.length}`);
      
      if (weekData.length === 0) {
        console.log('⚠️  No data for this week, skipping...');
        continue;
      }
      
      // Create a temporary Excel file for this week
      const tempWorkbook = XLSX.utils.book_new();
      const tempWorksheet = XLSX.utils.json_to_sheet(weekData);
      XLSX.utils.book_append_sheet(tempWorkbook, tempWorksheet, 'Sheet1');
      const tempFilePath = `temp_week_${week.start}.xls`;
      XLSX.writeFile(tempWorkbook, tempFilePath);
      
      console.log(`📁 Created temporary file: ${tempFilePath}`);
      
      // Upload via the API
      const FormData = require('form-data');
      const fs = require('fs');
      const axios = require('axios');
      
      const form = new FormData();
      form.append('file', fs.createReadStream(tempFilePath));
      
      try {
        const response = await axios.post('http://localhost:3000/api/upload', form, {
          headers: form.getHeaders()
        });
        
        console.log(`✅ Upload successful!`);
        console.log(`   Revenue: $${response.data.data.totalWeeklyRevenue}`);
        console.log(`   IV Therapy: $${response.data.data.dripIvRevenue}`);
        console.log(`   Weight Loss: $${response.data.data.semaglutideRevenue}`);
        console.log(`   NEW Memberships: ${JSON.stringify(response.data.data.newMemberships)}`);
      } catch (error) {
        console.error(`❌ Upload failed:`, error.response?.data || error.message);
      }
      
      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      console.log(`🧹 Cleaned up temporary file`);
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ September data import complete!');
    console.log(`${'='.repeat(60)}\n`);
    
    // Show summary
    const summary = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        drip_iv_revenue_weekly,
        semaglutide_revenue_weekly,
        new_family_members_weekly
      FROM analytics_data
      WHERE week_start_date >= '2025-09-01' AND week_start_date < '2025-10-01'
      ORDER BY week_start_date
    `);
    
    console.log('📊 SUMMARY - September Weeks in Database:');
    console.log('─'.repeat(100));
    let totalRevenue = 0;
    summary.rows.forEach(row => {
      const revenue = parseFloat(row.actual_weekly_revenue);
      totalRevenue += revenue;
      console.log(`${row.week_start_date.toISOString().split('T')[0]} to ${row.week_end_date.toISOString().split('T')[0]}: ` +
                  `Revenue=$${revenue.toFixed(2).padStart(10)}, ` +
                  `IV=$${parseFloat(row.drip_iv_revenue_weekly).toFixed(2).padStart(10)}, ` +
                  `WL=$${parseFloat(row.semaglutide_revenue_weekly).toFixed(2).padStart(10)}, ` +
                  `NEW Family=${row.new_family_members_weekly}`);
    });
    console.log('─'.repeat(100));
    console.log(`TOTAL SEPTEMBER REVENUE: $${totalRevenue.toFixed(2)}`);
    console.log('─'.repeat(100));
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the import
importSeptemberData().catch(console.error);
