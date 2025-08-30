const { Pool } = require('pg');
require('dotenv').config();

async function checkDatabase() {
  // Use Railway database URL
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:tXnJczJrBENdRQcxMzWLMnJPCQaXNLIu@autorack.proxy.rlwy.net:27586/railway';
  
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Railway database...\n');
    
    // Check recent analytics data
    const analyticsResult = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        total_drip_iv_members,
        iv_infusions_weekday_weekly,
        iv_infusions_weekend_weekly,
        created_at
      FROM analytics_data 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('=== RECENT ANALYTICS DATA ===');
    if (analyticsResult.rows.length === 0) {
      console.log('No analytics data found in database');
    } else {
      analyticsResult.rows.forEach((row, index) => {
        console.log(`\nRecord ${index + 1}:`);
        console.log(`  Week: ${row.week_start_date} to ${row.week_end_date}`);
        console.log(`  Revenue: $${row.actual_weekly_revenue}`);
        console.log(`  Members: ${row.total_drip_iv_members}`);
        console.log(`  Weekday Infusions: ${row.iv_infusions_weekday_weekly}`);
        console.log(`  Weekend Infusions: ${row.iv_infusions_weekend_weekly}`);
        console.log(`  Created: ${row.created_at}`);
      });
    }
    
    // Check for data in the Aug 18-24 range
    console.log('\n=== CHECKING FOR AUG 18-24 DATA ===');
    const specificWeekResult = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        total_drip_iv_members
      FROM analytics_data 
      WHERE week_start_date >= '2025-08-18' 
        AND week_start_date <= '2025-08-18'
      ORDER BY created_at DESC
    `);
    
    if (specificWeekResult.rows.length === 0) {
      console.log('No data found for week of Aug 18-24, 2025');
      
      // Check what dates we do have
      const dateRangeResult = await pool.query(`
        SELECT DISTINCT week_start_date, week_end_date
        FROM analytics_data
        ORDER BY week_start_date DESC
        LIMIT 10
      `);
      
      console.log('\nAvailable date ranges in database:');
      dateRangeResult.rows.forEach(row => {
        console.log(`  ${row.week_start_date} to ${row.week_end_date}`);
      });
    } else {
      console.log('Found data for Aug 18-24:');
      specificWeekResult.rows.forEach(row => {
        console.log(`  Week: ${row.week_start_date} to ${row.week_end_date}`);
        console.log(`  Revenue: $${row.actual_weekly_revenue}`);
        console.log(`  Members: ${row.total_drip_iv_members}`);
      });
    }
    
    // Check table count
    const countResult = await pool.query('SELECT COUNT(*) as total FROM analytics_data');
    console.log(`\nTotal records in analytics_data table: ${countResult.rows[0].total}`);
    
  } catch (error) {
    console.error('Database Error:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
    console.log('\nDatabase connection closed.');
  }
}

checkDatabase();