const { Pool } = require('pg');
require('dotenv').config();

// Database configuration with proper timeout and retry settings
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:tXnJczJrBENdRQcxMzWLMnJPCQaXNLIu@autorack.proxy.rlwy.net:27586/railway';

async function verifyDatabase() {
  console.log('🔍 DATABASE VERIFICATION SCRIPT');
  console.log('================================\n');
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000, // 10 second timeout
    query_timeout: 10000,
    statement_timeout: 10000,
    idle_in_transaction_session_timeout: 10000
  });

  try {
    console.log('📡 Connecting to Railway PostgreSQL...');
    
    // Test connection
    const testResult = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Connected successfully at:', testResult.rows[0].current_time);
    console.log('');
    
    // 1. Check if analytics_data table exists
    console.log('📊 CHECKING TABLE STRUCTURE');
    console.log('---------------------------');
    const tableCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'analytics_data' 
      ORDER BY ordinal_position
      LIMIT 10
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('❌ Table analytics_data does not exist!');
      await pool.end();
      return;
    }
    
    console.log('✅ Table exists with columns:');
    tableCheck.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });
    console.log('');
    
    // 2. Check total record count
    console.log('📈 DATA STATISTICS');
    console.log('------------------');
    const countResult = await pool.query('SELECT COUNT(*) as total FROM analytics_data');
    console.log(`Total records: ${countResult.rows[0].total}`);
    console.log('');
    
    // 3. Check date ranges in database
    console.log('📅 DATE RANGES IN DATABASE');
    console.log('--------------------------');
    const dateRanges = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        total_drip_iv_members,
        created_at
      FROM analytics_data 
      ORDER BY week_start_date DESC 
      LIMIT 10
    `);
    
    if (dateRanges.rows.length === 0) {
      console.log('❌ No data found in analytics_data table');
    } else {
      console.log('Recent weeks in database:');
      dateRanges.rows.forEach((row, i) => {
        console.log(`\n${i + 1}. Week: ${row.week_start_date} to ${row.week_end_date}`);
        console.log(`   Revenue: $${row.actual_weekly_revenue || 0}`);
        console.log(`   Members: ${row.total_drip_iv_members || 0}`);
        console.log(`   Created: ${row.created_at}`);
      });
    }
    console.log('');
    
    // 4. Specifically check for Aug 18-24 data
    console.log('🔎 CHECKING FOR AUG 18-24, 2025 DATA');
    console.log('-------------------------------------');
    const aug18Data = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        total_drip_iv_members,
        iv_infusions_weekday_weekly,
        iv_infusions_weekend_weekly
      FROM analytics_data 
      WHERE week_start_date = '2025-08-18'
         OR (week_start_date <= '2025-08-18' AND week_end_date >= '2025-08-24')
      ORDER BY created_at DESC
    `);
    
    if (aug18Data.rows.length === 0) {
      console.log('❌ No data found for week of Aug 18-24, 2025');
      console.log('   This is why "Last Week" shows $0.00!');
    } else {
      console.log('✅ Found data for Aug 18-24:');
      aug18Data.rows.forEach(row => {
        console.log(`   Week: ${row.week_start_date} to ${row.week_end_date}`);
        console.log(`   Revenue: $${row.actual_weekly_revenue}`);
        console.log(`   Members: ${row.total_drip_iv_members}`);
        console.log(`   Weekday Infusions: ${row.iv_infusions_weekday_weekly}`);
        console.log(`   Weekend Infusions: ${row.iv_infusions_weekend_weekly}`);
      });
    }
    console.log('');
    
    // 5. Test the exact query the dashboard uses
    console.log('🧪 TESTING DASHBOARD QUERY');
    console.log('--------------------------');
    const dashboardQuery = await pool.query(`
      SELECT * FROM analytics_data 
      WHERE week_start_date <= $1 AND week_end_date >= $2
      ORDER BY week_start_date DESC 
      LIMIT 1
    `, ['2025-08-24', '2025-08-18']);
    
    if (dashboardQuery.rows.length === 0) {
      console.log('❌ Dashboard query returns no results for Last Week filter');
      console.log('   Query: WHERE week_start_date <= 2025-08-24 AND week_end_date >= 2025-08-18');
    } else {
      console.log('✅ Dashboard query found data:');
      const row = dashboardQuery.rows[0];
      console.log(`   Week: ${row.week_start_date} to ${row.week_end_date}`);
      console.log(`   Revenue: $${row.actual_weekly_revenue}`);
    }
    
  } catch (error) {
    console.error('❌ Database Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Connection refused - check if Railway database is accessible');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      console.error('   Connection timeout - Railway database may be down or URL incorrect');
    } else {
      console.error('   Full error:', error);
    }
  } finally {
    await pool.end();
    console.log('\n✅ Database connection closed');
  }
}

// Run verification
console.log('Starting database verification...\n');
verifyDatabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});