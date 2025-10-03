const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');
require('dotenv').config();

const filePath = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls');

console.log('='.repeat(80));
console.log('SEPTEMBER 2025 DATA DIAGNOSTIC');
console.log('='.repeat(80));

// Define current week
const weekStart = new Date('2025-09-22');
const weekEnd = new Date('2025-09-28');

console.log(`\nCurrent Week: ${weekStart.toDateString()} - ${weekEnd.toDateString()}`);

// Read Excel file
console.log('\n📂 Reading Excel file...');
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws);

console.log(`✅ Total rows in Excel: ${data.length}`);

// Find NEW memberships in current week
console.log('\n' + '='.repeat(80));
console.log('NEW MEMBERSHIPS IN CURRENT WEEK (Sep 22-28)');
console.log('='.repeat(80));

const newMembershipsThisWeek = [];

data.forEach(row => {
  const chargeDesc = row['Charge Desc'] || '';
  let dateStr = row['Date'] || row['Date Of Payment'] || '';

  if (!/\bNEW\b/.test(chargeDesc.toUpperCase())) return;
  if (!dateStr) return;

  // Convert to string if it's a number (Excel date serial)
  if (typeof dateStr === 'number') {
    // Excel date serial number
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + dateStr * 86400000);
    dateStr = date.toLocaleDateString('en-US');
  } else {
    dateStr = String(dateStr);
  }

  // Parse date
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

  // Check if within current week
  if (date >= weekStart && date <= weekEnd) {
    newMembershipsThisWeek.push({
      patient: row['Patient'] || '',
      date: date.toDateString(),
      chargeDesc: chargeDesc,
      amount: row['Total'] || 0
    });
  }
});

console.log(`\n✅ Found ${newMembershipsThisWeek.length} NEW memberships in current week\n`);

// Group by type
const byType = {
  individual: [],
  family: [],
  concierge: [],
  corporate: []
};

newMembershipsThisWeek.forEach(item => {
  const desc = item.chargeDesc.toLowerCase();
  if (desc.includes('individual')) byType.individual.push(item);
  else if (desc.includes('family')) byType.family.push(item);
  else if (desc.includes('concierge')) byType.concierge.push(item);
  else if (desc.includes('corporate')) byType.corporate.push(item);
});

console.log('Breakdown by Type:');
console.log(`  Individual: ${byType.individual.length}`);
console.log(`  Family: ${byType.family.length}`);
console.log(`  Concierge: ${byType.concierge.length}`);
console.log(`  Corporate: ${byType.corporate.length}`);

if (newMembershipsThisWeek.length > 0) {
  console.log('\nDetails:');
  newMembershipsThisWeek.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.patient} - ${item.chargeDesc} - ${item.date} - $${item.amount}`);
  });
}

// Check database
async function checkDatabase() {
  console.log('\n' + '='.repeat(80));
  console.log('DATABASE CHECK - SEPTEMBER 2025 WEEKS');
  console.log('='.repeat(80));

  if (!process.env.DATABASE_URL) {
    console.log('\n⚠️  No DATABASE_URL found in environment. Skipping database check.');
    console.log('Set DATABASE_URL to check production database.');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Get all September weeks
    const result = await pool.query(`
      SELECT
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        drip_iv_revenue_weekly,
        semaglutide_revenue_weekly,
        new_individual_members_weekly,
        new_family_members_weekly,
        new_concierge_members_weekly,
        new_corporate_members_weekly,
        created_at
      FROM analytics_data
      WHERE week_start_date >= '2025-09-01' AND week_start_date < '2025-10-01'
      ORDER BY week_start_date ASC
    `);

    if (result.rows.length === 0) {
      console.log('\n⚠️  NO DATA FOUND FOR SEPTEMBER 2025');
    } else {
      console.log(`\n✅ Found ${result.rows.length} week(s) of data in September 2025:\n`);

      let totalRevenue = 0;
      let totalIV = 0;
      let totalSema = 0;
      let totalNewIndividual = 0;
      let totalNewFamily = 0;
      let totalNewConcierge = 0;
      let totalNewCorporate = 0;

      result.rows.forEach((row, i) => {
        console.log(`Week ${i + 1}: ${row.week_start_date} to ${row.week_end_date}`);
        console.log(`  Total Revenue: $${parseFloat(row.actual_weekly_revenue).toFixed(2)}`);
        console.log(`  IV Therapy: $${parseFloat(row.drip_iv_revenue_weekly).toFixed(2)}`);
        console.log(`  Weight Loss: $${parseFloat(row.semaglutide_revenue_weekly).toFixed(2)}`);
        console.log(`  New Memberships: Ind=${row.new_individual_members_weekly}, Fam=${row.new_family_members_weekly}, Con=${row.new_concierge_members_weekly}, Corp=${row.new_corporate_members_weekly}`);
        console.log(`  Uploaded: ${row.created_at}`);
        console.log('');

        totalRevenue += parseFloat(row.actual_weekly_revenue) || 0;
        totalIV += parseFloat(row.drip_iv_revenue_weekly) || 0;
        totalSema += parseFloat(row.semaglutide_revenue_weekly) || 0;
        totalNewIndividual += parseInt(row.new_individual_members_weekly) || 0;
        totalNewFamily += parseInt(row.new_family_members_weekly) || 0;
        totalNewConcierge += parseInt(row.new_concierge_members_weekly) || 0;
        totalNewCorporate += parseInt(row.new_corporate_members_weekly) || 0;
      });

      console.log('='.repeat(80));
      console.log('SEPTEMBER 2025 TOTALS (Sum of all weeks):');
      console.log('='.repeat(80));
      console.log(`Total Revenue: $${totalRevenue.toFixed(2)}`);
      console.log(`IV Therapy: $${totalIV.toFixed(2)}`);
      console.log(`Weight Loss: $${totalSema.toFixed(2)}`);
      console.log(`New Memberships: Ind=${totalNewIndividual}, Fam=${totalNewFamily}, Con=${totalNewConcierge}, Corp=${totalNewCorporate}`);
    }

    // Test the monthly revenue query (current logic)
    console.log('\n' + '='.repeat(80));
    console.log('CURRENT MONTHLY QUERY TEST');
    console.log('='.repeat(80));

    const monthStart = new Date(2025, 8, 1); // September 1, 2025
    const monthEnd = new Date(2025, 8, 30); // September 30, 2025

    const currentQueryResult = await pool.query(`
      SELECT
        SUM(drip_iv_revenue_weekly) as total_iv_revenue,
        SUM(semaglutide_revenue_weekly) as total_sema_revenue,
        SUM(actual_weekly_revenue) as total_revenue,
        COUNT(*) as weeks_count
      FROM analytics_data
      WHERE week_start_date >= $1 AND week_start_date <= $2
    `, [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]);

    console.log('Current Query (week_start_date >= Sep 1 AND week_start_date <= Sep 30):');
    console.log(`  Weeks Found: ${currentQueryResult.rows[0].weeks_count}`);
    console.log(`  Total Revenue: $${parseFloat(currentQueryResult.rows[0].total_revenue || 0).toFixed(2)}`);
    console.log(`  IV Therapy: $${parseFloat(currentQueryResult.rows[0].total_iv_revenue || 0).toFixed(2)}`);
    console.log(`  Weight Loss: $${parseFloat(currentQueryResult.rows[0].total_sema_revenue || 0).toFixed(2)}`);

    // Test the FIXED monthly revenue query
    const fixedQueryResult = await pool.query(`
      SELECT
        SUM(drip_iv_revenue_weekly) as total_iv_revenue,
        SUM(semaglutide_revenue_weekly) as total_sema_revenue,
        SUM(actual_weekly_revenue) as total_revenue,
        COUNT(*) as weeks_count
      FROM analytics_data
      WHERE week_start_date <= $2 AND week_end_date >= $1
    `, [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]);

    console.log('\nFixed Query (week_start_date <= Sep 30 AND week_end_date >= Sep 1):');
    console.log(`  Weeks Found: ${fixedQueryResult.rows[0].weeks_count}`);
    console.log(`  Total Revenue: $${parseFloat(fixedQueryResult.rows[0].total_revenue || 0).toFixed(2)}`);
    console.log(`  IV Therapy: $${parseFloat(fixedQueryResult.rows[0].total_iv_revenue || 0).toFixed(2)}`);
    console.log(`  Weight Loss: $${parseFloat(fixedQueryResult.rows[0].total_sema_revenue || 0).toFixed(2)}`);

  } catch (error) {
    console.error('❌ Database Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase().then(() => {
  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('='.repeat(80));
});
