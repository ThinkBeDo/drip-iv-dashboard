const { Pool } = require('pg');
require('dotenv').config();

// Connect to database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function checkRecentData() {
  try {
    console.log('🔍 Checking recent database records...');

    // Check all records in analytics_data
    const allRecords = await pool.query(`
      SELECT id, week_start_date, week_end_date, upload_date,
             total_drip_iv_members, actual_weekly_revenue,
             individual_memberships, family_memberships,
             concierge_memberships, corporate_memberships
      FROM analytics_data
      ORDER BY upload_date DESC, id DESC
      LIMIT 5
    `);

    console.log(`\n📊 Found ${allRecords.rows.length} recent records:`);
    allRecords.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. Record ID: ${row.id}`);
      console.log(`   Week: ${row.week_start_date} to ${row.week_end_date}`);
      console.log(`   Uploaded: ${row.upload_date}`);
      console.log(`   Revenue: $${row.actual_weekly_revenue}`);
      console.log(`   Total Members: ${row.total_drip_iv_members}`);
      console.log(`   Individual: ${row.individual_memberships}`);
      console.log(`   Family: ${row.family_memberships}`);
      console.log(`   Concierge: ${row.concierge_memberships}`);
      console.log(`   Corporate: ${row.corporate_memberships}`);
    });

    // Check for the "Last Week" range (Sep 29 - Oct 5, 2025)
    const lastWeekStart = '2025-09-29';
    const lastWeekEnd = '2025-10-05';

    console.log(`\n🎯 Checking for "Last Week" data (${lastWeekStart} to ${lastWeekEnd}):`);

    const lastWeekRecords = await pool.query(`
      SELECT * FROM analytics_data
      WHERE week_start_date = $1 AND week_end_date = $2
    `, [lastWeekStart, lastWeekEnd]);

    if (lastWeekRecords.rows.length === 0) {
      console.log('❌ No records found for the "Last Week" date range');
      console.log('📋 Possible issues:');
      console.log('   1. Data was not imported correctly');
      console.log('   2. Data was imported with different week dates');
      console.log('   3. Upload process failed');

      // Check if there are any recent uploads at all
      const recentUploads = await pool.query(`
        SELECT * FROM analytics_data
        WHERE upload_date >= NOW() - INTERVAL '24 hours'
        ORDER BY upload_date DESC
      `);

      if (recentUploads.rows.length === 0) {
        console.log('\n🚨 No uploads in the last 24 hours!');
        console.log('The new data may not have been imported at all.');
      } else {
        console.log(`\n✅ Found ${recentUploads.rows.length} recent upload(s) in the last 24 hours:`);
        recentUploads.rows.forEach(row => {
          console.log(`   ${row.upload_date}: ${row.week_start_date} to ${row.week_end_date} (Members: ${row.total_drip_iv_members})`);
        });
      }
    } else {
      const record = lastWeekRecords.rows[0];
      console.log(`✅ Found record for "Last Week"!`);
      console.log(`   Total Members: ${record.total_drip_iv_members}`);
      console.log(`   Revenue: $${record.actual_weekly_revenue}`);

      if (record.total_drip_iv_members === 0) {
        console.log('\n🚨 MEMBERSHIP DATA ISSUE:');
        console.log('   The record exists but total_drip_iv_members is 0');
        console.log('   This means the membership file was not processed correctly');
      }
    }

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    await pool.end();
  }
}

checkRecentData();
