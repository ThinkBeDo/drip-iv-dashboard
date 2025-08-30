const { Pool } = require('pg');

// Railway database URL - update this if it changes
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:tXnJczJrBENdRQcxMzWLMnJPCQaXNLIu@autorack.proxy.rlwy.net:27586/railway';

async function testDatabase() {
  console.log('Testing Railway Database Connection...\n');
  console.log('Database URL:', DATABASE_URL.replace(/:[^:@]+@/, ':****@')); // Hide password
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000, // 10 second timeout
  });

  try {
    // Test 1: Basic connection
    console.log('1. Testing basic connection...');
    const testResult = await pool.query('SELECT NOW() as current_time');
    console.log('   ✅ Connected! Server time:', testResult.rows[0].current_time);
    
    // Test 2: Check if analytics_data table exists
    console.log('\n2. Checking if analytics_data table exists...');
    const tableResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'analytics_data'
      );
    `);
    
    if (tableResult.rows[0].exists) {
      console.log('   ✅ Table analytics_data exists');
      
      // Test 3: Count records
      console.log('\n3. Counting records in analytics_data...');
      const countResult = await pool.query('SELECT COUNT(*) as total FROM analytics_data');
      console.log('   Total records:', countResult.rows[0].total);
      
      // Test 4: Check for recent data
      console.log('\n4. Checking for recent data...');
      const recentResult = await pool.query(`
        SELECT 
          week_start_date,
          week_end_date,
          actual_weekly_revenue,
          created_at
        FROM analytics_data 
        ORDER BY created_at DESC 
        LIMIT 3
      `);
      
      if (recentResult.rows.length === 0) {
        console.log('   ⚠️  No data found in analytics_data table');
      } else {
        console.log('   Recent records:');
        recentResult.rows.forEach((row, i) => {
          console.log(`   ${i + 1}. Week ${row.week_start_date} to ${row.week_end_date}`);
          console.log(`      Revenue: $${row.actual_weekly_revenue || 0}`);
          console.log(`      Created: ${row.created_at}`);
        });
      }
      
      // Test 5: Check specifically for Aug 18-24 data
      console.log('\n5. Checking for Aug 18-24, 2025 data...');
      const specificResult = await pool.query(`
        SELECT 
          week_start_date,
          week_end_date,
          actual_weekly_revenue,
          total_drip_iv_members,
          created_at
        FROM analytics_data 
        WHERE week_start_date::date = '2025-08-18'::date
           OR (week_start_date::date >= '2025-08-18'::date 
               AND week_start_date::date <= '2025-08-24'::date)
        ORDER BY created_at DESC
      `);
      
      if (specificResult.rows.length === 0) {
        console.log('   ❌ No data found for week of Aug 18-24, 2025');
        
        // Show what date ranges ARE available
        const availableDates = await pool.query(`
          SELECT DISTINCT 
            week_start_date::date as start_date,
            week_end_date::date as end_date
          FROM analytics_data
          WHERE week_start_date IS NOT NULL
          ORDER BY start_date DESC
          LIMIT 5
        `);
        
        if (availableDates.rows.length > 0) {
          console.log('\n   Available date ranges:');
          availableDates.rows.forEach(row => {
            console.log(`   - ${row.start_date} to ${row.end_date}`);
          });
        }
      } else {
        console.log('   ✅ Found data for Aug 18-24:');
        specificResult.rows.forEach(row => {
          console.log(`      Week: ${row.week_start_date} to ${row.week_end_date}`);
          console.log(`      Revenue: $${row.actual_weekly_revenue || 0}`);
          console.log(`      Members: ${row.total_drip_iv_members || 0}`);
          console.log(`      Created: ${row.created_at}`);
        });
      }
      
    } else {
      console.log('   ❌ Table analytics_data does not exist!');
      console.log('   The database schema may need to be initialized.');
    }
    
    console.log('\n✅ Database connection test completed successfully');
    
  } catch (error) {
    console.error('\n❌ Database Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('   Connection refused - check if the database is running');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      console.error('   Connection timeout - check network and database URL');
    } else if (error.code === '28P01') {
      console.error('   Authentication failed - check database credentials');
    } else {
      console.error('   Error code:', error.code);
    }
  } finally {
    await pool.end();
    console.log('\nConnection closed.');
  }
}

// Run the test
testDatabase().catch(console.error);