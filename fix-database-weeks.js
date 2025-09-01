// Script to fix incorrect week dates in the database
const { Pool } = require('pg');
require('dotenv').config();

// Use Railway database URL directly for this fix
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:rqzJIoJddRSrXcWagdqOtSmeCmHvjgPs@autorack.proxy.rlwy.net:34226/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixDatabaseWeeks() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Starting database week fixes...\n');
    
    // 1. Show current data
    console.log('📊 Current data in database:');
    const currentData = await client.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue, total_drip_iv_members
      FROM analytics_data
      ORDER BY week_start_date DESC
    `);
    
    currentData.rows.forEach(row => {
      const daysDiff = Math.round((new Date(row.week_end_date) - new Date(row.week_start_date)) / (1000 * 60 * 60 * 24));
      const status = daysDiff === 6 ? '✅' : '❌';
      console.log(`${status} ID ${row.id}: ${row.week_start_date} to ${row.week_end_date} (${daysDiff + 1} days) - $${row.actual_weekly_revenue}`);
    });
    
    console.log('\n🔄 Applying fixes...\n');
    
    // 2. Fix the Aug 17-23 entry to be Aug 18-24
    const aug17Fix = await client.query(`
      UPDATE analytics_data 
      SET week_start_date = '2025-08-18', 
          week_end_date = '2025-08-24',
          updated_at = CURRENT_TIMESTAMP
      WHERE week_start_date = '2025-08-17' AND week_end_date = '2025-08-23'
      RETURNING id, week_start_date, week_end_date
    `);
    
    if (aug17Fix.rows.length > 0) {
      console.log('✅ Fixed Aug 17-23 to Aug 18-24:', aug17Fix.rows[0]);
    }
    
    // 3. Delete single-day "weeks"
    const deleteSingleDay = await client.query(`
      DELETE FROM analytics_data 
      WHERE week_start_date = week_end_date
      RETURNING id, week_start_date, week_end_date
    `);
    
    if (deleteSingleDay.rows.length > 0) {
      console.log(`✅ Deleted ${deleteSingleDay.rows.length} single-day entries:`);
      deleteSingleDay.rows.forEach(row => {
        console.log(`   - ID ${row.id}: ${row.week_start_date}`);
      });
    }
    
    // 4. Delete any entries that aren't 7-day weeks
    const deleteInvalidWeeks = await client.query(`
      DELETE FROM analytics_data 
      WHERE DATE_PART('day', week_end_date::timestamp - week_start_date::timestamp) != 6
      RETURNING id, week_start_date, week_end_date
    `);
    
    if (deleteInvalidWeeks.rows.length > 0) {
      console.log(`✅ Deleted ${deleteInvalidWeeks.rows.length} invalid week entries`);
    }
    
    // 5. Show fixed data
    console.log('\n📊 Data after fixes:');
    const fixedData = await client.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue, total_drip_iv_members
      FROM analytics_data
      ORDER BY week_start_date DESC
    `);
    
    fixedData.rows.forEach(row => {
      const daysDiff = Math.round((new Date(row.week_end_date) - new Date(row.week_start_date)) / (1000 * 60 * 60 * 24));
      const startDay = new Date(row.week_start_date).getDay();
      const endDay = new Date(row.week_end_date).getDay();
      const formatOk = startDay === 1 && endDay === 0 ? '✅' : '⚠️';
      console.log(`${formatOk} ID ${row.id}: ${row.week_start_date} to ${row.week_end_date} - $${row.actual_weekly_revenue}, ${row.total_drip_iv_members} members`);
    });
    
    console.log('\n✅ Database cleanup complete!');
    
  } catch (error) {
    console.error('❌ Error fixing database:', error);
  } finally {
    client.release();
    pool.end();
  }
}

// Run the fix
fixDatabaseWeeks();